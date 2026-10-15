// Oficina procedural: elementos desenhados por código, sem IA e sem banco.
// Cada gerador recebe parâmetros (tamanho, inclinação, semente, paleta) e devolve
// um SVG; o mesmo gerador faz mil moedas diferentes, todas nossas (licença
// própria) e sempre vetoriais. Serve para o que é geométrico ou repetitivo:
// moedas, moeda furada, medalhão, envelope, raio, faíscas e grupos deles.
// Mascote e cenas complexas continuam nas outras vias.
import sharp from 'sharp';
import { hexParaLab } from './cores.js';

// Aleatório com semente (mulberry32): a mesma semente desenha a mesma peça.
export function aleatorio(semente = 1) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v) => +v.toFixed(2);
let contador = 0;
const novoId = (base) => `${base}${++contador}`;

// Rampa de tons a partir de uma paleta (as cores da parte na referência): do mais
// escuro ao mais claro. Sem paleta, o ouro padrão da ficha.
export const OURO = { sombra: '#6b2a06', escuro: '#b5600f', medio: '#eba61e', claro: '#fde060', brilho: '#fffbe2' };
export const VERMELHO = { sombra: '#5c0d06', escuro: '#a8200c', medio: '#e5391a', claro: '#ff6a3a', brilho: '#ffb08a' };
export function rampaDaPaleta(paleta, base = OURO) {
  if (!paleta?.length) return base;
  const ordem = [...paleta].sort((a, b) => hexParaLab(a)[0] - hexParaLab(b)[0]);
  const em = (f) => ordem[Math.min(ordem.length - 1, Math.round(f * (ordem.length - 1)))];
  return { sombra: base.sombra, escuro: em(0), medio: em(0.5), claro: em(1), brilho: base.brilho };
}

function documento(largura, altura, defs, corpo) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}"><defs>${defs.join('')}</defs>${corpo}</svg>`;
}

const brilhoDifuso = (id, desvio) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${desvio}"/></filter>`;

// Símbolos gravados na face (em coordenadas de raio 1).
const SIMBOLOS = {
  estrela: () => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.24 : 0.56, a = -Math.PI / 2 + (i * Math.PI) / 5;
      p.push(`${n(r * Math.cos(a))},${n(r * Math.sin(a))}`);
    }
    return `<polygon points="${p.join(' ')}"/>`;
  },
  cifrao: () => `<path d="M0.22,-0.3 C0.1,-0.42 -0.3,-0.42 -0.3,-0.16 C-0.3,0.08 0.3,0 0.3,0.22 C0.3,0.46 -0.12,0.46 -0.26,0.3" fill="none" stroke-width="0.13" stroke-linecap="round"/><rect x="-0.05" y="-0.56" width="0.1" height="1.12" rx="0.04"/>`,
  coroa: () => `<path d="M-0.5,0.28 L-0.56,-0.3 L-0.26,-0.02 L0,-0.44 L0.26,-0.02 L0.56,-0.3 L0.5,0.28 Z"/><rect x="-0.5" y="0.32" width="1" height="0.12" rx="0.04"/>`,
  diamante: () => `<polygon points="0,-0.5 0.42,-0.1 0,0.52 -0.42,-0.1"/>`,
};

