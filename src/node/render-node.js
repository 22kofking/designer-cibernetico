// Renderizador sem tela: o agente usa este para ver e medir a cena exatamente
// como o editor mostra (mesmo Fabric, mesmo núcleo).
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import Ajv from 'ajv';
import path from 'node:path';
import { createCanvas, loadImage, registerFont } from 'canvas';
import * as fabric from 'fabric/node';
import sharp from 'sharp';
import { validarCena } from '../nucleo/cena.js';
import { criarMedidor, montarCena } from '../nucleo/render.js';

const fontesRegistradas = new Set();

export async function carregarCena(arquivo) {
  const cena = JSON.parse(await readFile(arquivo, 'utf8'));
  const esquema = JSON.parse(await readFile(new URL('../../esquemas/cena.schema.json', import.meta.url), 'utf8'));
  const ajv = new Ajv({ allErrors: true });
  const errosEsquema = ajv.validate(esquema, cena) ? [] : ajv.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
  const erros = [...errosEsquema, ...validarCena(cena)];
  if (erros.length) throw new Error(`cena inválida (${arquivo}):\n- ${erros.join('\n- ')}`);
  return cena;
}

// Fonte embutida (data:) vem do editor, quando a pessoa sobe uma fonte nova.
function arquivoDaFonte(f, pasta) {
  if (!f.arquivo.startsWith('data:')) return path.resolve(pasta, f.arquivo);
  const bytes = Buffer.from(f.arquivo.slice(f.arquivo.indexOf(',') + 1), 'base64');
  const arquivo = path.join(os.tmpdir(), `fonte-${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}.ttf`);
  if (!existsSync(arquivo)) writeFileSync(arquivo, bytes);
  return arquivo;
}

function registrarFontes(cena, pasta) {
  for (const f of cena.fontes ?? []) {
    const arquivo = arquivoDaFonte(f, pasta);
    if (fontesRegistradas.has(arquivo)) continue;
    registerFont(arquivo, { family: f.familia, weight: String(f.peso ?? 400) });
    fontesRegistradas.add(arquivo);
  }
}

// Desenha a cena e devolve o canvas do Fabric (para medir ou exportar).
export async function renderizar(cena, pastaDaCena) {
  registrarFontes(cena, pastaDaCena);
  const { largura, altura } = cena.formato;
  const canvas = new fabric.StaticCanvas(null, { width: largura, height: altura, enableRetinaScaling: false });
  const medidor = criarMedidor(createCanvas(10, 10).getContext('2d'));
  // Imagem embutida (data:) vem do editor, quando a camada foi colocada ou veio de um PSD.
  const carregarImagem = async (asset) => new fabric.FabricImage(await loadImage(asset.startsWith('data:') ? asset : path.resolve(pastaDaCena, asset)));
  await montarCena(fabric, canvas, cena, { medidor, carregarImagem });
  return canvas;
}

export async function exportar(canvas, destinoSemExtensao, formatos = ['png', 'webp']) {
  const png = canvas.getNodeCanvas().toBuffer('image/png');
  const saidas = [];
  for (const f of formatos) {
    const arquivo = `${destinoSemExtensao}.${f}`;
    if (f === 'png') await sharp(png).png({ compressionLevel: 9 }).toFile(arquivo);
    else if (f === 'webp') await sharp(png).webp({ quality: 90 }).toFile(arquivo);
    else if (f === 'jpg') await sharp(png).flatten().jpeg({ quality: 90 }).toFile(arquivo);
    else throw new Error(`formato de saída desconhecido: ${f}`);
    saidas.push(arquivo);
  }
  return saidas;
}
