// Mascote em partes: corpo + o que dá para trocar (objeto na mão, braço...).
// Cada parte sai como PNG transparente com a sua caixa em frações do mascote;
// o corpo leva um remendo onde a parte estava, para a troca não deixar buraco.
import sharp from 'sharp';
import { segmentar } from './segmentar.js';

// Preenche os pixels marcados com a média dos vizinhos já conhecidos, de fora
// para dentro (cor e transparência). Buraco no meio do corpo vira roupa; o que
// ficava fora da silhueta volta a ser transparente.
export function remendar(rgba, w, h, buraco) {
  const conhecido = new Uint8Array(w * h);
  let faltam = 0;
  for (let i = 0; i < w * h; i++) {
    if (buraco[i]) faltam++;
    else conhecido[i] = 1;
  }
  const viz = [-1, 1, -w, w, -w - 1, -w + 1, w - 1, w + 1];
  while (faltam > 0) {
    const novos = [];
    for (let i = 0; i < w * h; i++) {
      if (conhecido[i]) continue;
      const x = i % w;
      let r = 0, g = 0, b = 0, a = 0, peso = 0, n = 0;
      for (const d of viz) {
        const j = i + d;
        if (j < 0 || j >= w * h || !conhecido[j]) continue;
        const xj = j % w;
        if (Math.abs(xj - x) > 1) continue;
        const aj = rgba[j * 4 + 3];
        r += rgba[j * 4] * aj; g += rgba[j * 4 + 1] * aj; b += rgba[j * 4 + 2] * aj; peso += aj;
        a += aj; n++;
      }
      if (!n) continue;
      novos.push([i, peso ? r / peso : 0, peso ? g / peso : 0, peso ? b / peso : 0, a / n]);
    }
    if (!novos.length) break;
    for (const [i, r, g, b, a] of novos) {
      rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
      conhecido[i] = 1;
      faltam--;
    }
  }
  // Alisa o remendo (média dos 4 vizinhos, só dentro do buraco) para tirar as listras da propagação.
  for (let k = 0; k < 30; k++) {
    for (let i = 0; i < w * h; i++) {
      if (!buraco[i]) continue;
      const x = i % w;
      const vs = [x > 0 ? i - 1 : i, x < w - 1 ? i + 1 : i, i >= w ? i - w : i, i < w * (h - 1) ? i + w : i];
      for (let c = 0; c < 4; c++) rgba[i * 4 + c] = (vs.reduce((s, j) => s + rgba[j * 4 + c], 0) + rgba[i * 4 + c]) / 5;
    }
  }
  // Borda dura: ou é corpo ou é fundo.
  for (let i = 0; i < w * h; i++) if (buraco[i]) rgba[i * 4 + 3] = rgba[i * 4 + 3] >= 128 ? 255 : 0;
  return rgba;
}

function matiz(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return { h: 0, s: 0 };
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / max };
}