// Moeda vista de frente ou inclinada. inclinacao 0 = de frente; 0,9 = quase de lado.
// Desenha a borda (espessura), a face com gradiente, o aro, o símbolo em relevo e o reflexo.
export function moeda({ cx = 0, cy = 0, raio = 50, inclinacao = 0.3, rotacao = 0, simbolo = 'estrela', espessura = 0.16, furo = false, cores = OURO, desfoque = 0 } = {}) {
  const defs = [];
  const ry = raio * Math.max(0.12, 1 - inclinacao);
  const face = novoId('face'), aro = novoId('aro'), borda = novoId('borda');
  defs.push(`<radialGradient id="${face}" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="${cores.claro}"/><stop offset="0.55" stop-color="${cores.medio}"/><stop offset="1" stop-color="${cores.escuro}"/></radialGradient>`);
  defs.push(`<linearGradient id="${aro}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cores.brilho}"/><stop offset="0.45" stop-color="${cores.claro}"/><stop offset="1" stop-color="${cores.escuro}"/></linearGradient>`);
  defs.push(`<linearGradient id="${borda}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${cores.sombra}"/><stop offset="0.5" stop-color="${cores.escuro}"/><stop offset="1" stop-color="${cores.sombra}"/></linearGradient>`);
  let filtro = '';
  if (desfoque > 0) { const f = novoId('mov'); defs.push(brilhoDifuso(f, desfoque)); filtro = ` filter="url(#${f})"`; }
  const prof = raio * espessura * Math.sin(inclinacao * Math.PI / 2);
  // A face num círculo de raio 1, achatado pela inclinação.
  const sx = raio, sy = ry;
  const furoQuadrado = furo ? ' M-0.2,-0.2 L-0.2,0.2 L0.2,0.2 L0.2,-0.2 Z' : '';
  const disco = (r) => `M${-r},0 A${r},${r} 0 1,0 ${r},0 A${r},${r} 0 1,0 ${-r},0 Z`;
  const relevo = furo
    ? `<path d="${disco(0.42)}" fill="none" stroke="${cores.escuro}" stroke-width="0.05"/><path d="M-0.27,-0.27 L-0.27,0.27 L0.27,0.27 L0.27,-0.27 Z" fill="none" stroke="${cores.escuro}" stroke-width="0.06"/>`
    : `<g transform="translate(0.03,0.04)" fill="${cores.escuro}" stroke="${cores.escuro}" stroke-width="0.03" opacity="0.8">${SIMBOLOS[simbolo]()}</g><g fill="${cores.claro}" stroke="${cores.claro}" stroke-width="0.03">${SIMBOLOS[simbolo]()}</g>`;
  const corpo = `<g transform="translate(${n(cx)},${n(cy)}) rotate(${n(rotacao)})"${filtro}>`
    // espessura: a face de trás deslocada, e o miolo entre as duas
    + (prof > 0.5 ? `<ellipse cx="0" cy="${n(prof)}" rx="${n(sx)}" ry="${n(sy)}" fill="${cores.sombra}"/><rect x="${n(-sx)}" y="0" width="${n(2 * sx)}" height="${n(prof)}" fill="url(#${borda})"/>` : '')
    + `<g transform="scale(${n(sx)},${n(sy)})">`
    + `<path d="${disco(1)}${furoQuadrado}" fill-rule="evenodd" fill="url(#${aro})"/>`
    + `<path d="${disco(0.84)}${furoQuadrado}" fill-rule="evenodd" fill="url(#${face})"/>`
    + `<path d="${disco(0.84)}" fill="none" stroke="${cores.escuro}" stroke-width="0.035" opacity="0.7"/>`
    + relevo
    // reflexo: arco claro no alto à esquerda
    + `<path d="M-0.72,-0.2 A0.76,0.76 0 0,1 -0.12,-0.75" fill="none" stroke="${cores.brilho}" stroke-width="0.09" stroke-linecap="round" opacity="0.85"/>`
    + `</g></g>`;
  return { defs, corpo };
}

// Medalhão: moeda grande com faixa de pontos gravados em volta e emblema no centro.
export function medalhao({ largura = 300, altura = 360, inclinacao = 0.15, simbolo = 'coroa', cores = OURO } = {}) {
  const raio = Math.min(largura, altura / (1 - inclinacao + 0.2)) * 0.46;
  const m = moeda({ cx: largura / 2, cy: altura / 2 - raio * 0.08, raio, inclinacao, simbolo, espessura: 0.2, cores });
  const ry = raio * (1 - inclinacao);
  let pontos = '';
  for (let i = 0; i < 36; i++) {
    const a = (i * Math.PI * 2) / 36;
    pontos += `<circle cx="${n(largura / 2 + Math.cos(a) * raio * 0.72)}" cy="${n(altura / 2 - raio * 0.08 + Math.sin(a) * ry * 0.72)}" r="${n(raio * 0.025)}" fill="${cores.escuro}" opacity="0.8"/>`;
  }
  return documento(largura, altura, m.defs, m.corpo + pontos);
}

