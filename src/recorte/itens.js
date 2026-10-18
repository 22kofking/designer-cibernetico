// Recorte de itens, um por um: "o objeto que tem este ponto" (SlimSAM) +
// limpeza da máscara + tirada da cor do fundo na borda. Tudo em CPU, sem custo.
//   item { id, pontos: [[x, y]], excluir?: [[x, y]], caixa?: [x0, y0, x1, y1], suavizar?, encolher? }
// Devolve o PNG recortado (RGBA, aparado), a máscara e números de conferência.
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { segmentar } from '../mascote/segmentar.js';

function caixaDe(m, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}
function iou(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const i = ix * iy;
  return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i);
}

// Pedaços conexos (8 vizinhos); devolve rótulos e áreas.
function pedacos(m, w, h) {
  const rot = new Int32Array(w * h);
  const areas = [0];
  const pilha = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || rot[s]) continue;
    const id = areas.length;
    let topo = 0, n = 0;
    pilha[topo++] = s; rot[s] = id;
    while (topo) {
      const p = pilha[--topo]; n++;
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (m[q] && !rot[q]) { rot[q] = id; pilha[topo++] = q; }
      }
    }
    areas.push(n);
  }
  return { rot, areas };
}

// Fica só com os pedaços grandes (>= 3% do maior) e tapa furos pequenos.
function limpar(m, w, h, pontos) {
  const { rot, areas } = pedacos(m, w, h);
  const maior = Math.max(...areas.slice(1), 0);
  const ficam = new Set();
  areas.forEach((a, i) => { if (i && a >= maior * 0.03) ficam.add(i); });
  for (const [x, y] of pontos) { const r = rot[Math.round(y) * w + Math.round(x)]; if (r) ficam.add(r); }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = ficam.has(rot[i]) ? 255 : 0;
  // furos: pedaços do fundo que não encostam na borda da imagem e são < 1,5% da parte
  const inv = out.map((v) => (v ? 0 : 255));
  const f = pedacos(inv, w, h);
  const area = out.reduce((s, v) => s + (v ? 1 : 0), 0);
  const tocaBorda = new Set();
  for (let x = 0; x < w; x++) { tocaBorda.add(f.rot[x]); tocaBorda.add(f.rot[(h - 1) * w + x]); }
  for (let y = 0; y < h; y++) { tocaBorda.add(f.rot[y * w]); tocaBorda.add(f.rot[y * w + w - 1]); }
  for (let i = 0; i < w * h; i++) {
    const r = f.rot[i];
    if (r && !tocaBorda.has(r) && f.areas[r] < area * 0.015) out[i] = 255;
  }
  return { mascara: out, pedacos: ficam.size };
}

async function borrar(buf, w, h, sigma, canais = 1) {
  const img = sharp(buf, { raw: { width: w, height: h, channels: canais } }).blur(sigma);
  return (canais === 1 ? img.extractChannel(0) : img).raw().toBuffer();
}

const executar = promisify(execFile);
const refinador = path.join(path.dirname(new URL(import.meta.url).pathname), 'refinar.py');

