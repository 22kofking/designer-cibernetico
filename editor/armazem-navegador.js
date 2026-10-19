// Adaptadores do Armazém no navegador.
// - IndexedDB: cópia local, funciona sem rede e cabe centenas de MB (o localStorage de antes parava em ~5 MB).
// - Banco da Mesa online (capacidade `db` do claude.ai): vale em qualquer aparelho e o Claude lê e grava.
// - Espelhado: grava nos dois e lê do online quando ele responde; o que não subiu fica pendente e sobe depois.
import { COLECOES, criarArmazem, passa } from './armazem.js';

const NOME_BANCO = 'mesa-de-cena';

export function adaptadorIndexedDB(nome = NOME_BANCO) {
  const pronto = new Promise((ok, erro) => {
    const pedido = indexedDB.open(nome, 1);
    pedido.onupgradeneeded = () => {
      for (const c of [...COLECOES, '_pendentes']) {
        if (!pedido.result.objectStoreNames.contains(c)) pedido.result.createObjectStore(c, { keyPath: 'id' });
      }
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => erro(pedido.error);
  });
  const fazer = async (colecao, modo, acao) => {
    const banco = await pronto;
    return new Promise((ok, erro) => {
      const tx = banco.transaction(colecao, modo);
      const r = acao(tx.objectStore(colecao));
      tx.oncomplete = () => ok(r?.result);
      tx.onerror = () => erro(tx.error);
      tx.onabort = () => erro(tx.error ?? new Error('transação abortada'));
    });
  };
  return {
    tipo: 'navegador',
    pronto,
    listar: async (c, filtro) => (await fazer(c, 'readonly', (s) => s.getAll())).filter(passa(filtro)),
    ler: async (c, id) => (await fazer(c, 'readonly', (s) => s.get(id))) ?? null,
    gravar: (c, id, doc) => fazer(c, 'readwrite', (s) => s.put({ ...doc, id })),
    apagar: (c, id) => fazer(c, 'readwrite', (s) => s.delete(id)),
  };
}

// O banco do claude.ai guarda documentos em `colecao/id`; o id vai no caminho, não no corpo.
export function adaptadorBancoOnline(db) {
  const tentar = async (f) => {
    try { return await f(); } catch (e) {
      if (e?.code !== 'unavailable') throw e;
      await new Promise((ok) => setTimeout(ok, 300 + Math.random() * 700));
      return f();
    }
  };
  return {
    tipo: 'online',
    async listar(c, filtro) {
      const consulta = filtro ? db.collection(c).where(filtro[0], '==', filtro[1]) : db.collection(c);
      const snap = await tentar(() => consulta.get());
      return snap.docs.map((d) => ({ ...structuredClone(d.data()), id: d.id }));
    },
    async ler(c, id) {
      const d = await tentar(() => db.doc(`${c}/${id}`).get());
      return d.exists ? { ...structuredClone(d.data()), id: d.id } : null;
    },
    async gravar(c, id, doc) {
      const { id: _id, ...corpo } = doc;
      await tentar(() => db.doc(`${c}/${id}`).set(JSON.parse(JSON.stringify(corpo))));
    },
    apagar: (c, id) => tentar(() => db.doc(`${c}/${id}`).delete()),
  };
}

// Online manda; a cópia local responde quando o online falha e guarda o que ficou por subir.
export function adaptadorEspelhado(online, local, { aoFalhar = () => {} } = {}) {
  const chave = (c, id) => `${c}/${id}`;
  const pendente = (c, id, apagar = false) => local.gravar('_pendentes', chave(c, id), { colecao: c, doc: id, apagar });
  async function subir(c, id, f) {
    try {
      await f();
      await local.apagar('_pendentes', chave(c, id));
    } catch (e) {
      if (e?.code === 'invalid_argument' || e?.code === 'quota_exceeded') aoFalhar(e, c, id);
      await pendente(c, id, false);
    }
  }
  return {
    tipo: 'online',
    async listar(c, filtro) {
      try {
        const docs = await online.listar(c, filtro);
        const pend = new Set((await local.listar('_pendentes')).filter((p) => p.colecao === c).map((p) => p.doc));
        // o que ainda não subiu vale a cópia local
        const locais = pend.size ? await local.listar(c, filtro) : [];
        const mistura = new Map(docs.map((d) => [d.id, d]));
        for (const d of locais) if (pend.has(d.id)) mistura.set(d.id, d);
        for (const d of mistura.values()) if (!pend.has(d.id)) await local.gravar(c, d.id, d);
        return [...mistura.values()];
      } catch {
        return local.listar(c, filtro);
      }
    },
    async ler(c, id) {
      const pend = await local.ler('_pendentes', chave(c, id));
      if (pend) return local.ler(c, id);
      try { return await online.ler(c, id); } catch { return local.ler(c, id); }
    },
    async gravar(c, id, doc) {
      await local.gravar(c, id, doc);
      await subir(c, id, () => online.gravar(c, id, doc));
    },
    async apagar(c, id) {
      await local.apagar(c, id);
      try { await online.apagar(c, id); await local.apagar('_pendentes', chave(c, id)); } catch { await pendente(c, id, true); }
    },
    // Sobe o que ficou pendente (sem rede, ou o online falhou). Devolve quantos subiram.
    async sincronizar() {
      let n = 0;
      for (const p of await local.listar('_pendentes')) {
        try {
          if (p.apagar) await online.apagar(p.colecao, p.doc);
          else {
            const doc = await local.ler(p.colecao, p.doc);
            if (doc) await online.gravar(p.colecao, p.doc, doc);
          }
          await local.apagar('_pendentes', p.id);
          n++;
        } catch { /* fica para a próxima */ }
      }
      return n;
    },
  };
}

// Capacidades do claude.ai, quando a Mesa está publicada lá; fora dele (npm run editor) não há nenhuma.
async function capacidade(nome) {
  if (!window.claude?.use) return null;
  try { return await window.claude.use(nome); } catch { return null; }
}

let assetsPromessa;
const assets = () => (assetsPromessa ??= capacidade('assets'));

// Abre o armazém certo para onde a Mesa está rodando.
export async function abrirArmazem({ aoFalhar } = {}) {
  const local = adaptadorIndexedDB();
  try { await local.pronto; } catch { return { armazem: null, onde: 'nenhum' }; }
  const db = await capacidade('db');
  if (!db) return { armazem: criarArmazem(local), onde: 'navegador' };
  const espelho = adaptadorEspelhado(adaptadorBancoOnline(db), local, { aoFalhar });
  espelho.sincronizar().catch(() => {});
  return { armazem: criarArmazem(espelho), onde: 'online', sincronizar: () => espelho.sincronizar() };
}

// Imagem nova colocada na Mesa: na Mesa online vai para o depósito de imagens (fica fora da cena, que
// tem limite de 256 KB por documento); fora dele, continua como data URL dentro da cena.
export async function guardarImagem(arquivo, comoDataUrl) {
  const a = await assets();
  if (a) {
    try {
      const r = await a.upload(arquivo);
      return { asset: `/_blob/${r.id}`, onde: 'online' };
    } catch (e) {
      console.warn('upload da imagem falhou, fica dentro da cena', e);
    }
  }
  return { asset: await comoDataUrl(arquivo), onde: 'cena' };
}

// Cena com imagens embutidas (PSD aberto, imagem colocada fora da Mesa online): na Mesa online, cada
// data URL sobe para o depósito e a cena passa a apontar para ele. Altera a cena; devolve quantas subiram.
export async function tirarImagensDaCena(cena) {
  const a = await assets();
  if (!a) return 0;
  let n = 0;
  const andar = async (nos) => {
    for (const no of nos ?? []) {
      if (typeof no.asset === 'string' && no.asset.startsWith('data:')) {
        try {
          const blob = await (await fetch(no.asset)).blob();
          const r = await a.upload(blob);
          no.asset = `/_blob/${r.id}`;
          n++;
        } catch (e) { console.warn('imagem ficou dentro da cena', e); }
      }
      await andar(no.filhos);
    }
  };
  await andar(cena.nos);
  return n;
}
