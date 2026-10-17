// Composições da Mesa: um conjunto de camadas numa disposição espacial que se guarda e se reutiliza.
// Funções puras (testadas em testes/composicoes.test.js); o editor cuida da tela e do armazenamento.
//
// Uma composição guarda as camadas com a caixa relativa ao retângulo que envolve o conjunto:
//   { versao, id, nome, aspecto, nos: [{ ...nó, caixa: { x, y, w, h } }] }   (x, y, w, h em 0..1 do conjunto)
// Ao colocar na peça, o conjunto cabe numa largura escolhida e as camadas mantêm a mesma disposição.
import { caixaEmPixels, caixaEmFracoes } from '../src/nucleo/cena.js';

export const VERSAO_COMPOSICAO = 1;

// Retângulo (em pixels da peça) que envolve as camadas com caixa.
export function caixaDoConjunto(nos, formato) {
  const caixas = nos.filter((n) => n.caixa).map((n) => caixaEmPixels(n.caixa, formato));
  if (!caixas.length) return null;
  const x0 = Math.min(...caixas.map((c) => c.x));
  const y0 = Math.min(...caixas.map((c) => c.y));
  const x1 = Math.max(...caixas.map((c) => c.x + c.w));
  const y1 = Math.max(...caixas.map((c) => c.y + c.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Leva o conjunto para outro retângulo (origem e tamanho novos), mantendo a disposição interna.
// Altera os nós recebidos.
export function reposicionar(nos, formato, destino) {
  const de = caixaDoConjunto(nos, formato);
  if (!de) return nos;
  const fx = de.w > 0 ? destino.w / de.w : 1;
  const fy = de.h > 0 ? destino.h / de.h : 1;
  for (const n of nos) {
    if (!n.caixa) continue;
    const c = caixaEmPixels(n.caixa, formato);
    n.caixa = caixaEmFracoes({ x: destino.x + (c.x - de.x) * fx, y: destino.y + (c.y - de.y) * fy, w: c.w * fx, h: c.h * fy }, formato);
  }
  return nos;
}

const slug = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'composicao';

// Congela as camadas escolhidas numa composição. As camadas de texto entram com o texto que têm.
export function capturar(nos, formato, nome) {
  const comCaixa = nos.filter((n) => n.caixa);
  const conjunto = caixaDoConjunto(comCaixa, formato);
  if (!conjunto || !(conjunto.w > 0) || !(conjunto.h > 0)) throw new Error('escolha camadas com tamanho');
  const copias = structuredClone(comCaixa);
  for (const n of copias) {
    const c = caixaEmPixels(n.caixa, formato);
    n.caixa = {
      x: (c.x - conjunto.x) / conjunto.w, y: (c.y - conjunto.y) / conjunto.h, w: c.w / conjunto.w, h: c.h / conjunto.h,
    };
    delete n.secao;
    delete n.bloqueado;
  }
  return { versao: VERSAO_COMPOSICAO, id: slug(nome), nome, aspecto: Math.round((conjunto.w / conjunto.h) * 10000) / 10000, nos: copias };
}

// Camadas novas, prontas para a peça: o conjunto cabe na largura pedida (a altura sai do aspecto) e começa em (x, y).
// `novoId(base)` devolve um id livre; todas as camadas ganham a marca da seção.
export function instanciar(comp, formato, { x, y, largura }, novoId, secao) {
  const altura = largura / comp.aspecto;
  const nos = structuredClone(comp.nos);
  const usados = new Set();
  for (const n of nos) {
    const c = n.caixa;
    n.caixa = caixaEmFracoes({ x: x + c.x * largura, y: y + c.y * altura, w: c.w * largura, h: c.h * altura }, formato);
    let id = novoId(n.id);
    for (let k = 2; usados.has(id); k++) id = `${n.id}-${k}`;
    usados.add(id);
    n.id = id;
    n.secao = secao;
  }
  return nos;
}

// Largura que cabe na peça: até 60 % da largura e 80 % da altura.
export function larguraInicial(comp, formato) {
  return Math.min(formato.largura * 0.6, formato.altura * 0.8 * comp.aspecto);
}

export function validarComposicao(c) {
  if (!c || typeof c !== 'object') return 'não é uma composição';
  if (c.versao !== VERSAO_COMPOSICAO) return `versão ${c.versao} não é a ${VERSAO_COMPOSICAO}`;
  if (!c.nome || !(c.aspecto > 0)) return 'faltam nome ou proporção';
  if (!Array.isArray(c.nos) || !c.nos.length) return 'sem camadas';
  if (c.nos.some((n) => !n.id || !n.tipo || !n.caixa)) return 'camada sem id, tipo ou caixa';
  return null;
}
