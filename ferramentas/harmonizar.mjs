// Mede o acabamento de uma montagem contra a referência e grava receita.json, antes/depois e a comparação.
// Uso: node ferramentas/harmonizar.mjs <montagem.png> <referencia.png|webp> <pasta-de-saida>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { harmonizar, lerRgb, paraPng } from '../src/oficinas/acabamento.js';
import { deltaDeCor } from '../src/qualidade/cor.js';

const [montagem, referencia, saida] = process.argv.slice(2);
if (!saida) { console.error('uso: node ferramentas/harmonizar.mjs <montagem> <referencia> <saida>'); process.exit(1); }
mkdirSync(saida, { recursive: true });
const m = await lerRgb(montagem);
const r = await lerRgb(referencia);
if (m.w !== r.w || m.h !== r.h) throw new Error(`tamanhos diferentes: ${m.w}x${m.h} e ${r.w}x${r.h}`);
const res = await harmonizar(m, r, { log: console.log });
await paraPng(res.resultado, path.join(saida, 'harmonizada.png'));
await paraPng(m, path.join(saida, 'montagem.png'));
await paraPng(r, path.join(saida, 'referencia.png'));
const pal = async (p) => Math.round((await deltaDeCor(p, path.join(saida, 'referencia.png'))) * 100) / 100;
const paleta = { antes: await pal(path.join(saida, 'montagem.png')), depois: await pal(path.join(saida, 'harmonizada.png')) };
writeFileSync(path.join(saida, 'receita.json'), JSON.stringify({ receita: res.receita, antes: res.antes, depois: res.depois, paleta }));
const lado = async (p) => sharp(p).resize({ width: 700 }).toBuffer();
const [a, b, c] = await Promise.all(['montagem', 'harmonizada', 'referencia'].map((n) => lado(path.join(saida, `${n}.png`))));
const { height } = await sharp(a).metadata();
await sharp({ create: { width: 700, height: height * 3, channels: 3, background: '#000' } })
  .composite([{ input: a, top: 0, left: 0 }, { input: b, top: height, left: 0 }, { input: c, top: height * 2, left: 0 }]).jpeg({ quality: 88 }).toFile(path.join(saida, 'comparacao.jpg'));
console.log(JSON.stringify({ antes: res.antes, depois: res.depois, paleta, passos: Object.keys(res.receita) }));
