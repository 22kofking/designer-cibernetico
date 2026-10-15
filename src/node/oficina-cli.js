#!/usr/bin/env node
// Oficinas pela linha de comando (npm run oficina -- ...).
//
//   elemento --nome moedas (--texto "stack of gold coins" | --imagem arquivo | --cena cena.json --no id | --raster nosso.png)
//            [--paleta "#f0b03a,#e5682d,#aa251c,#fef60a"] [--contorno "#120804:8"] [--cores 6]
//            [--escolher id-do-banco] [--gerar --teto 0.02] [--saida pasta] [--nao-guardar]
//            [--trocar] (com --cena: grava cena-oficina.json com o nó trocado pelo elemento)
//
// Gerar só acontece com --gerar e --teto, e precisa de GATEWAY_URL e GATEWAY_CHAVE no ambiente.
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { Banco, pastaDoItem } from '../banco/armazem.js';
import { recortarNo } from '../banco/no-da-cena.js';
import { celula, montarPrancha } from '../banco/prancha.js';
import { fazerElemento, trocarNaCena } from '../oficinas/elementos.js';
import { carregarCena } from './render-node.js';

function opcao(args, nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
}
const lista = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);

function contorno(v) {
  if (!v || v === 'nao') return undefined;
  const [cor, espessura] = v.split(':');
  return { cor, espessura: Number(espessura ?? 6) };
}

async function principal(args) {
  const [comando, ...resto] = args;
  if (comando !== 'elemento') {
    console.error((await readFile(new URL(import.meta.url), 'utf8')).split('\n').slice(1, 10).join('\n'));
    process.exitCode = 2;
    return;
  }
  const banco = await Banco.abrir();
  const nome = opcao(resto, 'nome', 'elemento');
  const saida = path.resolve(opcao(resto, 'saida', path.join('saidas', 'oficina', nome)));
  const arquivoCena = opcao(resto, 'cena');
  const idNo = opcao(resto, 'no');
  let cena = null;
  let referencia = opcao(resto, 'imagem');
  if (arquivoCena) {
    cena = await carregarCena(arquivoCena);
    referencia = await recortarNo(cena, path.dirname(path.resolve(arquivoCena)), idNo);
  }
  const pedido = {
    nome,
    descricao: opcao(resto, 'texto'),
    referencia,
    raster: opcao(resto, 'raster'),
    estilo: { paleta: lista(opcao(resto, 'paleta')), contorno: contorno(opcao(resto, 'contorno')), cores_max: Number(opcao(resto, 'cores', 6)) },
    escolher: opcao(resto, 'escolher'),
    gerar: resto.includes('--gerar') ? { permitido: true, teto: Number(opcao(resto, 'teto', 0)) } : undefined,
    guardar: !resto.includes('--nao-guardar'),
  };
  const { relatorio, png, candidatos } = await fazerElemento(banco, pedido, saida);

  const celulas = [];
  if (png) celulas.push(await celula(png, ['referência', arquivoCena ? `nó ${idNo}` : path.basename(String(opcao(resto, 'imagem')))], true));
  else if (pedido.raster) celulas.push(await celula(await readFile(pedido.raster), ['raster trazido', path.basename(pedido.raster)], true));
  else celulas.push(await celula(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), ['pedido por texto', `"${pedido.descricao}"`], true));
  for (const r of candidatos.slice(0, 3)) {
    const ehBase = r.item.id === relatorio.base;
    celulas.push(await celula(path.join(pastaDoItem(banco.raiz, r.item), r.item.arquivos.miniatura), [`${ehBase ? '★ ' : ''}${r.item.titulo}`, `${r.item.fonte} · ${r.item.licenca}`, `nota ${r.nota.toFixed(3)}`], ehBase));
  }
  const final = relatorio.resultado?.png ?? relatorio.resultado?.arquivo;
  if (final) celulas.push(await celula(final, [`resultado: ${relatorio.acao}`, relatorio.guardado ? `banco: ${relatorio.guardado.id}` : 'não guardado'], true));
  await montarPrancha(celulas, path.join(saida, 'prancha.png'));

  if (cena && resto.includes('--trocar') && relatorio.resultado?.png) {
    const pasta = path.dirname(path.resolve(arquivoCena));
    const nova = await trocarNaCena(cena, pasta, idNo, relatorio.resultado.png, {
      nomeAsset: `${idNo}-${nome}.png`,
      origem: { fonte: 'criados', como: `oficina de elementos (${relatorio.acao})`, licenca: relatorio.guardado?.licenca ?? 'nossa', banco: relatorio.guardado?.id },
    });
    const destino = path.join(pasta, 'cena-oficina.json');
    await writeFile(destino, JSON.stringify(nova, null, 2));
    relatorio.cena = destino;
  }
  console.log(JSON.stringify({ acao: relatorio.acao, motivo: relatorio.motivo, saida, guardado: relatorio.guardado, gasto_usd: relatorio.gasto_usd, cena: relatorio.cena }, null, 2));
}

principal(process.argv.slice(2)).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
