// Oficina de texto: 100% código. A IA nunca desenha letra; aqui a tipografia
// é encaixada com fonte real, como um designer faz no Illustrator.
//
// Entrada: um nó bloco_texto da cena e a caixa dele em pixels.
// Saída: uma lista de linhas prontas para desenhar, cada uma com tamanho de
// fonte e a caixa da caixa-alta (topo das maiúsculas até a linha de base).
//
// O "medidor" é injetado para o mesmo código rodar no Node e no navegador:
//   medidor.largura(texto, fonte, tamanho, espacamentoEm) -> px
//   medidor.metricas(fonte) -> { altCaixaAlta }   (altura da maiúscula / corpo)
import { distribuir } from './layout.js';

export const PADRAO_BLOCO = {
  caixa_alta: true,
  vao: 0.28,            // vão entre linhas, em frações do corpo da linha menor
  espacamento: 0,       // espaço extra entre letras, em em (0.02 = 2% do corpo)
  alinhamento: 'esquerda',
  vertical: 'centro',
  tamanho_max: null,    // corpo máximo em frações da altura da peça (opcional)
};

export function prepararTexto(texto, caixaAlta) {
  return caixaAlta ? texto.toLocaleUpperCase('pt-BR') : texto;
}

// Encaixa as linhas na caixa. Cada linha tem um "peso": o corpo dela é
// proporcional ao peso (a palavra-chave com peso 4 sai 4x maior). Procura o
// maior fator que faz o bloco caber na largura e na altura ao mesmo tempo.
export function encaixarTexto(no, caixa, medidor, formato) {
  const cfg = { ...PADRAO_BLOCO, ...no };
  const fonte = cfg.fonte;
  const { altCaixaAlta } = medidor.metricas(fonte);
  // Uma linha pode ter trechos com estilos diferentes ("DE ATÉ" branco e "2%" dourado):
  // o texto da linha é a soma dos trechos. Cada linha pode ter o próprio espaçamento.
  const linhas = cfg.linhas.map((l) => {
    // trecho.escala aumenta só aquele pedaço (o "2%" maior que o "DE ATÉ"), na mesma linha de base;
    // trecho.caixa_alta = false deixa o pedaço como foi escrito (o "e" de "14H 18H e 22H").
    const trechos = l.trechos?.length
      ? l.trechos.map((t) => ({ ...t, escala: t.escala ?? 1, texto: prepararTexto(t.texto, t.caixa_alta ?? cfg.caixa_alta) }))
      : null;
    return {
      ...l,
      peso: l.peso ?? 1,
      espacamento: l.espacamento ?? cfg.espacamento,
      trechos,
      texto: trechos ? trechos.map((t) => t.texto).join('') : prepararTexto(l.texto, cfg.caixa_alta),
    };
  });

  // Largura de cada linha com corpo 1 (é linear no corpo).
  const larguraTrechos = (l, tam) => l.trechos.reduce((soma, t) => soma + medidor.largura(t.texto, fonte, tam * t.escala, l.espacamento), 0);
  const unidade = linhas.map((l) => (l.trechos ? larguraTrechos(l, 100) : medidor.largura(l.texto, fonte, 100, l.espacamento)) / 100);
  // a altura da linha segue o maior trecho
  linhas.forEach((l) => { l.alturaRel = l.trechos ? Math.max(...l.trechos.map((t) => t.escala)) : 1; });
  const larguraPorFator = Math.max(...linhas.map((l, i) => l.peso * unidade[i]));
  let alturaPorFator = 0;
  linhas.forEach((l, i) => {
    alturaPorFator += l.peso * l.alturaRel * altCaixaAlta;
    if (i > 0) alturaPorFator += cfg.vao * Math.min(l.peso, linhas[i - 1].peso);
  });

  let fator = Math.min(caixa.w / larguraPorFator, caixa.h / alturaPorFator);
  if (cfg.tamanho_max && formato) {
    const pesoMax = Math.max(...linhas.map((l) => l.peso));
    fator = Math.min(fator, (cfg.tamanho_max * formato.altura) / pesoMax);
  }

  const filhos = linhas.map((l, i) => ({
    w: l.peso * unidade[i] * fator,
    h: l.peso * l.alturaRel * altCaixaAlta * fator,
    margemAntes: i > 0 ? cfg.vao * Math.min(l.peso, linhas[i - 1].peso) * fator : 0,
  }));
  const caixas = distribuir(caixa, filhos, {
    direcao: 'coluna',
    justificar: cfg.vertical,
    alinhar: cfg.alinhamento,
  });

  return linhas.map((l, i) => ({
    texto: l.texto,
    estilo: l.estilo,
    espacamento: l.espacamento,
    // deslocamento de cada trecho a partir do começo da linha, com a fonte real
    trechos: l.trechos?.map((t, k) => ({
      ...t,
      dx: k ? larguraTrechos({ ...l, trechos: l.trechos.slice(0, k) }, l.peso * fator) : 0,
    })) ?? null,
    tamanho: l.peso * fator,
    x: caixas[i].x,
    topo: caixas[i].y,              // topo das maiúsculas
    base: caixas[i].y + caixas[i].h, // linha de base
    largura: caixas[i].w,
  }));
}
