// Transforma qualquer arquivo do banco numa imagem que a busca consegue comparar:
// miniatura transparente, silhueta (forma) e cores principais.
//
// Vetores (SVG, .vectorcraft, PDF, .ai) são rasterizados pelo VectorCraft
// (vectorcraft-cli convert), a ferramenta escolhida para a oficina vetorial. Sem o
// VectorCraft instalado, SVG cai no rasterizador do sharp.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { DIM_FORMA } from './armazem.js';

const executar = promisify(execFile);
export const VETORIAIS = ['.svg', '.vectorcraft', '.pdf', '.ai', '.eps'];
export const LADO_MINIATURA = 256;

export function caminhoVectorcraft() {
  if (process.env.VECTORCRAFT_CLI) return process.env.VECTORCRAFT_CLI;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const p = path.join(dir, 'vectorcraft-cli');
    if (existsSync(p)) return p;
  }
  return null;
}

async function rasterizarVetor(arquivo) {
  const cli = caminhoVectorcraft();
  if (cli) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'banco-'));
    try {
      const saida = path.join(tmp, 'r.png');
      await executar(cli, ['convert', arquivo, saida], { timeout: 60000 });
      return await readFile(saida);
    } catch (e) {
      if (path.extname(arquivo).toLowerCase() !== '.svg') throw e;
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
  if (path.extname(arquivo).toLowerCase() !== '.svg') {
    throw new Error(`precisa do vectorcraft-cli para ler ${path.basename(arquivo)} (defina VECTORCRAFT_CLI)`);
  }
  return sharp(arquivo, { density: 144 }).png().toBuffer();
}

// Devolve um PNG RGBA do arquivo, com o lado maior em no máximo `lado` px.
export async function carregarComoPng(arquivoOuBuffer, lado = 512) {
  let entrada = arquivoOuBuffer;
  if (typeof arquivoOuBuffer === 'string' && VETORIAIS.includes(path.extname(arquivoOuBuffer).toLowerCase())) {
    entrada = await rasterizarVetor(arquivoOuBuffer);
  }
  return sharp(entrada, { limitInputPixels: 2e8 })
    .ensureAlpha()
    .resize(lado, lado, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
}

// Máscara do objeto: usa a transparência; se a imagem não tem transparência,
// separa do fundo pela cor das bordas (recortes e banners vêm assim).
async function mascara(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const alfa = new Float32Array(n);
  let temTransparencia = false;
  for (let i = 0; i < n; i++) {
    alfa[i] = data[i * 4 + 3] / 255;
    if (alfa[i] < 0.95) temTransparencia = true;
  }
  if (!temTransparencia) {
    const borda = [0, 0, 0];
    let k = 0;
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = (y * w + x) * 4; borda[0] += data[i]; borda[1] += data[i + 1]; borda[2] += data[i + 2]; k++; }
    for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = (y * w + x) * 4; borda[0] += data[i]; borda[1] += data[i + 1]; borda[2] += data[i + 2]; k++; }
    borda.forEach((v, j) => { borda[j] = v / k; });
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(data[i * 4] - borda[0], data[i * 4 + 1] - borda[1], data[i * 4 + 2] - borda[2]);
      alfa[i] = Math.min(1, Math.max(0, (d - 20) / 40));
    }
  }
  return { alfa, data, w, h };
}

// Silhueta 16x16 do objeto recortado + proporção, normalizada (cosseno compara formas).
export async function descritorForma(png) {
  const { alfa, w, h } = await mascara(png);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alfa[y * w + x] > 0.5) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const v = new Float32Array(DIM_FORMA);
  if (x1 < 0) return v;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const lado = Math.max(bw, bh);
  const ox = x0 - (lado - bw) / 2;
  const oy = y0 - (lado - bh) / 2;
  const G = 16;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let soma = 0, cont = 0;
    const ya = Math.floor(oy + (gy * lado) / G), yb = Math.floor(oy + ((gy + 1) * lado) / G);
    const xa = Math.floor(ox + (gx * lado) / G), xb = Math.floor(ox + ((gx + 1) * lado) / G);
    for (let y = ya; y < Math.max(yb, ya + 1); y++) for (let x = xa; x < Math.max(xb, xa + 1); x++) {
      cont++;
      if (x >= 0 && y >= 0 && x < w && y < h) soma += alfa[y * w + x];
    }
    v[gy * G + gx] = cont ? soma / cont : 0;
  }
  v[G * G] = Math.log(bw / bh) * 2;
  let norma = 0;
  for (const x of v) norma += x * x;
  norma = Math.sqrt(norma) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norma;
  return v;
}

// Até 3 cores principais do objeto (só onde a máscara cobre), em hex.
export async function coresPrincipais(png) {
  const pequeno = await sharp(png).resize(48, 48, { fit: 'inside' }).png().toBuffer();
  const { alfa, data, w, h } = await mascara(pequeno);
  const caixas = new Map();
  for (let i = 0; i < w * h; i++) {
    if (alfa[i] < 0.5) continue;
    const chave = ((data[i * 4] >> 5) << 6) | ((data[i * 4 + 1] >> 5) << 3) | (data[i * 4 + 2] >> 5);
    const c = caixas.get(chave) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += data[i * 4]; c.g += data[i * 4 + 1]; c.b += data[i * 4 + 2];
    caixas.set(chave, c);
  }
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return [...caixas.values()].sort((a, b) => b.n - a.n).slice(0, 3)
    .map((c) => `#${hex(c.r / c.n)}${hex(c.g / c.n)}${hex(c.b / c.n)}`);
}

export async function miniatura(png) {
  return sharp(png)
    .resize(LADO_MINIATURA, LADO_MINIATURA, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// Para o CLIP: o objeto sobre um cinza claro liso (como os prompts do gateway pedem).
export async function sobreFundoNeutro(png) {
  return sharp(png).flatten({ background: '#e6e6e6' }).resize(224, 224, { fit: 'contain', background: '#e6e6e6' }).png().toBuffer();
}
