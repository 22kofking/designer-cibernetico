import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { caixaQueCobre } from '../src/agentes/diretor.js';
import { nosDaParte, substituir } from '../src/agentes/especialistas.js';
import { criticar } from '../src/agentes/critico.js';
import { guardarPeca } from '../src/agentes/bibliotecario.js';
import { deltaE2000, deltaPaletas, fracaoDeOuro, perfilDeLuz } from '../src/qualidade/cor.js';

test('ΔE2000 bate com os dados de Sharma (2005)', () => {
  assert.ok(Math.abs(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) - 2.0425) < 1e-3);
  assert.ok(Math.abs(deltaE2000([50, -1.3802, -84.2814], [50, 0, -82.7485]) - 1.0) < 1e-3);
  assert.ok(Math.abs(deltaE2000([50, 2.5, 0], [73, 25, -18]) - 27.1492) < 1e-3);
  const p = [{ lab: [50, 10, 10], peso: 1 }];
  assert.equal(deltaPaletas(p, p), 0);
});

test('perfil de luz e ouro: esquerda preta, direita dourada', async () => {
  const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><rect width="100" height="50" fill="#000"/><rect x="100" width="100" height="50" fill="#f5c518"/></svg>')).png().toBuffer();
  const luz = await perfilDeLuz(png);
  assert.ok(luz.porFaixa[0] < 10 && luz.porFaixa[9] > 150);
  assert.ok(Math.abs((await fracaoDeOuro(png)) - 0.5) < 0.05);
});

test('especialista troca só os nós da sua parte, no mesmo lugar', () => {
  const cena = { nos: [{ id: 'cena' }, { id: 'moedas-1' }, { id: 'moedas-2' }, { id: 'mascote' }, { id: 'texto' }] };
  assert.deepEqual(nosDaParte(cena, 'moedas').map((n) => n.id), ['moedas-1', 'moedas-2']);
  substituir(cena, 'mascote', [{ id: 'mascote-corpo' }, { id: 'mascote-orbe' }]);
  assert.deepEqual(cena.nos.map((n) => n.id), ['cena', 'moedas-1', 'moedas-2', 'mascote-corpo', 'mascote-orbe', 'texto']);
  substituir(cena, 'mascote', [{ id: 'mascote' }]);
  assert.deepEqual(cena.nos.map((n) => n.id), ['cena', 'moedas-1', 'moedas-2', 'mascote', 'texto']);
  assert.deepEqual(caixaQueCobre([[0.1, 0.2, 0.1, 0.1], [0.15, 0.4, 0.2, 0.1]]).map((v) => +v.toFixed(2)), [0.1, 0.2, 0.25, 0.3]);
});

test('crítico: igual à referência passa; lugar vazio e regra da ficha reprovam', async () => {
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'critico-'));
  const cena = {
    versao: '0.1', nome: 't', formato: { largura: 200, altura: 100, fundo: '#000000' },
    nos: [
      { id: 'cena', papel: 'fundo', tipo: 'gradiente', direcao: 'horizontal', caixa: { x: 0, y: 0, w: 1, h: 1 }, paradas: [[0, '#050203'], [1, '#e8a020']] },
      { id: 'moedas', papel: 'elemento', tipo: 'retangulo', caixa: { x: 0.7, y: 0.2, w: 0.2, h: 0.3 }, cor: '#e5682d', opacidade: 0.3 },
    ],
  };
  const { renderizar } = await import('../src/node/render-node.js');
  const referencia = path.join(pasta, 'ref.png');
  await writeFile(referencia, (await renderizar(cena, pasta)).getNodeCanvas().toBuffer('image/png'));
  const grafo = { tamanho_px: [200, 100], tema: 'x', nos: [{ id: 'cena', tipo: 'fundo' }, { id: 'moedas', tipo: 'objeto_grupo', caixa: [0.7, 0.2, 0.2, 0.3] }] };
  const tarefas = [
    { no: 'cena', papel: 'fundo', especialista: 'cenarista', caixa: [0, 0, 1, 1], opcoes: [] },
    { no: 'moedas', papel: 'elemento', especialista: 'ilustrador_elementos', caixa: [0.7, 0.2, 0.2, 0.3], opcoes: [] },
  ];
  const marca = { critico: { delta_max: 10, L_mediana: [0, 255], esquerda_mais_escura_que_centro: true } };
  const r = await criticar(cena, pasta, { grafo, referencia, marca, tarefas });
  assert.equal(r.partes[0].ok, true);
  assert.equal(r.partes[0].delta, 0);
  assert.match(r.partes[1].problemas.join(), /lugar vazio/);
  assert.equal(r.regras.find((x) => /esquerda/.test(x.regra)).ok, true);
  const invertida = { ...cena, nos: [{ ...cena.nos[0], paradas: [[0, '#e8a020'], [1, '#050203']] }] };
  const r2 = await criticar(invertida, pasta, { grafo, referencia, marca, tarefas: tarefas.slice(0, 1) });
  assert.equal(r2.aprovado, false);
  assert.ok(r2.problemas.some((p) => /esquerda/.test(p)));
});

test('bibliotecário não guarda sem a aprovação do dono', async () => {
  await assert.rejects(guardarPeca({}, '/tmp/nada'), /aprovada pelo dono/);
});
