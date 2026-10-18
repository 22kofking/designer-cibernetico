// Especialistas: cada um só mexe nos nós da sua parte. Recebem a tarefa do
// diretor e o número da opção a usar (0 = a preferida) e trocam o material
// daquela parte na cena. O resto da cena fica como está.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gradienteDaPaleta, trazerAsset } from '../desconstrucao/molde.js';
import { acharReferencia, recortarNoDoGrafo } from '../desconstrucao/grafo.js';
import { pastaDoItem } from '../banco/armazem.js';
import { adaptarVetor } from '../oficinas/elementos.js';
import { gerarProcedural } from '../oficinas/procedural.js';
import { coresPrincipaisDe } from '../qualidade/cor.js';
import { lerMontagem, mascoteNaCena } from '../mascote/montagem.js';
import { caixaNaMao, gerarComponente, maoErguida } from '../geracao/componentes.js';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { caixaEmPixels, encaixar } from '../nucleo/cena.js';

const caixaDe = (c) => ({ x: +c[0].toFixed(4), y: +c[1].toFixed(4), w: +c[2].toFixed(4), h: +c[3].toFixed(4) });

// Nós de uma parte: o próprio id ou os pedaços dele (moedas-1, mascote-corpo...).
export function nosDaParte(cena, no) {
  return cena.nos.filter((n) => n.id === no || n.id.startsWith(`${no}-`));
}

// Troca os nós da parte pelos novos, no lugar do primeiro (a ordem de camadas fica).
export function substituir(cena, no, novos) {
  const i = cena.nos.findIndex((n) => n.id === no || n.id.startsWith(`${no}-`));
  const resto = cena.nos.filter((n) => !(n.id === no || n.id.startsWith(`${no}-`)));
  const lugar = i < 0 ? resto.length : cena.nos.slice(0, i).filter((n) => resto.includes(n)).length;
  resto.splice(lugar, 0, ...novos);
  cena.nos = resto;
}

function itemDoBanco(banco, opcao) {
  const item = banco.itens.find((x) => x.fonte === opcao.fonte && x.id === opcao.id);
  if (!item) throw new Error(`a opção ${opcao.fonte}/${opcao.id} não está no banco`);
  if (item.fonte === 'referencias') throw new Error(`${item.id} é referência: só guia, nunca entra na peça`);
  return item;
}

const origemDe = (item, como) => ({ fonte: item.fonte, como, licenca: item.licenca });

// Componente gerado pelo gateway: gera uma vez por parte (as rodadas reaproveitam)
// e copia a tentativa escolhida para assets/.
async function componente(opcao, tarefa, ctx) {
  if (!ctx.orcamento) throw new Error('gerar componente precisa de --gerar e --teto');
  ctx.componentes ??= new Map();
  if (!ctx.componentes.has(tarefa.no)) {
    const noGrafo = ctx.grafo.nos.find((n) => n.id === tarefa.no);
    const comMascara = noGrafo && (noGrafo.tipo === 'fundo' || noGrafo.mascara);
    const referenciaDoNo = comMascara && opcao.pedido.tipo !== 'mascote' ? await recortarNoDoGrafo(ctx.grafo, noGrafo, acharReferencia(ctx.grafo, ctx.referencias ?? [])) : null;
    ctx.componentes.set(tarefa.no, gerarComponente(opcao.pedido, { pasta: ctx.pasta, orcamento: ctx.orcamento, banco: ctx.banco, personagem: ctx.personagem, referenciaDoNo, gerar: ctx.gerarImagem, recortar: ctx.recortar }));
  }
  const r = await ctx.componentes.get(tarefa.no);
  const asset = `assets/${tarefa.no}-componente.png`;
  await copyFile(r.escolhida, path.join(ctx.pasta, asset));
  return { asset, origem: { fonte: 'criados', como: `${opcao.pedido.tipo} gerado sozinho pelo gateway (geração por componentes)`, licenca: 'nossa' }, componente: r };
}

async function cenarista(cena, tarefa, opcao, ctx) {
  const caixa = caixaDe(tarefa.caixa);
  if (opcao.tipo === 'gerar') {
    const c = await componente(opcao, tarefa, ctx);
    substituir(cena, tarefa.no, [{ id: tarefa.no, papel: 'fundo', tipo: 'imagem', asset: c.asset, caixa, encaixe: 'cobrir', bloqueado: true, origem: c.origem }]);
    return { componente: c.componente };
  }
  if (opcao.tipo === 'gradiente') {
    const noGrafo = ctx.grafo.nos.find((n) => n.id === tarefa.no);
    substituir(cena, tarefa.no, [{ id: tarefa.no, papel: 'fundo', tipo: 'gradiente', direcao: 'horizontal', caixa, paradas: gradienteDaPaleta(noGrafo), bloqueado: true }]);
    return;
  }
  const item = itemDoBanco(ctx.banco, opcao);
  const asset = await trazerAsset(ctx.banco, item, ctx.pasta);
  substituir(cena, tarefa.no, [{ id: tarefa.no, papel: 'fundo', tipo: 'imagem', asset, caixa, encaixe: 'cobrir', bloqueado: true, origem: origemDe(item, 'cenarista: fundo do banco') }]);
}

