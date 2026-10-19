// Armazém da Mesa: onde ficam projetos, peças, versões e composições.
// Funções puras sobre um adaptador de chave e valor (testadas em testes/armazem.test.js);
// os adaptadores do navegador (IndexedDB e o banco da Mesa online) ficam em armazem-navegador.js.
//
// Coleções (cada documento é um objeto JSON com `id`):
//   projetos     { id, nome, grupo, criado, alterado, arquivado }
//   pecas        { id, projeto, nome, rotulo, origem, cena, formato, criado, alterado, arquivado, ultimaAutomatica }
//                `origem` é o endereço da cena que veio pronta (as imagens relativas resolvem a partir dele);
//                `cena` nula quer dizer "igual à origem", sem edição guardada.
//   versoes      { id, peca, nome, automatica, criado, cena }
//   composicoes  { id, nome, aspecto, nos, ... }   (o formato de editor/composicoes.js)
//
// Um adaptador tem quatro funções assíncronas: listar(colecao, filtro?), ler(colecao, id), gravar(colecao, id, doc),
// apagar(colecao, id). O filtro opcional é [campo, valor] (igualdade), para não trazer a coleção inteira.

export const COLECOES = ['projetos', 'pecas', 'versoes', 'composicoes'];

// Ids aceitos por todos os adaptadores (o banco online só aceita letras, dígitos e alguns sinais).
export function slug(texto, reserva = 'item') {
  const s = String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return s || reserva;
}

const sufixo = () => Math.random().toString(36).slice(2, 7);

export const passa = (filtro) => (d) => !filtro || d[filtro[0]] === filtro[1];

export function adaptadorMemoria() {
  const dados = new Map(COLECOES.map((c) => [c, new Map()]));
  const col = (c) => {
    if (!dados.has(c)) dados.set(c, new Map());
    return dados.get(c);
  };
  return {
    tipo: 'memoria',
    async listar(c, filtro) { return [...col(c).values()].filter(passa(filtro)).map((d) => structuredClone(d)); },
    async ler(c, id) { const d = col(c).get(id); return d ? structuredClone(d) : null; },
    async gravar(c, id, doc) { col(c).set(id, structuredClone({ ...doc, id })); },
    async apagar(c, id) { col(c).delete(id); },
  };
}

const porNome = (a, b) => String(a.nome ?? a.id).localeCompare(String(b.nome ?? b.id), 'pt-BR', { numeric: true });

