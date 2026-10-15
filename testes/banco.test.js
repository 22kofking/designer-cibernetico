import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { Banco, DIM_FORMA, DIM_VISUAL } from '../src/banco/armazem.js';
import { buscar } from '../src/banco/buscar.js';
import { coresPrincipais, descritorForma } from '../src/banco/imagem.js';
import { cosseno } from '../src/banco/visual.js';
import { slug } from '../src/banco/importar.js';

const svg = (forma) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${forma}</svg>`);
const png = (forma) => sharp(svg(forma)).png().toBuffer();

function vetor(dim, i) {
  const v = new Float32Array(dim);
  v[i % dim] = 1;
  return v;
}

test('silhuetas parecidas ficam mais perto que silhuetas diferentes', async () => {
  const circulo = await descritorForma(await png('<circle cx="100" cy="100" r="80" fill="#e0a020"/>'));
  const circuloMenor = await descritorForma(await png('<circle cx="60" cy="70" r="40" fill="#2050e0"/>'));
  const faixa = await descritorForma(await png('<rect x="10" y="90" width="180" height="20" fill="#e0a020"/>'));
  assert.equal(circulo.length, DIM_FORMA);
  assert.ok(cosseno(circulo, circuloMenor) > 0.95, 'o mesmo círculo em outro tamanho e lugar deveria casar');
  assert.ok(cosseno(circulo, faixa) < cosseno(circulo, circuloMenor));
});

test('a silhueta funciona também sem transparência (fundo pela cor da borda)', async () => {
  const opaco = await sharp(svg('<rect width="200" height="200" fill="#fff"/><circle cx="100" cy="100" r="80" fill="#000"/>')).flatten().png().toBuffer();
  const transparente = await png('<circle cx="100" cy="100" r="80" fill="#000"/>');
  assert.ok(cosseno(await descritorForma(opaco), await descritorForma(transparente)) > 0.98);
});

test('cores principais saem da área do objeto', async () => {
  const cores = await coresPrincipais(await png('<circle cx="100" cy="100" r="90" fill="#f0b03a"/>'));
  assert.equal(cores.length, 1);
  assert.match(cores[0], /^#f[0-9a-f]b[0-9a-f]3[0-9a-f]$/);
});

test('o banco salva, reabre e recusa item sem licença', async () => {
  const raiz = await mkdtemp(path.join(os.tmpdir(), 'banco-teste-'));
  const b = new Banco(raiz);
  b.colocar({ id: 'a', fonte: 'criados', licenca: 'nossa', papel: 'elemento' }, vetor(DIM_VISUAL, 1), vetor(DIM_FORMA, 1));
  b.colocar({ id: 'b', fonte: 'publicos', licenca: 'CC0', papel: 'elemento' }, vetor(DIM_VISUAL, 2), vetor(DIM_FORMA, 2));
  assert.throws(() => b.colocar({ id: 'c', fonte: 'publicos' }, vetor(DIM_VISUAL, 3), vetor(DIM_FORMA, 3)), /sem licença/);
  await b.salvar();
  const de_novo = await Banco.abrir(raiz);
  assert.deepEqual(de_novo.resumo(), { total: 2, porFonte: { criados: 1, publicos: 1 } });
  assert.equal(de_novo.visual[1][2], 1);
});

test('a busca ordena pela nota e respeita o filtro de fonte', () => {
  const b = new Banco('/nao-usado');
  b.colocar({ id: 'perto', fonte: 'publicos', licenca: 'CC0' }, vetor(DIM_VISUAL, 5), vetor(DIM_FORMA, 5));
  b.colocar({ id: 'longe', fonte: 'publicos', licenca: 'CC0' }, vetor(DIM_VISUAL, 6), vetor(DIM_FORMA, 6));
  b.colocar({ id: 'nosso', fonte: 'criados', licenca: 'nossa' }, vetor(DIM_VISUAL, 5), vetor(DIM_FORMA, 5));
  const r = buscar(b, { visual: vetor(DIM_VISUAL, 5), forma: vetor(DIM_FORMA, 5) }, { fontes: ['publicos'] });
  assert.deepEqual(r.map((x) => x.item.id), ['perto', 'longe']);
  assert.ok(Math.abs(r[0].nota - 1) < 1e-6);
});

test('a busca mostra uma vez só itens repetidos', () => {
  const b = new Banco('/nao-usado');
  b.colocar({ id: 'a', fonte: 'publicos', licenca: 'CC0' }, vetor(DIM_VISUAL, 5), vetor(DIM_FORMA, 5));
  b.colocar({ id: 'a-copia', fonte: 'publicos', licenca: 'CC0' }, vetor(DIM_VISUAL, 5), vetor(DIM_FORMA, 5));
  b.colocar({ id: 'outro', fonte: 'publicos', licenca: 'CC0' }, vetor(DIM_VISUAL, 6), vetor(DIM_FORMA, 6));
  const r = buscar(b, { visual: vetor(DIM_VISUAL, 5) }, { k: 3 });
  assert.deepEqual(r.map((x) => x.item.id), ['a', 'outro']);
});

test('slug tira acento, extensão e símbolos', () => {
  assert.equal(slug('Ícones/Avião de Papel.PNG'), 'icones-aviao-de-papel');
});
