// Elementos desenhados por código.
//   npm run procedural -- <gerador> [--largura 400] [--altura 400] [--semente 1] [--paleta "#hex,#hex"] [--saida pasta]
//   npm run procedural -- lista
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GERADORES, gerarProcedural } from '../oficinas/procedural.js';

const [nome, ...resto] = process.argv.slice(2);
const opcao = (k, padrao) => { const i = resto.indexOf(`--${k}`); return i >= 0 ? resto[i + 1] : padrao; };
if (!nome || nome === 'lista') {
  console.log(`geradores: ${Object.keys(GERADORES).join(', ')}`);
  process.exit(0);
}
const semente = +opcao('semente', 1);
const paleta = opcao('paleta')?.split(',').map((s) => s.trim());
const r = await gerarProcedural(nome, { largura: +opcao('largura', 400), altura: +opcao('altura', 400), semente, paleta });
const pasta = path.resolve(opcao('saida', '.'));
await mkdir(pasta, { recursive: true });
const base = path.join(pasta, `${nome}-${semente}`);
await writeFile(`${base}.svg`, r.svg);
await writeFile(`${base}.png`, r.png);
console.log(`${base}.svg\n${base}.png`);
