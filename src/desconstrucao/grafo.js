// Desconstrução → banco. Lê um grafo de peça (formato grafo-peca/0.1, o que o
// gera-o-de-imagem- produz ao desconstruir uma referência: um nó por parte, com
// caixa, camada, máscara, descrição e paleta) e:
//   - recorta cada parte da referência pela máscara (ou pela caixa);
//   - guarda cada recorte no banco como "referencias" (só guia de forma, nunca entra
//     na peça), com os dados do nó, para a busca achar "um mascote segurando algo",
//     "moedas em volta" etc. a partir de uma peça nova.
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { importarArquivo, slug } from '../banco/importar.js';

export const FORMATO_GRAFO = 'grafo-peca/0.1';

// Tipo do nó no grafo → papel no banco e na cena.
export const PAPEL_DO_TIPO = {
  fundo: 'fundo',
  personagem: 'mascote',
  objeto: 'elemento',
  objeto_grupo: 'elemento',
  objeto_segurado: 'elemento',
  efeito: 'efeito',
  texto: 'texto',
  logo: 'logo',
};

// Partes que viram recorte no banco. Texto não (a letra sai sempre por código),
// logo não (é a nossa) e efeito embutido no fundo não tem o que recortar.
export function noRecortavel(no) {
  if (['texto', 'logo'].includes(no.tipo)) return false;
  if (no.tipo === 'efeito' && !no.mascara) return false;
  return Array.isArray(no.caixa) || !!no.mascara;
}

export async function lerGrafo(arquivo) {
  const grafo = JSON.parse(await readFile(arquivo, 'utf8'));
  if (grafo.formato !== FORMATO_GRAFO) throw new Error(`${path.basename(arquivo)} não é ${FORMATO_GRAFO} (veio ${grafo.formato})`);
  // No disco, a pasta do grafo (máscaras, recortes) fica ao lado do .json com o nome da peça.
  grafo._arquivo = path.resolve(arquivo);
  grafo._pasta = path.join(path.dirname(grafo._arquivo), grafo.peca);
  return grafo;
}

// Acha a imagem da referência: o caminho do grafo é relativo ao repositório que o
// gerou, então tenta a pasta indicada tirando pedaços do começo do caminho.
export function acharReferencia(grafo, raizes = []) {
  const partes = grafo.referencia.split('/');
  const tentativas = [];
  for (const raiz of [path.dirname(grafo._arquivo), ...raizes]) {
    for (let i = 0; i < partes.length; i++) tentativas.push(path.join(raiz, ...partes.slice(i)));
  }
  const achado = tentativas.find((p) => existsSync(p));
  if (!achado) throw new Error(`não achei a referência ${grafo.referencia}; passe a pasta com --referencias`);
  return achado;
}

const paraPixels = (caixa, w, h) => {
  const left = Math.max(0, Math.floor(caixa[0] * w));
  const top = Math.max(0, Math.floor(caixa[1] * h));
  return { left, top, width: Math.max(1, Math.min(w - left, Math.ceil(caixa[2] * w))), height: Math.max(1, Math.min(h - top, Math.ceil(caixa[3] * h))) };
};

// Recorte de um nó: a máscara vira transparência; sem máscara, vale a caixa.
export async function recortarNoDoGrafo(grafo, no, arquivoReferencia) {
  // Fundo: a placa "cena limpa" (sem texto, mascote e logo) é o fundo de verdade.
  const limpa = grafo.placas?.cena_limpa && path.join(grafo._pasta, grafo.placas.cena_limpa);
  if (no.tipo === 'fundo' && limpa && existsSync(limpa)) return sharp(limpa).ensureAlpha().png().toBuffer();
  const ref = sharp(arquivoReferencia).ensureAlpha();
  const { width: w, height: h } = await ref.metadata();
  let img = ref;
  const mascara = no.mascara && path.join(grafo._pasta, no.mascara);
  if (mascara && existsSync(mascara)) {
    const alfa = await sharp(mascara).resize(w, h, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
    const rgb = await sharp(arquivoReferencia).removeAlpha().raw().toBuffer();
    img = sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).joinChannel(alfa, { raw: { width: w, height: h, channels: 1 } });
  }
  let png = await img.png().toBuffer();
  if (Array.isArray(no.caixa)) png = await sharp(png).extract(paraPixels(no.caixa, w, h)).png().toBuffer();
  if (mascara && existsSync(mascara)) png = await sharp(png).trim({ threshold: 1 }).png().toBuffer().catch(() => png);
  return png;
}

