// Especialistas: cada um só mexe nos nós da sua parte. Recebem a tarefa do
// diretor e o número da opção a usar (0 = a preferida) e trocam o material
// daquela parte na cena. O resto da cena fica como está.
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { gradienteDaPaleta, trazerAsset } from '../desconstrucao/molde.js';
import { acharReferencia, recortarNoDoGrafo } from '../desconstrucao/grafo.js';
import { pastaDoItem } from '../banco/armazem.js';
import { adaptarVetor } from '../oficinas/elementos.js';
import { coresPrincipaisDe } from '../qualidade/cor.js';
import { lerMontagem, mascoteNaCena } from '../mascote/montagem.js';

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

async function cenarista(cena, tarefa, opcao, ctx) {
  const caixa = caixaDe(tarefa.caixa);
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

async function ilustradorElementos(cena, tarefa, opcao, ctx) {
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
