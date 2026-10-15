// Oficina de elementos: faz uma peça (moeda, avião de papel, raio...) sem partir
// do vazio. A ordem é a de um designer:
//   1. reusar  algo que já criamos e está no banco, se for quase igual;
//   2. adaptar um vetor parecido (nosso ou público), levando-o para a paleta e o
//              contorno da ficha no VectorCraft;
//   3. gerar   matéria-prima pelo gateway (só com permissão e teto de gasto),
//              vetorizar no VectorCraft e adaptar como no passo 2;
//   4. se nada disso couber, devolve os candidatos para alguém escolher.
// O que sai vira item "criados" no banco, com a cadeia de origem e a licença.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { pastaDoItem } from '../banco/armazem.js';
import { buscar } from '../banco/buscar.js';
import { carregarComoPng, descritorForma, sobreFundoNeutro } from '../banco/imagem.js';
import { importarArquivo, slug } from '../banco/importar.js';
import { embeddingDeImagem, embeddingDeTexto } from '../banco/visual.js';
import { mapaParaPaleta } from './cores.js';
import { gerarImagem } from './gateway.js';
import { resultadoDo, rodarVectorcraft } from './vectorcraft.js';

export const FORMATOS_VETORIAIS = ['svg', 'vectorcraft'];

// Notas de corte. Imagem contra imagem dá notas altas (CLIP + silhueta); texto
// contra imagem dá notas baixas (0,2 a 0,35, mais 0,02 por palavra no nome), por
// isso cada tipo tem as suas. Calibradas com moedas, avião, raio e coroa.
export const LIMIARES = {
  imagem: { reusar: 0.92, adaptar: 0.82 },
  texto: { reusar: 0.34, adaptar: 0.3 },
};

const ehVetor = (item) => FORMATOS_VETORIAIS.includes(item.formato);
// Referências estudadas são de terceiros: servem de consulta, nunca entram na peça.
const usavel = (item) => item.fonte !== 'referencias';

// Decide o caminho a partir dos resultados da busca (ordenados pela nota).
export function decidir(resultados, { tipo = 'imagem', limiares, gerarPermitido = false, escolher } = {}) {
  const corte = { ...LIMIARES[tipo], ...limiares };
  if (escolher) {
    const r = resultados.find((x) => x.item.id === escolher);
    if (!r) return { acao: 'candidatos', motivo: `"${escolher}" não está entre os candidatos` };
    if (!usavel(r.item)) return { acao: 'candidatos', motivo: `"${escolher}" é referência de terceiros e não entra na peça` };
    return { acao: ehVetor(r.item) ? 'adaptar' : 'reusar', base: r, motivo: 'escolhido à mão' };
  }
  const nosso = resultados.find((r) => r.item.fonte === 'criados');
  const melhorNota = resultados.find((r) => usavel(r.item))?.nota ?? 0;
  // Reusar só quando o nosso está no topo (um vetor bem mais parecido ganha dele).
  if (nosso && nosso.nota >= corte.reusar && nosso.nota >= melhorNota - 0.02) {
    return { acao: 'reusar', base: nosso, motivo: `já temos um quase igual (nota ${nosso.nota.toFixed(3)} ≥ ${corte.reusar})` };
  }
  const vetor = resultados.find((r) => usavel(r.item) && ehVetor(r.item));
  if (vetor && vetor.nota >= corte.adaptar) {
    return { acao: 'adaptar', base: vetor, motivo: `vetor parecido no banco (nota ${vetor.nota.toFixed(3)} ≥ ${corte.adaptar})` };
  }
  const melhor = vetor ? `o vetor mais parecido teve nota ${vetor.nota.toFixed(3)}, abaixo de ${corte.adaptar}` : 'nenhum vetor usável no banco';
  if (gerarPermitido) return { acao: 'gerar', motivo: `${melhor}; gerando matéria-prima` };
  return { acao: 'candidatos', motivo: `${melhor}; sem permissão para gerar` };
}

// Licença do que sai da oficina: é nosso, mas registra de onde veio a base.
export function licencaDerivada(base) {
  if (!base) return 'nossa';
  if (base.fonte === 'criados') return base.licenca;
  return `nossa (derivada de ${base.titulo}: ${base.licenca})`;
}

