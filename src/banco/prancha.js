// Prancha de resultados: a consulta à esquerda e os parecidos ao lado, com
// fonte, licença e nota. É o que o agente (e você) olha para escolher.
import path from 'node:path';
import sharp from 'sharp';
import { pastaDoItem } from './armazem.js';

const LADO = 220;
const LEGENDA = 54;

function escapar(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function corta(t, n) {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

async function celula(png, linhas, destaque) {
  const fundo = destaque ? '#3a2c12' : '#26231e';
  const img = await sharp(png).resize(LADO - 16, LADO - 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const texto = `<svg width="${LADO}" height="${LEGENDA}" xmlns="http://www.w3.org/2000/svg">
    ${linhas.map((l, i) => `<text x="8" y="${18 + i * 16}" font-family="DejaVu Sans, sans-serif" font-size="${i === 0 ? 13 : 11}" fill="${i === 0 ? '#efeae0' : '#a39b8d'}">${escapar(corta(l, 34))}</text>`).join('')}
  </svg>`;
  return sharp({ create: { width: LADO, height: LADO + LEGENDA, channels: 4, background: fundo } })
    .composite([
      { input: Buffer.from(`<svg width="${LADO - 16}" height="${LADO - 16}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="x" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#3a352c"/><rect x="8" y="8" width="8" height="8" fill="#3a352c"/></pattern></defs><rect width="100%" height="100%" fill="url(#x)"/></svg>`), left: 8, top: 8 },
      { input: img, left: 8, top: 8 },
      { input: Buffer.from(texto), left: 0, top: LADO },
    ])
    .png()
    .toBuffer();
}

export async function prancha(banco, consultaPng, tituloConsulta, resultados, destino) {
  const celulas = [await celula(consultaPng ?? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), ['consulta', corta(tituloConsulta, 34)], true)];
  for (const r of resultados) {
    const mini = path.join(pastaDoItem(banco.raiz, r.item), r.item.arquivos.miniatura);
    celulas.push(await celula(mini, [r.item.titulo, `${r.item.fonte} · ${r.item.licenca}`, `nota ${r.nota.toFixed(3)} · forma ${r.forma.toFixed(2)}`]));
  }
  const colunas = Math.min(5, celulas.length);
  const linhas = Math.ceil(celulas.length / colunas);
  const G = 8;
  await sharp({ create: { width: colunas * (LADO + G) + G, height: linhas * (LADO + LEGENDA + G) + G, channels: 4, background: '#15130f' } })
    .composite(celulas.map((input, i) => ({ input, left: G + (i % colunas) * (LADO + G), top: G + Math.floor(i / colunas) * (LADO + LEGENDA + G) })))
    .png()
    .toFile(destino);
  return destino;
}
