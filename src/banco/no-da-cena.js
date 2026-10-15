// Recorta um nó de uma cena (sozinho, com fundo transparente) para consultar o
// banco com ele: "o que no banco se parece com este mascote / esta moeda?".
import sharp from 'sharp';
import { renderizar } from '../node/render-node.js';

export async function recortarNo(cena, pastaDaCena, idNo) {
  const no = cena.nos.find((n) => n.id === idNo);
  if (!no) throw new Error(`a cena não tem o nó "${idNo}"`);
  const sozinho = { ...cena, formato: { ...cena.formato, fundo: 'rgba(0,0,0,0)' }, nos: [{ ...no, visivel: true }] };
  const canvas = await renderizar(sozinho, pastaDaCena);
  const png = canvas.getNodeCanvas().toBuffer('image/png');
  return sharp(png).trim({ threshold: 1 }).png().toBuffer();
}
