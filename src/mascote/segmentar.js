// Separador por pontos (SlimSAM, roda em CPU pelo transformers.js): "o objeto
// que tem este ponto". Os pontos vêm da montagem do mascote (como a marcação
// dos grafos): positivos em cima da parte, negativos no que não é dela.
import { AutoProcessor, RawImage, SamModel, env } from '@huggingface/transformers';
import sharp from 'sharp';

const MODELO = process.env.MASCOTE_MODELO_SAM ?? 'Xenova/slimsam-77-uniform';
env.cacheDir = process.env.BANCO_CACHE_MODELO ?? `${process.env.HOME ?? '/tmp'}/.cache/designer-cibernetico/modelos`;

let carregado = null;
function carregar() {
  carregado ??= Promise.all([
    SamModel.from_pretrained(MODELO, { dtype: 'q8' }),
    AutoProcessor.from_pretrained(MODELO),
  ]).then(([modelo, processador]) => ({ modelo, processador }));
  return carregado;
}

// png: imagem (buffer); pontos/excluir: [[x, y], ...] em pixels da imagem.
// Devolve a máscara (1 byte por pixel, 0 ou 255) com a melhor nota do modelo.
export async function segmentar(png, { pontos, excluir = [] }) {
  if (!pontos?.length) throw new Error('segmentar precisa de pelo menos um ponto em cima da parte');
  const { modelo, processador } = await carregar();
  // O fundo transparente vira cinza (como nos prompts) para o modelo ver a silhueta.
  const plano = await sharp(png).flatten({ background: '#e6e6e6' }).png().toBuffer();
  const img = await RawImage.fromBlob(new Blob([plano], { type: 'image/png' }));
  const todos = [...pontos, ...excluir];
  const rotulos = [...pontos.map(() => 1), ...excluir.map(() => 0)];
  const entradas = await processador(img.rgb(), { input_points: [[todos]], input_labels: [[rotulos]] });
  const saida = await modelo(entradas);
  const [mascaras] = await processador.post_process_masks(saida.pred_masks, entradas.original_sizes, entradas.reshaped_input_sizes);
  const notas = Array.from(saida.iou_scores.data);
  const [, n, h, w] = mascaras.dims;
  let melhor = 0;
  for (let i = 1; i < n; i++) if (notas[i] > notas[melhor]) melhor = i;
  const mascara = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) mascara[i] = mascaras.data[melhor * w * h + i] ? 255 : 0;
  return { mascara, largura: w, altura: h, nota: notas[melhor] };
}
