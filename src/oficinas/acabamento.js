// Acabamento: a camada de composição que vem depois da montagem das partes.
// Montar as partes dá uma cópia dos elementos; o acabamento homogeneiza a peça com a referência como base:
// curvas por canal, mapa de luz (vinheta incluída), brilho (glow) e granulado. A receita é medida
// (referência contra montagem), é pequena e serializável, e se aplica a qualquer resolução.
import sharp from 'sharp';
import { rgbParaLab } from './cores.js';

const LADO_MEDIDA = 1024;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

// RGB 0..1 (Float32Array intercalado) numa largura de trabalho.
export async function lerRgb(entrada, largura = LADO_MEDIDA) {
  const { data, info } = await sharp(entrada).removeAlpha().resize({ width: largura }).raw().toBuffer({ resolveWithObject: true });
  const rgb = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) rgb[i] = data[i] / 255;
  return { rgb, w: info.width, h: info.height };
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ---- curvas: casa o histograma de cada canal da montagem com o da referência (força 0..1) ----
function histograma(rgb, canal) {
  const h = new Float64Array(256);
  for (let i = canal; i < rgb.length; i += 3) h[Math.round(rgb[i] * 255)]++;
  return h;
}

function cdf(h) {
  const c = new Float64Array(256);
  let s = 0;
  for (let i = 0; i < 256; i++) { s += h[i]; c[i] = s; }
  for (let i = 0; i < 256; i++) c[i] /= s || 1;
  return c;
}

export function ajustarCurvas(montagem, referencia, forca = 1) {
  const lut = [];
  for (let c = 0; c < 3; c++) {
    const cm = cdf(histograma(montagem.rgb, c));
    const cr = cdf(histograma(referencia.rgb, c));
    const t = new Array(256);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      while (j < 255 && cr[j] < cm[i]) j++;
      t[i] = Math.round((i + (j - i) * forca) * 10) / 10;
    }
    // monótona, com suavização leve para não criar degraus
    for (let i = 1; i < 256; i++) t[i] = Math.max(t[i], t[i - 1]);
    const suave = t.map((_, i) => { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const v = t[Math.min(255, Math.max(0, i + k))]; s += v; n++; } return Math.round((s / n) * 10) / 10; });
    lut.push(suave);
  }
  return lut;
}

function aplicarCurvas(rgb, lut) {
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) for (let c = 0; c < 3; c++) {
    const x = clamp(rgb[i + c]) * 255;
    const a = Math.floor(x), b = Math.min(255, a + 1), f = x - a;
    out[i + c] = (lut[c][a] * (1 - f) + lut[c][b] * f) / 255;
  }
  return out;
}

// ---- mapa de luz: ganho de luminosidade em grade (pega vinheta e as manchas de luz da referência) ----
function grade(rgb, w, h, gx, gy) {
  const soma = new Float64Array(gx * gy), n = new Float64Array(gx * gy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = Math.min(gy - 1, Math.floor((y / h) * gy)) * gx + Math.min(gx - 1, Math.floor((x / w) * gx));
    const i = (y * w + x) * 3;
    soma[k] += luma(rgb[i], rgb[i + 1], rgb[i + 2]);
    n[k]++;
  }
  return Array.from(soma, (s, k) => s / (n[k] || 1));
}

export function ajustarLuz(montagem, referencia, { gx = 12, gy = 4, forca = 1, minimo = 0.65, maximo = 1.5 } = {}) {
  const gm = grade(montagem.rgb, montagem.w, montagem.h, gx, gy);
  const gr = grade(referencia.rgb, referencia.w, referencia.h, gx, gy);
  const ganho = gm.map((m, k) => Math.round(clamp(1 + ((gr[k] + 0.02) / (m + 0.02) - 1) * forca, minimo, maximo) * 1000) / 1000);
  return { gx, gy, ganho };
}

