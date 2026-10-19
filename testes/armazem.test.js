import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptadorMemoria, criarArmazem, slug } from '../editor/armazem.js';
import { adaptadorEspelhado } from '../editor/armazem-navegador.js';

// Relógio controlado: cada chamada avança 1 minuto.
function relogio(inicio = Date.parse('2026-10-19T00:00:00Z')) {
  let t = inicio;
  const f = () => new Date(t).toISOString();
  f.avancar = (ms) => { t += ms; };
  return f;
}

const cena = (titulo = 'a') => ({ versao: 1, nome: titulo, formato: { largura: 1020, altura: 300 }, nos: [] });

const CENAS = [
  { nome: 'convite', rotulo: 'home 1 · convite', origem: 'https://mesa/arara519/convite/cena.json' },
  { nome: 'home-2', rotulo: 'home 2 · rede', origem: 'https://mesa/arara519/home-2/cena.json' },
  { grupo: 'tucano', nome: 'tucano-home-1', rotulo: 'home 1 · convite', origem: 'https://mesa/mascotes-3d/tucano/home-1/cena.json' },
];

test('slug só deixa letras, dígitos e hífen', () => {
  assert.equal(slug('Mascote 3D · onça!'), 'mascote-3d-onca');
  assert.equal(slug(''), 'item');
});

test('semear cria um projeto por grupo e uma peça por cena, uma vez só', async () => {
  const a = criarArmazem(adaptadorMemoria());
  const r1 = await a.semear(CENAS, { nomesGrupo: { '': 'ARARA519', tucano: 'Mascote 3D · tucano' } });
  assert.deepEqual(r1, { projetos: 2, pecas: 3, rascunhos: 0, composicoes: 0 });
  const r2 = await a.semear(CENAS);
  assert.deepEqual(r2, { projetos: 0, pecas: 0, rascunhos: 0, composicoes: 0 });
  const projetos = await a.listarProjetos();
  assert.deepEqual(projetos.map((p) => p.nome), ['ARARA519', 'Mascote 3D · tucano']);
  const pecas = await a.listarPecas({ projeto: 'g-pecas' });
  assert.deepEqual(pecas.map((p) => p.rotulo), ['home 1 · convite', 'home 2 · rede']); // na ordem das cenas
  assert.equal(pecas[0].cena, null);
});

test('semear traz rascunhos e composições antigas do navegador', async () => {
  const a = criarArmazem(adaptadorMemoria());
  const rascunho = cena('editada');
  const r = await a.semear(CENAS, {
    rascunhoDe: (url) => (url.endsWith('home-2/cena.json') ? rascunho : null),
    composicoesAntigas: [{ id: 'moedas', nome: 'Moedas', aspecto: 1, nos: [] }],
  });
  assert.equal(r.rascunhos, 1);
  assert.equal(r.composicoes, 1);
  const p = await a.pecaPelaOrigem(CENAS[1].origem);
  assert.equal(p.cena.nome, 'editada');
  assert.deepEqual(p.formato, rascunho.formato);
  assert.deepEqual((await a.listarComposicoes()).map((c) => c.id), ['moedas']);
});

test('gravarCena guarda a edição e faz versões automáticas a cada intervalo, com limite', async () => {
  const agora = relogio();
  const a = criarArmazem(adaptadorMemoria(), { agora, intervaloAutomatica: 10 * 60e3, maxAutomaticas: 2 });
  const p = await a.criarPeca({ projeto: 'x', nome: 'banner' });
  await a.gravarCena(p.id, cena('1')); // primeira edição: nada a guardar ainda
  agora.avancar(60e3);
  await a.gravarCena(p.id, cena('2')); // 1 min depois: sem versão
  assert.equal((await a.listarVersoes(p.id)).length, 0);
  for (let i = 3; i <= 6; i++) {
    agora.avancar(11 * 60e3);
    await a.gravarCena(p.id, cena(String(i)));
  }
  const versoes = await a.listarVersoes(p.id);
  assert.equal(versoes.length, 2, 'guarda só as 2 automáticas mais novas');
  assert.deepEqual(versoes.map((v) => v.cena.nome), ['5', '4']);
  assert.equal((await a.lerPeca(p.id)).cena.nome, '6');
});

test('versão nomeada não some na poda e restaurar guarda a cena atual antes', async () => {
  const agora = relogio();
  const a = criarArmazem(adaptadorMemoria(), { agora, maxAutomaticas: 0 });
  const p = await a.criarPeca({ projeto: 'x', nome: 'banner', cena: cena('A') });
  const v = await a.salvarVersao(p.id, cena('A'), { nome: 'aprovada' });
  agora.avancar(1000);
  await a.gravarCena(p.id, cena('B'));
  agora.avancar(1000);
  await a.restaurarVersao(v.id);
  assert.equal((await a.lerPeca(p.id)).cena.nome, 'A');
  const nomes = (await a.listarVersoes(p.id)).map((x) => x.nome);
  assert.deepEqual(nomes, ['antes de restaurar', 'aprovada']);
});

