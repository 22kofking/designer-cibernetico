import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrar, subcategorias } from '../editor/biblioteca.js';

const itens = [
  { id: 'a', categoria: 'mascotes', sub: 'Capivara (IA, tratada)', nome: 'Capivara faraó · aponta', fonte: 'Z-Image' },
  { id: 'b', categoria: 'mascotes', sub: 'Arara (rei e turista)', nome: 'Arara rei · convite', fonte: 'folha' },
  { id: 'c', categoria: 'recortes', sub: 'Moedas', nome: 'moeda 3 · home-3', fonte: 'recorte da ARARA519' },
  { id: 'd', categoria: 'elementos-3d', sub: 'Mestres', nome: 'Moeda com coroa', fonte: 'Z-Image' },
];

test('filtra por categoria e subcategoria', () => {
  assert.deepEqual(filtrar(itens, { categoria: 'mascotes' }).map((i) => i.id), ['a', 'b']);
  assert.deepEqual(filtrar(itens, { categoria: 'mascotes', sub: 'Arara (rei e turista)' }).map((i) => i.id), ['b']);
});

test('busca ignora acento e caixa e exige todas as palavras', () => {
  assert.deepEqual(filtrar(itens, { busca: 'FARAO' }).map((i) => i.id), ['a']);
  assert.deepEqual(filtrar(itens, { busca: 'moeda coroa' }).map((i) => i.id), ['d']);
  assert.deepEqual(filtrar(itens, { busca: 'moeda' }).map((i) => i.id), ['c', 'd']);
  assert.deepEqual(filtrar(itens, { busca: 'inexistente' }), []);
});

test('subcategorias contam os itens da categoria', () => {
  assert.deepEqual(subcategorias(itens, 'mascotes'), [
    { sub: 'Capivara (IA, tratada)', total: 1 }, { sub: 'Arara (rei e turista)', total: 1 }]);
});
