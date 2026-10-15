// Ponte com o VectorCraft sem tela (vectorcraft-cli run). Cada passo é um
// comando do catálogo (vectorcraft-cli commands); o CLI devolve uma linha JSON
// por passo, que guardamos no relatório para saber exatamente o que foi feito.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { caminhoVectorcraft } from '../banco/imagem.js';

const executar = promisify(execFile);

export async function rodarVectorcraft(entrada, passos, exportacoes = [], { escala } = {}) {
  const cli = caminhoVectorcraft();
  if (!cli) throw new Error('o VectorCraft não está instalado: defina VECTORCRAFT_CLI com o caminho do vectorcraft-cli');
  const args = ['run'];
  if (entrada) args.push('--in', entrada);
  for (const p of passos) {
    args.push('--cmd', p.cmd);
    if (p.params) args.push('--params', JSON.stringify(p.params));
  }
  for (const e of exportacoes) args.push('--export', e);
  if (escala) args.push('--scale', String(escala));
  const { stdout } = await executar(cli, args, { timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  const linhas = stdout.split('\n').filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l));
  const erro = linhas.find((l) => l.error);
  if (erro) throw new Error(`VectorCraft falhou em ${erro.command ?? erro.step}: ${JSON.stringify(erro.error)}`);
  return linhas;
}

export function resultadoDo(linhas, comando) {
  return linhas.filter((l) => l.command === comando).map((l) => l.result);
}
