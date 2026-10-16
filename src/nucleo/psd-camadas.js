// Cena → documento PSD (formato do ag-psd), uma camada por nó, na ordem da cena.
// Roda no Node (src/node/psd.js) e no editor do navegador: quem chama passa
// pixelsDe(cenaParcial), que desenha a cena e devolve os pixels RGBA da peça.

// Modos de mistura da cena → nomes do ag-psd, e o caminho de volta.
export const MISTURA_PSD = {
  normal: 'normal', multiplicar: 'multiply', tela: 'screen', sobrepor: 'overlay', escurecer: 'darken', clarear: 'lighten',
  subexpor_cor: 'color burn', superexpor_cor: 'color dodge', luz_direta: 'hard light', luz_suave: 'soft light',
  diferenca: 'difference', exclusao: 'exclusion', matiz: 'hue', saturacao: 'saturation', cor: 'color', luminosidade: 'luminosity',
};
export const MISTURA_DA_CENA = Object.fromEntries(Object.entries(MISTURA_PSD).map(([k, v]) => [v, k]));

export function caixaDoAlfa(data, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { left: x0, top: y0, right: x1 + 1, bottom: y1 + 1 };
}

export function recortar(data, w, c) {
  const cw = c.right - c.left, ch = c.bottom - c.top;
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(data.subarray(((c.top + y) * w + c.left) * 4, ((c.top + y) * w + c.right) * 4), y * cw * 4);
  return { width: cw, height: ch, data: out };
}

export const nomeDaCamada = (no) => {
  if (no.tipo === 'bloco_texto') return `texto: ${(no.linhas ?? []).map((l) => l.texto).join(' / ')}`.slice(0, 120);
  return no.id;
};

// Parte do nó para agrupar no PSD: "mascote-corpo" e "mascote-orbe" vão juntos.
// Cópias e numerações do editor ("texto-2", "logo-copia") ficam soltas.
function parteDe(id) {
  if (!id.includes('-') || /-(\d+|copia)(-\d+)?$/.test(id)) return `\u0000${id}`;
  return id.split('-')[0];
}

// Monta o documento. Cada nó é desenhado sozinho (visível, opacidade cheia,
// mistura normal); opacidade, mistura e "escondido" viram propriedades da camada.
// Nós da mesma parte (mascote-corpo, mascote-orbe) entram num grupo.
export async function documentoPsd(cena, pixelsDe) {
  const { largura: w, altura: h } = cena.formato;
  const camadas = [];
  for (const no of cena.nos) {
    const so = { ...cena, formato: { ...cena.formato, fundo: 'rgba(0,0,0,0)' }, nos: [{ ...no, opacidade: 1, visivel: true, mistura: 'normal' }] };
    const data = await pixelsDe(so);
    const c = caixaDoAlfa(data, w, h);
    if (!c) continue;
    camadas.push({
      parte: parteDe(no.id),
      camada: {
        name: nomeDaCamada(no), ...c, opacity: no.opacidade ?? 1, hidden: no.visivel === false,
        blendMode: MISTURA_PSD[no.mistura] ?? 'normal', imageData: recortar(data, w, c),
      },
    });
  }
  const filhos = [];
  for (let i = 0; i < camadas.length; i++) {
    const irmas = camadas.filter((x) => x.parte === camadas[i].parte);
    if (irmas.length < 2) { filhos.push(camadas[i].camada); continue; }
    if (irmas[0] !== camadas[i]) continue;
    filhos.push({ name: camadas[i].parte.replace('\u0000', ''), opened: true, children: irmas.map((x) => x.camada) });
  }
  // Fundo da cena (cor chapada) como camada de baixo, para o PSD abrir igual à prévia.
  const fundo = cena.formato.fundo;
  if (/^#[0-9a-f]{6}$/i.test(fundo ?? '')) {
    const data = new Uint8ClampedArray(w * h * 4);
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(fundo.slice(k, k + 2), 16));
    for (let i = 0; i < w * h; i++) data.set([r, g, b, 255], i * 4);
    filhos.unshift({ name: 'cor de fundo', left: 0, top: 0, right: w, bottom: h, imageData: { width: w, height: h, data } });
  }
  const composta = await pixelsDe(cena);
  return { width: w, height: h, children: filhos, imageData: { width: w, height: h, data: composta } };
}
