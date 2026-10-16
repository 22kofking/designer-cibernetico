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
const ORIG = {
  'home-3': 'home/banner3.png.webp', 'promo-envelopes': 'promo/promo-1790980998-e0741671.webp', 'promo-deposito': 'promo/promo-1790980959-9639e055.webp',
  'promo-rebate': 'promo/promo-1790981102-82ba1db4.webp', 'promo-telegram': 'promo/promo-1790981127-d91c22ef.webp', 'promo-instagram': 'promo/promo-1790981412-117f1d73.webp',
};
const FILTRO = { envelopes: /^env/, moedas: /^moeda/, moedas_furadas: /^moeda/, coracoes: /^coracao/, icones_instagram: /^icone_instagram/, icone_telegram: /^icone_telegram/, celulares: /^celular$/ };
if (!FILTRO[tipo]) { console.error(`tipo desconhecido: ${tipo}`); process.exit(2); }
const itens = JSON.parse(await readFile(arqPos, 'utf8')).filter((i) => i.banner === banner && FILTRO[tipo].test(i.id));
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
const cores = /moeda/.test(tipo) ? rampaDaPaleta(paleta, OURO) : tipo === 'envelopes' ? rampaDaPaleta(paleta, VERMELHO) : OURO;

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

// Coração de notificação (balão vermelho com coração branco), ícone do Instagram, ícone do Telegram e celular.
// Todos desenhados no próprio quadro (centro 0,0), w x h; o giro vem de fora.
function coracao(w, h) {
  const id = `c${++seq}`, bh = h * 0.84, r = Math.min(w, bh) * 0.24;
  const cor = `<linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#ff6a6f"/><stop offset="0.55" stop-color="#f2243b"/><stop offset="1" stop-color="#b3081f"/></linearGradient>`;
  const x0 = -w / 2, y0 = -h / 2;
  const balao = `<rect x="${x0}" y="${y0}" width="${w}" height="${bh}" rx="${r}" fill="url(#${id})"/>`
    + `<path d="M${x0 + w * 0.2},${y0 + bh - 1} L${x0 + w * 0.22},${y0 + h} L${x0 + w * 0.45},${y0 + bh - 1} Z" fill="#c4102a"/>`;
  const s0 = Math.min(w, bh) * 0.32, cx = 0, cy = y0 + bh * 0.52;
  const heart = `<path d="M${cx},${cy + s0 * 0.9} C${cx - s0 * 1.6},${cy - s0 * 0.1} ${cx - s0 * 0.9},${cy - s0 * 1.3} ${cx},${cy - s0 * 0.45} C${cx + s0 * 0.9},${cy - s0 * 1.3} ${cx + s0 * 1.6},${cy - s0 * 0.1} ${cx},${cy + s0 * 0.9} Z" fill="#fff"/>`;
  const brilho = `<rect x="${x0 + w * 0.08}" y="${y0 + bh * 0.06}" width="${w * 0.84}" height="${bh * 0.32}" rx="${r * 0.8}" fill="#fff" opacity="0.18"/>`;
  return { defs: [cor], corpo: `<rect x="${x0}" y="${y0 + h * 0.05}" width="${w}" height="${bh}" rx="${r}" fill="#7a0614"/>` + balao + brilho + heart };
}
function iconeInstagram(w, h, sombra = true) {
  const id = `i${++seq}`, r = w * 0.27, x0 = -w / 2, y0 = -h / 2;
  const g = `<radialGradient id="${id}" cx="0.15" cy="1.05" r="1.35"><stop offset="0" stop-color="#feda75"/><stop offset="0.25" stop-color="#fa7e1e"/><stop offset="0.5" stop-color="#d62976"/><stop offset="0.78" stop-color="#962fbf"/><stop offset="1" stop-color="#4f5bd5"/></radialGradient>`;
  const q = Math.min(w, h), t = q * 0.075; // o glifo é sempre quadrado, mesmo na tela do celular
  const glifo = `<rect x="${-q * 0.29}" y="${-q * 0.29}" width="${q * 0.58}" height="${q * 0.58}" rx="${q * 0.17}" fill="none" stroke="#fff" stroke-width="${t}"/>`
    + `<circle cx="0" cy="0" r="${q * 0.14}" fill="none" stroke="#fff" stroke-width="${t}"/><circle cx="${q * 0.165}" cy="${-q * 0.165}" r="${q * 0.04}" fill="#fff"/>`;
  return { defs: [g], corpo: (sombra ? `<rect x="${x0}" y="${y0 + h * 0.06}" width="${w}" height="${h}" rx="${r}" fill="#5a1c6e"/>` : '')
    + `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="url(#${id})"/>`
    + `<rect x="${x0 + w * 0.06}" y="${y0 + h * 0.04}" width="${w * 0.88}" height="${h * 0.36}" rx="${r * 0.8}" fill="#fff" opacity="0.16"/>` + glifo };
}
function aviaoTelegram(r) {
  return `<path d="M${-r * 0.52},${-r * 0.02} L${r * 0.48},${-r * 0.42} L${r * 0.3},${r * 0.45} L${r * 0.02},${r * 0.22} L${-r * 0.12},${r * 0.38} L${-r * 0.1},${r * 0.12} L${r * 0.3},${-r * 0.25} L${-r * 0.2},${r * 0.08} Z" fill="#fff"/>`;
}
function iconeTelegram(w) {
  const id = `t${++seq}`, r = w / 2;
  const g = `<radialGradient id="${id}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#6fd6ff"/><stop offset="0.6" stop-color="#2aa3e0"/><stop offset="1" stop-color="#136fa8"/></radialGradient>`;
  return { defs: [g], corpo: `<circle cx="0" cy="${r * 0.05}" r="${r}" fill="#0c4a73"/><circle cx="0" cy="0" r="${r}" fill="url(#${id})"/>`
    + `<circle cx="0" cy="0" r="${r * 0.96}" fill="none" stroke="#e8f8ff" stroke-width="${r * 0.05}" opacity="0.7"/>`
    + `<ellipse cx="${-r * 0.2}" cy="${-r * 0.5}" rx="${r * 0.55}" ry="${r * 0.25}" fill="#fff" opacity="0.2"/>` + aviaoTelegram(r) };
}
function celular(w, h, tela) {
  const id = `f${++seq}`, x0 = -w / 2, y0 = -h / 2, r = w * 0.16, m = w * 0.05;
  const aro = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${OURO.brilho}"/><stop offset="0.4" stop-color="${OURO.claro}"/><stop offset="1" stop-color="${OURO.escuro}"/></linearGradient>`;
  const defs = [aro];
  let conteudo;
  const sw = w - 2 * m, sh = h - 2 * m;
  if (tela === 'telegram') {
    const tg = iconeTelegram(sw * 0.62); defs.push(...tg.defs);
    conteudo = `<rect x="${x0 + m}" y="${y0 + m}" width="${sw}" height="${sh}" rx="${r * 0.7}" fill="#0f2235"/>` + tg.corpo;
  } else {
    const ig = iconeInstagram(sw, sh, false); defs.push(...ig.defs);
    conteudo = ig.corpo.replace(/rx="[0-9.]+"/, `rx="${(r * 0.7).toFixed(1)}"`);
  }
  return { defs, corpo: `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r}" fill="url(#${id})"/>`
    + `<rect x="${x0 + m * 0.45}" y="${y0 + m * 0.45}" width="${w - m * 0.9}" height="${h - m * 0.9}" rx="${r * 0.85}" fill="#0b0b0b"/>`
    + conteudo + `<rect x="${-w * 0.16}" y="${y0 + m * 1.2}" width="${w * 0.32}" height="${m * 1.3}" rx="${m * 0.65}" fill="#0b0b0b"/>` };
}

