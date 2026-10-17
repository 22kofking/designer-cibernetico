import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderizar } from '../src/node/render-node.js';

const dataUrl = async (buf) => `data:image/png;base64,${(await sharp(buf).png().toBuffer()).toString('base64')}`;
const pixels = async (canvas) => sharp(canvas.getNodeCanvas().toBuffer('image/png')).raw().toBuffer({ resolveWithObject: true });
const px = ({ data, info }, fx, fy) => { const i = (Math.floor(fy * info.height) * info.width + Math.floor(fx * info.width)) * info.channels; return [...data.slice(i, i + 4)]; };

test('vinheta radial escurece os cantos e deixa o centro', async () => {
  const branco = await dataUrl(await sharp({ create: { width: 40, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer());
  const cena = {
    versao: '0.1', formato: { largura: 400, altura: 200, fundo: '#000000' },
    nos: [
      { id: 'fundo', tipo: 'imagem', papel: 'fundo', asset: branco, encaixe: 'esticar', caixa: { x: 0, y: 0, w: 1, h: 1 } },
      { id: 'vinheta', tipo: 'gradiente', papel: 'efeito', direcao: 'radial', caixa: { x: 0, y: 0, w: 1, h: 1 }, paradas: [[0, '#000000', 0], [0.5, '#000000', 0], [1, '#000000', 0.9]] },
    ],
  };
  const r = await pixels(await renderizar(cena, '.'));
  const centro = px(r, 0.5, 0.5)[0];
  const canto = px(r, 0.02, 0.03)[0];
  assert.ok(centro > 240, `centro ${centro}`);
  assert.ok(canto < 120, `canto ${canto}`);
  // elipse: o meio da borda de cima é menos escuro que o canto
  assert.ok(px(r, 0.5, 0.03)[0] > canto + 20);
});

test('máscara de camada: só aparece onde o alfa da máscara deixa', async () => {
  const vermelho = await dataUrl(await sharp({ create: { width: 40, height: 20, channels: 3, background: '#ff0000' } }).png().toBuffer());
  // máscara: metade esquerda branca opaca, metade direita transparente, e uma faixa a meio alfa
  const w = 40, h = 20, m = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m.set([255, 255, 255, x < 20 ? 255 : x < 30 ? 128 : 0], (y * w + x) * 4);
  const mascara = await dataUrl(await sharp(m, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer());
  const cena = {
    versao: '0.1', formato: { largura: 400, altura: 200, fundo: '#000000' },
    nos: [{ id: 'cor', tipo: 'imagem', papel: 'elemento', asset: vermelho, mascara, encaixe: 'esticar', caixa: { x: 0, y: 0, w: 1, h: 1 } }],
  };
  const r = await pixels(await renderizar(cena, '.'));
  assert.equal(px(r, 0.25, 0.5)[0], 255);
  const meio = px(r, 0.62, 0.5)[0];
  assert.ok(meio > 90 && meio < 170, `meio ${meio}`);
  assert.equal(px(r, 0.9, 0.5)[0], 0);
});

test('ajustes.linear aplica ganho e deslocamento (níveis)', async () => {
  const cinza = await dataUrl(await sharp({ create: { width: 40, height: 20, channels: 3, background: '#808080' } }).png().toBuffer());
  const cena = {
    versao: '0.1', formato: { largura: 400, altura: 200, fundo: '#000000' },
    nos: [{ id: 'cor', tipo: 'imagem', papel: 'fundo', asset: cinza, encaixe: 'esticar', caixa: { x: 0, y: 0, w: 1, h: 1 }, ajustes: { linear: { ganho: 0.5, desloc: 0.1 } } }],
  };
  const v = px(await pixels(await renderizar(cena, '.')), 0.5, 0.5)[0];
  assert.ok(Math.abs(v - (128 * 0.5 + 0.1 * 255)) < 4, `esperava ~90, veio ${v}`);
});