// Uma moeda sozinha num quadro do tamanho dela.
export function moedaSolta({ lado = 200, inclinacao = 0.35, rotacao = -12, simbolo = 'estrela', furo = false, cores = OURO } = {}) {
  const m = moeda({ cx: lado / 2, cy: lado / 2, raio: lado * 0.42, inclinacao, rotacao, simbolo, furo, cores });
  return documento(lado, lado, m.defs, m.corpo);
}

// Moedas voando: espalhadas no quadro, de tamanhos e inclinações diferentes;
// as menores (mais longe) saem desfocadas, como na referência.
export function chuvaDeMoedas({ largura = 300, altura = 600, quantas = 7, semente = 7, simbolo = 'estrela', furo = false, cores = OURO, tamanho = [0.12, 0.3] } = {}) {
  const r = aleatorio(semente);
  const lado = Math.min(largura, altura);
  const defs = [], partes = [], postas = [];
  for (let i = 0, tentativas = 0; i < quantas && tentativas < quantas * 40; tentativas++) {
    const raio = lado * (tamanho[0] + r() * (tamanho[1] - tamanho[0])) / 2;
    const cx = raio + r() * (largura - 2 * raio), cy = raio + r() * (altura - 2 * raio);
    if (postas.some((p) => Math.hypot(p.cx - cx, p.cy - cy) < (p.raio + raio) * 0.8)) continue;
    postas.push({ cx, cy, raio });
    i++;
  }
  postas.sort((a, b) => a.raio - b.raio); // longe (pequena) atrás
  const maior = Math.max(...postas.map((p) => p.raio));
  for (const p of postas) {
    const m = moeda({ ...p, inclinacao: 0.15 + r() * 0.7, rotacao: -60 + r() * 120, simbolo, furo, cores, desfoque: p.raio < maior * 0.55 ? n(p.raio * 0.08) : 0 });
    defs.push(...m.defs);
    partes.push(m.corpo);
  }
  return documento(largura, altura, defs, partes.join(''));
}

// Envelope vermelho (hongbao) com borda dourada e uma moeda de selo, em perspectiva leve.
export function envelope({ cx = 0, cy = 0, largura = 160, altura = 110, rotacao = 0, inclinacao = 0.35, cores = VERMELHO, ouro = OURO } = {}) {
  const defs = [];
  const papel = novoId('papel');
  defs.push(`<linearGradient id="${papel}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cores.claro}"/><stop offset="0.5" stop-color="${cores.medio}"/><stop offset="1" stop-color="${cores.escuro}"/></linearGradient>`);
  const h = altura * (1 - inclinacao * 0.5), w = largura;
  const selo = moeda({ cx: 0, cy: -h * 0.05, raio: Math.min(w, h) * 0.2, inclinacao: inclinacao * 0.8, cores: ouro, furo: true });
  defs.push(...selo.defs);
  const corpo = `<g transform="translate(${n(cx)},${n(cy)}) rotate(${n(rotacao)})">`
    + `<rect x="${n(-w / 2)}" y="${n(-h / 2 + h * 0.06)}" width="${n(w)}" height="${n(h)}" rx="${n(h * 0.06)}" fill="${cores.sombra}"/>`
    + `<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" rx="${n(h * 0.06)}" fill="url(#${papel})"/>`
    + `<rect x="${n(-w / 2 + h * 0.07)}" y="${n(-h / 2 + h * 0.07)}" width="${n(w - h * 0.14)}" height="${n(h * 0.86)}" rx="${n(h * 0.04)}" fill="none" stroke="${ouro.claro}" stroke-width="${n(h * 0.035)}"/>`
    + `<path d="M${n(-w / 2)},${n(-h / 2 + h * 0.02)} L0,${n(h * 0.08)} L${n(w / 2)},${n(-h / 2 + h * 0.02)}" fill="none" stroke="${cores.escuro}" stroke-width="${n(h * 0.03)}" opacity="0.7"/>`
    + selo.corpo
    + `</g>`;
  return { defs, corpo };
}

