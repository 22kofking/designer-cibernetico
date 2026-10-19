// Kit da marca: cores, fontes e logos de uma peça, e a troca de cor numa camada.
// Funções puras sobre a cena (testadas em testes/marca.test.js); o painel está em marca-painel.js.

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizarHex(h) {
  if (typeof h !== 'string' || !HEX.test(h.trim())) return null;
  let v = h.trim().toLowerCase();
  if (v.length === 4) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v;
}

function andar(nos, f) {
  for (const n of nos ?? []) {
    f(n);
    if (n.filhos) andar(n.filhos, f);
  }
}

// Cores usadas na peça, das mais frequentes para as menos (no máximo `limite`).
export function coresDaCena(cena, limite = 16) {
  const conta = new Map();
  const soma = (h, peso = 1) => {
    const v = normalizarHex(h);
    if (v) conta.set(v, (conta.get(v) ?? 0) + peso);
  };
  soma(cena.formato?.fundo, 0.5);
  andar(cena.nos, (n) => {
    soma(n.cor);
    for (const est of Object.values(n.estilos ?? {})) {
      soma(est.cor);
      soma(est.relevo, 0.5);
      for (const [, h] of est.rampa ?? []) soma(h);
    }
    for (const [, h] of n.paradas ?? []) soma(h, 0.5);
    soma(n.sombra?.cor, 0.25);
    for (const e of Object.values(n.efeitos ?? {})) soma(e?.cor, 0.25);
    soma(n.ajustes?.tom?.cor, 0.25);
  });
  return [...conta].sort((a, b) => b[1] - a[1]).slice(0, limite).map(([hex]) => ({ hex }));
}

export function fontesDaCena(cena, base) {
  const vistas = new Set();
  const lista = [];
  for (const f of cena.fontes ?? []) {
    const chave = `${f.familia}|${f.peso ?? 400}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    lista.push({ familia: f.familia, peso: f.peso ?? 400, arquivo: f.arquivo ? new URL(f.arquivo, base).href : null });
  }
  return lista;
}

export function logosDaCena(cena, base) {
  const lista = [];
  andar(cena.nos, (n) => {
    if (n.papel === 'logo' && n.tipo === 'imagem' && n.asset) lista.push({ nome: n.id, asset: new URL(n.asset, base).href });
  });
  return lista;
}

export function extrairKit(cena, base) {
  return { cores: coresDaCena(cena), fontes: fontesDaCena(cena, base), logos: logosDaCena(cena, base) };
}

// Passa os endereços do kit (arquivos de fonte e logos) por `f`, por exemplo para guardá-los relativos à página.
export function mapearEnderecos(kit, f) {
  return {
    ...kit,
    fontes: (kit.fontes ?? []).map((x) => (x.arquivo ? { ...x, arquivo: f(x.arquivo) } : x)),
    logos: (kit.logos ?? []).map((x) => ({ ...x, asset: f(x.asset) })),
  };
}

// Junta o que a peça traz ao kit já existente, sem repetir.
export function mesclarKit(kit, novo) {
  const cores = [...kit.cores ?? []];
  for (const c of novo.cores ?? []) if (!cores.some((x) => x.hex === c.hex)) cores.push(c);
  const fontes = [...kit.fontes ?? []];
  for (const f of novo.fontes ?? []) if (!fontes.some((x) => x.familia === f.familia && x.peso === f.peso)) fontes.push(f);
  const logos = [...kit.logos ?? []];
  for (const l of novo.logos ?? []) if (!logos.some((x) => x.asset === l.asset)) logos.push(l);
  return { cores, fontes, logos };
}

// A linha de destaque de um texto: a de maior peso (em "Área de Membro VIP", o VIP).
export function estiloDeDestaque(no) {
  const linhas = no.linhas ?? [];
  if (!linhas.length) return null;
  return linhas.reduce((a, b) => ((b.peso ?? 1) > (a.peso ?? 1) ? b : a)).estilo ?? null;
}

// Troca a cor principal de uma camada. Devolve o que mudou (para o histórico) ou null se a camada não tem cor.
//   retângulo: a cor do preenchimento; texto: o estilo da linha de destaque (ou todos, com `todas`).
export function aplicarCorNo(no, hex, { todas = false } = {}) {
  const v = normalizarHex(hex);
  if (!v || !no) return null;
  if (no.tipo === 'retangulo') { no.cor = v; return `Cor de ${no.id}`; }
  if (no.tipo === 'bloco_texto') {
    no.estilos = no.estilos ?? {};
    const nomes = todas ? Object.keys(no.estilos) : [estiloDeDestaque(no)].filter((e) => e && no.estilos[e]);
    if (!nomes.length) return null;
    for (const nome of nomes) {
      const est = no.estilos[nome];
      delete est.rampa;
      est.cor = v;
    }
    return `Cor do texto ${no.id}`;
  }
  return null;
}