export function criarArmazem(adaptador, {
  agora = () => new Date().toISOString(),
  maxAutomaticas = 20, // versões automáticas guardadas por peça (as nomeadas ficam todas)
  intervaloAutomatica = 10 * 60 * 1000, // uma versão automática a cada 10 min de edição
} = {}) {
  const ms = (iso) => (iso ? Date.parse(iso) : 0);

  async function idLivre(colecao, base) {
    let id = slug(base);
    while (await adaptador.ler(colecao, id)) id = `${slug(base).slice(0, 52)}-${sufixo()}`;
    return id;
  }

  const api = {
    tipo: adaptador.tipo,
    adaptador,

    // ---------- projetos ----------
    async listarProjetos({ arquivados = false } = {}) {
      return (await adaptador.listar('projetos')).filter((p) => arquivados || !p.arquivado).sort(porNome);
    },
    async criarProjeto(nome, extra = {}) {
      const id = await idLivre('projetos', nome);
      const p = { id, nome, grupo: null, arquivado: false, ...extra, criado: agora(), alterado: agora() };
      await adaptador.gravar('projetos', id, p);
      return p;
    },
    async atualizarProjeto(id, campos) {
      const p = await adaptador.ler('projetos', id);
      if (!p) throw new Error(`projeto ${id} não existe`);
      const novo = { ...p, ...campos, id, alterado: agora() };
      await adaptador.gravar('projetos', id, novo);
      return novo;
    },

    // ---------- peças ----------
    async listarPecas({ projeto, arquivadas = false } = {}) {
      return (await adaptador.listar('pecas'))
        .filter((p) => (projeto === undefined || p.projeto === projeto) && (arquivadas || !p.arquivado))
        .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || porNome(a, b));
    },
    lerPeca: (id) => adaptador.ler('pecas', id),
    async pecaPelaOrigem(origem) {
      return (await adaptador.listar('pecas')).find((p) => p.origem === origem) ?? null;
    },
    async criarPeca({ projeto, nome, cena = null, origem = null, rotulo, ...extra }) {
      const id = await idLivre('pecas', `${projeto ?? ''}-${nome}`);
      const p = {
        ...extra, id, projeto: projeto ?? null, nome, rotulo: rotulo ?? nome, origem, cena,
        formato: cena?.formato ?? extra.formato ?? null, arquivado: false, criado: agora(), alterado: agora(),
      };
      await adaptador.gravar('pecas', id, p);
      return p;
    },
    async atualizarPeca(id, campos) {
      const p = await adaptador.ler('pecas', id);
      if (!p) throw new Error(`peça ${id} não existe`);
      const novo = { ...p, ...campos, id, alterado: agora() };
      await adaptador.gravar('pecas', id, novo);
      return novo;
    },
    // Guarda a cena editada. A cada `intervaloAutomatica` de edição, guarda também uma versão automática
    // com a cena de antes (para voltar a um ponto anterior mesmo sem ter nomeado nada).
    async gravarCena(id, cena) {
      const p = await adaptador.ler('pecas', id);
      if (!p) throw new Error(`peça ${id} não existe`);
      const t = agora();
      let ultimaAutomatica = p.ultimaAutomatica ?? null;
      if (p.cena && ms(t) - ms(ultimaAutomatica ?? p.criado) >= intervaloAutomatica) {
        await api.salvarVersao(id, p.cena, { automatica: true });
        ultimaAutomatica = t;
      }
      const novo = { ...p, cena, formato: cena?.formato ?? p.formato, alterado: t, ultimaAutomatica };
      await adaptador.gravar('pecas', id, novo);
      return novo;
    },
    // Volta a peça à cena de origem (descarta a edição guardada, que fica numa versão).
    async voltarAoOriginal(id) {
      const p = await adaptador.ler('pecas', id);
      if (!p?.origem) throw new Error('esta peça não tem original');
      if (p.cena) await api.salvarVersao(id, p.cena, { nome: 'antes de voltar ao original' });
      return api.atualizarPeca(id, { cena: null });
    },
    async duplicarPeca(id, nome) {
      const p = await adaptador.ler('pecas', id);
      if (!p) throw new Error(`peça ${id} não existe`);
      const { id: _i, criado: _c, alterado: _a, ultimaAutomatica: _u, ordem: _o, ...resto } = p;
      return api.criarPeca({ ...resto, nome: nome ?? `${p.nome} (cópia)`, rotulo: nome ?? `${p.rotulo ?? p.nome} (cópia)` });
    },

    // ---------- versões ----------
    async listarVersoes(peca) {
      return (await adaptador.listar('versoes', ['peca', peca])).filter((v) => v.peca === peca).sort((a, b) => ms(b.criado) - ms(a.criado));
    },
    async salvarVersao(peca, cena, { nome = null, automatica = false } = {}) {
      const t = agora();
      const v = { id: `${slug(peca).slice(0, 40)}-${ms(t).toString(36)}-${sufixo()}`, peca, nome, automatica, criado: t, cena };
      await adaptador.gravar('versoes', v.id, v);
      if (automatica) {
        const autos = (await api.listarVersoes(peca)).filter((x) => x.automatica);
        for (const velha of autos.slice(maxAutomaticas)) await adaptador.apagar('versoes', velha.id);
      }
      return v;
    },
    // Restaurar não apaga nada: a cena atual vira uma versão antes de dar lugar à escolhida.
    async restaurarVersao(idVersao) {
      const v = await adaptador.ler('versoes', idVersao);
      if (!v) throw new Error('versão não encontrada');
      const p = await adaptador.ler('pecas', v.peca);
      if (p?.cena) await api.salvarVersao(v.peca, p.cena, { nome: 'antes de restaurar' });
      return api.atualizarPeca(v.peca, { cena: v.cena });
    },
    async renomearVersao(idVersao, nome) {
      const v = await adaptador.ler('versoes', idVersao);
      if (!v) throw new Error('versão não encontrada');
      await adaptador.gravar('versoes', v.id, { ...v, nome, automatica: false });
    },
    apagarVersao: (id) => adaptador.apagar('versoes', id),

    // ---------- composições ----------
    async listarComposicoes() { return (await adaptador.listar('composicoes')).sort(porNome); },
    gravarComposicao: (comp) => adaptador.gravar('composicoes', slug(comp.id), { ...comp, id: slug(comp.id) }),
    apagarComposicao: (id) => adaptador.apagar('composicoes', slug(id)),

    // ---------- primeira abertura ----------
    // As cenas que vêm prontas com a página (window.CENAS) viram projetos e peças, uma vez.
    // Rascunhos antigos (localStorage) entram como a cena editada da peça, e as composições
    // antigas entram na coleção. Rodar de novo só cria o que falta.
    async semear(cenas = [], { nomesGrupo = {}, rascunhoDe = () => null, composicoesAntigas = [] } = {}) {
      const criados = { projetos: 0, pecas: 0, rascunhos: 0, composicoes: 0 };
      const projetos = new Map((await adaptador.listar('projetos')).map((p) => [p.id, p]));
      const pecas = await adaptador.listar('pecas');
      const origens = new Set(pecas.map((p) => p.origem).filter(Boolean));
      let ordem = 0;
      for (const c of cenas) {
        ordem++;
        const grupo = c.grupo ?? '';
        const idProjeto = slug(`g-${grupo || 'pecas'}`);
        if (!projetos.has(idProjeto)) {
          const p = { id: idProjeto, nome: nomesGrupo[grupo] ?? (grupo || 'Peças'), grupo, arquivado: false, criado: agora(), alterado: agora() };
          await adaptador.gravar('projetos', idProjeto, p);
          projetos.set(idProjeto, p);
          criados.projetos++;
        }
        if (origens.has(c.origem)) continue;
        const rascunho = rascunhoDe(c.origem);
        const id = await idLivre('pecas', c.nome ?? c.rotulo);
        await adaptador.gravar('pecas', id, {
          id, projeto: idProjeto, nome: c.rotulo ?? c.nome, rotulo: c.rotulo ?? c.nome, origem: c.origem, ordem,
          cena: rascunho, formato: rascunho?.formato ?? null, arquivado: false, criado: agora(), alterado: agora(),
        });
        origens.add(c.origem);
        criados.pecas++;
        if (rascunho) criados.rascunhos++;
      }
      const existentes = new Set((await adaptador.listar('composicoes')).map((c) => c.id));
      for (const comp of composicoesAntigas) {
        if (!comp?.id || existentes.has(slug(comp.id))) continue;
        await api.gravarComposicao(comp);
        criados.composicoes++;
      }
      return criados;
    },
  };
  return api;
}
