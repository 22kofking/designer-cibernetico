// Crítico: renderiza a cena como o editor mostra e mede contra a referência.
// Mede parte por parte (para devolver só a que errou) e confere as regras da
// ficha. A referência é só régua: nada dela entra na peça.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from 'canvas';
import { recortarNoDoGrafo } from '../desconstrucao/grafo.js';
import sharp from 'sharp';
import { caixaEmPixels } from '../nucleo/cena.js';
import { criarMedidor } from '../nucleo/render.js';
import { encaixarTexto } from '../nucleo/texto.js';
import { deltaDeCor, fracaoDeOuro, perfilDeLuz } from '../qualidade/cor.js';
import { renderizar } from '../node/render-node.js';

const caixaPx = (c, w, h) => {
  const left = Math.max(0, Math.round(c[0] * w)), top = Math.max(0, Math.round(c[1] * h));
  return { left, top, width: Math.max(1, Math.min(w - left, Math.round(c[2] * w))), height: Math.max(1, Math.min(h - top, Math.round(c[3] * h))) };
};

// Altura das maiúsculas de cada linha do bloco de texto, em px da peça.
export function alturasDoTexto(cena) {
  const no = cena.nos.find((n) => n.tipo === 'bloco_texto');
  if (!no) return [];
  const medidor = criarMedidor(createCanvas(10, 10).getContext('2d'));
  const { altCaixaAlta } = medidor.metricas(no.fonte);
  return encaixarTexto(no, caixaEmPixels(no.caixa, cena.formato), medidor, cena.formato).map((l) => l.tamanho * altCaixaAlta);
}

export async function criticar(cena, pasta, { grafo, referencia, marca, tarefas, montagens = {}, escolhas }) {
  const regrasDaMarca = marca.critico ?? {};
  const deltaMax = regrasDaMarca.delta_max ?? 10;
  const canvas = await renderizar(cena, pasta);
  const png = canvas.getNodeCanvas().toBuffer('image/png');
  const { largura: w, altura: h } = cena.formato;
  const ref = await sharp(referencia).resize(w, h, { fit: 'fill' }).png().toBuffer();

  const partes = [];
  for (const t of tarefas) {
    const problemas = [];
    const caixa = caixaPx(t.caixa, w, h);
    const nos = cena.nos.filter((n) => n.id === t.no || n.id.startsWith(`${t.no}-`));
    // Elemento: o nosso desenho (só os pixels dele) contra a parte recortada da
    // referência pela máscara. A caixa inteira misturaria o fundo e o mascote.
    const noGrafo = grafo.nos.find((n) => n.id === t.no);
    const desenho = nos.find((n) => n.tipo === 'imagem')?.asset;
    let delta;
    if (t.papel === 'elemento' && desenho && noGrafo?.mascara) {
      const recorte = await recortarNoDoGrafo(grafo, noGrafo, referencia);
      delta = +(await deltaDeCor(await readFile(path.resolve(pasta, desenho)), recorte)).toFixed(2);
    } else delta = +(await deltaDeCor(png, ref, { caixaA: caixa, caixaB: caixa })).toFixed(2);
    const alertas = [];
    // O mascote é o nosso de propósito (outro bicho, outra roupa): a cor dele é só aviso.
    if (delta > deltaMax) (t.papel === 'mascote' ? alertas : problemas).push(`cor longe da referência (ΔE ${delta} > ${deltaMax})`);
    if (nos.some((n) => n.tipo === 'retangulo')) problemas.push('lugar vazio: o banco não tem material para esta parte');
    if (nos.some((n) => n.origem?.fonte === 'referencias')) problemas.push('usa material da referência');
    if (t.papel === 'mascote') {
      const opcao = t.opcoes[escolhas?.[t.no] ?? 0];
      if (opcao && opcao.tema !== grafo.tema) problemas.push(`mascote ${opcao.tema ? `com o figurino do tema ${opcao.tema}` : 'sem tema conhecido'}: falta a pose do tema ${grafo.tema} (npm run mascote -- pose --tema ${grafo.tema}, gasta gateway)`);
    }
    if (t.papel === 'texto') {
      const nossas = alturasDoTexto(cena);
      const escala = w / grafo.tamanho_px[0];
      const minimo = (regrasDaMarca.letra_min_da_referencia ?? 0.7) * Math.min(...t.altura_ref) * escala;
      const menor = Math.min(...nossas);
      if (t.altura_ref?.length && nossas.length && menor < minimo) problemas.push(`letra pequena (${menor.toFixed(0)} px < ${minimo.toFixed(0)} px): frase longa demais para a caixa`);
      if (!t.opcoes.length) problemas.push('a marca não tem textos para este tema');
    }
    const montagem = montagens[t.no];
    for (const c of montagem?.camadas ?? []) {
      if (c.qa && !c.qa.aprovado) problemas.push(`recorte ${c.id} reprovado no QA: ${c.qa.problemas.join('; ')}`);
    }
    partes.push({
      no: t.no,
      especialista: t.especialista,
      delta,
      ok: problemas.length === 0,
      problemas,
      alertas: [...alertas, ...(montagem?.camadas ?? []).map((c) => c.alerta ?? c.qa?.alerta).filter(Boolean)],
    });
  }

  const regras = [];
  const luz = await perfilDeLuz(png);
  const [lmin, lmax] = regrasDaMarca.L_mediana ?? [0, 255];
  regras.push({ regra: 'luz mediana', valor: luz.mediana, ok: luz.mediana >= lmin && luz.mediana <= lmax, faixa: [lmin, lmax] });
  if (regrasDaMarca.esquerda_mais_escura_que_centro) {
    const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    const esq = media(luz.porFaixa.slice(0, 2)), centro = media(luz.porFaixa.slice(4, 6));
    regras.push({ regra: 'esquerda mais escura que o centro', valor: [+esq.toFixed(0), +centro.toFixed(0)], ok: esq < centro });
  }
  if (regrasDaMarca.ouro_presente_min != null) {
    const ouro = +(await fracaoDeOuro(png)).toFixed(3);
    regras.push({ regra: 'ouro presente', valor: ouro, ok: ouro >= regrasDaMarca.ouro_presente_min });
  }
  const deltaPeca = +(await deltaDeCor(png, ref)).toFixed(2);
  regras.push({ regra: 'peça inteira parecida com a referência', valor: deltaPeca, ok: deltaPeca <= deltaMax });

  const problemas = [
    ...partes.filter((p) => !p.ok).flatMap((p) => p.problemas.map((x) => `${p.no}: ${x}`)),
    ...regras.filter((r) => !r.ok).map((r) => `regra "${r.regra}" falhou (${JSON.stringify(r.valor)})`),
  ];
  return { png, aprovado: problemas.length === 0, delta_peca: deltaPeca, partes, regras, problemas };
}
