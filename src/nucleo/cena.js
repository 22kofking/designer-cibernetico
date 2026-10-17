// Documento de cena: o formato único que agentes, editor e exportador leem.
// Roda igual no Node e no navegador (sem dependências).
//
// Convenções (as mesmas das fichas do gera-o-de-imagem-):
//   caixa.x, caixa.w  frações da largura da peça
//   caixa.y, caixa.h  frações da altura da peça
// Assim a mesma cena serve para qualquer resolução do formato.

export const VERSAO_CENA = '0.1';

export const PAPEIS = ['fundo', 'texto', 'mascote', 'elemento', 'logo', 'efeito'];
export const TIPOS = ['imagem', 'gradiente', 'retangulo', 'bloco_texto', 'grupo'];
export const ENCAIXES = ['conter', 'cobrir', 'esticar'];
export const ANCORAS = ['centro', 'base', 'topo', 'esquerda', 'direita'];

// Converte a caixa em frações para pixels do formato.
export function caixaEmPixels(caixa, formato) {
  const c = { x: 0, y: 0, w: 1, h: 1, ...caixa };
  return {
    x: c.x * formato.largura,
    y: c.y * formato.altura,
    w: c.w * formato.largura,
    h: c.h * formato.altura,
  };
}

// Converte pixels de volta para frações (usado pelo editor ao mover um nó).
export function caixaEmFracoes(px, formato) {
  const r = (v) => Math.round(v * 10000) / 10000;
  return {
    x: r(px.x / formato.largura),
    y: r(px.y / formato.altura),
    w: r(px.w / formato.largura),
    h: r(px.h / formato.altura),
  };
}

// Encaixa um conteúdo de tamanho natural (nw x nh) dentro da caixa.
// conter: cabe inteiro; cobrir: preenche cortando; esticar: deforma.
// A âncora decide para onde o conteúdo encosta quando sobra espaço.
export function encaixar(nw, nh, caixa, encaixe = 'conter', ancora = 'centro') {
  if (encaixe === 'esticar') {
    return { x: caixa.x, y: caixa.y, escalaX: caixa.w / nw, escalaY: caixa.h / nh };
  }
  const fx = caixa.w / nw;
  const fy = caixa.h / nh;
  const f = encaixe === 'cobrir' ? Math.max(fx, fy) : Math.min(fx, fy);
  const w = nw * f;
  const h = nh * f;
  let x = caixa.x + (caixa.w - w) / 2;
  let y = caixa.y + (caixa.h - h) / 2;
  if (ancora === 'base') y = caixa.y + caixa.h - h;
  if (ancora === 'topo') y = caixa.y;
  if (ancora === 'esquerda') x = caixa.x;
  if (ancora === 'direita') x = caixa.x + caixa.w - w;
  return { x, y, escalaX: f, escalaY: f };
}

// Lista plana de nós (grupos incluídos), na ordem de desenho.
export function percorrer(nos, visitar, pai = null) {
  for (const no of nos) {
    visitar(no, pai);
    if (no.tipo === 'grupo' && Array.isArray(no.filhos)) percorrer(no.filhos, visitar, no);
  }
}

// Validação leve, para rodar também no editor. A validação completa usa
// esquemas/cena.schema.json (npm run validar).
export function validarCena(cena) {
  const erros = [];
  if (!cena || typeof cena !== 'object') return ['a cena não é um objeto'];
  if (cena.versao !== VERSAO_CENA) erros.push(`versão ${cena.versao} diferente de ${VERSAO_CENA}`);
  const f = cena.formato;
  if (!f || !(f.largura > 0) || !(f.altura > 0)) erros.push('formato precisa de largura e altura');
  if (!Array.isArray(cena.nos)) return [...erros, 'a cena precisa de uma lista "nos"'];
  const ids = new Set();
  percorrer(cena.nos, (no) => {
    const onde = `nó "${no.id ?? '?'}"`;
    if (!no.id) erros.push('nó sem id');
    else if (ids.has(no.id)) erros.push(`id repetido: ${no.id}`);
    ids.add(no.id);
    if (!TIPOS.includes(no.tipo)) erros.push(`${onde}: tipo desconhecido "${no.tipo}"`);
    if (no.papel && !PAPEIS.includes(no.papel)) erros.push(`${onde}: papel desconhecido "${no.papel}"`);
    if (no.encaixe && !ENCAIXES.includes(no.encaixe)) erros.push(`${onde}: encaixe desconhecido`);
    if (no.ancora && !ANCORAS.includes(no.ancora)) erros.push(`${onde}: âncora desconhecida`);
    if (no.tipo === 'imagem' && !no.asset) erros.push(`${onde}: imagem sem asset`);
    if (no.tipo === 'bloco_texto' && !(no.linhas?.length)) erros.push(`${onde}: bloco de texto sem linhas`);
    if (no.tipo === 'bloco_texto') {
      for (const l of no.linhas ?? []) {
        if (l.estilo && !no.estilos?.[l.estilo]) erros.push(`${onde}: estilo "${l.estilo}" não definido`);
        for (const t of l.trechos ?? []) {
          if (t.estilo && !no.estilos?.[t.estilo]) erros.push(`${onde}: estilo "${t.estilo}" não definido`);
        }
      }
    }
  });
  return erros;
}