// Passos do VectorCraft que levam um vetor para o estilo da ficha.
export function passosDeEstilo(mapa, contorno) {
  const passos = [];
  if (Object.keys(mapa).length) passos.push({ cmd: 'select.all' }, { cmd: 'recolor.apply', params: { map: mapa } });
  if (contorno) {
    // Silhueta: cópia de tudo unida numa forma só, pintada e com traço por fora, atrás do desenho.
    passos.push(
      { cmd: 'select.all' }, { cmd: 'edit.duplicate' }, { cmd: 'object.pathfinder.unite' },
      { cmd: 'paint.setFill', params: { color: contorno.cor } },
      { cmd: 'paint.setStroke', params: { color: contorno.cor } },
      { cmd: 'stroke.set', params: { weight: contorno.espessura ?? 6, join: 'round', align: 'outside' } },
      { cmd: 'object.arrange.sendToBack' },
    );
  }
  passos.push({ cmd: 'artboard.fitToArt' });
  return passos;
}

export async function adaptarVetor(entrada, estilo, pastaSaida, { escala = 2 } = {}) {
  const leitura = await rodarVectorcraft(entrada, [{ cmd: 'select.all' }, { cmd: 'recolor.colors' }]);
  const cores = (resultadoDo(leitura, 'recolor.colors')[0]?.colors ?? []).map((c) => c.hex);
  const mapa = estilo?.paleta?.length ? mapaParaPaleta(cores, estilo.paleta) : {};
  const passos = passosDeEstilo(mapa, estilo?.contorno);
  const svg = path.join(pastaSaida, 'resultado.svg');
  const png = path.join(pastaSaida, 'resultado.png');
  const linhas = await rodarVectorcraft(entrada, passos, [svg, png], { escala });
  return { svg, png, cores_originais: cores, mapa, passos: passos.map((p) => p.cmd), vectorcraft: linhas.filter((l) => l.step === 'cmd') };
}

// Fundo liso (cor das bordas) vira transparente, para o traço só pegar o objeto.
export async function removerFundo(png, { tolerancia = 24 } = {}) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const borda = [0, 0, 0];
  let k = 0;
  const somar = (x, y) => { const i = (y * w + x) * 4; borda[0] += data[i]; borda[1] += data[i + 1]; borda[2] += data[i + 2]; k++; };
  for (let x = 0; x < w; x++) { somar(x, 0); somar(x, h - 1); }
  for (let y = 0; y < h; y++) { somar(0, y); somar(w - 1, y); }
  const fundo = borda.map((v) => v / k);
  for (let i = 0; i < w * h; i++) {
    const d = Math.hypot(data[i * 4] - fundo[0], data[i * 4 + 1] - fundo[1], data[i * 4 + 2] - fundo[2]);
    data[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (d - tolerancia) / tolerancia)));
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer();
}

// Tira pedaços soltos pequenos (restos de outro objeto, sujeira do fundo): fica só
// o que tem pelo menos `minimo` da área da maior parte.
export function apagarIlhas(rgba, w, h, { minimo = 0.02 } = {}) {
  const rotulo = new Int32Array(w * h).fill(-1);
  const areas = [];
  const pilha = [];
  for (let p = 0; p < w * h; p++) {
    if (rotulo[p] >= 0 || rgba[p * 4 + 3] === 0) continue;
    const id = areas.length;
    let area = 0;
    rotulo[p] = id;
    pilha.push(p);
    while (pilha.length) {
      const q = pilha.pop();
      area++;
      const x = q % w, y = (q - x) / w;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (rotulo[n] < 0 && rgba[n * 4 + 3] !== 0) { rotulo[n] = id; pilha.push(n); }
      }
    }
    areas.push(area);
  }
  const corte = Math.max(0, ...areas) * minimo;
  for (let p = 0; p < w * h; p++) if (rotulo[p] >= 0 && areas[rotulo[p]] < corte) rgba[p * 4 + 3] = 0;
  return areas.filter((a) => a >= corte).length;
}

// Raster (gerado ou trazido) para vetor chapado com poucas cores.
export async function vetorizar(png, pastaSaida, { cores = 6, lado = 1024 } = {}) {
  const limpo = await removerFundo(png);
  // Borda meio transparente vira franja suja no traço: a máscara fica dura (tudo ou nada).
  // A máscara é suavizada e apertada um pouco, para a franja escura da borda sair junto.
  const grandeSuave = sharp(limpo).resize(lado, lado, { fit: 'inside' }).ensureAlpha();
  const { data, info } = await grandeSuave.clone().raw().toBuffer({ resolveWithObject: true });
  const alfa = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).extractChannel(3).blur(3).raw().toBuffer();
  for (let i = 0; i < alfa.length; i++) data[i * 4 + 3] = alfa[i] >= 200 ? 255 : 0;
  apagarIlhas(data, info.width, info.height);
  const grande = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const entrada = path.join(pastaSaida, 'materia-prima.png');
  await writeFile(entrada, grande);
  const saida = path.join(pastaSaida, 'tracado.svg');
  await rodarVectorcraft(entrada, [
    { cmd: 'select.all' },
    { cmd: 'imageTrace.makeAndExpand', params: { params: { mode: 'color', palette: 'limited', colors: cores, noise: 25 } } },
    { cmd: 'artboard.fitToArt' },
  ], [saida]);
  return saida;
}