// ganho suave (bilinear entre os centros das células) em qualquer ponto 0..1
function ganhoEm(luz, u, v) {
  const { gx, gy, ganho } = luz;
  const fx = clamp(u * gx - 0.5, 0, gx - 1), fy = clamp(v * gy - 0.5, 0, gy - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(gx - 1, x0 + 1), y1 = Math.min(gy - 1, y0 + 1);
  const ax = fx - x0, ay = fy - y0;
  const g = (x, y) => ganho[y * gx + x];
  return (g(x0, y0) * (1 - ax) + g(x1, y0) * ax) * (1 - ay) + (g(x0, y1) * (1 - ax) + g(x1, y1) * ax) * ay;
}

function aplicarLuz(rgb, w, h, luz) {
  const out = new Float32Array(rgb.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = ganhoEm(luz, (x + 0.5) / w, (y + 0.5) / h);
    const i = (y * w + x) * 3;
    for (let c = 0; c < 3; c++) out[i + c] = clamp(rgb[i + c] * g);
  }
  return out;
}

// ---- brilho (glow): realces desfocados somados em "tela" ----
async function desfocar(rgb, w, h, raioPx) {
  if (raioPx < 0.3) return rgb;
  const buf = Buffer.from(Uint8Array.from(rgb, (v) => Math.round(clamp(v) * 255)));
  const { data } = await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).blur(Math.max(0.3, raioPx)).raw().toBuffer({ resolveWithObject: true });
  return Float32Array.from(data, (v) => v / 255);
}

async function aplicarBrilho(rgb, w, h, { limiar, raio, quantidade }) {
  if (!quantidade) return rgb;
  const realce = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const l = luma(rgb[i], rgb[i + 1], rgb[i + 2]);
    const k = clamp((l - limiar) / (1 - limiar));
    for (let c = 0; c < 3; c++) realce[i + c] = rgb[i + c] * k;
  }
  const borrado = await desfocar(realce, w, h, raio * w);
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) {
    const b = clamp(borrado[i] * quantidade * 2);
    out[i] = 1 - (1 - rgb[i]) * (1 - b);
  }
  return out;
}

// ---- granulado: ruído gaussiano de luminosidade (sigma em 0..1) ----
function aplicarGrao(rgb, sigma, semente = 7) {
  if (!sigma) return rgb;
  let s = semente >>> 0;
  const aleatorio = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const g = (aleatorio() + aleatorio() + aleatorio() + aleatorio() - 2) * 1.732 * sigma; // ~N(0, sigma)
    for (let c = 0; c < 3; c++) out[i + c] = clamp(rgb[i + c] + g);
  }
  return out;
}

// energia de alta frequência (desvio da luminosidade menos a versão borrada): mede o grão da imagem
async function energiaFina(img) {
  const borrado = await desfocar(img.rgb, img.w, img.h, 1.5);
  let soma = 0, n = 0;
  for (let i = 0; i < img.rgb.length; i += 3) {
    const d = luma(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]) - luma(borrado[i], borrado[i + 1], borrado[i + 2]);
    soma += d * d; n++;
  }
  return Math.sqrt(soma / n);
}

// ---- medida: ΔE médio por pixel em baixa resolução (estrutura de luz e cor), mais o desvio fino ----
async function emBaixa(img, largura = 128) {
  const buf = Buffer.from(Uint8Array.from(img.rgb, (v) => Math.round(clamp(v) * 255)));
  const { data, info } = await sharp(buf, { raw: { width: img.w, height: img.h, channels: 3 } }).resize({ width: largura}).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

export async function medir(montagem, referencia) {
  const [a, b] = await Promise.all([emBaixa(montagem), emBaixa(referencia)]);
  let soma = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 3) {
    const la = rgbParaLab(a.data[i], a.data[i + 1], a.data[i + 2]);
    const lb = rgbParaLab(b.data[i], b.data[i + 1], b.data[i + 2]);
    soma += Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
    n++;
  }
  const [fa, fb] = await Promise.all([energiaFina(montagem), energiaFina(referencia)]);
  return { deltaE_pixel: Math.round((soma / n) * 100) / 100, grao: Math.round(fa * 10000) / 10000, grao_referencia: Math.round(fb * 10000) / 10000 };
}