// Brilho e faíscas do objeto (o halo azul de um orbe) ficam em volta da máscara:
// pixels perto da parte, com a mesma cor dominante dela, vão junto com a parte.
export function haloDaParte(rgba, w, h, mascara, raio) {
  const hist = new Float64Array(36);
  for (let i = 0; i < w * h; i++) {
    if (!mascara[i]) continue;
    const { h: m, s } = matiz(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    if (s > 0.3) hist[Math.floor(m / 10) % 36] += s;
  }
  let pico = 0;
  for (let k = 1; k < 36; k++) if (hist[k] > hist[pico]) pico = k;
  const centro = pico * 10 + 5;
  const perto = dilatar(mascara, w, h, raio);
  const halo = Buffer.from(mascara);
  for (let i = 0; i < w * h; i++) {
    if (!perto[i] || mascara[i] || rgba[i * 4 + 3] === 0) continue;
    const { h: m, s } = matiz(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    const dist = Math.min(Math.abs(m - centro), 360 - Math.abs(m - centro));
    const claro = rgba[i * 4] > 200 && rgba[i * 4 + 1] > 200 && rgba[i * 4 + 2] > 200;
    if ((s > 0.25 && dist < 35) || claro) halo[i] = 255;
  }
  return halo;
}

function dilatar(mascara, w, h, raio) {
  if (raio <= 0) return mascara;
  let atual = mascara;
  for (let k = 0; k < raio; k++) {
    const prox = Buffer.from(atual);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (atual[i]) continue;
      if ((x > 0 && atual[i - 1]) || (x < w - 1 && atual[i + 1]) || (y > 0 && atual[i - w]) || (y < h - 1 && atual[i + w])) prox[i] = 255;
    }
    atual = prox;
  }
  return atual;
}

// Fica só o maior pedaço da máscara e os furos dentro dele são fechados
// (o modelo às vezes pega migalhas soltas ou deixa um reflexo de fora).
export function limparMascara(mascara, w, h) {
  const rotulo = new Int32Array(w * h).fill(-1);
  const areas = [];
  const rotular = (alvo, aceita) => {
    for (let p = 0; p < w * h; p++) {
      if (rotulo[p] >= 0 || !aceita(p)) continue;
      const id = areas.length;
      let area = 0;
      const pilha = [p];
      rotulo[p] = id;
      let tocaBorda = false;
      while (pilha.length) {
        const q = pilha.pop();
        area++;
        const x = q % w, y = (q - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tocaBorda = true;
        for (const n of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) {
          if (n >= 0 && rotulo[n] < 0 && aceita(n)) { rotulo[n] = id; pilha.push(n); }
        }
      }
      areas.push({ area, tocaBorda, alvo });
    }
  };
  rotular('cheio', (p) => mascara[p] > 0);
  let maior = -1;
  areas.forEach((a, i) => { if (maior < 0 || a.area > areas[maior].area) maior = i; });
  const saida = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) if (rotulo[p] === maior) saida[p] = 255;
  // Furos: regiões vazias que não tocam a borda da imagem.
  rotulo.fill(-1);
  areas.length = 0;
  rotular('vazio', (p) => saida[p] === 0);
  for (let p = 0; p < w * h; p++) if (saida[p] === 0 && !areas[rotulo[p]].tocaBorda) saida[p] = 255;
  return saida;
}

function caixaDaMascara(alfa, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alfa[y * w + x] >= 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) return null;
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const fracoes = (c, w, h) => [c.left / w, c.top / h, c.width / w, c.height / h].map((v) => +v.toFixed(4));

async function recortarRgba(rgba, w, h, caixa) {
  return sharp(Buffer.from(rgba), { raw: { width: w, height: h, channels: 4 } }).extract(caixa).png().toBuffer();
}

// partes: [{ id, papel, pontos: [[x,y]...], excluir?: [[x,y]...], z? }] em pixels do mascote.
// segmentador é injetável (os testes usam máscaras prontas).
export async function separarEmPartes(png, partes, { remendo = true, folga = 6, segmentador = segmentar } = {}) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const uniao = Buffer.alloc(w * h);
  const saida = [];
  for (const parte of partes) {
    const { mascara: bruta, nota } = await segmentador(png, parte);
    let mascara = limparMascara(bruta, w, h);
    if (parte.halo !== 0) mascara = haloDaParte(data, w, h, mascara, parte.halo ?? 30);
    const rgba = Buffer.from(data);
    for (let i = 0; i < w * h; i++) {
      const dentro = mascara[i] && data[i * 4 + 3] > 0;
      if (!dentro) rgba[i * 4 + 3] = 0;
      else uniao[i] = 255;
    }
    const caixa = caixaDaMascara(rgba.filter((_, k) => k % 4 === 3), w, h);
    if (!caixa) throw new Error(`a parte "${parte.id}" saiu vazia: confira os pontos`);
    saida.push({ id: parte.id, papel: parte.papel ?? 'objeto_na_mao', z: parte.z ?? 2, nota: +nota.toFixed(3), caixa: fracoes(caixa, w, h), png: await recortarRgba(rgba, w, h, caixa) });
  }
  const corpo = Buffer.from(data);
  const buraco = dilatar(uniao, w, h, folga);
  for (let i = 0; i < w * h; i++) if (buraco[i]) corpo[i * 4 + 3] = 0;
  if (remendo) remendar(corpo, w, h, buraco);
  const caixaCorpo = caixaDaMascara(corpo.filter((_, k) => k % 4 === 3), w, h);
  return {
    tamanho: [w, h],
    corpo: { id: 'corpo', papel: 'corpo', z: 1, caixa: fracoes(caixaCorpo, w, h), png: await recortarRgba(corpo, w, h, caixaCorpo), remendado: remendo },
    partes: saida,
  };
}