// Oficina: o vetor do banco recolorido com as cores da parte na referência.
async function adaptarNaOficina(item, tarefa, ctx) {
  const noGrafo = ctx.grafo.nos.find((n) => n.id === tarefa.no);
  const recorte = await recortarNoDoGrafo(ctx.grafo, noGrafo, acharReferencia(ctx.grafo, ctx.referencias ?? []));
  const paleta = await coresPrincipaisDe(recorte, 4);
  const pastaOficina = path.join(ctx.pasta, 'oficina', `${tarefa.no}-${item.id}`);
  await mkdir(pastaOficina, { recursive: true });
  const r = await adaptarVetor(path.join(pastaDoItem(ctx.banco.raiz, item), item.arquivos.original), { paleta }, pastaOficina);
  const asset = `assets/${tarefa.no}-${item.id}-adaptado.png`;
  await copyFile(r.png, path.join(ctx.pasta, asset));
  return { asset, paleta };
}

// Procedural: o gerador desenha a parte inteira no tamanho da caixa, nas cores
// tiradas da parte da referência (só a paleta; a forma é toda nossa).
async function desenharPorCodigo(cena, tarefa, opcao, ctx) {
  const noGrafo = ctx.grafo.nos.find((n) => n.id === tarefa.no);
  let paleta = null;
  if (noGrafo?.mascara || Array.isArray(noGrafo?.caixa)) {
    const recorte = await recortarNoDoGrafo(ctx.grafo, noGrafo, acharReferencia(ctx.grafo, ctx.referencias ?? []));
    paleta = await coresPrincipaisDe(recorte, 4);
  }
  const { largura: W, altura: H } = cena.formato;
  const largura = Math.max(16, Math.round(tarefa.caixa[2] * W)), altura = Math.max(16, Math.round(tarefa.caixa[3] * H));
  const semente = opcao.semente ?? 1;
  const r = await gerarProcedural(opcao.gerador, { largura, altura, semente, paleta });
  const base = `assets/${tarefa.no}-procedural-${opcao.gerador}-${semente}`;
  await mkdir(path.join(ctx.pasta, 'assets'), { recursive: true });
  await writeFile(path.join(ctx.pasta, `${base}.svg`), r.svg);
  await writeFile(path.join(ctx.pasta, `${base}.png`), r.png);
  const como = `ilustrador de elementos: ${opcao.gerador.replaceAll('_', ' ')} desenhado por código (semente ${semente}${paleta ? `, cores da parte ${paleta.join(' ')}` : ''}); vetor em ${base}.svg`;
  substituir(cena, tarefa.no, [{ id: tarefa.no, papel: 'elemento', tipo: 'imagem', asset: `${base}.png`, caixa: caixaDe(tarefa.caixa), encaixe: 'conter', origem: { fonte: 'criados', como, licenca: 'nossa' } }]);
  return { paleta, svg: `${base}.svg` };
}

// Mascote gerado na cena (com a mão livre) e a caixa do objeto na mão erguida dele.
async function objetoNaMao(cena, assetObjeto, ctx) {
  const mascote = cena.nos.find((n) => n.papel === 'mascote' && n.tipo === 'imagem' && /componente/.test(n.asset));
  if (!mascote) return null;
  const pngMascote = await readFile(path.join(ctx.pasta, mascote.asset));
  const mao = await maoErguida(pngMascote);
  if (!mao) return null;
  const m = await sharp(pngMascote).metadata();
  const o = await sharp(path.join(ctx.pasta, assetObjeto)).metadata();
  const pos = encaixar(m.width, m.height, caixaEmPixels(mascote.caixa, cena.formato), mascote.encaixe ?? 'conter', mascote.ancora ?? 'centro');
  const caixa = caixaNaMao(mao, { x: pos.x, y: pos.y, w: m.width * pos.escalaX, h: m.height * pos.escalaY }, cena.formato, o.width / o.height);
  return { mascote, caixa: Object.fromEntries(Object.entries(caixa).map(([k, v]) => [k, +v.toFixed(4)])) };
}

