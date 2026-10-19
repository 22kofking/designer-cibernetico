// Armazém da Mesa: onde ficam projetos, peças, versões e composições.
// Funções puras sobre um adaptador de chave e valor (testadas em testes/armazem.test.js);
// os adaptadores do navegador (IndexedDB e o banco da Mesa online) ficam em armazem-navegador.js.
//
// Coleções (cada documento é um objeto JSON com `id`):
//   projetos     { id, nome, grupo, criado, alterado, arquivado }
//   pecas        { id, projeto, pasta, nome, rotulo, origem, cena, formato, miniatura, criado, alterado, arquivado, ultimaAutomatica }
//                `pasta` é o nome de uma pasta dentro do projeto (texto livre; vazio = fora de pastas);
//                `miniatura` é um JPEG pequeno em data URL (cerca de 10 a 25 KB).
//                `origem` é o endereço da cena que veio pronta (as imagens relativas resolvem a partir dele);
//                `cena` nula quer dizer "igual à origem", sem edição guardada.
//   versoes      { id, peca, nome, automatica, criado, cena }
//   composicoes  { id, nome, aspecto, nos, ... }   (o formato de editor/composicoes.js)
//   modelos      { id, nome, categoria, cena, base, formato, miniatura, criado }   (peça pronta para começar outras)
//   preferencias { id, ... }   (por pessoa e peça de interface, como os favoritos da Biblioteca)
//   marcas       { id, nome, cores: [{ hex, nome? }], fontes: [{ familia, peso, arquivo? }], logos: [{ nome, asset }], criado, alterado }
//
// Um adaptador tem quatro funções assíncronas: listar(colecao, filtro?), ler(colecao, id), gravar(colecao, id, doc),
// apagar(colecao, id). O filtro opcional é [campo, valor] (igualdade), para não trazer a coleção inteira.

export const COLECOES = ['projetos', 'pecas', 'versoes', 'composicoes', 'modelos', 'marcas', 'preferencias'];

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
    async gravarCena(id, cena, { miniatura } = {}) {
      const p = await adaptador.ler('pecas', id);
      if (!p) throw new Error(`peça ${id} não existe`);
      const t = agora();
      let ultimaAutomatica = p.ultimaAutomatica ?? null;
      if (p.cena && ms(t) - ms(ultimaAutomatica ?? p.criado) >= intervaloAutomatica) {
        await api.salvarVersao(id, p.cena, { automatica: true });
        ultimaAutomatica = t;
      }
      const novo = { ...p, cena, formato: cena?.formato ?? p.formato, alterado: t, ultimaAutomatica };
      if (miniatura) novo.miniatura = miniatura;
      await adaptador.gravar('pecas', id, novo);
      return novo;
    },
    // A miniatura (imagem pequena em data URL) não conta como edição: `alterado` não muda.
    async definirMiniatura(id, miniatura) {
      const p = await adaptador.ler('pecas', id);
      if (!p) return null;
      const novo = { ...p, miniatura };
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
      const { id: _i, criado: _c, alterado: _a, ultimaAutomatica: _u, ordem: _o, ...resto } = p; // a miniatura vai junto
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

    // ---------- modelos ----------
    async listarModelos() { return (await adaptador.listar('modelos')).sort(porNome); },
    lerModelo: (id) => adaptador.ler('modelos', id),
    // `base` é o endereço a partir do qual as imagens relativas da cena resolvem.
    async salvarModelo({ nome, categoria = null, cena, base = null, miniatura = null }) {
      const id = await idLivre('modelos', nome);
      const m = { id, nome, categoria, cena: structuredClone(cena), base, formato: cena?.formato ?? null, miniatura, criado: agora() };
      await adaptador.gravar('modelos', id, m);
      return m;
    },
    async atualizarModelo(id, campos) {
      const m = await adaptador.ler('modelos', id);
      if (!m) throw new Error('modelo não encontrado');
      const novo = { ...m, ...campos, id };
      await adaptador.gravar('modelos', id, novo);
      return novo;
    },
    apagarModelo: (id) => adaptador.apagar('modelos', id),
    // Uma peça nova, própria (sem original), com a cena do modelo.
    async criarPecaDeModelo(idModelo, { projeto, nome } = {}) {
      const m = await adaptador.ler('modelos', idModelo);
      if (!m) throw new Error('modelo não encontrado');
      return api.criarPeca({ projeto, nome: nome ?? m.nome, cena: structuredClone(m.cena), base: m.base, miniatura: m.miniatura });
    },

    // ---------- marcas (kit: cores, fontes e logos) ----------
    async listarMarcas() { return (await adaptador.listar('marcas')).sort(porNome); },
    async criarMarca(nome, kit = {}) {
      const id = await idLivre('marcas', nome);
      const m = { cores: [], fontes: [], logos: [], ...kit, id, nome, criado: agora(), alterado: agora() };
      await adaptador.gravar('marcas', id, m);
      return m;
    },
    async atualizarMarca(id, campos) {
      const m = await adaptador.ler('marcas', id);
      if (!m) throw new Error('marca não encontrada');
      const novo = { ...m, ...campos, id, alterado: agora() };
      await adaptador.gravar('marcas', id, novo);
      return novo;
    },
    apagarMarca: (id) => adaptador.apagar('marcas', id),

    // ---------- preferências (favoritos e recentes da Biblioteca, por exemplo) ----------
    lerPreferencia: (id) => adaptador.ler('preferencias', slug(id)),
    gravarPreferencia: (id, doc) => adaptador.gravar('preferencias', slug(id), { ...doc, id: slug(id) }),

    // ---------- backup: tudo num arquivo ----------
    async exportarTudo() {
      const colecoes = {};
      for (const c of COLECOES) colecoes[c] = await adaptador.listar(c);
      return { formato: 'mesa-armazem', versao: 1, criado: agora(), colecoes };
    },
    // Junta ao que já existe: o que falta entra, o que existe só é trocado se o do arquivo for mais novo
    // (`alterado`); nada é apagado. Devolve a contagem por coleção.
    async importarTudo(dados) {
      if (dados?.formato !== 'mesa-armazem' || typeof dados.colecoes !== 'object') throw new Error('este arquivo não é um backup da Mesa');
      const resultado = {};
      for (const c of COLECOES) {
        const docs = Array.isArray(dados.colecoes[c]) ? dados.colecoes[c] : [];
        const r = { novos: 0, atualizados: 0, ignorados: 0 };
        for (const doc of docs) {
          if (!doc?.id) { r.ignorados++; continue; }
          const atual = await adaptador.ler(c, doc.id);
          if (!atual) { await adaptador.gravar(c, doc.id, doc); r.novos++; }
          else if (doc.alterado && ms(doc.alterado) > ms(atual.alterado)) { await adaptador.gravar(c, doc.id, doc); r.atualizados++; }
          else r.ignorados++;
        }
        resultado[c] = r;
      }
      return resultado;
    },

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
