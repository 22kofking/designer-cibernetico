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

test('favoritos: alternar liga e desliga, e o mais novo vem primeiro', async () => {
  const { alternarFavorito } = await import('../editor/biblioteca.js');
  let p = alternarFavorito({}, 'a');
  p = alternarFavorito(p, 'b');
  assert.deepEqual(p.favoritos, ['b', 'a']);
  p = alternarFavorito(p, 'b');
  assert.deepEqual(p.favoritos, ['a']);
});

test('recentes: o último usado vem primeiro, sem repetir e com limite', async () => {
  const { registrarRecente } = await import('../editor/biblioteca.js');
  let p = {};
  for (const id of ['a', 'b', 'c', 'a']) p = registrarRecente(p, id, 3);
  assert.deepEqual(p.recentes, ['a', 'c', 'b']);
  p = registrarRecente(p, 'd', 3);
  assert.deepEqual(p.recentes, ['d', 'a', 'c']);
});

test('itensDaVista segue a ordem das preferências e ignora ids que sumiram', async () => {
  const { itensDaVista, VISTA_FAVORITOS, VISTA_RECENTES } = await import('../editor/biblioteca.js');
  assert.deepEqual(itensDaVista(itens, { favoritos: ['d', 'x', 'a'] }, VISTA_FAVORITOS).map((i) => i.id), ['d', 'a']);
  assert.deepEqual(itensDaVista(itens, { recentes: ['c'] }, VISTA_RECENTES).map((i) => i.id), ['c']);
  assert.deepEqual(itensDaVista(itens, {}, VISTA_RECENTES), []);
});
