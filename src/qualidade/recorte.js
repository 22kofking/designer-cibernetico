// QA do recorte: números que dizem se a máscara de uma parte está aceitável
// antes de ela virar camada ou entrar no banco. Nada aqui usa IA: é geometria
// da máscara e cor dos pixels. As máscaras são 1 byte por pixel (0 ou 255).
import { rgbParaLab } from '../oficinas/cores.js';

// Calibrados no mago (orbe limpo x orbe com a mão) e no faraó (cabeça).
export const LIMIARES_RECORTE = {
  pedacos_max: 1, // pedaços que contam (≥ 1% da área)
  furos_max: 0.02, // área dos furos / área da parte
  solidez_min: 0.6, // área / área do contorno convexo
  mancha_max: 0.02, // maior mancha com a cor de fora / área da parte
  franja_max: 0.25, // borda com cinza claro de fundo / borda
  nitidez_min: 0.35, // detalhe dentro do remendo / detalhe em volta
  ambigua: { nota: 0.03, area: 0.1 }, // duas opções do modelo quase empatadas e bem diferentes
};

// Distância (em px, chanfro 3-4) de cada pixel da máscara até o pixel de fora mais perto.
export function distanciaInterna(mascara, w, h) {
  const d = new Float32Array(w * h);
  const INF = 1e9;
  for (let i = 0; i < w * h; i++) d[i] = mascara[i] ? INF : 0;
  const passo = (x, y, dx, dy, c) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return c; // fora da imagem conta como fora
    return d[ny * w + nx] + c;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], passo(x, y, -1, 0, 3), passo(x, y, 0, -1, 3), passo(x, y, -1, -1, 4), passo(x, y, 1, -1, 4));
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], passo(x, y, 1, 0, 3), passo(x, y, 0, 1, 3), passo(x, y, 1, 1, 4), passo(x, y, -1, 1, 4));
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}

// Rotula os pedaços conectados (vizinhança 4) dos pixels aceitos.
function rotular(w, h, aceita) {
  const rotulo = new Int32Array(w * h).fill(-1);
  const pedacos = [];
  for (let p = 0; p < w * h; p++) {
    if (rotulo[p] >= 0 || !aceita(p)) continue;
    const id = pedacos.length;
    let area = 0, tocaBorda = false;
    const pilha = [p];
    rotulo[p] = id;
    while (pilha.length) {
      const q = pilha.pop();
      area++;
      const x = q % w, y = (q - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tocaBorda = true;
      if (x > 0 && rotulo[q - 1] < 0 && aceita(q - 1)) { rotulo[q - 1] = id; pilha.push(q - 1); }
      if (x < w - 1 && rotulo[q + 1] < 0 && aceita(q + 1)) { rotulo[q + 1] = id; pilha.push(q + 1); }
      if (y > 0 && rotulo[q - w] < 0 && aceita(q - w)) { rotulo[q - w] = id; pilha.push(q - w); }
      if (y < h - 1 && rotulo[q + w] < 0 && aceita(q + w)) { rotulo[q + w] = id; pilha.push(q + w); }
    }
    pedacos.push({ area, tocaBorda });
  }
  return { rotulo, pedacos };
}

export function areaDe(mascara) {
  let n = 0;
  for (const v of mascara) if (v) n++;
  return n;
}

// Pedaços que contam (≥ 1% da área) e área dos furos (vazios que não tocam a borda).
export function pedacosEFuros(mascara, w, h) {
  const area = areaDe(mascara);
  const cheio = rotular(w, h, (p) => mascara[p] > 0);
  const pedacos = cheio.pedacos.filter((c) => c.area >= 0.01 * area).length;
  const vazio = rotular(w, h, (p) => !mascara[p]);
  const furos = vazio.pedacos.filter((c) => !c.tocaBorda).reduce((s, c) => s + c.area, 0);
  return { pedacos, furos: area ? furos / area : 0 };
}

// Área / área do contorno convexo (1 = forma cheia; mão aberta, raios e franjas baixam).
export function solidez(mascara, w, h) {
  const pts = [];
  for (let y = 0; y < h; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < w; x++) if (mascara[y * w + x]) { if (x0 < 0) x0 = x; x1 = x; }
    if (x0 >= 0) { pts.push([x0, y], [x1 + 1, y], [x0, y + 1], [x1 + 1, y + 1]); }
  }
  if (pts.length < 3) return 0;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const baixo = [], cima = [];
  for (const p of pts) { while (baixo.length >= 2 && cruz(baixo.at(-2), baixo.at(-1), p) <= 0) baixo.pop(); baixo.push(p); }
  for (const p of pts.reverse()) { while (cima.length >= 2 && cruz(cima.at(-2), cima.at(-1), p) <= 0) cima.pop(); cima.push(p); }
  const casco = baixo.slice(0, -1).concat(cima.slice(0, -1));
  let a2 = 0;
  for (let i = 0; i < casco.length; i++) { const [x1, y1] = casco[i], [x2, y2] = casco[(i + 1) % casco.length]; a2 += x1 * y2 - x2 * y1; }
  return areaDe(mascara) / (Math.abs(a2) / 2);
}

