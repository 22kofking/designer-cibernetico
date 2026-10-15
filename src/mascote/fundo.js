// Tirar o fundo com IA (BiRefNet lite, licença MIT, em CPU pelo transformers.js).
// Serve para o personagem inteiro: pose gerada pelo gateway com fundo cheio ou
// o personagem de uma referência. Não separa partes (orbe x mão): isso é do SAM.
// Custo medido: ~20 s e ~7,5 GB de memória por imagem (o modelo só aceita 1024x1024).
import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';
import sharp from 'sharp';

const MODELO = process.env.MASCOTE_MODELO_FUNDO ?? 'onnx-community/BiRefNet_lite-ONNX';
env.cacheDir = process.env.BANCO_CACHE_MODELO ?? `${process.env.HOME ?? '/tmp'}/.cache/designer-cibernetico/modelos`;

let carregado = null;
function carregar() {
  // fp32: no CPU foi mais rápido que o fp16 (22 s x 31 s) e deu a mesma máscara.
  carregado ??= Promise.all([AutoModel.from_pretrained(MODELO, { dtype: 'fp32' }), AutoProcessor.from_pretrained(MODELO)])
    .then(([modelo, processador]) => ({ modelo, processador }));
  return carregado;
}

// Devolve o alfa suave (1 byte por pixel, 0 a 255) no tamanho da imagem.
export async function alfaDoFundo(png) {
  const { modelo, processador } = await carregar();
  const plano = await sharp(png).flatten({ background: '#e6e6e6' }).png().toBuffer();
  const img = await RawImage.fromBlob(new Blob([plano], { type: 'image/png' }));
  const { pixel_values } = await processador(img.rgb());
  const entrada = modelo.sessions?.model?.inputNames?.[0] ?? 'input_image';
  const saida = await modelo({ [entrada]: pixel_values });
  const tensor = Object.values(saida)[0];
  const m = await RawImage.fromTensor(tensor[0].sigmoid().mul(255).to('uint8')).resize(img.width, img.height);
  return { alfa: Buffer.from(m.data), largura: img.width, altura: img.height };
}

// PNG com o fundo tirado (alfa suave nas bordas: pelo, brilho, fumaça).
export async function tirarFundoIA(png) {
  const { alfa, largura, altura } = await alfaDoFundo(png);
  // removeAlpha do sharp roda no fim do processo (depois do joinChannel): tira o canal antes, em bruto.
  const rgb = await sharp(png).removeAlpha().raw().toBuffer();
  return sharp(rgb, { raw: { width: largura, height: altura, channels: 3 } }).joinChannel(alfa, { raw: { width: largura, height: altura, channels: 1 } }).png().toBuffer();
}
