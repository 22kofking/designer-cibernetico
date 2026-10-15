import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { ambiguidade, conferirRecorte, escolherMascara, iou, nitidezDoRemendo, pedacosEFuros, solidez } from '../src/qualidade/recorte.js';
import { separarEmPartes } from '../src/mascote/partes.js';

// Cena de teste: corpo vermelho, braço marrom subindo até a mão, orbe azul na
// mão e dedos marrons na frente da parte de baixo do orbe (finos, como num desenho:
// a mancha é medida fora do miolo da parte).
const W = 100, H = 100;
const noDisco = (x, y) => (x - 50) ** 2 + (y - 45) ** 2 <= 25 ** 2;
const nosDedos = (x, y) => x >= 42 && x < 58 && y >= 64 && y < 70;
const naMao = (x, y) => x >= 38 && x < 62 && y >= 70;
function cena() {
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let c = [200, 30, 30];
    if (noDisco(x, y)) c = [30, 120, 230];
    if (nosDedos(x, y) || naMao(x, y)) c = [120, 80, 50];
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  }
  return rgba;
}
const mascara = (f) => { const m = Buffer.alloc(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f(x, y)) m[y * W + x] = 255; return m; };
const orbeLimpo = mascara((x, y) => noDisco(x, y) && !nosDedos(x, y));
const orbeComMao = mascara((x, y) => noDisco(x, y) || nosDedos(x, y) || (naMao(x, y) && y < 76));

test('QA do recorte: orbe limpo passa, orbe com a mão acusa a mancha', () => {
  const rgba = cena();
  const limpo = conferirRecorte(rgba, W, H, orbeLimpo);
  assert.equal(limpo.aprovado, true, limpo.problemas.join('; '));
  assert.ok(limpo.medidas.mancha < 0.005);
  const sujo = conferirRecorte(rgba, W, H, orbeComMao);
  assert.equal(sujo.aprovado, false);
  assert.ok(sujo.medidas.mancha > 0.1);
  assert.match(sujo.problemas.join(), /cor do resto/);
  // Numa parte do corpo a mancha é só medida.
  assert.equal(conferirRecorte(rgba, W, H, orbeComMao, { objeto: false }).aprovado, true);
});

test('QA do recorte: escolhe a opção que passa e avisa do empate', () => {
  const rgba = cena();
  const opcoes = [{ mascara: orbeComMao, nota: 0.94 }, { mascara: orbeLimpo, nota: 0.93 }];
  assert.ok(ambiguidade(opcoes));
  assert.equal(ambiguidade([{ mascara: orbeComMao, nota: 0.94 }, { mascara: orbeLimpo, nota: 0.7 }]), null);
  const e = escolherMascara(rgba, W, H, opcoes);
  assert.equal(e.indice, 1);
  assert.equal(e.trocou, true);
  assert.ok(e.qa.alerta);
  assert.ok(iou(orbeLimpo, orbeComMao) < 0.9);
});

test('QA do recorte: pedaços, furos e solidez', () => {
  const dois = mascara((x, y) => (x - 25) ** 2 + (y - 50) ** 2 < 100 || (x - 75) ** 2 + (y - 50) ** 2 < 100);
  assert.equal(pedacosEFuros(dois, W, H).pedacos, 2);
  const anel = mascara((x, y) => { const d = (x - 50) ** 2 + (y - 50) ** 2; return d < 900 && d > 100; });
  assert.ok(pedacosEFuros(anel, W, H).furos > 0.1);
  assert.ok(solidez(mascara((x, y) => x > 20 && x < 80 && y > 20 && y < 80), W, H) > 0.95);
  const cruz = mascara((x, y) => (x > 45 && x < 55) || (y > 45 && y < 55));
  assert.ok(solidez(cruz, W, H) < 0.3);
});

test('nitidez do remendo: listras mantidas dão perto de 1, borrão dá perto de 0', () => {
  const listras = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { const v = (i % W) % 8 < 4 ? 40 : 220; listras[i * 4] = listras[i * 4 + 1] = listras[i * 4 + 2] = v; listras[i * 4 + 3] = 255; }
  const buraco = mascara((x, y) => x >= 40 && x < 60 && y >= 40 && y < 60);
  assert.ok(nitidezDoRemendo(listras, W, H, buraco) > 0.8);
  const borrado = Buffer.from(listras);
  for (let i = 0; i < W * H; i++) if (buraco[i]) borrado[i * 4] = borrado[i * 4 + 1] = borrado[i * 4 + 2] = 130;
  assert.ok(nitidezDoRemendo(borrado, W, H, buraco) < 0.3);
});

test('mascote em partes: com as opções do modelo, fica a que passa no QA', async () => {
  const png = await sharp(cena(), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const segmentador = async () => ({ mascara: orbeComMao, nota: 0.94, opcoes: [{ mascara: orbeComMao, nota: 0.94 }, { mascara: orbeLimpo, nota: 0.93 }] });
  const r = await separarEmPartes(png, [{ id: 'orbe', pontos: [[50, 45]], halo: 0 }], { segmentador });
  const [orbe] = r.partes;
  assert.equal(orbe.nota, 0.93);
  assert.equal(orbe.qa.aprovado, true);
  assert.match(orbe.qa.escolha, /opção 2 de 2/);
  assert.equal(typeof r.corpo.nitidez_remendo, 'number');
});
