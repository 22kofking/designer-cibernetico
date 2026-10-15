// Importadores do banco. Todo item entra com fonte, licença e origem registradas;
// item sem licença não entra.
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pastaDoItem } from './armazem.js';
import { carregarComoPng, coresPrincipais, descritorForma, miniatura, sobreFundoNeutro } from './imagem.js';
import { embeddingDeImagem } from './visual.js';

const EXTENSOES = ['.png', '.webp', '.jpg', '.jpeg', '.svg', '.vectorcraft'];

export function slug(texto) {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function listarArquivos(pasta, extensoes = EXTENSOES) {
  const saida = [];
  for (const nome of (await readdir(pasta)).sort()) {
    const p = path.join(pasta, nome);
    const s = await stat(p);
    if (s.isDirectory()) saida.push(...await listarArquivos(p, extensoes));
    else if (extensoes.includes(path.extname(nome).toLowerCase())) saida.push(p);
  }
  return saida;
}

// Importa um arquivo: guarda o original e a miniatura, calcula forma, cores e embedding.
export async function importarArquivo(banco, arquivo, dados) {
  const item = {
    id: dados.id,
    fonte: dados.fonte,
    titulo: dados.titulo ?? path.basename(arquivo),
    tags: dados.tags ?? [],
    papel: dados.papel ?? null,
    licenca: dados.licenca,
    autor: dados.autor ?? null,
    origem: dados.origem ?? null,
    formato: path.extname(arquivo).slice(1).toLowerCase(),
    importado_em: new Date().toISOString(),
  };
  const png = await carregarComoPng(arquivo);
  const pasta = pastaDoItem(banco.raiz, item);
  await mkdir(pasta, { recursive: true });
  const original = `original.${item.formato}`;
  await copyFile(arquivo, path.join(pasta, original));
  await writeFile(path.join(pasta, 'miniatura.png'), await miniatura(png));
  item.arquivos = { original, miniatura: 'miniatura.png' };
  item.cores = await coresPrincipais(png);
  const forma = await descritorForma(png);
  const visual = await embeddingDeImagem(await sobreFundoNeutro(png));
  banco.colocar(item, visual, forma);
  return item;
}

// Importa uma lista de tarefas com progresso, pulando o que já existe e salvando aos poucos.
async function importarLote(banco, tarefas, { refazer = false, aCada = 200, aoProgredir } = {}) {
  let feitos = 0, pulados = 0;
  const falhas = [];
  for (const [i, t] of tarefas.entries()) {
    if (!refazer && banco.tem(t.dados.fonte, t.dados.id)) { pulados++; continue; }
    try {
      await importarArquivo(banco, t.arquivo, t.dados);
      feitos++;
    } catch (e) {
      falhas.push({ arquivo: t.arquivo, erro: e.message.split('\n')[0] });
    }
    if ((feitos + falhas.length) % aCada === 0) await banco.salvar();
    aoProgredir?.(i + 1, tarefas.length);
  }
  await banco.salvar();
  return { feitos, pulados, falhas };
}

// Papel provável pelo nome do arquivo (camadas exportadas pelo gera-o-de-imagem-).
function papelPeloNome(nome) {
  const n = nome.toLowerCase();
  if (n.includes('mascote')) return 'mascote';
  if (n.includes('logo')) return 'logo';
  if (n.includes('texto')) return 'texto';
  if (n.includes('cena') || n.includes('fundo')) return 'fundo';
  if (n.includes('brilho')) return 'efeito';
  return 'elemento';
}

// Pasta com material nosso (fonte "criados") ou recortes estudados (fonte "referencias").
export async function importarPasta(banco, pasta, { fonte, licenca, prefixo, tags = [], ...opcoes }) {
  const arquivos = await listarArquivos(pasta);
  const tarefas = arquivos.map((arquivo) => {
    const rel = path.relative(pasta, arquivo);
    const partes = rel.split(path.sep);
    return {
      arquivo,
      dados: {
        id: slug(`${prefixo ?? path.basename(pasta)}-${rel}`),
        fonte,
        titulo: rel,
        tags: [...tags, ...partes.slice(0, -1)],
        papel: papelPeloNome(rel),
        licenca,
        origem: { como: 'importado de pasta', caminho: arquivo },
      },
    };
  });
  return importarLote(banco, tarefas, opcoes);
}

// Openclipart 0.18 (pacote openclipart-svg do Debian): domínio público (CC0).
export async function importarOpenclipart(banco, pasta, { categorias, limite, ...opcoes } = {}) {
  let arquivos = await listarArquivos(pasta, ['.svg']);
  if (categorias?.length) arquivos = arquivos.filter((a) => categorias.includes(path.relative(pasta, a).split(path.sep)[0]));
  if (limite) arquivos = arquivos.slice(0, limite);
  const tarefas = arquivos.map((arquivo) => {
    const rel = path.relative(pasta, arquivo);
    return {
      arquivo,
      dados: {
        id: slug(rel),
        fonte: 'publicos',
        titulo: path.basename(rel, '.svg').replace(/[_-]+/g, ' '),
        tags: ['openclipart', ...rel.split(path.sep).slice(0, -1)],
        papel: 'elemento',
        licenca: 'CC0 (domínio público)',
        origem: { como: 'openclipart 0.18 (Debian openclipart-svg)', url: 'https://openclipart.org/', caminho: rel },
      },
    };
  });
  return importarLote(banco, tarefas, opcoes);
}

// Exemplos do repositório do VectorCraft (MIT ou Apache-2.0, ver ASSETS.md de lá).
export async function importarExemplosVectorcraft(banco, pasta, opcoes = {}) {
  const arquivos = await listarArquivos(pasta, ['.vectorcraft']);
  const tarefas = arquivos.map((arquivo) => ({
    arquivo,
    dados: {
      id: slug(`vectorcraft-${path.basename(arquivo)}`),
      fonte: 'publicos',
      titulo: path.basename(arquivo, '.vectorcraft').replace(/-/g, ' '),
      tags: ['vectorcraft', 'exemplo'],
      papel: 'elemento',
      licenca: 'MIT OR Apache-2.0',
      origem: { como: 'exemplos do VectorCraft', url: 'https://github.com/storytold/vectorcraft/tree/main/examples' },
    },
  }));
  return importarLote(banco, tarefas, opcoes);
}

// Ícones de marca em SVG oficial (Simple Icons, CC0). As marcas continuam das donas.
export async function importarIconesDeMarca(banco, nomes, { versao = '13.0.0', pastaTemp, ...opcoes } = {}) {
  await mkdir(pastaTemp, { recursive: true });
  const tarefas = [];
  for (const nome of nomes) {
    const url = `https://cdn.jsdelivr.net/npm/simple-icons@${versao}/icons/${nome}.svg`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`ícone ${nome} não encontrado (${r.status})`);
    let svg = await r.text();
    const cor = opcoes.cores?.[nome];
    if (cor) svg = svg.replace('<svg ', `<svg fill="${cor}" `);
    const arquivo = path.join(pastaTemp, `${nome}.svg`);
    await writeFile(arquivo, svg);
    tarefas.push({
      arquivo,
      dados: {
        id: slug(`marca-${nome}`),
        fonte: 'publicos',
        titulo: `ícone ${nome}`,
        tags: ['icone', 'marca', nome],
        papel: 'elemento',
        licenca: 'CC0 (Simple Icons; a marca pertence à dona)',
        origem: { como: 'simple-icons', url },
      },
    });
  }
  return importarLote(banco, tarefas, opcoes);
}