// Um grupo (5 moedas em volta) vira também uma peça por pedaço solto da máscara,
// do maior para o menor, ignorando migalhas abaixo de `minimo` da área do maior.
export async function separarPartes(png, { minimo = 0.15, margem = 2 } = {}) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const rotulo = new Int32Array(w * h).fill(-1);
  const partes = [];
  for (let p = 0; p < w * h; p++) {
    if (rotulo[p] >= 0 || data[p * 4 + 3] < 128) continue;
    const parte = { area: 0, x0: w, y0: h, x1: 0, y1: 0 };
    const pilha = [p];
    rotulo[p] = partes.length;
    while (pilha.length) {
      const q = pilha.pop();
      const x = q % w, y = (q - x) / w;
      parte.area++;
      parte.x0 = Math.min(parte.x0, x); parte.y0 = Math.min(parte.y0, y); parte.x1 = Math.max(parte.x1, x); parte.y1 = Math.max(parte.y1, y);
      for (const n of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) {
        if (n >= 0 && rotulo[n] < 0 && data[n * 4 + 3] >= 128) { rotulo[n] = partes.length; pilha.push(n); }
      }
    }
    partes.push(parte);
  }
  const maior = Math.max(0, ...partes.map((x) => x.area));
  const saida = [];
  for (const [i, parte] of partes.entries()) {
    if (parte.area < maior * minimo) continue;
    const left = Math.max(0, parte.x0 - margem), top = Math.max(0, parte.y0 - margem);
    const width = Math.min(w, parte.x1 + margem + 1) - left, height = Math.min(h, parte.y1 + margem + 1) - top;
    const so = Buffer.from(data);
    for (let p = 0; p < w * h; p++) if (rotulo[p] !== i) so[p * 4 + 3] = 0;
    const recorte = await sharp(so, { raw: { width: w, height: h, channels: 4 } }).extract({ left, top, width, height }).png().toBuffer();
    saida.push({ area: parte.area, caixa_px: [left, top, width, height], png: recorte });
  }
  return saida.sort((a, b) => b.area - a.area);
}

export function dadosDoNo(grafo, no) {
  return {
    peca: grafo.peca,
    id: no.id,
    tipo: no.tipo,
    caixa: no.caixa ?? null,
    z: no.z ?? null,
    camada: no.camada_psd ?? null,
    descricao: no.descricao ?? null,
    pose: no.pose ?? null,
    tema: no.tema ?? grafo.tema ?? null,
    figurino: no.figurino ?? null,
    quantidade: no.quantidade ?? null,
    paleta: no.estilo?.paleta?.map((p) => p.cor) ?? null,
    relacoes: (grafo.arestas ?? []).filter((a) => a.de === no.id || a.para === no.id).map((a) => `${a.de} ${a.rel} ${a.para}`),
  };
}

// Leva todos os nós recortáveis de um grafo para o banco ("referencias").
export async function importarGrafo(banco, grafo, { referencias = [], refazer = false } = {}) {
  const arquivoReferencia = acharReferencia(grafo, referencias);
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'grafo-'));
  const feitos = [];
  const pulados = [];
  for (const no of grafo.nos) {
    if (!noRecortavel(no)) { pulados.push(no.id); continue; }
    const id = slug(`grafo-${grafo.peca}-${no.id}`);
    if (!refazer && banco.tem('referencias', id)) { pulados.push(no.id); continue; }
    const png = await recortarNoDoGrafo(grafo, no, arquivoReferencia);
    const arquivo = path.join(tmp, `${id}.png`);
    await writeFile(arquivo, png);
    const dados = dadosDoNo(grafo, no);
    await importarArquivo(banco, arquivo, {
      id,
      fonte: 'referencias',
      titulo: `${grafo.peca} · ${no.id}${no.descricao ? ` · ${no.descricao}` : ''}`,
      tags: ['grafo', grafo.peca, no.tipo, dados.tema, dados.figurino, grafo.formato_peca].filter(Boolean),
      papel: PAPEL_DO_TIPO[no.tipo] ?? 'elemento',
      licenca: 'só referência (não entra na peça final)',
      origem: { como: `desconstrução ${FORMATO_GRAFO}`, grafo: grafo._arquivo, referencia: arquivoReferencia, no: dados },
    });
    feitos.push(no.id);
    if (no.tipo === 'objeto_grupo' && no.mascara) {
      const partes = await separarPartes(png);
      if (partes.length > 1) {
        for (const [i, parte] of partes.entries()) {
          const idParte = `${id}-${i + 1}`;
          const arq = path.join(tmp, `${idParte}.png`);
          await writeFile(arq, parte.png);
          await importarArquivo(banco, arq, {
            id: idParte,
            fonte: 'referencias',
            titulo: `${grafo.peca} · ${no.id} ${i + 1}/${partes.length}`,
            tags: ['grafo', 'parte', grafo.peca, no.tipo, dados.tema, grafo.formato_peca].filter(Boolean),
            papel: 'elemento',
            licenca: 'só referência (não entra na peça final)',
            origem: { como: `desconstrução ${FORMATO_GRAFO} (pedaço do grupo)`, grafo: grafo._arquivo, referencia: arquivoReferencia, no: { ...dados, parte: i + 1, de: partes.length } },
          });
          feitos.push(`${no.id}:${i + 1}`);
        }
      }
    }
  }
  await banco.salvar();
  return { peca: grafo.peca, referencia: arquivoReferencia, feitos, pulados };
}