// k-médias simples em Lab, início pelo ponto mais distante (determinístico).
function paleta(amostras, k) {
  if (!amostras.length) return [];
  const centros = [amostras[0]];
  while (centros.length < Math.min(k, amostras.length)) {
    let melhor = null, dist = -1;
    for (const a of amostras) {
      const d = Math.min(...centros.map((c) => (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2 + (a[2] - c[2]) ** 2));
      if (d > dist) { dist = d; melhor = a; }
    }
    if (dist <= 0) break;
    centros.push(melhor);
  }
  for (let it = 0; it < 8; it++) {
    const soma = centros.map(() => [0, 0, 0, 0]);
    for (const a of amostras) {
      let j = 0, dj = Infinity;
      centros.forEach((c, i) => { const d = (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2 + (a[2] - c[2]) ** 2; if (d < dj) { dj = d; j = i; } });
      soma[j][0] += a[0]; soma[j][1] += a[1]; soma[j][2] += a[2]; soma[j][3]++;
    }
    soma.forEach((s, i) => { if (s[3]) centros[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  return centros;
}

function amostrar(rgba, indices, max = 3000) {
  const passo = Math.max(1, Math.floor(indices.length / max));
  const out = [];
  for (let k = 0; k < indices.length; k += passo) { const i = indices[k]; out.push(rgbParaLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])); }
  return out;
}

const pertoDe = (lab, cores) => Math.min(...cores.map((c) => Math.hypot(lab[0] - c[0], lab[1] - c[1], lab[2] - c[2])));
// Contorno escuro e brilho branco aparecem em todas as partes de um desenho: não acusam nada.
const neutro = ([l, a, b]) => l < 22 || (l > 88 && Math.hypot(a, b) < 10);

// Mancha com a cor de fora: compara cada pixel da borda da parte com as cores do
// miolo dela e com as cores do resto da imagem. Dedos marrons no orbe azul ficam
// mais perto do resto (o corpo) do que do miolo do orbe. Devolve a maior mancha
// conectada (fração da área) e a máscara dos pixels acusados.
export function manchaDeFora(rgba, w, h, mascara, { miolo = 0.5, margem = 8 } = {}) {
  const dist = distanciaInterna(mascara, w, h);
  let raio = 0;
  for (const v of dist) if (v > raio) raio = v;
  const nucleo = [], fora = [], borda = [];
  const longe = distanciaInterna(Uint8Array.from(mascara, (v) => (v ? 0 : 255)), w, h); // distância até a parte
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    if (mascara[i]) (dist[i] >= miolo * raio ? nucleo : borda).push(i);
    else if (longe[i] >= 4) fora.push(i);
  }
  const area = nucleo.length + borda.length;
  const acusado = new Uint8Array(w * h);
  if (!nucleo.length || !fora.length) return { mancha: 0, acusado };
  const P = paleta(amostrar(rgba, nucleo), 6);
  const V = paleta(amostrar(rgba, fora), 8);
  for (const i of borda) {
    const lab = rgbParaLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    if (neutro(lab)) continue;
    const dP = pertoDe(lab, P), dV = pertoDe(lab, V);
    if (dV + margem < dP && dP > 15) acusado[i] = 1;
  }
  const { pedacos } = rotular(w, h, (p) => acusado[p] === 1);
  const maior = pedacos.reduce((m, c) => Math.max(m, c.area), 0);
  return { mancha: area ? maior / area : 0, acusado };
}

// Franja de fundo: pixels da borda da parte em cinza claro sem cor (sobra do fundo liso).
export function franja(rgba, w, h, mascara, { largura = 2 } = {}) {
  const dist = distanciaInterna(mascara, w, h);
  let n = 0, claros = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mascara[i] || dist[i] > largura || rgba[i * 4 + 3] < 128) continue;
    n++;
    const [l, a, b] = rgbParaLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    if (l > 75 && Math.hypot(a, b) < 6) claros++;
  }
  return n ? claros / n : 0;
}

function luminancia(rgba, w, h) {
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return L;
}

// Nitidez do remendo: detalhe (gradiente) dentro do buraco remendado dividido
// pelo detalhe numa faixa em volta. Remendo borrado dá perto de 0.
export function nitidezDoRemendo(rgba, w, h, buraco, { faixa = 12 } = {}) {
  const L = luminancia(rgba, w, h);
  const grad = (i) => {
    const x = i % w, y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return 0;
    return Math.hypot(L[i + 1] - L[i - 1], L[i + w] - L[i - w]);
  };
  const longe = distanciaInterna(Uint8Array.from(buraco, (v) => (v ? 0 : 255)), w, h);
  let gd = 0, nd = 0, gf = 0, nf = 0;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    if (buraco[i]) { gd += grad(i); nd++; } else if (longe[i] <= faixa) { gf += grad(i); nf++; }
  }
  if (!nd || !nf || !gf) return 1;
  return gd / nd / (gf / nf);
}