// Retângulo de proporção kx:ky (lado maior = L) girado phi, encaixado na caixa do item;
// se o item encosta na borda do banner, só os lados livres valem para medir e posicionar.
function encaixeRetangulo(i, kx, ky, phi) {
  const ct = Math.abs(Math.cos(rad(phi))), st = Math.abs(Math.sin(rad(phi)));
  const cortaX = i.x <= 1 || i.x + i.w >= W - 1, cortaY = i.y <= 1 || i.y + i.h >= H - 1;
  const Lw = i.w / (kx * ct + ky * st), Lh = i.h / (kx * st + ky * ct);
  const L = !cortaX && !cortaY ? (Lw + Lh) / 2 : cortaX && !cortaY ? Lh : cortaY && !cortaX ? Lw : Math.max(Lw, Lh);
  const bw = L * (kx * ct + ky * st), bh = L * (kx * st + ky * ct);
  const cx = i.x <= 1 && cortaX ? i.x + i.w - bw / 2 : i.x + i.w >= W - 1 && cortaX ? i.x + bw / 2 : i.x + i.w / 2;
  const cy = i.y <= 1 && cortaY ? i.y + i.h - bh / 2 : i.y + i.h >= H - 1 && cortaY ? i.y + bh / 2 : i.y + i.h / 2;
  return { cx, cy, w: L * kx, h: L * ky };
}
const noLugar = (e, cx, cy, phi) => ({ defs: e.defs, corpo: `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${phi.toFixed(1)})">${e.corpo}</g>` });

function desenhar(i) {
  const th = rad(i.angulo), c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  const cortaX = i.x <= 1 || i.x + i.w >= W - 1, cortaY = i.y <= 1 || i.y + i.h >= H - 1;
  const bx = i.x + i.w / 2, by = i.y + i.h / 2;
  const alongado = i.alongamento > 1.25;
  const ang = alongado ? i.angulo : 0;
  let defs, corpo, tamanho;
  if (['coracoes', 'icones_instagram', 'icone_telegram', 'celulares'].includes(tipo)) {
    const phi = i.giro_retangulo ?? 0;
    const [kx, ky] = tipo === 'celulares' ? [0.5, 1] : tipo === 'coracoes' ? [1, 0.95] : [1, 1];
    const q = encaixeRetangulo(i, kx, ky, phi);
    const e = tipo === 'coracoes' ? coracao(q.w, q.h) : tipo === 'icones_instagram' ? iconeInstagram(q.w, q.h) : tipo === 'icone_telegram' ? iconeTelegram(q.w) : celular(q.w, q.h, banner === 'promo-telegram' ? 'telegram' : 'instagram');
    ({ defs, corpo } = noLugar(e, q.cx, q.cy, phi)); tamanho = Math.max(q.w, q.h);
  } else if (tipo === 'envelopes') {
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
  const desf = /moeda/.test(tipo) ? 0 : desfoqueDe(i.nitidez, tamanho);
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

if (ORIG[banner]) {
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
}
console.log('paleta', paleta.join(' '), `${nos.length} camadas`);