// Envelopes no chão com moedas furadas por cima: o grupo da peça de envelopes.
export function envelopesComMoedas({ largura = 640, altura = 300, envelopes = Math.max(2, Math.round((largura / altura) * 0.75)), moedas = envelopes + 2, semente = 3, cores = VERMELHO, ouro = OURO } = {}) {
  const r = aleatorio(semente);
  const defs = [], partes = [];
  for (let i = 0; i < envelopes; i++) {
    const w = Math.min(largura / envelopes * (1.15 + r() * 0.3), altura * 1.5), cx = (i + 0.5) * largura / envelopes + (r() - 0.5) * w * 0.2;
    const e = envelope({ cx, cy: altura * (0.5 + (r() - 0.5) * 0.25), largura: w * 0.9, altura: Math.min(altura * 0.85, w * 0.66), rotacao: -14 + r() * 28, cores, ouro });
    defs.push(...e.defs); partes.push(e.corpo);
  }
  for (let i = 0; i < moedas; i++) {
    const raio = altura * (0.1 + r() * 0.1);
    const m = moeda({ cx: raio + r() * (largura - 2 * raio), cy: altura * 0.3 + r() * altura * 0.55, raio, inclinacao: 0.55 + r() * 0.25, rotacao: -15 + r() * 30, furo: true, cores: ouro });
    defs.push(...m.defs); partes.push(m.corpo);
  }
  return documento(largura, altura, defs, partes.join(''));
}

// Raio por deslocamento do ponto médio, com galhos; brilho largo e miolo branco.
export function caminhoDeRaio(de, para, { geracoes = 6, desvio = 0.22, galhos = 0.35, semente = 5 } = {}) {
  const r = aleatorio(semente);
  let segs = [[de, para]];
  const ramos = [];
  let d = Math.hypot(para[0] - de[0], para[1] - de[1]) * desvio;
  for (let g = 0; g < geracoes; g++) {
    const novos = [];
    for (const [a, b] of segs) {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const nx = -(b[1] - a[1]), ny = b[0] - a[0], len = Math.hypot(nx, ny) || 1;
      const off = (r() - 0.5) * 2 * d;
      const m = [mx + (nx / len) * off, my + (ny / len) * off];
      novos.push([a, m], [m, b]);
      if (g < 3 && r() < galhos) {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5);
        const comp = Math.hypot(b[0] - a[0], b[1] - a[1]) * (1.2 + r());
        ramos.push(caminhoDeRaio(m, [m[0] + Math.cos(ang) * comp, m[1] + Math.sin(ang) * comp], { geracoes: geracoes - g - 1, desvio, galhos: 0, semente: Math.floor(r() * 1e9) }).tronco);
      }
    }
    segs = novos;
    d /= 2;
  }
  return { tronco: [segs[0][0], ...segs.map((s) => s[1])], ramos };
}

