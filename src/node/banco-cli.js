#!/usr/bin/env node
// Banco de referências pela linha de comando (npm run banco -- ...).
//
//   resumo
//   importar criados     <pasta> [--prefixo nome] [--licenca "nossa"]
//   importar referencias <pasta> [--prefixo nome]
//   importar openclipart <pasta-svg> [--categorias a,b] [--limite n]
//   importar vectorcraft <pasta-examples>
//   importar marcas      telegram,whatsapp,instagram
//   buscar (--imagem arquivo | --texto "gold coin" | --cena cena.json --no id)
//          [--k 8] [--fontes criados,publicos] [--papel elemento] [--prancha saida.png] [--json]
//
// O banco fica em BANCO_DIR (padrão /mnt/project-files/banco).
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Banco } from '../banco/armazem.js';
import { buscar } from '../banco/buscar.js';
import { carregarComoPng, descritorForma, sobreFundoNeutro } from '../banco/imagem.js';
import { importarExemplosVectorcraft, importarIconesDeMarca, importarOpenclipart, importarPasta } from '../banco/importar.js';
import { recortarNo } from '../banco/no-da-cena.js';
import { prancha } from '../banco/prancha.js';
import { embeddingDeImagem, embeddingDeTexto } from '../banco/visual.js';
import { carregarCena } from './render-node.js';

const CORES_MARCA = { telegram: '#26A5E4', whatsapp: '#25D366', instagram: '#E4405F', youtube: '#FF0000', tiktok: '#000000', facebook: '#0866FF', x: '#000000', discord: '#5865F2' };

function opcao(args, nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
}
const lista = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);

function progresso(feitos, total) {
  if (feitos % 50 === 0 || feitos === total) process.stderr.write(`\r${feitos}/${total}`);
  if (feitos === total) process.stderr.write('\n');
}

async function principal(args) {
  const [comando, sub, alvo] = args;
  const banco = await Banco.abrir();

  if (comando === 'resumo') {
    console.log(JSON.stringify({ banco: banco.raiz, ...banco.resumo() }, null, 2));
    return;
  }

  if (comando === 'importar') {
    const comum = { refazer: args.includes('--refazer'), aoProgredir: progresso };
    let r;
    if (sub === 'criados') {
      r = await importarPasta(banco, alvo, { fonte: 'criados', licenca: opcao(args, 'licenca', 'nossa'), prefixo: opcao(args, 'prefixo'), ...comum });
    } else if (sub === 'referencias') {
      r = await importarPasta(banco, alvo, { fonte: 'referencias', licenca: 'só referência (não entra na peça final)', prefixo: opcao(args, 'prefixo'), ...comum });
    } else if (sub === 'openclipart') {
      r = await importarOpenclipart(banco, alvo, { categorias: lista(opcao(args, 'categorias')), limite: Number(opcao(args, 'limite', 0)) || undefined, ...comum });
    } else if (sub === 'vectorcraft') {
      r = await importarExemplosVectorcraft(banco, alvo, comum);
    } else if (sub === 'marcas') {
      r = await importarIconesDeMarca(banco, lista(alvo), { pastaTemp: path.join(os.tmpdir(), 'banco-marcas'), cores: CORES_MARCA, ...comum });
    } else {
      throw new Error(`não sei importar "${sub}"`);
    }
    console.log(JSON.stringify({ ...r, falhas: r.falhas.slice(0, 20), total_falhas: r.falhas.length, banco: banco.resumo() }, null, 2));
    return;
  }

  if (comando === 'buscar') {
    const resto = args.slice(1);
    let consulta = {};
    let png = null;
    let titulo;
    if (opcao(resto, 'imagem')) {
      titulo = path.basename(opcao(resto, 'imagem'));
      png = await carregarComoPng(opcao(resto, 'imagem'));
    } else if (opcao(resto, 'cena')) {
      const arquivo = opcao(resto, 'cena');
      const idNo = opcao(resto, 'no');
      titulo = `nó ${idNo}`;
      png = await carregarComoPng(await recortarNo(await carregarCena(arquivo), path.dirname(path.resolve(arquivo)), idNo));
    } else if (opcao(resto, 'texto')) {
      titulo = `"${opcao(resto, 'texto')}"`;
      consulta.visual = await embeddingDeTexto(opcao(resto, 'texto'));
    } else {
      throw new Error('diga o que buscar: --imagem, --texto ou --cena com --no');
    }
    if (png) {
      consulta = { visual: await embeddingDeImagem(await sobreFundoNeutro(png)), forma: await descritorForma(png) };
    }
    const resultados = buscar(banco, consulta, {
      k: Number(opcao(resto, 'k', 8)),
      fontes: lista(opcao(resto, 'fontes')),
      papel: opcao(resto, 'papel'),
    });
    if (opcao(resto, 'prancha')) await prancha(banco, png, titulo, resultados, opcao(resto, 'prancha'));
    if (resto.includes('--json')) {
      console.log(JSON.stringify(resultados.map((r) => ({ ...r.item, nota: r.nota, visual: r.visual, forma: r.forma })), null, 2));
    } else {
      for (const r of resultados) {
        console.log(`${r.nota.toFixed(3)}  ${r.item.fonte.padEnd(11)} ${r.item.titulo}  [${r.item.licenca}]`);
      }
    }
    return;
  }

  console.error((await readFile(new URL(import.meta.url), 'utf8')).split('\n').slice(1, 13).join('\n'));
  process.exitCode = 2;
}

principal(process.argv.slice(2)).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