// O CLIP pequeno às vezes confunde objetos (um poste de arranhador parece "pilha de
// moedas"). Como faria um bibliotecário, quem também tem o nome certo no título ou
// nas tags sobe: cada palavra da descrição encontrada vale `peso` de nota.
const PALAVRAS_VAZIAS = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'with', 'and', 'for', 'de', 'da', 'do', 'com', 'e', 'em']);
export function reordenarPorNome(candidatos, descricao, { peso = 0.02 } = {}) {
  if (!descricao) return candidatos;
  const raiz = (w) => w.toLowerCase().replace(/(es|s)$/, '');
  const palavras = descricao.toLowerCase().split(/[^a-z0-9à-ú]+/).filter((w) => w.length > 1 && !PALAVRAS_VAZIAS.has(w)).map(raiz);
  return candidatos
    .map((r) => {
      const nomes = new Set(`${r.item.titulo} ${(r.item.tags ?? []).join(' ')}`.toLowerCase().split(/[^a-z0-9à-ú]+/).map(raiz));
      const acertos = palavras.filter((w) => nomes.has(w)).length;
      return { ...r, nota_visual: r.nota, acertos, nota: r.nota + peso * acertos };
    })
    .sort((a, b) => b.nota - a.nota);
}

async function consultaDoPedido(pedido) {
  if (pedido.referencia) {
    const png = await carregarComoPng(pedido.referencia);
    return { tipo: 'imagem', png, consulta: { visual: await embeddingDeImagem(await sobreFundoNeutro(png)), forma: await descritorForma(png) } };
  }
  if (pedido.descricao) return { tipo: 'texto', png: null, consulta: { visual: await embeddingDeTexto(pedido.descricao) } };
  throw new Error('o pedido precisa de uma descrição ou de uma imagem de referência');
}

const arquivoDoItem = (banco, item) => path.join(pastaDoItem(banco.raiz, item), item.arquivos.original);

