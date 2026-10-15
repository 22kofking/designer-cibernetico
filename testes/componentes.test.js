import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { criarOrcamento, custoDosPedidos, gerarComponente, pedidosDaPeca, tamanhoDoGateway } from '../src/geracao/componentes.js';
import { cenaParaPsd } from '../src/node/psd.js';
import { readPsd } from 'ag-psd';

const personagem = {
  prompt: 'capybara, {figurino}, {segura}',
  figurinos: { sorte: 'red tang jacket' },
  figurino_padrao: 'sorte',
  temas: { envelopes: { figurino: 'sorte', segura: 'holding a red envelope', objeto: 'a red envelope' } },
};
const marca = { geracao: { fundos: { envelopes: 'red and gold light burst' } } };
const grafo = {
  tema: 'envelopes',
  nos: [
    { id: 'cena', tipo: 'fundo' },
    { id: 'mascote', tipo: 'personagem', caixa: [0.4, 0, 0.5, 1] },
    { id: 'envelope', tipo: 'objeto_segurado', caixa: [0.87, 0.03, 0.12, 0.2] },
  ],
};

test('componentes: fundo sem personagem, mascote de mão livre e o objeto à parte', () => {
  assert.equal(tamanhoDoGateway(2040, 600), '1536x448');
  assert.equal(tamanhoDoGateway(600, 2040), '448x1536');
  const pedidos = pedidosDaPeca(grafo, marca, personagem, { formato: { largura: 2040, altura: 600 } });
  assert.deepEqual(pedidos.map((p) => p.tipo), ['fundo', 'mascote', 'objeto']);
  assert.match(pedidos[0].prompt, /no characters/);
  assert.match(pedidos[1].prompt, /holding nothing/);
  assert.doesNotMatch(pedidos[1].prompt, /holding a red envelope/);
  assert.match(pedidos[2].prompt, /a red envelope, single object/);
  assert.equal(custoDosPedidos(pedidos), 0.03);
  // Sem objeto no tema, o mascote segura o que a ficha manda e não há pedido de objeto.
  const semObjeto = { ...personagem, temas: { envelopes: { figurino: 'sorte', segura: 'holding a red envelope' } } };
  const p2 = pedidosDaPeca(grafo, marca, semObjeto, { formato: { largura: 2040, altura: 600 } });
  assert.deepEqual(p2.map((p) => p.tipo), ['fundo', 'mascote']);
  assert.match(p2[1].prompt, /holding a red envelope/);
});

test('componentes: teto obrigatório; gera, recorta pelo fundo liso e escolhe', async () => {
  assert.throws(() => criarOrcamento(0), /teto/);
  const orcamento = criarOrcamento(0.05);
  const quadrado = (cor) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e6e6e6"/><rect x="16" y="16" width="32" height="32" fill="${cor}"/></svg>`)).png().toBuffer();
  const gerar = async ({ quantas, teto }) => {
    assert.ok(teto <= 0.05);
    return { gasto: 0.005 * quantas, imagens: await Promise.all(['#d01010', '#10d010'].slice(0, quantas).map(async (c, i) => ({ png: await quadrado(c), job: `j${i}`, semente: i }))) };
  };
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'componente-'));
  const referenciaDoNo = await quadrado('#d01010');
  const r = await gerarComponente({ no: 'envelope', tipo: 'objeto', prompt: 'x', tamanho: '64x64', quantas: 2 }, { pasta, orcamento, referenciaDoNo, gerar });
  assert.equal(orcamento.gasto, 0.01);
  assert.match(r.escolhida, /recorte-1\.png$/); // o vermelho mede mais perto da referência
  const { data, info } = await sharp(await readFile(r.escolhida)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // O fundo liso saiu e a imagem foi aparada no objeto (32 px do quadrado vermelho).
  assert.ok(info.width <= 34 && info.height <= 34, `aparou no objeto (${info.width}x${info.height})`);
  assert.equal(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3], 255, 'o objeto ficou');
});

test('PSD: uma camada por nó, pedaços da mesma parte num grupo', async () => {
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'psd-'));
  const cena = {
    versao: '0.1', nome: 't', formato: { largura: 120, altura: 60, fundo: '#000000' },
    nos: [
      { id: 'cena', papel: 'fundo', tipo: 'gradiente', direcao: 'horizontal', caixa: { x: 0, y: 0, w: 1, h: 1 }, paradas: [[0, '#000000'], [1, '#e8a020']] },
      { id: 'mascote-corpo', papel: 'mascote', tipo: 'retangulo', caixa: { x: 0.5, y: 0.2, w: 0.3, h: 0.6 }, cor: '#aa5522' },
      { id: 'mascote-orbe', papel: 'mascote', tipo: 'retangulo', caixa: { x: 0.45, y: 0.3, w: 0.1, h: 0.2 }, cor: '#2255ff', opacidade: 0.5 },
    ],
  };
  const psd = readPsd(await cenaParaPsd(cena, pasta), { skipLayerImageData: true, skipThumbnail: true });
  assert.deepEqual(psd.children.map((c) => c.name), ['cor de fundo', 'cena', 'mascote']);
  assert.deepEqual(psd.children[2].children.map((c) => c.name), ['mascote-corpo', 'mascote-orbe']);
  assert.ok(Math.abs(psd.children[2].children[1].opacity - 0.5) < 0.01);
  assert.equal(psd.children[2].children[0].left, 60);
});