// Matting na região do item (com folga): devolve RGBA do mesmo tamanho da região, ou null se o
// Python ou o pymatting não estiverem instalados (aí vale a borda dura limpa).
async function refinarBorda(png, duro, W, H, cx, faixa) {
  const folga = faixa + 10;
  const r = { left: Math.max(0, cx[0] - folga), top: Math.max(0, cx[1] - folga) };
  r.width = Math.min(W, cx[2] + folga) - r.left; r.height = Math.min(H, cx[3] + folga) - r.top;
  const dir = await mkdtemp(path.join(tmpdir(), 'recorte-'));
  try {
    await sharp(png).extract(r).removeAlpha().png().toFile(path.join(dir, 'i.png'));
    await sharp(duro, { raw: { width: W, height: H, channels: 1 } }).extract(r).png().toFile(path.join(dir, 'm.png'));
    await executar('python3', ['-I', refinador, path.join(dir, 'i.png'), path.join(dir, 'm.png'), path.join(dir, 'o.png'), String(faixa)], { maxBuffer: 1 << 24 });
    return { regiao: r, rgba: await readFile(path.join(dir, 'o.png')) };
  } catch (e) {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// png: Buffer da imagem inteira. Devolve { png, mascara, caixa, recorte, nota, opcoes, avisos }.
export async function recortarItem(png, item) {
  const meta = await sharp(png).metadata();
  const W = meta.width, H = meta.height;
  const seg = await segmentar(png, { pontos: item.pontos, excluir: item.excluir ?? [] });
  const ops = seg.opcoes.map((o, k) => ({ k, nota: o.nota, m: o.mascara, caixa: caixaDe(o.mascara, W, H) })).filter((o) => o.caixa);
  for (const o of ops) o.iou = item.caixa ? iou(o.caixa, item.caixa) : 0;
  ops.sort((a, b) => (item.caixa ? b.iou - a.iou : b.nota - a.nota));
  const esc = ops[0];
  const avisos = [];
  if (item.caixa && esc.iou < 0.6) avisos.push(`máscara difere da caixa esperada (IoU ${esc.iou.toFixed(2)})`);

  let { mascara, pedacos: np } = limpar(esc.m, W, H, item.pontos);
  // alisa a serrilha e encolhe um pouco para sair o halo do fundo
  const suave = await borrar(mascara, W, H, item.suavizar ?? 1.2);
  const corte = 128 + (item.encolher ?? 1) * 24;
  const duro = Buffer.from(suave.map((v) => (v > corte ? 255 : 0)));
  const miolo = await borrar(Buffer.from(duro.map((v) => (v > 0 ? 255 : 0))), W, H, 2.2);
  // alfa = borda macia de ~1 px sobre a máscara dura
  const alfa = await borrar(duro, W, H, 0.7);

  // cor limpa: no miolo (longe da borda) vale a cor da imagem; na borda, a cor do miolo vizinho
  const rgb = await sharp(png).removeAlpha().raw().toBuffer();
  const seguro = Buffer.from(miolo.map((v) => (v > 250 ? 255 : 0)));
  const num = Buffer.alloc(W * H * 3), den = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) { den[i] = seguro[i]; for (let c = 0; c < 3; c++) num[i * 3 + c] = seguro[i] ? rgb[i * 3 + c] : 0; }
  const numB = await borrar(num, W, H, 3, 3), denB = await borrar(den, W, H, 3);
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const usarVizinho = !seguro[i] && denB[i] > 8;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = usarVizinho ? Math.min(255, Math.round(numB[i * 3 + c] * 255 / denB[i])) : rgb[i * 3 + c];
    out[i * 4 + 3] = alfa[i];
  }
  const cx = caixaDe(duro, W, H);
  if (!cx) throw new Error(`recorte vazio: ${item.id}`);
  const pad = 2;
  const box = { left: Math.max(0, cx[0] - pad), top: Math.max(0, cx[1] - pad) };
  box.width = Math.min(W, cx[2] + pad) - box.left; box.height = Math.min(H, cx[3] + pad) - box.top;
  let recorte;
  let refinado = false;
  if (item.matting !== false) {
    const ref = await refinarBorda(png, duro, W, H, cx, item.faixa ?? 4);
    if (ref) {
      const { data, info } = await sharp(ref.rgba).raw().toBuffer({ resolveWithObject: true });
      const tela = Buffer.alloc(W * H * 4);
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const d = ((ref.regiao.top + y) * W + ref.regiao.left + x) * 4, s0 = (y * info.width + x) * 4;
        for (let c = 0; c < 4; c++) tela[d + c] = data[s0 + c];
      }
      recorte = await sharp(tela, { raw: { width: W, height: H, channels: 4 } }).extract(box).png().toBuffer();
      refinado = true;
    }
  }
  if (!recorte) recorte = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).extract(box).png().toBuffer();
  const area = duro.reduce((s, v) => s + (v ? 1 : 0), 0);
  if (cx[0] <= 0 || cx[1] <= 0 || cx[2] >= W || cx[3] >= H) avisos.push('encosta na borda do banner (item cortado pela peça)');
  if (np > 1) avisos.push(`${np} pedaços separados`);
  return { id: item.id, png: recorte, mascara: duro, caixa: cx, box, area, nota: esc.nota, opcao: esc.k, iou: esc.iou, avisos, matting: refinado, opcoes: ops.map((o) => ({ k: o.k, nota: +o.nota.toFixed(3), iou: +o.iou.toFixed(2), caixa: o.caixa })) };
}
