import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { carregarCena, renderizar } from '../src/node/render-node.js';

const arquivo = new URL('../exemplos/capivara362-home-vip/cena.json', import.meta.url).pathname;

test('o exemplo home VIP renderiza no tamanho do formato, com o texto dentro da caixa', async () => {
  const cena = await carregarCena(arquivo);
  const canvas = await renderizar(cena, path.dirname(arquivo));
  const png = canvas.getNodeCanvas().toBuffer('image/png');
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 2040);
  assert.equal(info.height, 600);
  // pixels amarelo-limão do "VIP" só podem aparecer dentro da caixa do texto
  const caixa = cena.nos.find((n) => n.id === 'texto').caixa;
  let dentro = 0;
  let fora = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < Math.round(info.width * 0.42); x++) {
      const i = (y * info.width + x) * info.channels;
      const amarelo = data[i] > 230 && data[i + 1] > 220 && data[i + 2] < 60;
      if (!amarelo) continue;
      const fx = x / info.width;
      const fy = y / info.height;
      if (fx >= caixa.x && fx <= caixa.x + caixa.w && fy >= caixa.y && fy <= caixa.y + caixa.h) dentro++;
      else fora++;
    }
  }
  assert.ok(dentro > 5000, `poucos pixels amarelos: ${dentro}`);
  assert.ok(fora < dentro * 0.01, `amarelo fora da caixa: ${fora}`);
});