export function iou(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] > 0, y = b[i] > 0; if (x && y) inter++; if (x || y) uni++; }
  return uni ? inter / uni : 1;
}

// Duas opções do modelo quase empatadas na nota e com áreas bem diferentes
// (orbe sozinho x orbe com a mão): o modelo não sabe qual é a parte.
export function ambiguidade(opcoes, limiar = LIMIARES_RECORTE.ambigua) {
  const ord = [...opcoes].sort((a, b) => b.nota - a.nota);
  if (ord.length < 2) return null;
  const [a, b] = ord;
  const aa = areaDe(a.mascara), ab = areaDe(b.mascara);
  const difArea = Math.abs(aa - ab) / Math.max(aa, ab, 1);
  if (a.nota - b.nota <= limiar.nota && difArea >= limiar.area) return { notas: [+a.nota.toFixed(3), +b.nota.toFixed(3)], diferenca_area: +difArea.toFixed(3) };
  return null;
}

// Confere a máscara de uma parte. rgba: a imagem inteira (4 canais); opções:
// { opcoes } = as máscaras que o modelo devolveu (para acusar empate);
// objeto: a parte é um objeto com cores próprias (orbe, envelope). Numa parte do
// corpo (cabeça, braço) as cores do resto aparecem de verdade, então a mancha
// é só medida, não reprova.
export function conferirRecorte(rgba, w, h, mascara, { opcoes, objeto = true, limiares = LIMIARES_RECORTE } = {}) {
  const pf = pedacosEFuros(mascara, w, h);
  const m = {
    area: +(areaDe(mascara) / (w * h)).toFixed(4),
    pedacos: pf.pedacos,
    furos: +pf.furos.toFixed(4),
    solidez: +solidez(mascara, w, h).toFixed(3),
    mancha: +manchaDeFora(rgba, w, h, mascara).mancha.toFixed(4),
    franja: +franja(rgba, w, h, mascara).toFixed(3),
  };
  const problemas = [];
  if (!m.area) problemas.push('máscara vazia');
  if (m.pedacos > limiares.pedacos_max) problemas.push(`${m.pedacos} pedaços soltos`);
  if (m.furos > limiares.furos_max) problemas.push(`furos (${m.furos})`);
  if (m.solidez < limiares.solidez_min) problemas.push(`forma recortada demais (solidez ${m.solidez})`);
  if (objeto && m.mancha > limiares.mancha_max) problemas.push(`pegou um pedaço com a cor do resto (${m.mancha}): dedos, braço ou fundo`);
  if (m.franja > limiares.franja_max) problemas.push(`franja de fundo claro na borda (${m.franja})`);
  const amb = opcoes ? ambiguidade(opcoes, limiares.ambigua) : null;
  if (amb) m.ambigua = amb;
  return { aprovado: problemas.length === 0, medidas: m, problemas, alerta: amb ? 'o modelo ficou entre duas máscaras: confira a escolhida' : null };
}

// Escolhe entre as opções do modelo: a de maior nota entre as que passam no QA;
// se nenhuma passa, a de menos problemas (e a nota desempata).
export function escolherMascara(rgba, w, h, opcoes, { objeto = true, limiares = LIMIARES_RECORTE } = {}) {
  const conferidas = opcoes.map((o, indice) => ({ ...o, indice, qa: conferirRecorte(rgba, w, h, o.mascara, { opcoes, objeto, limiares }) }));
  conferidas.sort((a, b) => a.qa.problemas.length - b.qa.problemas.length || b.nota - a.nota);
  const [escolhida] = conferidas;
  return { ...escolhida, trocou: escolhida.nota < Math.max(...opcoes.map((o) => o.nota)) };
}