// pedido: { nome, descricao?, referencia? (arquivo ou PNG), estilo?: {paleta, contorno:{cor,espessura}, cores_max},
//           limiares?, escolher?, gerar?: {permitido, teto, modelo, semente}, guardar? (padrão true) }
export async function fazerElemento(banco, pedido, pastaSaida) {
  await mkdir(pastaSaida, { recursive: true });
  let tipo = 'raster', png = null, candidatos = [], decisao;
  if (pedido.raster) {
    // Raster nosso trazido pronto (camada exportada, arte gerada antes): só vetoriza e adapta.
    decisao = { acao: 'vetorizar', motivo: 'raster nosso trazido no pedido' };
  } else {
    let consulta;
    ({ tipo, png, consulta } = await consultaDoPedido(pedido));
    candidatos = buscar(banco, consulta, { k: 40, fontes: ['criados', 'publicos'] });
    if (tipo === 'texto') candidatos = reordenarPorNome(candidatos, pedido.descricao);
    candidatos = candidatos.slice(0, 12);
    // Escolhido à mão fora dos primeiros: entra na lista para a decisão achá-lo.
    if (pedido.escolher && !candidatos.some((r) => r.item.id === pedido.escolher)) {
      const i = banco.itens.findIndex((x) => x.id === pedido.escolher);
      if (i >= 0) candidatos.unshift({ item: banco.itens[i], indice: i, nota: 0, visual: 0, forma: 0 });
    }
    decisao = decidir(candidatos, { tipo, limiares: pedido.limiares, gerarPermitido: !!pedido.gerar?.permitido, escolher: pedido.escolher });
  }
  const relatorio = {
    pedido: { ...pedido, referencia: typeof pedido.referencia === 'string' ? pedido.referencia : pedido.referencia ? '(imagem)' : undefined },
    consulta: tipo,
    candidatos: candidatos.map((r) => ({ id: r.item.id, fonte: r.item.fonte, titulo: r.item.titulo, formato: r.item.formato, licenca: r.item.licenca, nota: +r.nota.toFixed(4) })),
    acao: decisao.acao,
    motivo: decisao.motivo,
    base: decisao.base?.item.id ?? null,
    gasto_usd: 0,
  };
  let base = decisao.base?.item ?? null;
  let feito = null;

  if (decisao.acao === 'reusar') {
    const destino = path.join(pastaSaida, `resultado.${base.formato}`);
    await copyFile(arquivoDoItem(banco, base), destino);
    feito = { arquivo: destino };
  } else if (decisao.acao === 'adaptar') {
    feito = await adaptarVetor(arquivoDoItem(banco, base), pedido.estilo, pastaSaida);
  } else if (decisao.acao === 'gerar') {
    const g = await gerarImagem({ descricao: pedido.descricao ?? pedido.nome, teto: pedido.gerar.teto, modelo: pedido.gerar.modelo, semente: pedido.gerar.semente });
    relatorio.gasto_usd = g.gasto;
    relatorio.gateway = g.imagens.map(({ job, prompt, semente }) => ({ job, prompt, semente }));
    const tracado = await vetorizar(g.imagens[0].png, pastaSaida, { cores: pedido.estilo?.cores_max ?? 6 });
    feito = await adaptarVetor(tracado, pedido.estilo, pastaSaida, { escala: 1 });
    base = { fonte: 'gerado', titulo: 'gateway', licenca: 'Z-Image Turbo (Apache 2.0), uso comercial ok' };
  } else if (decisao.acao === 'vetorizar') {
    const tracado = await vetorizar(await readFile(pedido.raster), pastaSaida, { cores: pedido.estilo?.cores_max ?? 6 });
    feito = await adaptarVetor(tracado, pedido.estilo, pastaSaida, { escala: 1 });
    base = { fonte: 'criados', titulo: path.basename(pedido.raster), licenca: pedido.licenca ?? 'nossa', origem: { caminho: pedido.raster } };
  }

  if (feito) {
    relatorio.resultado = feito;
    if (decisao.acao !== 'reusar' && pedido.guardar !== false) {
      const id = slug(`${pedido.nome ?? pedido.descricao ?? 'elemento'}-${new Date().toISOString().slice(0, 19)}`);
      const item = await importarArquivo(banco, feito.svg, {
        id,
        fonte: 'criados',
        titulo: pedido.nome ?? pedido.descricao,
        // As palavras da descrição viram tags: a próxima busca por texto acha e reusa.
        tags: ['oficina-elementos', decisao.acao, ...(pedido.descricao ?? '').toLowerCase().split(/[^a-z0-9à-ú]+/).filter((w) => w.length > 1)],
        papel: 'elemento',
        licenca: licencaDerivada(base),
        origem: {
          como: `oficina de elementos (${decisao.acao})`,
          base: base && { fonte: base.fonte, id: base.id ?? null, titulo: base.titulo, licenca: base.licenca, origem: base.origem ?? null },
          estilo: pedido.estilo ?? null,
          passos: feito.passos,
        },
      });
      await banco.salvar();
      relatorio.guardado = { fonte: item.fonte, id: item.id, licenca: item.licenca };
    } else if (decisao.acao === 'reusar') {
      relatorio.guardado = { fonte: base.fonte, id: base.id, licenca: base.licenca, ja_estava: true };
    }
  }
  await writeFile(path.join(pastaSaida, 'relatorio.json'), JSON.stringify(relatorio, null, 2));
  return { relatorio, png, candidatos };
}

// Troca o desenho de um nó de imagem da cena pelo elemento feito, e grava uma cena nova ao lado.
export async function trocarNaCena(cena, pastaDaCena, idNo, png, { nomeAsset, origem } = {}) {
  const no = cena.nos.find((n) => n.id === idNo);
  if (!no) throw new Error(`a cena não tem o nó "${idNo}"`);
  if (no.tipo !== 'imagem') throw new Error(`o nó "${idNo}" é ${no.tipo}; só nós de imagem recebem elemento`);
  const asset = `assets/${nomeAsset ?? `${idNo}-oficina.png`}`;
  await mkdir(path.join(pastaDaCena, 'assets'), { recursive: true });
  await copyFile(png, path.join(pastaDaCena, asset));
  return { ...cena, nos: cena.nos.map((n) => (n.id === idNo ? { ...n, asset, origem: origem ?? n.origem } : n)) };
}
