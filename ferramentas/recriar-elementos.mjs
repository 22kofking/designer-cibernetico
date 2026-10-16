// Recria, por código, os itens soltos de um grupo de um banner de referência: cada item do banner vira uma
// camada nova, inteira e sem fundo, na mesma posição, tamanho, giro e foco do original. Sem IA e sem custo.
//   node ferramentas/recriar-elementos.mjs <banner> <envelopes|moedas|moedas_furadas> <pasta-de-saida> [posicoes.json] [raiz-da-arara]
// posicoes.json vem do agrupamento (cada item: x, y, w, h, angulo, alongamento, nitidez, encosta_borda, arquivo).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { moeda, rampaDaPaleta, OURO, VERMELHO } from '../src/oficinas/procedural.js';
import { renderizar } from '../src/node/render-node.js';
import { exportarPsd } from '../src/node/psd.js';

const [banner, tipo, saida, arqPos = '/mnt/project-files/arara/elementos-v2/grupos/posicoes.json', raiz = '/mnt/project-files/arara'] = process.argv.slice(2);
if (!banner || !tipo || !saida) { console.error('uso: recriar-elementos.mjs <banner> <envelopes|moedas|moedas_furadas> <saida>'); process.exit(2); }
const ORIG = { 'promo-envelopes': 'promo/promo-1790980998-e0741671.webp', 'promo-deposito': 'promo/promo-1790980959-9639e055.webp' };
const itens = JSON.parse(await readFile(arqPos, 'utf8')).filter((i) => i.banner === banner && (tipo === 'envelopes' ? /^env/.test(i.id) : /^moeda/.test(i.id)));
const { W, H } = itens[0];
const rad = (g) => (g * Math.PI) / 180;

// paleta do tipo, tirada dos pixels dos recortes (como a oficina faz com a referência)
async function paletaDe(arquivos) {
  const px = [];
  for (const f of arquivos) {
    const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4 * 7) if (data[i + 3] > 220) px.push([data[i], data[i + 1], data[i + 2]]);
  }
  px.sort((a, b) => (0.3 * a[0] + 0.59 * a[1] + 0.11 * a[2]) - (0.3 * b[0] + 0.59 * b[1] + 0.11 * b[2]));
  const q = (f) => px[Math.floor(px.length * f)];
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  return [hex(q(0.18)), hex(q(0.5)), hex(q(0.88))];
}
const arqs = itens.map((i) => path.join(raiz, 'elementos-v2/entrega', i.arquivo));
const paleta = await paletaDe(arqs);
const cores = rampaDaPaleta(paleta, tipo === 'envelopes' ? VERMELHO : OURO);

function desfoqueDe(nit, tamanho) { return nit >= 150 ? 0 : nit >= 40 ? tamanho * 0.008 : nit >= 15 ? tamanho * 0.018 : tamanho * 0.03; }

let seq = 0;
function envelopeBanner({ cx, cy, largura: w, altura: h, rotacao = 0, cores, ouro }) {
  const id = `e${++seq}`;
  const r = Math.min(w, h) * 0.08;
  const defs = [
    `<radialGradient id="${id}p" cx="0.42" cy="0.38" r="0.75"><stop offset="0" stop-color="${cores.claro}"/><stop offset="0.55" stop-color="${cores.medio}"/><stop offset="1" stop-color="${cores.escuro}"/></radialGradient>`,
    `<linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cores.medio}"/><stop offset="1" stop-color="${cores.escuro}"/></linearGradient>`,
    `<linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`,
    `<filter id="${id}g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${(Math.min(w, h) * 0.05).toFixed(2)}"/></filter>`,
  ];
  const x0 = -w / 2, y0 = -h / 2, ponta = h * 0.12;
  const selo = moeda({ cx: 0, cy: ponta, raio: Math.min(w, h) * 0.24, inclinacao: 0.05, furo: true, cores: ouro });
  defs.push(...selo.defs);
  const corpo = `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${rotacao.toFixed(1)})">`
    + `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${ouro.claro}" stroke-width="${(Math.min(w, h) * 0.08).toFixed(1)}" opacity="0.75" filter="url(#${id}g)"/>`
    + `<rect x="${x0}" y="${y0 + h * 0.04}" width="${w}" height="${h}" rx="${r}" fill="${cores.sombra}"/>`
    + `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="url(#${id}p)"/>`
    + `<path d="M${x0 + r},${y0} L0,${ponta} L${-x0 - r},${y0} Z" fill="url(#${id}a)" opacity="0.9"/>`
    + `<path d="M${x0 + r * 0.6},${y0 + r * 0.3} L0,${ponta} L${-x0 - r * 0.6},${y0 + r * 0.3}" fill="none" stroke="${ouro.claro}" stroke-width="${(h * 0.03).toFixed(1)}" stroke-linejoin="round"/>`
    + `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${ouro.medio}" stroke-width="${(Math.min(w, h) * 0.035).toFixed(1)}"/>`
    + `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="url(#${id}l)"/>`
    + selo.corpo + `</g>`;
  return { defs, corpo };
}

