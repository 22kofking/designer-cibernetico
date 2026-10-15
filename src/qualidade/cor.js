// Delta de cor entre duas imagens (ou regiões): a "régua" do crítico. Compara as
// paletas ponderadas (k-médias em Lab) nos dois sentidos, como o loop de medição
// do gera-o-de-imagem-: abaixo de 10 é "parecido" (ΔE2000).
import sharp from 'sharp';
import { rgbParaLab } from '../oficinas/cores.js';

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// Pixels (Lab) de uma imagem ou de uma caixa dela, só os opacos, no máximo ~max.
export async function pixelsLab(png, { caixa, max = 4000, lado = 160 } = {}) {
  let img = sharp(png);
  if (caixa) img = sharp(await img.extract(caixa).png().toBuffer());
  const { data, info } = await img.ensureAlpha().resize(lado, lado, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const passo = Math.max(1, Math.floor(n / max));
  const out = [];
  for (let i = 0; i < n; i += passo) if (data[i * 4 + 3] >= 128) out.push(rgbParaLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]));
  return out;
}

// k-médias com início pelo ponto mais distante (determinístico). Devolve [{ lab, peso }].
export function paletaPonderada(amostras, k = 6) {
  if (!amostras.length) return [];
  const centros = [amostras[0]];
  while (centros.length < Math.min(k, amostras.length)) {
    let melhor = null, dist = -1;
    for (const a of amostras) {
      const d = Math.min(...centros.map((c) => d2(a, c)));
      if (d > dist) { dist = d; melhor = a; }
    }
    if (dist <= 0) break;
    centros.push(melhor);
  }
  let contagem = [];
  for (let it = 0; it < 10; it++) {
    const soma = centros.map(() => [0, 0, 0, 0]);
    for (const a of amostras) {
      let j = 0, dj = Infinity;
      centros.forEach((c, i) => { const d = d2(a, c); if (d < dj) { dj = d; j = i; } });
      soma[j][0] += a[0]; soma[j][1] += a[1]; soma[j][2] += a[2]; soma[j][3]++;
    }
    soma.forEach((s, i) => { if (s[3]) centros[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    contagem = soma.map((s) => s[3]);
  }
  return centros.map((lab, i) => ({ lab, peso: contagem[i] / amostras.length })).filter((c) => c.peso > 0);
}

// Distância média ponderada (ΔE2000) de cada cor de A até a cor mais perto de B, e vice-versa.
// Calibração: a peça antiga do gateway contra a referência dá ~9; duas referências
// da mesma campanha dão de 8 a 11. É régua de estilo, não de igualdade.
export function deltaPaletas(a, b) {
  if (!a.length || !b.length) return null;
  const ida = (x, y) => x.reduce((s, c) => s + c.peso * Math.min(...y.map((d) => deltaE2000(c.lab, d.lab))), 0);
  return (ida(a, b) + ida(b, a)) / 2;
}

export async function deltaDeCor(pngA, pngB, { caixaA, caixaB, k = 8 } = {}) {
  const [a, b] = await Promise.all([pixelsLab(pngA, { caixa: caixaA }), pixelsLab(pngB, { caixa: caixaB })]);
  return deltaPaletas(paletaPonderada(a, k), paletaPonderada(b, k));
}

// Luz (L de 0 a 255, como na ficha) por décimo da largura e mediana geral.
export async function perfilDeLuz(png, faixas = 10) {
  const { data, info } = await sharp(png).removeAlpha().resize(400, null).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const mediana = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
  const porFaixa = [];
  for (let f = 0; f < faixas; f++) {
    const x0 = Math.floor((f * w) / faixas), x1 = Math.floor(((f + 1) * w) / faixas);
    const v = [];
    for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) v.push(data[y * w + x]);
    porFaixa.push(mediana(v));
  }
  return { porFaixa, mediana: mediana(data) };
}

// Fração de pixels dourados/amarelos (matiz 35°–65°, saturados e claros).
export async function fracaoDeOuro(png) {
  const { data, info } = await sharp(png).removeAlpha().resize(300, null).raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let ouro = 0;
  for (let i = 0; i < n; i++) {
    const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 140 || max - min < 0.45 * max) continue;
    let hue = max === r ? ((g - b) / (max - min)) * 60 : max === g ? (2 + (b - r) / (max - min)) * 60 : (4 + (r - g) / (max - min)) * 60;
    hue = (hue + 360) % 360;
    if (hue >= 35 && hue <= 65) ouro++;
  }
  return ouro / n;
}

// CIEDE2000 (a fórmula de ΔE que acompanha a percepção; é a do loop de medição).
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { if (!a && !b) return 0; const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; };
  const h1p = h(b1, a1p), h2p = h(b2, a2p);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p) { if (Math.abs(h1p - h2p) > 180) hm += h1p + h2p < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cmp, SH = 1 + 0.015 * Cmp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// As cores principais (hex, da mais presente para a menos) de uma imagem com
// transparência: k-médias em Lab, cor média em RGB de cada grupo.
export async function coresPrincipaisDe(png, k = 4) {
  const { data, info } = await sharp(png).ensureAlpha().resize(120, 120, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] >= 200) px.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  if (!px.length) return [];
  const labs = px.map((p) => rgbParaLab(...p));
  const pal = paletaPonderada(labs, k);
  const soma = pal.map(() => [0, 0, 0, 0]);
  labs.forEach((l, i) => {
    let j = 0, dj = Infinity;
    pal.forEach((c, m) => { const d = d2(l, c.lab); if (d < dj) { dj = d; j = m; } });
    soma[j][0] += px[i][0]; soma[j][1] += px[i][1]; soma[j][2] += px[i][2]; soma[j][3]++;
  });
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return soma.filter((s) => s[3]).sort((a, b) => b[3] - a[3]).map((s) => `#${hex(s[0] / s[3])}${hex(s[1] / s[3])}${hex(s[2] / s[3])}`);
}
