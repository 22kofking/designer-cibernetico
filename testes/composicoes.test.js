import test from 'node:test';
import assert from 'node:assert/strict';
import { capturar, instanciar, reposicionar, caixaDoConjunto, validarComposicao, larguraInicial } from '../editor/composicoes.js';

const F = { largura: 1000, altura: 500 };
const nos = () => [
  { id: 'moeda', tipo: 'imagem', asset: 'a.png', caixa: { x: 0.1, y: 0.2, w: 0.1, h: 0.2 } },
  { id: 'bau', tipo: 'imagem', asset: 'b.png', caixa: { x: 0.3, y: 0.4, w: 0.2, h: 0.4 }, rotacao: 10, secao: 'velha', bloqueado: true },
];

test('o conjunto é o retângulo que envolve as camadas', () => {
  assert.deepEqual(caixaDoConjunto(nos(), F), { x: 100, y: 100, w: 400, h: 300 });
});

test('capturar guarda a disposição relativa e limpa marcas de seção e trava', () => {
  const c = capturar(nos(), F, 'Moeda e baú');
  assert.equal(c.id, 'moeda-e-bau');
  assert.equal(c.aspecto, 1.3333);
  assert.equal(c.nos[0].caixa.x, 0);
  assert.equal(c.nos[1].caixa.x, 0.5);
  assert.equal(c.nos[1].caixa.w, 0.5);
  assert.equal(c.nos[1].secao, undefined);
  assert.equal(c.nos[1].bloqueado, undefined);
  assert.equal(c.nos[1].rotacao, 10);
  assert.equal(validarComposicao(c), null);
});

test('instanciar reproduz a disposição em outra largura, com ids livres e a marca da seção', () => {
  const c = capturar(nos(), F, 'Par');
  const ocupados = new Set(['moeda']);
  const novoId = (b) => { let id = b; for (let k = 2; ocupados.has(id); k++) id = `${b}-${k}`; ocupados.add(id); return id; };
  const novos = instanciar(c, F, { x: 0, y: 0, largura: 200 }, novoId, 'par-1');
  assert.deepEqual(novos.map((n) => n.id), ['moeda-2', 'bau']);
  assert.ok(novos.every((n) => n.secao === 'par-1'));
  const box = caixaDoConjunto(novos, F);
  assert.ok(Math.abs(box.w - 200) < 0.5 && Math.abs(box.h - 150) < 0.5);
  // a distância entre moeda e baú, em frações do conjunto, continua a mesma
  const [m, b] = novos.map((n) => n.caixa);
  assert.ok(Math.abs((b.x - m.x) * F.largura - 100) < 0.5);
});

test('reposicionar leva o conjunto inteiro sem mudar a disposição', () => {
  const n = nos();
  reposicionar(n, F, { x: 0, y: 0, w: 800, h: 600 });
  const box = caixaDoConjunto(n, F);
  assert.deepEqual([box.x, box.y, Math.round(box.w), Math.round(box.h)], [0, 0, 800, 600]);
});

test('larguraInicial respeita a peça', () => {
  assert.equal(larguraInicial({ aspecto: 1 }, F), 400);
  assert.equal(larguraInicial({ aspecto: 4 }, F), 600);
});

test('valida composição quebrada', () => {
  assert.match(validarComposicao({ versao: 1, nome: 'x', aspecto: 1, nos: [{ id: 'a', tipo: 'imagem' }] }), /sem id, tipo ou caixa/);
  assert.match(validarComposicao(null), /não é/);
  assert.throws(() => capturar([], F, 'vazio'));
});
