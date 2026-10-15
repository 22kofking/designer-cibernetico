// Geração por componentes: em vez de pedir ao gateway uma imagem inteira (que
// depois precisa ser desmontada e remendada), cada parte nasce sozinha e já
// separada:
//   - fundo: só o cenário, sem personagem, objeto, texto ou logo (já é a placa limpa);
//   - mascote: o personagem travado em fundo liso, com a mão livre; o fundo sai no BiRefNet;
//   - objeto na mão: gerado à parte em fundo liso, recortado e posto na caixa do grafo.
// A recomposição é a cena JSON (as caixas do grafo), e o PSD sai dela com uma camada
// por parte. Todo gasto passa por um orçamento com teto obrigatório.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CUSTO_POR_IMAGEM, gerarImagem } from '../oficinas/gateway.js';
import { removerFundo } from '../oficinas/elementos.js';
import { tirarFundoIA } from '../mascote/fundo.js';
import { conferirPersonagem, promptDaPose } from '../mascote/personagem.js';
import { deltaDeCor } from '../qualidade/cor.js';

// O Z-Image Turbo aceita cada lado entre 256 e 1536 (múltiplos de 16 por segurança).
export function tamanhoDoGateway(largura, altura, maximo = 1536) {
  const f = maximo / Math.max(largura, altura);
  const lado = (v) => Math.max(256, Math.min(maximo, Math.round((v * f) / 16) * 16));
  return `${lado(largura)}x${lado(altura)}`;
}

const SEM_NADA = 'empty scene, no characters, no people, no animals, no mascot, no objects in the foreground, no text, no letters, no logo';
const MAO_LIVRE = 'pointing at the viewer with one hand, the other arm raised with the hand open and empty, holding nothing';

export function promptDoFundo(marca, tema) {
  const g = marca.geracao ?? {};
  const cena = g.fundos?.[tema] ?? g.fundo_padrao;
  if (!cena) throw new Error(`a marca não tem o fundo do tema "${tema}" em geracao.fundos`);
  return `${g.estilo_fundo ?? 'wide game banner background'}, ${cena}, ${SEM_NADA}`;
}

export function promptDoObjeto(marca, descricao) {
  const g = marca.geracao ?? {};
  return `${descricao}, single object, ${g.estilo_objeto ?? 'glossy 3D game asset, vivid colors'}, centered, isolated on a plain light grey studio background, no hands, no text, no letters`;
}

// O que gerar para uma peça: só as partes que nascem pelo gateway. Elementos do
// banco, desenho por código, texto e logo ficam com os outros especialistas.
export function pedidosDaPeca(grafo, marca, personagem, { formato, quantas = 2 } = {}) {
  const tema = grafo.tema;
  const t = personagem?.temas?.[tema];
  const pedidos = [];
  const fundo = grafo.nos.find((n) => n.tipo === 'fundo');
  if (fundo) pedidos.push({ no: fundo.id, tipo: 'fundo', prompt: promptDoFundo(marca, tema), tamanho: tamanhoDoGateway(formato.largura, formato.altura), quantas });
  const segurado = grafo.nos.find((n) => n.tipo === 'objeto_segurado' && Array.isArray(n.caixa));
  const mascote = grafo.nos.find((n) => n.tipo === 'personagem');
  if (mascote && personagem) {
    // Com objeto na mão, o mascote nasce de mão livre e o objeto vira outra camada.
    const { prompt, figurino } = promptDaPose(personagem, { tema, segura: segurado && t?.objeto ? MAO_LIVRE : undefined });
    pedidos.push({ no: mascote.id, tipo: 'mascote', prompt, figurino, tamanho: '768x1024', quantas });
  }
  if (segurado && t?.objeto) pedidos.push({ no: segurado.id, tipo: 'objeto', prompt: promptDoObjeto(marca, t.objeto), tamanho: '768x768', quantas });
  return pedidos;
}

export const custoDosPedidos = (pedidos, modelo = 'rapido') => +pedidos.reduce((s, p) => s + p.quantas * (CUSTO_POR_IMAGEM[modelo] ?? 0.02), 0).toFixed(3);

// Orçamento compartilhado: cada geração recebe só o que sobra do teto.
export function criarOrcamento(teto) {
  if (!(teto > 0)) throw new Error('a geração por componentes precisa de um teto de gasto (--teto em US$)');
  let gasto = 0;
  return {
    get gasto() { return +gasto.toFixed(4); },
    get resta() { return +(teto - gasto).toFixed(4); },
    somar(v) { gasto += v; },
  };
}

// Gera um componente, tira o fundo quando é recortável e escolhe a melhor tentativa.
// Guarda todas as tentativas em pasta/componentes/<no>/ e devolve o caminho da escolhida.
export async function gerarComponente(pedido, { pasta, orcamento, banco, personagem, referenciaDoNo, gerar = gerarImagem, recortar }) {
  const destino = path.join(pasta, 'componentes', pedido.no);
  await mkdir(destino, { recursive: true });
  const g = await gerar({ prompt: pedido.prompt, quantas: pedido.quantas, tamanho: pedido.tamanho, teto: orcamento.resta });
  orcamento.somar(g.gasto);
  const tentativas = [];
  for (const [i, img] of g.imagens.entries()) {
    const bruto = path.join(destino, `bruto-${i + 1}.png`);
    await writeFile(bruto, img.png);
    let png = img.png;
    // Fundo liso: a cor da borda resolve; quando sobra fundo, o BiRefNet entra.
    if (pedido.tipo !== 'fundo') png = await (recortar ?? recortarComponente)(img.png);
    const arquivo = path.join(destino, `${pedido.tipo === 'fundo' ? 'fundo' : 'recorte'}-${i + 1}.png`);
    await writeFile(arquivo, png);
    const t = { arquivo, bruto, job: img.job, semente: img.semente };
    if (pedido.tipo === 'mascote' && banco && personagem) t.conferencia = await conferirPersonagem(banco, personagem, png);
    if (referenciaDoNo) t.delta = +(await deltaDeCor(png, referenciaDoNo)).toFixed(2);
    tentativas.push(t);
  }
  const nota = (t) => (t.conferencia && !t.conferencia.aprovado ? 1000 : 0) + (t.delta ?? 0) - (t.conferencia?.parecido?.nota ?? 0);
  const escolhida = [...tentativas].sort((a, b) => nota(a) - nota(b))[0];
  const relatorio = { ...pedido, gasto: g.gasto, escolhida: escolhida.arquivo, tentativas };
  await writeFile(path.join(destino, 'componente.json'), JSON.stringify(relatorio, null, 2));
  return relatorio;
}

// Recorte do componente: pela cor da borda quando a moldura da imagem é lisa (o
// fundo liso que o prompt pede); se a moldura varia (o modelo pôs cenário), BiRefNet.
export async function recortarComponente(png, { tolerancia = 24 } = {}) {
  return (await molduraLisa(png, { tolerancia })) ? removerFundo(png, { tolerancia }) : tirarFundoIA(png);
}

export async function molduraLisa(png, { tolerancia = 24, limite = 0.15 } = {}) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = [];
  for (let x = 0; x < w; x++) px.push((0 * w + x) * 3, ((h - 1) * w + x) * 3);
  for (let y = 0; y < h; y++) px.push((y * w) * 3, (y * w + w - 1) * 3);
  const media = [0, 1, 2].map((c) => px.reduce((s, i) => s + data[i + c], 0) / px.length);
  const fora = px.filter((i) => Math.hypot(data[i] - media[0], data[i + 1] - media[1], data[i + 2] - media[2]) > tolerancia).length;
  return fora / px.length <= limite;
}
