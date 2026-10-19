// Painel da biblioteca da Mesa: mascotes, elementos, recortes e logos já criados, para escolher e colocar na peça.
// O índice (biblioteca/indice.json) é montado por ferramentas/montar-biblioteca.py e fica fora do git.
// Este módulo só desenha o painel; quem coloca a imagem na cena é o editor (aoEscolher).

const SEM_ACENTO = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Filtro puro (testado em testes/biblioteca.test.js): categoria, subcategoria e busca por todas as palavras.
export function filtrar(itens, { categoria = '', sub = '', busca = '' } = {}) {
  const palavras = SEM_ACENTO(busca).split(/\s+/).filter(Boolean);
  return itens.filter((i) => {
    if (categoria && i.categoria !== categoria) return false;
    if (sub && i.sub !== sub) return false;
    const texto = SEM_ACENTO(`${i.nome} ${i.sub} ${i.fonte ?? ''}`);
    return palavras.every((p) => texto.includes(p));
  });
}

export function subcategorias(itens, categoria) {
  const contagem = new Map();
  for (const i of itens) if (!categoria || i.categoria === categoria) contagem.set(i.sub, (contagem.get(i.sub) ?? 0) + 1);
  return [...contagem].map(([sub, total]) => ({ sub, total }));
}

// Vistas especiais, além das categorias do índice: favoritos e usados há pouco (preferências por pessoa).
export const TIPO_ARRASTO = 'application/x-mesa-biblioteca';
export const VISTA_FAVORITOS = '__fav';
export const VISTA_RECENTES = '__rec';
const MAX_RECENTES = 24;

export function alternarFavorito(prefs, id) {
  const favoritos = prefs.favoritos ?? [];
  return { ...prefs, favoritos: favoritos.includes(id) ? favoritos.filter((x) => x !== id) : [id, ...favoritos] };
}

export function registrarRecente(prefs, id, max = MAX_RECENTES) {
  return { ...prefs, recentes: [id, ...(prefs.recentes ?? []).filter((x) => x !== id)].slice(0, max) };
}

// Itens de uma vista especial, na ordem em que a pessoa os marcou ou usou (ids que sumiram do índice ficam de fora).
export function itensDaVista(itens, prefs, vista) {
  const ids = vista === VISTA_FAVORITOS ? prefs.favoritos ?? [] : vista === VISTA_RECENTES ? prefs.recentes ?? [] : [];
  const porId = new Map(itens.map((i) => [i.id, i]));
  return ids.map((id) => porId.get(id)).filter(Boolean);
}

