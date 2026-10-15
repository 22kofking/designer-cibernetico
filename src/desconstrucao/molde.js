// Grafo + plano → molde de cena (documento de cena 0.1). O molde tem o layout da
// referência (caixas, camadas, linhas de texto com o peso de cada uma) e, em cada
// parte, o nosso material que o plano achou. Nada da referência entra no molde:
// onde o banco não tem nada, fica um retângulo marcando o lugar.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { pastaDoItem } from '../banco/armazem.js';
import { carregarComoPng } from '../banco/imagem.js';
import { hexParaLab } from '../oficinas/cores.js';
import { acharReferencia, PAPEL_DO_TIPO, separarPartes } from './grafo.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FONTE_PADRAO = { familia: 'Montserrat', peso: 900, arquivo: path.join(RAIZ, 'assets/fontes/Montserrat-Black.ttf') };
const ESTILOS_TEXTO = {
  branco: { rampa: [[0, '#fffefc'], [1, '#f7f5f0']] },
  dourado: { rampa: [[0, '#fef80c'], [1, '#fde804']] },
};

const caixaDe = (c) => ({ x: +c[0].toFixed(4), y: +c[1].toFixed(4), w: +c[2].toFixed(4), h: +c[3].toFixed(4) });

// Pedaços de um grupo em frações da peça (cada moeda no seu lugar).
export async function partesEmFracoes(grafo, no, arquivoReferencia) {
  const mascara = no.mascara && path.join(grafo._pasta, no.mascara);
  if (!mascara || !existsSync(mascara)) return [];
  const { width: w, height: h } = await sharp(arquivoReferencia).metadata();
  const alfa = await sharp(mascara).resize(w, h, { fit: 'fill' }).extractChannel(0).raw().toBuffer();
  const preto = await sharp({ create: { width: w, height: h, channels: 3, background: '#000' } }).raw().toBuffer();
  const so = await sharp(preto, { raw: { width: w, height: h, channels: 3 } }).joinChannel(alfa, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
  const partes = await separarPartes(so, { margem: 0 });
  return partes.map((p) => [p.caixa_px[0] / w, p.caixa_px[1] / h, p.caixa_px[2] / w, p.caixa_px[3] / h]);
}

// Escurecimento da esquerda pelo perfil de luz medido na referência (L por décimo da largura).
export function paradasDoEscurecimento(no, cor = '#050203') {
  const perfil = no.estilo?.L_fundo_por_decimo_de_W;
  const largura = no.caixa?.[2] ?? 0.55;
  if (!perfil?.length) return [[0, cor, 0.97], [0.5, cor, 0.6], [1, cor, 0]];
  const maximo = Math.max(...perfil);
  const paradas = [];
  perfil.forEach((l, i) => {
    const pos = (i + 0.5) / perfil.length / largura;
    if (pos < 1) paradas.push([+pos.toFixed(3), cor, +Math.min(0.97, Math.max(0, 1 - l / maximo)).toFixed(2)]);
  });
  paradas.unshift([0, cor, paradas[0]?.[2] ?? 0.97]);
  paradas.push([1, cor, 0]);
  return paradas;
}

// Fundo sem material nosso: gradiente com a paleta medida, do escuro para o claro.
export function gradienteDaPaleta(no) {
  const cores = (no.estilo?.paleta ?? []).map((p) => p.cor);
  if (!cores.length) return [[0, '#050203'], [1, '#3a1206']];
  const ordem = [...cores].sort((a, b) => hexParaLab(a)[0] - hexParaLab(b)[0]);
  return ordem.map((c, i) => [+(i / Math.max(1, ordem.length - 1)).toFixed(3), c]);
}

function blocoDeTexto(linhas, arestas) {
  const x0 = Math.min(...linhas.map((n) => n.caixa[0]));
  const y0 = Math.min(...linhas.map((n) => n.caixa[1]));
  const x1 = Math.max(...linhas.map((n) => n.caixa[0] + n.caixa[2]));
  const y1 = Math.max(...linhas.map((n) => n.caixa[1] + n.caixa[3]));
  const vaos = (arestas ?? []).filter((a) => a.rel === 'empilhado_acima' && a.vao_rel_altura != null).map((a) => a.vao_rel_altura);
  const vao = vaos.length ? +(vaos.reduce((s, v) => s + v, 0) / vaos.length).toFixed(2) : 0.28;
  return {
    id: 'texto',
    papel: 'texto',
    tipo: 'bloco_texto',
    caixa: caixaDe([x0, y0, x1 - x0, y1 - y0]),
    fonte: { familia: FONTE_PADRAO.familia, peso: FONTE_PADRAO.peso },
    caixa_alta: true,
    vao,
    alinhamento: 'esquerda',
    vertical: 'centro',
    linhas: linhas.map((n, i) => ({
      texto: `linha ${i + 1}`,
      estilo: n.estilo?.estilo_ficha === 'dourado' ? 'dourado' : 'branco',
      peso: n.estilo?.peso_rel ?? 1,
    })),
    estilos: ESTILOS_TEXTO,
    origem: { fonte: 'criados', como: 'molde: linhas e pesos medidos na referência; texto a escrever', licenca: 'nossa' },
  };
}

// Copia o arquivo do item do banco para assets/ do molde (vetor vira PNG).
export async function trazerAsset(banco, item, pastaMolde) {
  const nome = `${item.id}.png`;
  const destino = path.join(pastaMolde, 'assets', nome);
  const original = path.join(pastaDoItem(banco.raiz, item), item.arquivos.original);
  if (['png'].includes(item.formato)) await copyFile(original, destino);
  else await writeFile(destino, await carregarComoPng(original, 1024));
  return `assets/${nome}`;
}

export async function grafoParaCena(banco, grafo, plano, pastaMolde, { escala = 2, referencias = [], logo } = {}) {
  await mkdir(path.join(pastaMolde, 'assets'), { recursive: true });
  const arquivoReferencia = acharReferencia(grafo, referencias);
  const [lw, lh] = grafo.tamanho_px;
  const porNo = new Map(plano.nos.map((p) => [p.no, p]));
  const itemPorId = new Map(banco.itens.map((i) => [`${i.fonte}/${i.id}`, i]));
  const nos = [];
  const pendentes = [];
  const ordenados = [...grafo.nos].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  for (const no of ordenados) {
    if (no.tipo === 'texto') continue;
    const p = porNo.get(no.id);
    const papel = PAPEL_DO_TIPO[no.tipo] ?? 'elemento';
    // Base: a que o plano escolheu; mascote sem base usa o nosso mais parecido como rascunho.
    let base = p?.base ?? null;
    let como = p ? `molde: ${p.acao} (${p.motivo})` : null;
    if (!base && papel === 'mascote' && p?.candidatos?.[0]) {
      base = p.candidatos[0];
      como = 'molde: rascunho com o nosso mascote mais parecido (mascote em partes é a fase 5)';
    }
    const item = base && itemPorId.get(`${base.fonte}/${base.id}`);
    const origem = item && { fonte: item.fonte, como, licenca: item.licenca };

    if (no.tipo === 'fundo') {
      if (item) nos.push({ id: no.id, papel, tipo: 'imagem', asset: await trazerAsset(banco, item, pastaMolde), caixa: caixaDe(no.caixa ?? [0, 0, 1, 1]), encaixe: 'cobrir', bloqueado: true, origem });
      else nos.push({ id: no.id, papel, tipo: 'gradiente', direcao: 'horizontal', caixa: caixaDe(no.caixa ?? [0, 0, 1, 1]), paradas: gradienteDaPaleta(no), bloqueado: true });
      continue;
    }
    if (no.id === 'escurecimento' || (no.tipo === 'efeito' && no.estilo?.L_fundo_por_decimo_de_W)) {
      nos.push({ id: no.id, papel: 'fundo', tipo: 'gradiente', direcao: 'horizontal', caixa: caixaDe(no.caixa ?? [0, 0, 0.55, 1]), paradas: paradasDoEscurecimento(no), bloqueado: true });
      continue;
    }
    if (no.tipo === 'efeito') continue;
    if (no.tipo === 'logo') {
      if (logo) {
        const destino = path.join(pastaMolde, 'assets', path.basename(logo));
        await copyFile(logo, destino);
        nos.push({ id: 'logo', papel: 'logo', tipo: 'imagem', asset: `assets/${path.basename(logo)}`, caixa: caixaDe(no.caixa), ancora: 'esquerda', origem: { fonte: 'criados', licenca: 'nossa' } });
      } else {
        nos.push({ id: 'logo', papel: 'logo', tipo: 'retangulo', caixa: caixaDe(no.caixa), cor: '#ffffff', opacidade: 0.25 });
        pendentes.push({ no: 'logo', motivo: 'passe --logo com o nosso logo' });
      }
      continue;
    }
    if (!Array.isArray(no.caixa)) continue;
    // Objeto na mão do mascote faz parte da camada dele: o nosso mascote traz o seu.
    if (no.tipo === 'objeto_segurado' && no.camada_psd === 'mascote') {
      pendentes.push({ no: no.id, motivo: 'segurado pelo mascote: vem junto com o mascote (fase 5)', descricao: no.descricao ?? null });
      continue;
    }
    if (!item) {
      nos.push({ id: no.id, papel, tipo: 'retangulo', caixa: caixaDe(no.caixa), cor: '#e5682d', opacidade: 0.3 });
      pendentes.push({ no: no.id, motivo: p?.motivo ?? 'sem consulta', descricao: no.descricao ?? null });
      continue;
    }
    const asset = await trazerAsset(banco, item, pastaMolde);
    const partes = no.tipo === 'objeto_grupo' ? await partesEmFracoes(grafo, no, arquivoReferencia) : [];
    if (partes.length > 1) {
      partes.forEach((c, i) => nos.push({ id: `${no.id}-${i + 1}`, papel, tipo: 'imagem', asset, caixa: caixaDe(c), encaixe: 'conter', origem }));
    } else {
      nos.push({ id: no.id, papel, tipo: 'imagem', asset, caixa: caixaDe(no.caixa), encaixe: 'conter', ancora: papel === 'mascote' ? 'base' : 'centro', origem });
    }
    if (p && p.acao !== 'reusar') pendentes.push({ no: no.id, motivo: `${p.acao}: passar pela oficina de elementos`, base: base.id });
  }

  const linhas = grafo.nos.filter((n) => n.tipo === 'texto' && Array.isArray(n.caixa)).sort((a, b) => a.caixa[1] - b.caixa[1]);
  if (linhas.length) {
    const texto = blocoDeTexto(linhas, grafo.arestas);
    const zTexto = Math.min(...linhas.map((n) => n.z ?? 6));
    const antesDoLogo = nos.findIndex((n) => n.papel === 'logo');
    nos.splice(antesDoLogo >= 0 && zTexto < 7 ? antesDoLogo : nos.length, 0, texto);
  }

  return {
    cena: {
      versao: '0.1',
      nome: `molde-${grafo.peca}`,
      descricao: `Molde da referência ${grafo.peca} (${grafo.formato_peca}, tema ${grafo.tema ?? '-'}): layout medido na desconstrução, material do nosso banco.`,
      formato: { largura: Math.round(lw * escala), altura: Math.round(lh * escala), fundo: '#050203' },
      fontes: [{ familia: FONTE_PADRAO.familia, peso: FONTE_PADRAO.peso, arquivo: path.relative(pastaMolde, FONTE_PADRAO.arquivo) }],
      nos,
    },
    pendentes,
  };
}
