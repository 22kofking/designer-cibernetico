#!/usr/bin/env node
// Desconstrução → banco → molde (npm run desconstruir -- ...).
//
//   importar <grafo.json> [mais grafos...] [--referencias pasta] [--refazer]
//       cada parte da referência vira item "referencias" no banco (grupos também peça por peça)
//   plano <grafo.json> [--referencias pasta] [--saida pasta]
//       consulta o banco parte por parte: plano.json + prancha.png
//   molde <grafo.json> [--referencias pasta] [--saida pasta] [--logo nosso-logo.png] [--escala 2]
//       plano + documento de cena com o layout da referência e o nosso material (cena.json + prévia)
//
// Os grafos (formato grafo-peca/0.1) vêm do gera-o-de-imagem- (ferramentas/desconstruir.py).
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Banco, pastaDoItem } from '../banco/armazem.js';
import { celula, montarPrancha } from '../banco/prancha.js';
import { importarGrafo, lerGrafo } from '../desconstrucao/grafo.js';
import { grafoParaCena } from '../desconstrucao/molde.js';
import { planejar, planoParaJson } from '../desconstrucao/plano.js';
import { exportar, renderizar } from './render-node.js';

function opcao(args, nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
}
const COM_VALOR = ['--referencias', '--saida', '--logo', '--escala'];
const posicionais = (args) => args.filter((a, i) => !a.startsWith('--') && !COM_VALOR.includes(args[i - 1]));

async function pranchaDoPlano(banco, plano, destino) {
  const linhas = [];
  for (const n of plano.nos) {
    const fila = [await celula(n._recorte, [`${n.no} (${n.tipo})`, `${n.acao}`, n.consulta], true)];
    for (const r of n._resultados) {
      const ehBase = n.base?.id === r.item.id;
      fila.push(await celula(path.join(pastaDoItem(banco.raiz, r.item), r.item.arquivos.miniatura), [`${ehBase ? '★ ' : ''}${r.item.titulo}`, `${r.item.fonte} · ${r.item.licenca}`, `nota ${r.nota.toFixed(3)}`], ehBase));
    }
    while (fila.length < 5) fila.push(await celula(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), ['—']));
    linhas.push(...fila.slice(0, 5));
  }
  await montarPrancha(linhas, destino);
}

async function principal(args) {
  const [comando, ...resto] = args;
  const referencias = [opcao(resto, 'referencias', '/mnt/project-files/gera-imagem/9pmbet/referencias')];
  const banco = await Banco.abrir();

  if (comando === 'importar') {
    const saida = [];
    for (const arquivo of posicionais(resto)) {
      saida.push(await importarGrafo(banco, await lerGrafo(arquivo), { referencias, refazer: resto.includes('--refazer') }));
    }
    console.log(JSON.stringify({ importados: saida, banco: banco.resumo() }, null, 2));
    return;
  }

  if (comando === 'plano' || comando === 'molde') {
    const [arquivo] = posicionais(resto);
    const grafo = await lerGrafo(arquivo);
    const pasta = path.resolve(opcao(resto, 'saida', path.join('saidas', 'moldes', grafo.peca)));
    await mkdir(pasta, { recursive: true });
    const plano = await planejar(banco, grafo, { referencias });
    await pranchaDoPlano(banco, plano, path.join(pasta, 'prancha-plano.png'));
    const json = planoParaJson(plano);
    const resumo = { peca: grafo.peca, pasta, plano: plano.nos.map((n) => `${n.no}: ${n.acao}${n.base ? ` (${n.base.titulo}, ${n.base.nota})` : ''}`) };
    if (comando === 'molde') {
      const { cena, pendentes } = await grafoParaCena(banco, grafo, plano, pasta, { escala: Number(opcao(resto, 'escala', 2)), referencias, logo: opcao(resto, 'logo') });
      const arqCena = path.join(pasta, 'cena.json');
      await writeFile(arqCena, JSON.stringify(cena, null, 2));
      const canvas = await renderizar(cena, pasta);
      const previas = await exportar(canvas, path.join(pasta, 'previa'), ['png']);
      json.pendentes = pendentes;
      Object.assign(resumo, { cena: arqCena, previa: previas[0], pendentes });
    }
    await writeFile(path.join(pasta, 'plano.json'), JSON.stringify(json, null, 2));
    console.log(JSON.stringify(resumo, null, 2));
    return;
  }

  console.error((await readFile(new URL(import.meta.url), 'utf8')).split('\n').slice(1, 11).join('\n'));
  process.exitCode = 2;
}

principal(process.argv.slice(2)).catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
