// PSD no navegador: exportar a cena com uma camada por nó (mesma montagem do
// Node, src/nucleo/psd-camadas.js) e abrir um PSD como cena nova, cada camada
// virando um nó de imagem. É a ida e volta com o PhotoCraft.
import { documentoPsd, MISTURA_DA_CENA } from '../src/nucleo/psd-camadas.js';
import { VERSAO_CENA } from '../src/nucleo/cena.js';

const AG_PSD = 'https://cdn.jsdelivr.net/npm/ag-psd@31.0.3/+esm';

export async function exportarPsd(cena, pixelsDe) {
  const { writePsd } = await import(AG_PSD);
  const documento = await documentoPsd(cena, pixelsDe);
  return new Blob([writePsd(documento, { generateThumbnail: false })], { type: 'image/vnd.adobe.photoshop' });
}

function folhas(camadas, prefixo = '', saida = []) {
  for (const c of camadas ?? []) {
    if (c.children) folhas(c.children, `${prefixo}${c.name ?? 'grupo'}/`, saida);
    else if (c.canvas && c.right > c.left && c.bottom > c.top) saida.push({ ...c, caminho: `${prefixo}${c.name ?? 'camada'}` });
  }
  return saida;
}

const idSeguro = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'camada';

// Papel da camada pelo nome que os PSDs do projeto usam (fundo, mascote, logo, texto); o resto é elemento.
function papelPeloNome(nome) {
  const n = nome.toLowerCase();
  if (/(^|\/)fundo/.test(n)) return 'fundo';
  if (/mascote|personagem/.test(n)) return 'mascote';
  if (/logo/.test(n)) return 'logo';
  if (/texto/.test(n)) return 'texto';
  return 'elemento';
}

export async function abrirPsd(buffer, nomeArquivo) {
  const { readPsd } = await import(AG_PSD);
  const psd = readPsd(buffer, { skipThumbnail: true, skipCompositeImageData: true });
  const W = psd.width;
  const H = psd.height;
  const usados = new Set();
  const nos = folhas(psd.children).map((c) => {
    let id = idSeguro(c.caminho);
    for (let k = 2; usados.has(id); k++) id = `${idSeguro(c.caminho)}-${k}`;
    usados.add(id);
    const r = (v) => Math.round(v * 10000) / 10000;
    return {
      id,
      tipo: 'imagem',
      papel: c.text ? 'texto' : papelPeloNome(c.caminho),
      asset: c.canvas.toDataURL('image/png'),
      caixa: { x: r(c.left / W), y: r(c.top / H), w: r((c.right - c.left) / W), h: r((c.bottom - c.top) / H) },
      encaixe: 'esticar',
      opacidade: c.opacity ?? 1,
      visivel: c.hidden !== true,
      mistura: MISTURA_DA_CENA[c.blendMode] ?? 'normal',
      origem: { como: `camada do PSD ${nomeArquivo}${c.text ? ` (texto: ${c.text.text})` : ''}` },
    };
  });
  return {
    versao: VERSAO_CENA,
    nome: nomeArquivo.replace(/\.(psd|psb)$/i, ''),
    formato: { largura: W, altura: H, fundo: '#000000' },
    fontes: [],
    nos,
  };
}