function desenhar(i) {
  const th = rad(i.angulo), c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  const cortaX = i.x <= 1 || i.x + i.w >= W - 1, cortaY = i.y <= 1 || i.y + i.h >= H - 1;
  const bx = i.x + i.w / 2, by = i.y + i.h / 2;
  const alongado = i.alongamento > 1.25;
  const ang = alongado ? i.angulo : 0;
  let defs, corpo, tamanho;
  if (tipo === 'envelopes') {
    const k = 0.62; // lado curto / lado longo
    const t = alongado ? th : 0, ct = Math.abs(Math.cos(t)), st = Math.abs(Math.sin(t));
    const Lw = i.w / (ct + k * st), Lh = i.h / (st + k * ct);
    const L = !cortaX && !cortaY ? (Lw + Lh) / 2 : cortaX && !cortaY ? Lh : cortaY && !cortaX ? Lw : Math.max(Lw, Lh);
    const bwv = L * ct + L * k * st, bhv = L * st + L * k * ct;
    const cx = i.x <= 1 && cortaX ? i.x + i.w - bwv / 2 : i.x + i.w >= W - 1 && cortaX ? i.x + bwv / 2 : bx;
    const cy = i.y <= 1 && cortaY ? i.y + i.h - bhv / 2 : i.y + i.h >= H - 1 && cortaY ? i.y + bhv / 2 : by;
    const e = envelopeBanner({ cx, cy, largura: L, altura: L * k, rotacao: ang, cores, ouro: OURO });
    defs = e.defs; corpo = e.corpo; tamanho = L;
  } else {
    const rho = alongado ? Math.min(1, 1 / i.alongamento) : 1;
    const incl = Math.min(0.8, 1 - rho);
    const t = alongado ? th : 0, ct = Math.abs(Math.cos(t)), st = Math.abs(Math.sin(t));
    const aW = (i.w / 2) / Math.sqrt(ct * ct + rho * rho * st * st), aH = (i.h / 2) / Math.sqrt(st * st + rho * rho * ct * ct);
    const a = !cortaX && !cortaY ? (aW + aH) / 2 : cortaX && !cortaY ? aH : cortaY && !cortaX ? aW : Math.max(aW, aH);
    const ex = a * Math.sqrt(ct * ct + rho * rho * st * st), ey = a * Math.sqrt(st * st + rho * rho * ct * ct);
    const cx = i.x <= 1 && cortaX ? i.x + i.w - ex : i.x + i.w >= W - 1 && cortaX ? i.x + ex : bx;
    const cy = i.y <= 1 && cortaY ? i.y + i.h - ey : i.y + i.h >= H - 1 && cortaY ? i.y + ey : by;
    const m = moeda({ cx, cy, raio: a, inclinacao: incl, rotacao: ang, furo: tipo === 'moedas_furadas', simbolo: 'coroa', cores, desfoque: desfoqueDe(i.nitidez, a * 2) });
    defs = m.defs; corpo = m.corpo; tamanho = a * 2;
  }
  const desf = tipo === 'envelopes' ? desfoqueDe(i.nitidez, tamanho) : 0;
  const filtro = desf > 0 ? `<filter id="fx${i.id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${desf.toFixed(2)}"/></filter>` : '';
  const f = filtro ? `<g filter="url(#fx${i.id})">${corpo}</g>` : corpo;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join('')}${filtro}</defs>${f}</svg>`;
}

await mkdir(path.join(saida, 'camadas'), { recursive: true });
const nos = [];
for (const i of itens) {
  const png = await sharp(Buffer.from(desenhar(i))).png().toBuffer();
  const { data, info } = await sharp(png).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const left = -info.trimOffsetLeft, top = -info.trimOffsetTop;
  await writeFile(path.join(saida, 'camadas', `${i.id}.png`), data);
  nos.push({ id: i.id, tipo: 'imagem', asset: `camadas/${i.id}.png`, caixa: { x: left / W, y: top / H, w: info.width / W, h: info.height / H }, encaixe: 'esticar' });
}
const cena = { versao: '0.1', nome: `${banner}-${tipo}-recriados`, formato: { largura: W, altura: H, fundo: 'rgba(0,0,0,0)' }, fontes: [], nos };
await writeFile(path.join(saida, 'cena.json'), JSON.stringify(cena, null, 1));
console.log(await exportarPsd(cena, saida, path.join(saida, `${banner}-${tipo}-recriados.psd`)));

// pré-visualização sobre fundo liso, ao lado dos recortes originais no mesmo lugar e do banner de referência
const fundo = { create: { width: W, height: H, channels: 3, background: '#16301f' } };
const sobre = async (camadas) => sharp(fundo).composite(camadas).png().toBuffer();
const recriado = await sobre(await Promise.all(nos.map(async (n) => ({ input: path.join(saida, n.asset), left: Math.round(n.caixa.x * W), top: Math.round(n.caixa.y * H) }))));
const antigo = await sobre(itens.map((i) => ({ input: path.join(raiz, 'elementos-v2/entrega', i.arquivo), left: i.x, top: i.y })));
const ref = await sharp(path.join(raiz, ORIG[banner])).resize(W, H).png().toBuffer();
const rot = (t) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="34"><rect width="${W}" height="34" fill="#000"/><text x="12" y="24" font-family="DejaVu Sans" font-size="20" fill="#fff">${t}</text></svg>`);
const cmp = await sharp({ create: { width: W, height: (H + 34) * 3, channels: 3, background: '#000' } }).composite([
  { input: rot('Referência (banner original)'), top: 0, left: 0 }, { input: ref, top: 34, left: 0 },
  { input: rot('Recortes do banner (como estavam)'), top: H + 34, left: 0 }, { input: antigo, top: H + 68, left: 0 },
  { input: rot('Recriados por código (inteiros, sem fundo)'), top: 2 * (H + 34), left: 0 }, { input: recriado, top: 2 * (H + 34) + 34, left: 0 },
]).jpeg({ quality: 90 }).toBuffer();
await writeFile(path.join(saida, 'comparacao.jpg'), cmp);
await writeFile(path.join(saida, 'recriado-sobre-fundo-liso.png'), recriado);
console.log('paleta', paleta.join(' '), `${nos.length} camadas`);
