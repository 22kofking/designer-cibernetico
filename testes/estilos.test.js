import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { renderizar } from '../src/node/render-node.js';

const pasta = path.resolve(new URL('..', import.meta.url).pathname);
// Quadrado vermelho de 4x4 como imagem embutida (data:), como o editor grava ao colocar uma imagem.
const PNG_VERMELHO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==';

function pixel(canvas, x, y) {
  const d = canvas.getNodeCanvas().getContext('2d').getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

const base = (nos) => ({ versao: '0.1', nome: 't', formato: { largura: 200, altura: 100, fundo: '#000000' }, fontes: [], nos });

test('brilho externo pinta em volta do retângulo e contorno pinta a borda', async () => {
  const cena = base([{
    id: 'r', tipo: 'retangulo', caixa: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, cor: '#0000ff',
    efeitos: { brilho: { cor: '#00ff00', opacidade: 1, tamanho: 20 }, contorno: { cor: '#ff0000', largura: 6 } },
  }]);
  const c = await renderizar(cena, pasta);
  const fora = pixel(c, 56, 50); // 4 px à esquerda do retângulo (que começa em x=60)
  assert.ok(fora[1] > 40 && fora[1] > fora[0], `sem brilho verde fora: ${fora}`);
  const borda = pixel(c, 61, 50);
  assert.ok(borda[0] > 150 && borda[2] < 100, `sem contorno vermelho: ${borda}`);
  assert.deepEqual(pixel(c, 100, 50), [0, 0, 255]);
});

test('ajustes e mistura mudam a imagem embutida', async () => {
  const normal = await renderizar(base([{ id: 'i', tipo: 'imagem', asset: PNG_VERMELHO, caixa: { x: 0, y: 0, w: 1, h: 1 }, encaixe: 'esticar' }]), pasta);
  assert.ok(pixel(normal, 100, 50)[0] > 200);
  const ajustada = await renderizar(base([{ id: 'i', tipo: 'imagem', asset: PNG_VERMELHO, caixa: { x: 0, y: 0, w: 1, h: 1 }, encaixe: 'esticar', ajustes: { matiz: 120 } }]), pasta);
  const [r, g] = pixel(ajustada, 100, 50);
  assert.ok(g > r, `matiz não girou: ${pixel(ajustada, 100, 50)}`);
  const mistura = await renderizar(base([
    { id: 'fundo', tipo: 'retangulo', caixa: { x: 0, y: 0, w: 1, h: 1 }, cor: '#808080' },
    { id: 'i', tipo: 'imagem', asset: PNG_VERMELHO, caixa: { x: 0, y: 0, w: 1, h: 1 }, encaixe: 'esticar', mistura: 'multiplicar' },
  ]), pasta);
  const m = pixel(mistura, 100, 50);
  assert.ok(m[0] > 100 && m[0] < 150 && m[1] < 20, `multiplicar errado: ${m}`);
});

test('tom tinge a imagem embutida com a cor escolhida', async () => {
  const tingida = await renderizar(base([{ id: 'i', tipo: 'imagem', asset: PNG_VERMELHO, caixa: { x: 0, y: 0, w: 1, h: 1 }, encaixe: 'esticar', ajustes: { tom: { cor: '#0000ff', intensidade: 1 } } }]), pasta);
  const [r, , b] = pixel(tingida, 100, 50);
  assert.ok(b > 200 && r < 60, `tom azul não aplicou: ${pixel(tingida, 100, 50)}`);
  const meio = await renderizar(base([{ id: 'i', tipo: 'imagem', asset: PNG_VERMELHO, caixa: { x: 0, y: 0, w: 1, h: 1 }, encaixe: 'esticar', ajustes: { tom: { cor: '#0000ff', intensidade: 0.5 } } }]), pasta);
  const [rm, , bm] = pixel(meio, 100, 50);
  assert.ok(rm > r && bm < b, `intensidade não reduziu o tom: ${pixel(meio, 100, 50)}`);
});