// ---- receita: mede e aplica ----
export async function aplicarReceita(img, receita) {
  let { rgb } = img;
  const { w, h } = img;
  if (receita.curvas) rgb = aplicarCurvas(rgb, receita.curvas);
  if (receita.luz) rgb = aplicarLuz(rgb, w, h, receita.luz);
  if (receita.brilho) rgb = await aplicarBrilho(rgb, w, h, receita.brilho);
  if (receita.grao) rgb = aplicarGrao(rgb, receita.grao.sigma);
  return { rgb, w, h };
}

export async function paraPng(img, destino) {
  const buf = Buffer.from(Uint8Array.from(img.rgb, (v) => Math.round(clamp(v) * 255)));
  const s = sharp(buf, { raw: { width: img.w, height: img.h, channels: 3 } });
  return destino ? s.png().toFile(destino) : s.png().toBuffer();
}

// Busca a receita passo a passo, guardando só o que melhora o deltaE por pixel.
export async function harmonizar(montagem, referencia, { log = () => {} } = {}) {
  const base = await medir(montagem, referencia);
  const receita = {};
  let atual = montagem;
  let melhor = base;
  const tentar = async (nome, candidatos) => {
    let vencedor = null;
    for (const c of candidatos) {
      const r = await aplicarReceita(montagem, { ...receita, [nome]: c.valor });
      const m = await medir(r, referencia);
      log(`${nome} ${c.rotulo}: ΔE pixel ${m.deltaE_pixel}`);
      if (m.deltaE_pixel < melhor.deltaE_pixel - 0.05) { melhor = m; vencedor = c; atual = r; }
    }
    if (vencedor) receita[nome] = vencedor.valor;
  };
  await tentar('curvas', [0.5, 0.8, 1].map((f) => ({ rotulo: `força ${f}`, valor: ajustarCurvas(montagem, referencia, f) })));
  const aposCurvas = await aplicarReceita(montagem, { curvas: receita.curvas });
  await tentar('luz', [0.5, 0.8, 1].flatMap((forca) => [{ gx: 12, gy: 4 }, { gx: 24, gy: 8 }].map((g) => ({ rotulo: `${g.gx}x${g.gy} força ${forca}`, valor: ajustarLuz(aposCurvas, referencia, { ...g, forca }) }))));
  await tentar('brilho', [0.55, 0.7].flatMap((limiar) => [0.01, 0.03].flatMap((raio) => [0.15, 0.3].map((quantidade) => ({ rotulo: `limiar ${limiar} raio ${raio} qtd ${quantidade}`, valor: { limiar, raio, quantidade } })))));
  const aposBrilho = await aplicarReceita(montagem, receita);
  const [fa, fb] = await Promise.all([energiaFina(aposBrilho), energiaFina(referencia)]);
  // a energia fina da referência é detalhe (folhas, textura), não só grão: o granulado fica limitado a 0,015
  const sigma = Math.min(0.015, Math.sqrt(Math.max(0, fb * fb - fa * fa)));
  if (sigma > 0.002) {
    const r = await aplicarReceita(montagem, { ...receita, grao: { sigma: Math.round(sigma * 10000) / 10000 } });
    const m = await medir(r, referencia);
    log(`grão sigma ${sigma.toFixed(4)}: ΔE pixel ${m.deltaE_pixel}, grão ${m.grao} (referência ${m.grao_referencia})`);
    receita.grao = { sigma: Math.round(sigma * 10000) / 10000 };
    atual = r;
    melhor = m;
  }
  return { receita, antes: base, depois: melhor, resultado: atual };
}
