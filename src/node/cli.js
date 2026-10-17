#!/usr/bin/env node
// Uso:
//   node src/node/cli.js render <cena.json> [--saida pasta] [--formatos png,webp]
//   node src/node/cli.js validar <cena.json>
//   node src/node/cli.js psd <cena.json> [--saida arquivo.psd]   (uma camada por nó)
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { carregarCena, exportar, renderizar } from './render-node.js';
import { exportarPsd } from './psd.js';

function opcao(args, nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
}

const [comando, arquivo, ...resto] = process.argv.slice(2);
if (!comando || !arquivo) {
  console.error('uso: cli.js render|validar|psd <cena.json> [--saida pasta] [--formatos png,webp]');
  process.exit(2);
}

try {
  const cena = await carregarCena(arquivo);
  if (comando === 'validar') {
    console.log(`ok: ${arquivo}`);
  } else if (comando === 'render') {
    const pasta = path.dirname(path.resolve(arquivo));
    const saida = path.resolve(opcao(resto, 'saida', path.join(pasta, 'saida')));
    const formatos = opcao(resto, 'formatos', 'png,webp').split(',');
    await mkdir(saida, { recursive: true });
    const canvas = await renderizar(cena, pasta);
    const nome = cena.nome ?? path.basename(arquivo, '.json');
    for (const f of await exportar(canvas, path.join(saida, nome), formatos)) console.log(f);
  } else if (comando === 'psd') {
    const pasta = path.dirname(path.resolve(arquivo));
    const destino = path.resolve(opcao(resto, 'saida', path.join(pasta, `${cena.nome ?? path.basename(arquivo, '.json')}.psd`)));
    console.log(await exportarPsd(cena, pasta, destino));
  } else {
    throw new Error(`comando desconhecido: ${comando}`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
