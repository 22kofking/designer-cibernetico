import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deltaE, mapaParaPaleta } from '../src/oficinas/cores.js';
import { apagarIlhas, decidir, licencaDerivada, passosDeEstilo, reordenarPorNome, adaptarVetor } from '../src/oficinas/elementos.js';
import { gerarImagem } from '../src/oficinas/gateway.js';
import { caminhoVectorcraft } from '../src/banco/imagem.js';

const PALETA = ['#f0b03a', '#e5682d', '#aa251c', '#fef60a'];
const r = (id, fonte, formato, nota, extra = {}) => ({ item: { id, fonte, formato, titulo: id, licenca: 'CC0', tags: [], ...extra }, nota });

test('delta E: cor igual é 0, cores distantes passam de 10', () => {
  assert.equal(deltaE('#f0b03a', '#f0b03a'), 0);
  assert.ok(deltaE('#f0b03a', '#2050e0') > 10);
});

test('mapa de cores segue a luz: o tom mais escuro vai para o mais escuro da paleta', () => {
  const mapa = mapaParaPaleta(['#e0b524', '#f3d727', '#000000'], PALETA);
  assert.equal(mapa['#000000'], undefined, 'o contorno preto fica');
  assert.equal(mapa['#e0b524'], '#aa251c');
  assert.equal(mapa['#f3d727'], '#fef60a');
});

test('desenho só de preto também muda de cor', () => {
  const mapa = mapaParaPaleta(['#000000'], PALETA);
  assert.ok(PALETA.includes(mapa['#000000']));
});

test('decisão: reusa o nosso quando é quase igual', () => {
  const d = decidir([r('nosso', 'criados', 'png', 0.95), r('pub', 'publicos', 'svg', 0.9)]);
  assert.equal(d.acao, 'reusar');
  assert.equal(d.base.item.id, 'nosso');
});

test('decisão: adapta vetor usável e nunca usa referência de terceiros', () => {
  const d = decidir([r('ref', 'referencias', 'svg', 0.99), r('png', 'publicos', 'png', 0.95), r('pub', 'publicos', 'svg', 0.85)]);
  assert.equal(d.acao, 'adaptar');
  assert.equal(d.base.item.id, 'pub');
  assert.equal(decidir([r('ref', 'referencias', 'svg', 0.99)], { escolher: 'ref' }).acao, 'candidatos');
});

test('decisão: só gera com permissão; sem ela devolve candidatos', () => {
  const fracos = [r('pub', 'publicos', 'svg', 0.5)];
  assert.equal(decidir(fracos).acao, 'candidatos');
  assert.equal(decidir(fracos, { gerarPermitido: true }).acao, 'gerar');
  assert.equal(decidir([r('pub', 'publicos', 'svg', 0.31)], { tipo: 'texto' }).acao, 'adaptar');
});

test('nome certo no título sobe na busca por texto', () => {
  const lista = reordenarPorNome([r('poste', 'publicos', 'svg', 0.33, { titulo: 'cat scratching post' }), r('moedas', 'publicos', 'svg', 0.32, { titulo: 'gold coins in a stack' })], 'stack of gold coins');
  assert.equal(lista[0].item.id, 'moedas');
  assert.equal(lista[0].acertos, 3);
});

test('licença derivada guarda de onde veio a base', () => {
  assert.equal(licencaDerivada(null), 'nossa');
  assert.match(licencaDerivada({ fonte: 'publicos', titulo: 'moedas', licenca: 'CC0' }), /derivada de moedas: CC0/);
});

test('passos de estilo: recolorir, contorno atrás e prancheta no tamanho da arte', () => {
  const p = passosDeEstilo({ '#000': '#fff' }, { cor: '#120804', espessura: 8 }).map((x) => x.cmd);
  assert.deepEqual(p.slice(0, 2), ['select.all', 'recolor.apply']);
  assert.ok(p.indexOf('object.pathfinder.unite') < p.indexOf('object.arrange.sendToBack'));
  assert.equal(p.at(-1), 'artboard.fitToArt');
});

test('ilhas pequenas somem, a peça principal fica', () => {
  const w = 20, h = 10;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) rgba[(y * w + x) * 4 + 3] = 255;
  rgba[(5 * w + 18) * 4 + 3] = 255;
  assert.equal(apagarIlhas(rgba, w, h), 1);
  assert.equal(rgba[(5 * w + 18) * 4 + 3], 0);
});

test('gerar exige teto e não passa dele', async () => {
  process.env.GATEWAY_URL = 'http://gateway.invalido';
  process.env.GATEWAY_CHAVE = 'x';
  await assert.rejects(gerarImagem({ descricao: 'coin' }), /teto/);
  await assert.rejects(gerarImagem({ descricao: 'coin', teto: 0.004 }), /acima do teto/);
  delete process.env.GATEWAY_URL;
  delete process.env.GATEWAY_CHAVE;
});

test('VectorCraft leva um SVG para a paleta da ficha', { skip: !caminhoVectorcraft() && 'sem vectorcraft-cli' }, async () => {
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'oficina-'));
  const svg = path.join(pasta, 'moeda.svg');
  await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#e0b524" stroke="#000000" stroke-width="4"/><circle cx="50" cy="50" r="25" fill="#f3d727"/></svg>');
  const r1 = await adaptarVetor(svg, { paleta: PALETA, contorno: { cor: '#120804', espessura: 6 } }, pasta);
  assert.equal(r1.mapa['#e0b524'], '#aa251c');
  assert.ok(r1.passos.includes('recolor.apply'));
});

test('gerar fala com o gateway, segue o job e soma o custo', async () => {
  const http = await import('node:http');
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#e6e6e6' } }).png().toBuffer();
  const pedidos = [];
  const servidor = http.createServer((req, res) => {
    pedidos.push(`${req.method} ${req.url} ${req.headers.authorization}`);
    if (req.url === '/v1/images') { res.end(JSON.stringify({ id: 'j1', status: 'running', images: [] })); return; }
    if (req.url === '/v1/jobs/j1') { res.end(JSON.stringify({ id: 'j1', status: 'succeeded', images: [`http://127.0.0.1:${servidor.address().port}/img.png`], cost_usd: 0.005 })); return; }
    res.setHeader('content-type', 'image/png');
    res.end(png);
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  process.env.GATEWAY_URL = `http://127.0.0.1:${servidor.address().port}`;
  process.env.GATEWAY_CHAVE = 'teste';
  try {
    const g = await gerarImagem({ descricao: 'gold coin', teto: 0.01 });
    assert.equal(g.gasto, 0.005);
    assert.equal(g.imagens.length, 1);
    assert.ok(g.imagens[0].png.equals(png));
    assert.match(g.imagens[0].prompt, /^gold coin, flat 2D vector/);
    assert.equal(pedidos[0], 'POST /v1/images Bearer teste');
  } finally {
    servidor.close();
    delete process.env.GATEWAY_URL;
    delete process.env.GATEWAY_CHAVE;
  }
});
