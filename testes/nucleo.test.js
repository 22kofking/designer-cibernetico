import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, registerFont } from 'canvas';
import { encaixar, caixaEmPixels, caixaEmFracoes, validarCena } from '../src/nucleo/cena.js';
import { distribuir } from '../src/nucleo/layout.js';
import { encaixarTexto } from '../src/nucleo/texto.js';
import { criarMedidor } from '../src/nucleo/render.js';

registerFont(new URL('../assets/fontes/Montserrat-Black.ttf', import.meta.url).pathname, { family: 'Montserrat', weight: '900' });
const medidor = criarMedidor(createCanvas(10, 10).getContext('2d'));
const formato = { largura: 2040, altura: 600 };
const fonte = { familia: 'Montserrat', peso: 900 };

test('encaixar conter com âncora na base encosta embaixo e centraliza', () => {
  const p = encaixar(400, 600, { x: 0, y: 0, w: 1000, h: 300 }, 'conter', 'base');
  assert.equal(p.escalaX, 0.5);
  assert.equal(p.y, 0);
  assert.equal(p.x, 400);
});

test('encaixar cobrir preenche a caixa inteira', () => {
  const p = encaixar(100, 100, { x: 0, y: 0, w: 300, h: 100 }, 'cobrir');
  assert.equal(p.escalaX, 3);
});

test('frações e pixels vão e voltam', () => {
  const c = { x: 0.074, y: 0.3, w: 0.32, h: 0.53 };
  assert.deepEqual(caixaEmFracoes(caixaEmPixels(c, formato), formato), c);
});

test('distribuir em coluna centralizada respeita as margens', () => {
  const r = distribuir({ x: 10, y: 0, w: 100, h: 100 }, [{ w: 50, h: 20 }, { w: 30, h: 20, margemAntes: 10 }], { justificar: 'centro' });
  assert.equal(r[0].y, 25);
  assert.equal(r[1].y, 55);
  assert.equal(r[0].x, 10);
});

test('texto cabe na caixa e respeita o peso das linhas', () => {
  const caixa = caixaEmPixels({ x: 0.074, y: 0.3, w: 0.32, h: 0.53 }, formato);
  const no = {
    tipo: 'bloco_texto', fonte, vao: 0.28,
    linhas: [{ texto: 'Área de', peso: 1 }, { texto: 'Membro', peso: 1 }, { texto: 'VIP', peso: 4 }],
  };
  const linhas = encaixarTexto(no, caixa, medidor, formato);
  assert.equal(linhas[0].texto, 'ÁREA DE');
  assert.ok(Math.abs(linhas[2].tamanho / linhas[0].tamanho - 4) < 1e-9);
  for (const l of linhas) {
    assert.ok(l.x >= caixa.x - 0.5 && l.x + l.largura <= caixa.x + caixa.w + 1, `${l.texto} passou da largura`);
    assert.ok(l.topo >= caixa.y - 0.5 && l.base <= caixa.y + caixa.h + 1, `${l.texto} passou da altura`);
  }
});

test('texto comprido encolhe para caber na largura', () => {
  const caixa = { x: 0, y: 0, w: 300, h: 600 };
  const no = { tipo: 'bloco_texto', fonte, linhas: [{ texto: 'Chuva de envelopes todo dia', peso: 1 }] };
  const [l] = encaixarTexto(no, caixa, medidor, formato);
  assert.ok(l.largura <= 301);
  assert.ok(l.base - l.topo < 600);
});

test('validarCena aponta id repetido e estilo inexistente', () => {
  const erros = validarCena({
    versao: '0.1', formato,
    nos: [
      { id: 'a', tipo: 'retangulo' },
      { id: 'a', tipo: 'bloco_texto', linhas: [{ texto: 'x', estilo: 'nenhum' }], estilos: {} },
    ],
  });
  assert.ok(erros.some((e) => e.includes('id repetido')));
  assert.ok(erros.some((e) => e.includes('estilo "nenhum"')));
});
