import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { haloDaParte, limparMascara, remendar, separarEmPartes } from '../src/mascote/partes.js';
import { mascoteNaCena } from '../src/mascote/montagem.js';
import { promptDaPose } from '../src/mascote/personagem.js';

const personagem = {
  prompt: 'capybara, {figurino}, {segura}, grey background',
  figurino_padrao: 'sorte',
  figurinos: { sorte: 'red tang jacket', mago: 'sorcerer robe' },
  temas: { telegram: { figurino: 'mago', segura: 'holding a blue orb' } },
};

test('prompt travado: o tema escolhe figurino e o que o mascote segura', () => {
  assert.deepEqual(promptDaPose(personagem, { tema: 'telegram' }), { figurino: 'mago', prompt: 'capybara, sorcerer robe, holding a blue orb, grey background' });
  assert.equal(promptDaPose(personagem, { tema: 'telegram', figurino: 'sorte' }).figurino, 'sorte');
  assert.match(promptDaPose(personagem).prompt, /red tang jacket, hands free/);
  assert.throws(() => promptDaPose(personagem, { tema: 'pirata' }), /não tem o tema/);
  assert.throws(() => promptDaPose(personagem, { figurino: 'rua' }), /não tem o figurino/);
});

test('máscara limpa: fica o maior pedaço, sem furos', () => {
  const w = 10, h = 10;
  const m = Buffer.alloc(w * h);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) m[y * w + x] = 255;
  m[5 * w + 5] = 0; // furo
  m[0] = 255; // migalha
  const l = limparMascara(m, w, h);
  assert.equal(l[5 * w + 5], 255);
  assert.equal(l[0], 0);
});

test('remendo: buraco no meio do corpo vira a cor em volta; fora da silhueta fica transparente', () => {
  const w = 20, h = 10;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < 12; x++) { const i = (y * w + x) * 4; rgba[i] = 200; rgba[i + 3] = 255; }
  const buraco = Buffer.alloc(w * h);
  for (let y = 3; y < 7; y++) for (let x = 4; x < 8; x++) buraco[y * w + x] = 255; // dentro
  for (let y = 3; y < 7; y++) for (let x = 15; x < 19; x++) buraco[y * w + x] = 255; // fora
  remendar(rgba, w, h, buraco);
  const dentro = (5 * w + 6) * 4, fora = (5 * w + 17) * 4;
  assert.equal(rgba[dentro + 3], 255);
  assert.ok(Math.abs(rgba[dentro] - 200) < 2);
  assert.equal(rgba[fora + 3], 0);
});

test('halo: brilho da mesma cor em volta da parte vai junto com ela', () => {
  const w = 20, h = 20;
  const rgba = Buffer.alloc(w * h * 4);
  const pintar = (x, y, r, g, b) => { const i = (y * w + x) * 4; rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pintar(x, y, 200, 40, 30); // roupa vermelha
  const mascara = Buffer.alloc(w * h);
  for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) { pintar(x, y, 30, 90, 230); mascara[y * w + x] = 255; } // orbe azul
  pintar(13, 10, 60, 140, 240); // faísca azul perto
  const halo = haloDaParte(rgba, w, h, mascara, 4);
  assert.equal(halo[10 * w + 13], 255);
  assert.equal(halo[10 * w + 15], 0, 'a roupa vermelha em volta não entra');
});

test('separar em partes: a parte sai recortada com a caixa certa e o corpo é remendado', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="10" y="10" width="80" height="80" fill="#c03020"/><circle cx="30" cy="40" r="12" fill="#2050e0"/></svg>');
  const png = await sharp(svg).png().toBuffer();
  const segmentador = async () => {
    const m = Buffer.alloc(100 * 100);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) if ((x - 30) ** 2 + (y - 40) ** 2 <= 144) m[y * 100 + x] = 255;
    return { mascara: m, largura: 100, altura: 100, nota: 0.9 };
  };
  const r = await separarEmPartes(png, [{ id: 'orbe', pontos: [[30, 40]] }], { segmentador });
  assert.deepEqual(r.tamanho, [100, 100]);
  const [orbe] = r.partes;
  assert.ok(Math.abs(orbe.caixa[0] - 0.18) < 0.02 && Math.abs(orbe.caixa[2] - 0.25) < 0.03, `caixa ${orbe.caixa}`);
  const { data, info } = await sharp(r.corpo.png).raw().toBuffer({ resolveWithObject: true });
  const x = 30 - Math.round(r.corpo.caixa[0] * 100), y = 40 - Math.round(r.corpo.caixa[1] * 100);
  const i = (y * info.width + x) * info.channels;
  assert.ok(data[i] > 150 && data[i + 2] < 80, 'onde estava o orbe agora é roupa vermelha');
});

test('mascote na cena: camadas ocupam o lugar do mascote inteiro e a troca encaixa na caixa da parte', () => {
  const montagem = { nome: 'mago', tamanho: [100, 200], camadas: [
    { id: 'corpo', caixa: [0, 0, 1, 1] },
    { id: 'orbe', caixa: [0, 0.25, 0.5, 0.25] },
  ] };
  const nos = mascoteNaCena(montagem, { caixa: { x: 0.5, y: 0, w: 0.5, h: 1 }, formato: { largura: 400, altura: 200 }, trocas: { orbe: { asset: 'assets/envelope.png' } }, assetDe: (c) => `assets/${c.id}.png` });
  assert.deepEqual(nos.map((n) => n.id), ['mascote-corpo', 'mascote-orbe']);
  // mascote 100x200 em caixa 200x200 px, base: largura 100 px centrada em x=250..350
  assert.deepEqual(nos[0].caixa, { x: 0.625, y: 0, w: 0.25, h: 1 });
  assert.deepEqual(nos[1].caixa, { x: 0.625, y: 0.25, w: 0.125, h: 0.25 });
  assert.equal(nos[1].asset, 'assets/envelope.png');
  assert.equal(nos[1].encaixe, 'conter');
  assert.equal(nos[0].encaixe, 'esticar');
});