const POR_PAGINA = 48;
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function iniciarBiblioteca({ raiz, urlIndice, aoEscolher, aoErro, preferencias = null }) {
  const painel = raiz;
  const corpo = painel.querySelector('.bib-corpo');
  let indice;
  try {
    const resposta = await fetch(urlIndice);
    if (!resposta.ok) throw new Error(String(resposta.status));
    indice = await resposta.json();
  } catch (e) {
    corpo.innerHTML = '<p class="dica">A biblioteca não está aqui. Monte com <code>python3 ferramentas/montar-biblioteca.py</code>.</p>';
    aoErro?.(e);
    return;
  }
  const base = new URL(urlIndice, location.href);
  const estado = { categoria: indice.categorias[0]?.id ?? '', sub: '', busca: '', mostrar: POR_PAGINA };
  let prefs = {}; // { favoritos: [ids], recentes: [ids] }
  const guardarPrefs = (novas) => {
    prefs = novas;
    desenhar();
    preferencias?.gravar(prefs).catch(() => {}); // sem gravar, vale até fechar a página
  };
  painel.querySelector('.bib-total').textContent = `${indice.itens.length} itens`;

  corpo.innerHTML = `
    <div class="bib-abas" role="tablist" aria-label="Categorias"></div>
    <div class="bib-filtros">
      <select class="bib-sub" aria-label="Subcategoria"></select>
      <input class="bib-busca" type="search" placeholder="Buscar (ex.: moeda, faraó, banner)" aria-label="Buscar na biblioteca">
    </div>
    <div class="bib-grade" role="list"></div>
    <button type="button" class="pequeno bib-mais" hidden>Mostrar mais</button>
    <p class="dica bib-dica">Clique ou arraste para a peça. Shift+clique troca a imagem da camada selecionada. A estrela guarda nos favoritos.</p>`;
  const abas = corpo.querySelector('.bib-abas');
  const selSub = corpo.querySelector('.bib-sub');
  const busca = corpo.querySelector('.bib-busca');
  const grade = corpo.querySelector('.bib-grade');
  const mais = corpo.querySelector('.bib-mais');

  const desenharAbas = () => {
    const especiais = preferencias ? [
      { id: VISTA_FAVORITOS, rotulo: '★ Favoritos', total: itensDaVista(indice.itens, prefs, VISTA_FAVORITOS).length },
      { id: VISTA_RECENTES, rotulo: 'Recentes', total: itensDaVista(indice.itens, prefs, VISTA_RECENTES).length },
    ] : [];
    abas.innerHTML = [...especiais, ...indice.categorias].map((c) => `<button type="button" role="tab" data-c="${esc(c.id)}" aria-selected="${c.id === estado.categoria}">${esc(c.rotulo)} <small>${c.total}</small></button>`).join('');
    abas.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { estado.categoria = b.dataset.c; estado.sub = ''; estado.mostrar = POR_PAGINA; desenhar(); };
    });
  };

  const desenhar = () => {
    desenharAbas();
    const especial = estado.categoria === VISTA_FAVORITOS || estado.categoria === VISTA_RECENTES;
    selSub.hidden = especial;
    const subs = especial ? [] : subcategorias(indice.itens, estado.categoria);
    selSub.innerHTML = `<option value="">Todas (${subs.reduce((s, x) => s + x.total, 0)})</option>` + subs.map((s) => `<option value="${esc(s.sub)}" ${s.sub === estado.sub ? 'selected' : ''}>${esc(s.sub)} (${s.total})</option>`).join('');
    const lista = estado.busca.trim() ? filtrar(indice.itens, { busca: estado.busca }) // com busca, procura em todas as categorias
      : especial ? itensDaVista(indice.itens, prefs, estado.categoria) : filtrar(indice.itens, estado);
    const favoritos = new Set(prefs.favoritos ?? []);
    grade.innerHTML = lista.slice(0, estado.mostrar).map((i) => `
      <div class="bib-celula" role="listitem">
        <button type="button" class="bib-item" draggable="true" data-id="${esc(i.id)}" title="${esc(`${i.nome}\n${i.sub} · ${i.w}×${i.h}`)}">
          <img src="${esc(new URL(i.arquivo, base).href)}" alt="${esc(i.nome)}" loading="lazy" decoding="async" draggable="false">
          <span>${esc(i.nome)}</span>
        </button>
        ${preferencias ? `<button type="button" class="bib-estrela" data-id="${esc(i.id)}" aria-pressed="${favoritos.has(i.id)}" aria-label="${favoritos.has(i.id) ? 'Tirar dos favoritos' : 'Guardar nos favoritos'}" title="Favorito">${favoritos.has(i.id) ? '★' : '☆'}</button>` : ''}
      </div>`).join('') || `<p class="dica">${especial && !estado.busca.trim() ? (estado.categoria === VISTA_FAVORITOS ? 'Nenhum favorito ainda. Clique na estrela de um item para guardá-lo aqui.' : 'Nada usado ainda. Os últimos itens que você colocar na peça aparecem aqui.') : 'Nada encontrado.'}</p>`;
    mais.hidden = lista.length <= estado.mostrar;
    mais.textContent = `Mostrar mais (${lista.length - estado.mostrar})`;
  };

  const usado = (id) => { if (preferencias) guardarPrefs(registrarRecente(prefs, id)); };
  grade.onclick = (ev) => {
    const estrela = ev.target.closest('.bib-estrela');
    if (estrela) { guardarPrefs(alternarFavorito(prefs, estrela.dataset.id)); return; }
    const b = ev.target.closest('.bib-item');
    if (!b) return;
    const item = indice.itens.find((i) => i.id === b.dataset.id);
    if (!item) return;
    aoEscolher(item, new URL(item.arquivo, base).href, { trocar: ev.shiftKey });
    usado(item.id);
  };
  // Arrastar para a peça: o editor lê o que vai junto e coloca onde foi solto.
  grade.addEventListener('dragstart', (ev) => {
    const b = ev.target.closest?.('.bib-item');
    const item = b && indice.itens.find((i) => i.id === b.dataset.id);
    if (!item) return;
    ev.dataTransfer.effectAllowed = 'copy';
    ev.dataTransfer.setData(TIPO_ARRASTO, JSON.stringify({ id: item.id, nome: item.nome, sub: item.sub, url: new URL(item.arquivo, base).href }));
  });
  grade.addEventListener('dragend', (ev) => {
    const b = ev.target.closest?.('.bib-item');
    if (b && ev.dataTransfer?.dropEffect === 'copy') usado(b.dataset.id);
  });
  selSub.onchange = () => { estado.sub = selSub.value; estado.mostrar = POR_PAGINA; desenhar(); };
  let espera;
  busca.oninput = () => { clearTimeout(espera); espera = setTimeout(() => { estado.busca = busca.value; estado.mostrar = POR_PAGINA; desenhar(); }, 120); };
  mais.onclick = () => { estado.mostrar += POR_PAGINA; desenhar(); };
  desenhar();
  const recarregar = async () => {
    if (!preferencias) return;
    try { prefs = (await preferencias.ler()) ?? {}; } catch { prefs = {}; }
    desenhar();
  };
  await recarregar();
  return { recarregar };
}
