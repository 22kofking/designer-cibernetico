import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { ajustarCurvas, ajustarLuz, aplicarReceita, harmonizar, lerRgb, medir } from '../src/oficinas/acabamento.js';

const imagem = (fn, w = 64, h = 32) => {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) buf.set(fn(x, y, w, h), (y * w + x) * 3);
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
};
// a referência é a montagem mais escura nas bordas (vinheta) e mais quente
const montagem = () => imagem(() => [140, 120, 100]);
const referencia = () => imagem((x, y, w, h) => {
  const d = Math.hypot((x / w - 0.5) * 2, (y / h - 0.5) * 2);
  const k = 1.15 - 0.5 * Math.min(1, d);
  return [Math.min(255, 170 * k), Math.min(255, 120 * k), Math.min(255, 80 * k)];
});

test('curvas aproximam o tom da montagem do da referência', async () => {
  const [m, r] = [await lerRgb(await montagem(), 64), await lerRgb(await referencia(), 64)];
  const antes = (await medir(m, r)).deltaE_pixel;
  const depois = (await medir(await aplicarReceita(m, { curvas: ajustarCurvas(m, r, 1) }), r)).deltaE_pixel;
  assert.ok(depois < antes, `${depois} deveria ser menor que ${antes}`);
});

test('o mapa de luz reproduz a vinheta: bordas escurecem em relação ao centro', async () => {
  const [m, r] = [await lerRgb(await montagem(), 64), await lerRgb(await referencia(), 64)];
  const luz = ajustarLuz(m, r, { gx: 8, gy: 4 });
  const centro = luz.ganho[1 * 8 + 4];
  const canto = luz.ganho[0];
  assert.ok(centro > canto);
});

test('harmonizar só guarda passos que melhoram a medida', async () => {
  const [m, r] = [await lerRgb(await montagem(), 64), await lerRgb(await referencia(), 64)];
  const res = await harmonizar(m, r);
  assert.ok(res.depois.deltaE_pixel < res.antes.deltaE_pixel);
  assert.ok(res.receita.curvas || res.receita.luz);
});
