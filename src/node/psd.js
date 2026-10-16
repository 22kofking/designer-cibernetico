// Cena → PSD com uma camada por nó, na ordem da cena, para abrir e editar no
// PhotoCraft (ou em qualquer editor de PSD). A cena JSON continua sendo a fonte:
// o PSD é só uma saída. Cada nó é desenhado sozinho, no tamanho da peça, e
// recortado na área que ele ocupa (montagem em src/nucleo/psd-camadas.js, a mesma do editor).
import { writeFile } from 'node:fs/promises';
import { initializeCanvas, writePsdBuffer } from 'ag-psd';
import { createCanvas, createImageData } from 'canvas';
import { documentoPsd } from '../nucleo/psd-camadas.js';
import { renderizar } from './render-node.js';

initializeCanvas(createCanvas, undefined, (w, h) => createImageData(w, h));

// Pixels RGBA da cena inteira, no tamanho da peça.
async function pixelsDe(cena, pasta) {
  const canvas = (await renderizar(cena, pasta)).getNodeCanvas();
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
}

export async function cenaParaPsd(cena, pasta) {
  const documento = await documentoPsd(cena, (c) => pixelsDe(c, pasta));
  return writePsdBuffer(documento, { generateThumbnail: false });
}

export async function exportarPsd(cena, pasta, destino) {
  const buffer = await cenaParaPsd(cena, pasta);
  await writeFile(destino, buffer);
  return destino;
}
