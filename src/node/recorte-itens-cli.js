// npm run recorte-itens -- <config.json>
// config: { imagem, saida, itens: [{ id, pontos, excluir?, caixa?, pasta? }] }
// Grava <saida>/<pasta>/<id>.png (recorte), <saida>/_conferencia/<id>.jpg (original ao lado do recorte
// sobre xadrez) e <saida>/relatorio.json. Não gera imagem nova nem gasta nada.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { recortarItem } from '../recorte/itens.js';

const cfg = JSON.parse(await readFile(process.argv[2], 'utf8'));
const png = await sharp(await readFile(cfg.imagem)).png().toBuffer();
await mkdir(path.join(cfg.saida, '_conferencia'), { recursive: true });
const relatorio = [];
for (const item of cfg.itens) {
  try {
    const r = await recortarItem(png, item);
    const pasta = path.join(cfg.saida, item.pasta ?? '');
    await mkdir(pasta, { recursive: true });
    await writeFile(path.join(pasta, `${item.id}.png`), r.png);
    // conferência: trecho do original (com a caixa) + recorte sobre xadrez e sobre cor viva
    const [x0, y0, x1, y1] = r.caixa;
    const m = 24, esq = { left: Math.max(0, x0 - m), top: Math.max(0, y0 - m) };
    const meta = await sharp(png).metadata();
    esq.width = Math.min(meta.width, x1 + m) - esq.left; esq.height = Math.min(meta.height, y1 + m) - esq.top;
    const orig = await sharp(png).extract(esq).resize({ height: 360, withoutEnlargement: false }).png().toBuffer();
    const rec = await sharp(r.png).resize({ height: 360, fit: 'inside', width: 520 }).png().toBuffer();
    const recMeta = await sharp(rec).metadata();
    const fundo = (cor) => sharp({ create: { width: recMeta.width, height: 360, channels: 3, background: cor } }).composite([{ input: rec, gravity: 'center' }]).png().toBuffer();
    const o = await sharp(orig).metadata();
    const [a, b] = await Promise.all([fundo('#ff00ff'), fundo('#203040')]);
    await sharp({ create: { width: o.width + recMeta.width * 2 + 20, height: 360, channels: 3, background: '#808080' } })
      .composite([{ input: orig, left: 0, top: 0 }, { input: a, left: o.width + 10, top: 0 }, { input: b, left: o.width + recMeta.width + 20, top: 0 }])
      .jpeg({ quality: 90 }).toFile(path.join(cfg.saida, '_conferencia', `${item.id}.jpg`));
    relatorio.push({ id: item.id, pasta: item.pasta ?? '', matting: r.matting, caixa: r.caixa, area: r.area, nota: +r.nota.toFixed(3), iou: +r.iou.toFixed(2), avisos: r.avisos, opcoes: r.opcoes });
    console.log(item.id, `caixa ${r.caixa}`, `nota ${r.nota.toFixed(2)}`, r.avisos.join('; '));
  } catch (e) {
    relatorio.push({ id: item.id, erro: e.message });
    console.log(item.id, 'ERRO', e.message);
  }
}
await writeFile(path.join(cfg.saida, 'relatorio.json'), JSON.stringify(relatorio, null, 1));
