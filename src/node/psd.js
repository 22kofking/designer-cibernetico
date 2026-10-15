// Cena → PSD com uma camada por nó, na ordem da cena, para abrir e editar no
// PhotoCraft (ou em qualquer editor de PSD). A cena JSON continua sendo a fonte:
// o PSD é só uma saída. Cada nó é desenhado sozinho, no tamanho da peça, e
// recortado na área que ele ocupa; a opacidade do nó vira a opacidade da camada.
// Nós da mesma parte (mascote-corpo, mascote-orbe) entram num grupo.
import { writeFile } from 'node:fs/promises';
import { initializeCanvas, writePsdBuffer } from 'ag-psd';
import { createCanvas, createImageData } from 'canvas';
import { renderizar } from './render-node.js';

initializeCanvas(createCanvas, undefined, (w, h) => createImageData(w, h));

function caixaDoAlfa(data, w, h) {
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

function recortar(data, w, c) {
  const cw = c.right - c.left, ch = c.bottom - c.top;
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(data.subarray(((c.top + y) * w + c.left) * 4, ((c.top + y) * w + c.right) * 4), y * cw * 4);
  return { width: cw, height: ch, data: out };
}

const nomeDaCamada = (no) => {
  if (no.tipo === 'bloco_texto') return `texto: ${(no.linhas ?? []).map((l) => l.texto).join(' / ')}`.slice(0, 120);
  return no.id;
};

// Pixels de um nó sozinho, sem o fundo da cena e com opacidade cheia.
async function pixelsDoNo(cena, no, pasta) {
  const so = { ...cena, formato: { ...cena.formato, fundo: 'rgba(0,0,0,0)' }, nos: [{ ...no, opacidade: 1 }] };
  const canvas = (await renderizar(so, pasta)).getNodeCanvas();
  const { width: w, height: h } = canvas;
  return canvas.getContext('2d').getImageData(0, 0, w, h).data;
}

export async function cenaParaPsd(cena, pasta) {
  const { largura: w, altura: h } = cena.formato;
  const camadas = [];
  for (const no of cena.nos) {
    const data = await pixelsDoNo(cena, no, pasta);
    const c = caixaDoAlfa(data, w, h);
    if (!c) continue;
    camadas.push({
      parte: no.id.includes('-') ? no.id.split('-')[0] : no.id,
      camada: { name: nomeDaCamada(no), ...c, opacity: no.opacidade ?? 1, hidden: false, imageData: recortar(data, w, c) },
    });
  }
  // Agrupa os pedaços da mesma parte; o PSD lista as camadas de baixo para cima, como a cena.
  const filhos = [];
  for (let i = 0; i < camadas.length; i++) {
    const irmas = camadas.filter((x) => x.parte === camadas[i].parte);
    if (irmas.length < 2) { filhos.push(camadas[i].camada); continue; }
    if (irmas[0] !== camadas[i]) continue;
    filhos.push({ name: camadas[i].parte, opened: true, children: irmas.map((x) => x.camada) });
  }
  // Fundo da cena (cor chapada) como camada de baixo, para o PSD abrir igual à prévia.
  const fundo = cena.formato.fundo;
  if (fundo) {
    const data = new Uint8ClampedArray(w * h * 4);
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(fundo.slice(k, k + 2), 16));
    for (let i = 0; i < w * h; i++) data.set([r, g, b, 255], i * 4);
    filhos.unshift({ name: 'cor de fundo', left: 0, top: 0, right: w, bottom: h, imageData: { width: w, height: h, data } });
  }
  const previa = (await renderizar(cena, pasta)).getNodeCanvas();
  const composta = previa.getContext('2d').getImageData(0, 0, w, h);
  return writePsdBuffer({ width: w, height: h, children: filhos, imageData: { width: w, height: h, data: composta.data } }, { generateThumbnail: false });
}

export async function exportarPsd(cena, pasta, destino) {
  const buffer = await cenaParaPsd(cena, pasta);
  await writeFile(destino, buffer);
  return destino;
}