test('voltar ao original esvazia a cena e guarda a edição numa versão', async () => {
  const a = criarArmazem(adaptadorMemoria());
  await a.semear(CENAS);
  const p = await a.pecaPelaOrigem(CENAS[0].origem);
  await a.gravarCena(p.id, cena('mexida'));
  await a.voltarAoOriginal(p.id);
  assert.equal((await a.lerPeca(p.id)).cena, null);
  assert.equal((await a.listarVersoes(p.id))[0].cena.nome, 'mexida');
});

test('duplicar cria outra peça com a mesma origem e cena, e arquivar a esconde da lista', async () => {
  const a = criarArmazem(adaptadorMemoria());
  await a.semear(CENAS);
  const p = await a.pecaPelaOrigem(CENAS[2].origem);
  await a.gravarCena(p.id, cena('tucano'));
  const copia = await a.duplicarPeca(p.id, 'tucano para o Natal');
  assert.notEqual(copia.id, p.id);
  assert.equal(copia.origem, p.origem);
  assert.equal(copia.cena.nome, 'tucano');
  assert.equal(copia.projeto, p.projeto);
  await a.atualizarPeca(p.id, { arquivado: true });
  const lista = await a.listarPecas({ projeto: p.projeto });
  assert.deepEqual(lista.map((x) => x.id), [copia.id]);
  assert.equal((await a.listarPecas({ projeto: p.projeto, arquivadas: true })).length, 2);
});

test('criar projeto com nome repetido gera outro id', async () => {
  const a = criarArmazem(adaptadorMemoria());
  const p1 = await a.criarProjeto('Campanha de Natal');
  const p2 = await a.criarProjeto('Campanha de Natal');
  assert.equal(p1.id, 'campanha-de-natal');
  assert.notEqual(p2.id, p1.id);
  assert.match(p2.id, /^campanha-de-natal-[a-z0-9]+$/);
});

test('espelhado: sem rede grava no local, marca pendente e sobe depois', async () => {
  const local = adaptadorMemoria();
  const online = adaptadorMemoria();
  let fora = true;
  const instavel = {
    ...online,
    gravar: async (...x) => { if (fora) throw Object.assign(new Error('sem rede'), { code: 'unavailable' }); return online.gravar(...x); },
    listar: async (...x) => { if (fora) throw new Error('sem rede'); return online.listar(...x); },
    ler: async (...x) => { if (fora) throw new Error('sem rede'); return online.ler(...x); },
  };
  const esp = adaptadorEspelhado(instavel, local);
  const a = criarArmazem(esp);
  const p = await a.criarPeca({ projeto: 'x', nome: 'banner', cena: cena('offline') });
  assert.equal((await a.lerPeca(p.id)).cena.nome, 'offline', 'lê do local enquanto está pendente');
  assert.equal(await online.ler('pecas', p.id), null);
  fora = false;
  assert.equal((await a.lerPeca(p.id)).cena.nome, 'offline', 'pendente ainda vale o local');
  assert.equal(await esp.sincronizar(), 1);
  assert.equal((await online.ler('pecas', p.id)).cena.nome, 'offline');
  assert.equal((await local.listar('_pendentes')).length, 0);
});

test('espelhado: a lista vem do online e atualiza a cópia local', async () => {
  const local = adaptadorMemoria();
  const online = adaptadorMemoria();
  await online.gravar('projetos', 'p1', { nome: 'Do outro aparelho' });
  const a = criarArmazem(adaptadorEspelhado(online, local));
  assert.deepEqual((await a.listarProjetos()).map((p) => p.nome), ['Do outro aparelho']);
  assert.equal((await local.ler('projetos', 'p1')).nome, 'Do outro aparelho');
});

test('miniatura: gravarCena e definirMiniatura guardam sem mudar a data de edição, e a cópia leva junto', async () => {
  const agora = relogio();
  const a = criarArmazem(adaptadorMemoria(), { agora });
  const p = await a.criarPeca({ projeto: 'x', nome: 'banner' });
  const g = await a.gravarCena(p.id, cena('1'), { miniatura: 'data:image/jpeg;base64,AAA' });
  assert.equal(g.miniatura, 'data:image/jpeg;base64,AAA');
  agora.avancar(60e3);
  const m = await a.definirMiniatura(p.id, 'data:image/jpeg;base64,BBB');
  assert.equal(m.alterado, g.alterado);
  assert.equal(m.cena.nome, '1');
  assert.equal((await a.duplicarPeca(p.id)).miniatura, 'data:image/jpeg;base64,BBB');
  assert.equal(await a.definirMiniatura('nao-existe', 'x'), null);
});
