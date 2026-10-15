import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { Banco } from '../src/banco/armazem.js';
import { validarCena } from '../src/nucleo/cena.js';
import { acharReferencia, dadosDoNo, lerGrafo, noRecortavel, recortarNoDoGrafo, separarPartes } from '../src/desconstrucao/grafo.js';
import { grafoParaCena, paradasDoEscurecimento, partesEmFracoes } from '../src/desconstrucao/molde.js';
import { termosDoNo } from '../src/desconstrucao/plano.js';

// Peça falsa 200x100: duas moedas (círculos) e um fundo; máscara das moedas à parte.
async function grafoDeTeste() {
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'grafo-teste-'));
  await mkdir(path.join(pasta, 'peca', 'mascaras'), { recursive: true });
  await mkdir(path.join(pasta, 'refs'), { recursive: true });
  const svg = (corpo, fundo = '#301008') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="${fundo}"/>${corpo}</svg>`);
  await sharp(svg('<circle cx="140" cy="30" r="15" fill="#f0b03a"/><circle cx="180" cy="70" r="12" fill="#f0b03a"/>')).png().toFile(path.join(pasta, 'refs', 'peca.png'));
  await sharp(svg('<circle cx="140" cy="30" r="15" fill="#fff"/><circle cx="180" cy="70" r="12" fill="#fff"/>', '#000')).png().toFile(path.join(pasta, 'peca', 'mascaras', 'moedas.png'));
  const grafo = {
    formato: 'grafo-peca/0.1', peca: 'peca', formato_peca: 'home', tema: 'vip', tamanho_px: [200, 100],
    referencia: 'referencias/marca/home/peca.png',
    nos: [
      { id: 'cena', tipo: 'fundo', z: 0, caixa: [0, 0, 1, 1], estilo: { paleta: [{ cor: '#301008' }, { cor: '#f0b03a' }] } },
      { id: 'escurecimento', tipo: 'efeito', z: 1, caixa: [0, 0, 0.5, 1], estilo: { L_fundo_por_decimo_de_W: [2, 3, 8, 20, 60, 110, 160, 160, 150, 100] } },
      { id: 'moedas', tipo: 'objeto_grupo', z: 2, mascara: 'mascaras/moedas.png', caixa: [0.6, 0, 0.4, 1], descricao: 'moedas de ouro em volta', quantidade: 2 },
      { id: 'brilho', tipo: 'efeito', z: 5 },
      { id: 'texto_l1', tipo: 'texto', z: 6, caixa: [0.05, 0.3, 0.3, 0.1], estilo: { estilo_ficha: 'branco', peso_rel: 1 } },
      { id: 'texto_l2', tipo: 'texto', z: 6, caixa: [0.05, 0.45, 0.35, 0.3], estilo: { estilo_ficha: 'dourado', peso_rel: 4 } },
      { id: 'logo', tipo: 'logo', z: 7, caixa: [0.03, 0.05, 0.15, 0.15] },
    ],
    arestas: [{ de: 'texto_l1', rel: 'empilhado_acima', para: 'texto_l2', vao_rel_altura: 0.4 }],
  };
  const arquivo = path.join(pasta, 'peca.json');
  await writeFile(arquivo, JSON.stringify(grafo));
  return { pasta, grafo: await lerGrafo(arquivo) };
}

test('só partes com imagem viram recorte (texto, logo e efeito embutido não)', async () => {
  const { grafo } = await grafoDeTeste();
  assert.deepEqual(grafo.nos.filter(noRecortavel).map((n) => n.id), ['cena', 'moedas']);
});

test('acha a referência tirando pedaços do caminho do grafo', async () => {
  const { pasta, grafo } = await grafoDeTeste();
  assert.equal(acharReferencia(grafo, [path.join(pasta, 'refs')]), path.join(pasta, 'refs', 'peca.png'));
  assert.throws(() => acharReferencia(grafo, []), /não achei/);
});

test('recorte pela máscara: grupo de moedas se separa em duas peças', async () => {
  const { pasta, grafo } = await grafoDeTeste();
  const no = grafo.nos.find((n) => n.id === 'moedas');
  const png = await recortarNoDoGrafo(grafo, no, path.join(pasta, 'refs', 'peca.png'));
  const partes = await separarPartes(png);
  assert.equal(partes.length, 2);
  assert.ok(partes[0].area > partes[1].area, 'a maior vem primeiro');
  const fracoes = await partesEmFracoes(grafo, no, path.join(pasta, 'refs', 'peca.png'));
  assert.equal(fracoes.length, 2);
  assert.ok(Math.abs(fracoes[0][0] - 125 / 200) < 0.01, 'a moeda maior começa em x=125');
});

test('dados do nó levam descrição, tema e relações', async () => {
  const { grafo } = await grafoDeTeste();
  const d = dadosDoNo(grafo, grafo.nos.find((n) => n.id === 'texto_l1'));
  assert.equal(d.tema, 'vip');
  assert.deepEqual(d.relacoes, ['texto_l1 empilhado_acima texto_l2']);
});

test('glossário: descrição em português vira termos em inglês para os vetores públicos', () => {
  assert.equal(termosDoNo({ id: 'moedas', descricao: 'moedas de ouro em volta' }), 'coin');
  assert.match(termosDoNo({ id: 'orbe', descricao: 'orbe com o ícone do Telegram', tema: 'telegram' }), /orb.*telegram/);
});

test('escurecimento segue a luz medida: escuro à esquerda, some no fim', () => {
  const p = paradasDoEscurecimento({ caixa: [0, 0, 0.5, 1], estilo: { L_fundo_por_decimo_de_W: [2, 3, 8, 20, 60, 110, 160, 160, 150, 100] } });
  assert.ok(p[0][2] > 0.9);
  assert.equal(p.at(-1)[2], 0);
  for (let i = 1; i < p.length; i++) assert.ok(p[i][0] >= p[i - 1][0]);
});

test('molde sem material no banco: cena válida, layout da referência e pendências marcadas', async () => {
  const { pasta, grafo } = await grafoDeTeste();
  const banco = new Banco(path.join(pasta, 'banco-vazio'));
  const plano = { nos: [{ no: 'moedas', acao: 'candidatos', motivo: 'nenhum vetor usável no banco', base: null, candidatos: [] }] };
  const { cena, pendentes } = await grafoParaCena(banco, grafo, plano, path.join(pasta, 'molde'), { referencias: [path.join(pasta, 'refs')] });
  assert.deepEqual(validarCena(cena), []);
  assert.equal(cena.formato.largura, 400);
  const texto = cena.nos.find((n) => n.tipo === 'bloco_texto');
  assert.deepEqual(texto.linhas.map((l) => [l.estilo, l.peso]), [['branco', 1], ['dourado', 4]]);
  assert.equal(texto.vao, 0.4);
  assert.equal(cena.nos[0].tipo, 'gradiente', 'fundo sem material vira gradiente da paleta');
  assert.equal(cena.nos.find((n) => n.id === 'moedas').tipo, 'retangulo');
  assert.deepEqual(pendentes.map((p) => p.no).sort(), ['logo', 'moedas']);
  assert.ok(!JSON.stringify(cena).includes('peca.png'), 'nada da referência entra no molde');
});
