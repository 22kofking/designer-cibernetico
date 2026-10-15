// Embedding visual (CLIP ViT-B/32, quantizado, roda em CPU pelo transformers.js).
// A mesma "régua" mede imagens e textos, então dá para buscar por um recorte ou
// por uma descrição ("gold coin", "paper plane"). O CLIP entende melhor inglês.
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';

const MODELO = process.env.BANCO_MODELO ?? 'Xenova/clip-vit-base-patch32';
env.cacheDir = process.env.BANCO_CACHE_MODELO ?? `${process.env.HOME ?? '/tmp'}/.cache/designer-cibernetico/modelos`;

let carregado = null;
async function carregar() {
  if (!carregado) {
    carregado = Promise.all([
      AutoProcessor.from_pretrained(MODELO),
      CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' }),
      AutoTokenizer.from_pretrained(MODELO),
      CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: 'q8' }),
    ]).then(([processador, visao, tokenizador, texto]) => ({ processador, visao, tokenizador, texto }));
  }
  return carregado;
}

function normalizado(tensor) {
  const v = Float32Array.from(tensor.data);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export async function embeddingDeImagem(png) {
  const m = await carregar();
  const img = await RawImage.fromBlob(new Blob([png], { type: 'image/png' }));
  const { image_embeds } = await m.visao(await m.processador(img));
  return normalizado(image_embeds);
}

export async function embeddingDeTexto(texto) {
  const m = await carregar();
  const { text_embeds } = await m.texto(m.tokenizador([texto], { padding: true, truncation: true }));
  return normalizado(text_embeds);
}

export function cosseno(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
