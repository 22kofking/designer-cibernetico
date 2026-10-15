// Personagem travado: a ficha (personagens/<nome>/personagem.json) fixa o prompt,
// os figurinos, o que o mascote segura em cada tema e a folha de referência (as
// versões aprovadas, no banco). Pose nova só passa se parecer o personagem e não
// sair infantil.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { gerarImagem } from '../oficinas/gateway.js';
import { removerFundo } from '../oficinas/elementos.js';
import { tirarFundoIA } from './fundo.js';
import { cosseno, embeddingDeImagem, embeddingDeTexto } from '../banco/visual.js';

export async function lerPersonagem(arquivo) {
  const p = JSON.parse(await readFile(arquivo, 'utf8'));
  p._arquivo = path.resolve(arquivo);
  return p;
}

// Prompt de uma pose: o texto travado do personagem com o figurino e o que segura.
export function promptDaPose(personagem, { tema, figurino, segura } = {}) {
  const t = tema ? personagem.temas?.[tema] : null;
  if (tema && !t) throw new Error(`o personagem não tem o tema "${tema}"`);
  const nomeFigurino = figurino ?? t?.figurino ?? personagem.figurino_padrao;
  const textoFigurino = personagem.figurinos[nomeFigurino];
  if (!textoFigurino) throw new Error(`o personagem não tem o figurino "${nomeFigurino}"`);
  const textoSegura = segura ?? t?.segura ?? 'hands free';
  return {
    figurino: nomeFigurino,
    prompt: personagem.prompt.replace('{figurino}', textoFigurino).replace('{segura}', textoSegura),
  };
}

const TEXTOS_INFANTIL = {
  infantil: ['a cute childish cartoon animal for kids, chibi, adorable baby mascot', 'a cute kawaii plush toy character for children'],
  adulto: ['a cool adult cartoon mascot with sunglasses, bold comic style, confident grin', 'a stylish adult casino mascot, edgy and charismatic'],
};
let embTextos = null;

async function embeddingDoMascote(png) {
  return embeddingDeImagem(await sharp(png).flatten({ background: '#e6e6e6' }).resize(224, 224, { fit: 'contain', background: '#e6e6e6' }).png().toBuffer());
}

// Chance (0 a 1) de o CLIP ver "fofo para crianças" em vez de "mascote adulto".
export async function notaInfantil(png, visual) {
  embTextos ??= Object.fromEntries(await Promise.all(Object.entries(TEXTOS_INFANTIL).map(async ([k, ts]) => [k, await Promise.all(ts.map(embeddingDeTexto))])));
  const v = visual ?? (await embeddingDoMascote(png));
  const s = (k) => Math.max(...embTextos[k].map((e) => cosseno(v, e)));
  const a = Math.exp(100 * s('infantil'));
  const b = Math.exp(100 * s('adulto'));
  return a / (a + b);
}

// Confere uma imagem contra a folha do personagem (no banco) e a regra de não ser infantil.
export async function conferirPersonagem(banco, personagem, png) {
  const visual = await embeddingDoMascote(png);
  const folha = personagem.folha.map((f) => {
    const [fonte, id] = f.banco.split('/');
    const i = banco.itens.findIndex((x) => x.fonte === fonte && x.id === id);
    return { ...f, indice: i };
  }).filter((f) => f.indice >= 0);
  if (!folha.length) throw new Error('nenhuma imagem da folha do personagem está no banco');
  const parecidos = folha.map((f) => ({ figurino: f.figurino, banco: f.banco, nota: +cosseno(visual, banco.visual[f.indice]).toFixed(4) })).sort((a, b) => b.nota - a.nota);
  const infantil = +(await notaInfantil(png, visual)).toFixed(3);
  const c = personagem.conferencia;
  const problemas = [];
  if (parecidos[0].nota < c.parecido_min) problemas.push(`pouco parecido com a folha (${parecidos[0].nota} < ${c.parecido_min})`);
  if (infantil > c.infantil_max) problemas.push(`saiu infantil (${infantil} > ${c.infantil_max})`);
  return {
    aprovado: problemas.length === 0,
    alerta: infantil > c.infantil_alerta && infantil <= c.infantil_max ? `quase infantil (${infantil})` : null,
    parecido: parecidos[0],
    folha: parecidos,
    infantil,
    problemas,
  };
}

// Pose nova pelo gateway (só com teto): gera, tira o fundo e confere. Devolve
// todas as tentativas com a conferência; quem guarda no banco é quem chamou.
// fundo: 'cor' (fundo liso pela cor da borda, rápido) ou 'ia' (BiRefNet, para
// quando o fundo vem cheio; ~20 s e ~7,5 GB de memória por imagem).
export async function gerarPose(banco, personagem, { tema, figurino, segura, quantas = 2, teto, semente, fundo = 'cor' } = {}) {
  const { prompt, figurino: nomeFigurino } = promptDaPose(personagem, { tema, figurino, segura });
  const g = await gerarImagem({ descricao: prompt, prompt, quantas, teto, semente, tamanho: '768x1024' });
  const tentativas = [];
  for (const img of g.imagens) {
    const png = fundo === 'ia' ? await tirarFundoIA(img.png) : await removerFundo(img.png);
    tentativas.push({ png, job: img.job, semente: img.semente, conferencia: await conferirPersonagem(banco, personagem, png) });
  }
  return { prompt, figurino: nomeFigurino, gasto: g.gasto, tentativas };
}