export function raio({ largura = 300, altura = 600, de, para, cor = '#bfe6ff', espessura = 6, semente = 5, galhos = 0.35 } = {}) {
  const c = caminhoDeRaio(de ?? [largura * 0.55, 0], para ?? [largura * 0.45, altura], { semente, galhos });
  const d = (pts) => 'M' + pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' L');
  const brilho = novoId('brilho');
  const linhas = (larg, corL, op, filtro = '') => [c.tronco, ...c.ramos].map((pts, i) => `<path d="${d(pts)}" fill="none" stroke="${corL}" stroke-width="${n(larg * (i ? 0.5 : 1))}" stroke-linejoin="round" stroke-linecap="round" opacity="${op}"${filtro}/>`).join('');
  return documento(largura, altura, [brilhoDifuso(brilho, espessura * 1.5)],
    linhas(espessura * 4, cor, 0.7, ` filter="url(#${brilho})"`) + linhas(espessura, cor, 1) + linhas(espessura * 0.4, '#ffffff', 1));
}

// Faíscas: riscos curtos e pontos brilhantes saindo de um centro (ou espalhados).
export function faiscas({ largura = 400, altura = 300, quantas = 40, centro, semente = 11, cores = OURO } = {}) {
  const r = aleatorio(semente);
  const [cx, cy] = centro ?? [largura / 2, altura / 2];
  const brilho = novoId('brilho');
  let riscos = '';
  for (let i = 0; i < quantas; i++) {
    const ang = r() * Math.PI * 2, dist = (0.15 + r() * 0.85) * Math.min(largura, altura) / 2;
    const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist;
    const comp = 4 + r() * 18, larg = 1 + r() * 2.5;
    const cor = r() < 0.5 ? cores.claro : cores.brilho;
    riscos += `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + Math.cos(ang) * comp)}" y2="${n(y + Math.sin(ang) * comp)}" stroke="${cor}" stroke-width="${n(larg)}" stroke-linecap="round"/>`;
  }
  return documento(largura, altura, [brilhoDifuso(brilho, 3)], `<g filter="url(#${brilho})" opacity="0.9">${riscos}</g>${riscos}`);
}

// Catálogo: nome → gerador que recebe { largura, altura, semente, paleta } e devolve SVG.
export const GERADORES = {
  moeda: ({ largura, altura, paleta, ...o }) => moedaSolta({ lado: Math.min(largura, altura), cores: rampaDaPaleta(paleta), ...o }),
  moeda_furada: ({ largura, altura, paleta, ...o }) => moedaSolta({ lado: Math.min(largura, altura), furo: true, cores: rampaDaPaleta(paleta), ...o }),
  chuva_de_moedas: ({ paleta, ...o }) => chuvaDeMoedas({ cores: rampaDaPaleta(paleta), ...o }),
  medalhao: ({ paleta, ...o }) => medalhao({ cores: rampaDaPaleta(paleta), ...o }),
  envelopes_com_moedas: ({ paleta, ...o }) => envelopesComMoedas({ ...o }),
  raio: ({ paleta, ...o }) => raio(o),
  faiscas: ({ paleta, ...o }) => faiscas({ cores: rampaDaPaleta(paleta), ...o }),
};

// Qual gerador serve para uma parte do grafo, pela descrição e pelo tipo.
export function geradorParaParte(no) {
  const d = (no.descricao ?? no.id ?? '').toLowerCase();
  if (/medalh|moeda gigante|moeda grande/.test(d)) return 'medalhao';
  if (/envelope/.test(d)) return 'envelopes_com_moedas';
  if (/moeda/.test(d)) return no.tipo === 'objeto_grupo' ? 'chuva_de_moedas' : (/furad/.test(d) ? 'moeda_furada' : 'moeda');
  if (/\braio/.test(d)) return 'raio';
  if (/faísca|faisca|fagulha/.test(d)) return 'faiscas';
  return null;
}

export async function renderizarSvg(svg) {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function gerarProcedural(nome, opcoes = {}) {
  const gerador = GERADORES[nome];
  if (!gerador) throw new Error(`não há gerador procedural "${nome}" (tem: ${Object.keys(GERADORES).join(', ')})`);
  const svg = gerador({ largura: 300, altura: 300, ...opcoes });
  return { svg, png: await renderizarSvg(svg) };
}