async function ilustradorElementos(cena, tarefa, opcao, ctx) {
  if (opcao.tipo === 'procedural') return desenharPorCodigo(cena, tarefa, opcao, ctx);
  if (opcao.tipo === 'gerar') {
    const c = await componente(opcao, tarefa, ctx);
    const no = { id: tarefa.no, papel: 'elemento', tipo: 'imagem', asset: c.asset, caixa: caixaDe(tarefa.caixa), encaixe: 'conter', origem: c.origem };
    // Objeto segurado: vai para a mão erguida do NOSSO mascote (a caixa do grafo é a
    // mão do personagem da referência), atrás dele, para os dedos ficarem por cima.
    const naMao = opcao.pedido.tipo === 'objeto' && (await objetoNaMao(cena, c.asset, ctx));
    if (naMao) {
      no.caixa = naMao.caixa;
      no.ancora = 'base';
      cena.nos = cena.nos.filter((n) => !(n.id === tarefa.no || n.id.startsWith(`${tarefa.no}-`)));
      cena.nos.splice(cena.nos.indexOf(naMao.mascote), 0, no);
      return { componente: c.componente, na_mao: true };
    }
    substituir(cena, tarefa.no, [no]);
    return { componente: c.componente };
  }
  const item = itemDoBanco(ctx.banco, opcao);
  let asset, como = `ilustrador de elementos: ${item.titulo}`, info = {};
  if (opcao.tipo === 'adaptar') {
    const a = await adaptarNaOficina(item, tarefa, ctx);
    asset = a.asset;
    como = `ilustrador de elementos: ${item.titulo} recolorido no VectorCraft com as cores da parte (${a.paleta.join(' ')})`;
    info = { paleta: a.paleta };
  } else asset = await trazerAsset(ctx.banco, item, ctx.pasta);
  const atuais = nosDaParte(cena, tarefa.no);
  const caixas = atuais.length ? atuais.map((n) => ({ id: n.id, caixa: n.caixa })) : [{ id: tarefa.no, caixa: caixaDe(tarefa.caixa) }];
  substituir(cena, tarefa.no, caixas.map(({ id, caixa }) => ({ id, papel: 'elemento', tipo: 'imagem', asset, caixa, encaixe: 'conter', origem: origemDe(item, como) })));
  return info;
}

async function ilustradorMascote(cena, tarefa, opcao, ctx) {
  const caixa = nosDaParte(cena, tarefa.no)[0]?.caixa ?? caixaDe(tarefa.caixa);
  if (opcao.tipo === 'montagem') {
    const montagem = await lerMontagem(opcao.arquivo);
    await mkdir(path.join(ctx.pasta, 'assets'), { recursive: true });
    const assets = {};
    for (const c of montagem.camadas) {
      const destino = `assets/${montagem.nome}-${c.arquivo}`;
      await copyFile(path.join(path.dirname(opcao.arquivo), c.arquivo), path.join(ctx.pasta, destino));
      assets[c.id] = destino;
    }
    // A caixa do grafo é a do personagem deles; o nosso entra inteiro nela, pela base.
    substituir(cena, tarefa.no, mascoteNaCena(montagem, { id: tarefa.no, caixa, formato: cena.formato, ancora: 'base', assetDe: (c) => assets[c.id] }));
    return { montagem };
  }
  if (opcao.tipo === 'gerar') {
    const c = await componente(opcao, tarefa, ctx);
    substituir(cena, tarefa.no, [{ id: tarefa.no, papel: 'mascote', tipo: 'imagem', asset: c.asset, caixa, encaixe: 'conter', ancora: 'base', origem: c.origem }]);
    return { componente: c.componente };
  }
  const item = itemDoBanco(ctx.banco, opcao);
  const asset = await trazerAsset(ctx.banco, item, ctx.pasta);
  substituir(cena, tarefa.no, [{ id: tarefa.no, papel: 'mascote', tipo: 'imagem', asset, caixa, encaixe: 'conter', ancora: 'base', origem: origemDe(item, 'ilustrador do mascote: rascunho com o nosso mascote mais parecido') }]);
}

async function tipografo(cena, tarefa, opcao) {
  const no = cena.nos.find((n) => n.id === 'texto' && n.tipo === 'bloco_texto');
  if (!no) throw new Error('a cena não tem o bloco de texto do molde');
  no.linhas = opcao.linhas.map((l) => ({ texto: l.texto, estilo: l.estilo, peso: l.peso ?? 1 }));
  no.origem = { fonte: 'criados', como: 'tipógrafo: textos da marca no layout medido', licenca: 'nossa' };
}

export const ESPECIALISTAS = {
  cenarista,
  ilustrador_elementos: ilustradorElementos,
  ilustrador_mascote: ilustradorMascote,
  tipografo,
};

// Aplica a opção `indice` da tarefa. Devolve o que o especialista informou (ou nada).
export async function aplicarOpcao(cena, tarefa, indice, ctx) {
  const opcao = tarefa.opcoes[indice];
  if (!opcao) throw new Error(`a parte ${tarefa.no} não tem a opção ${indice + 1}`);
  const fazer = ESPECIALISTAS[tarefa.especialista];
  if (!fazer) throw new Error(`não há especialista "${tarefa.especialista}"`);
  return (await fazer(cena, tarefa, opcao, ctx)) ?? {};
}
