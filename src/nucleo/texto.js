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
  const linhas = cfg.linhas.map((l) => ({
    ...l,
    peso: l.peso ?? 1,
    texto: prepararTexto(l.texto, cfg.caixa_alta),
  }));

  // Largura de cada linha com corpo 1 (é linear no corpo).
  const unidade = linhas.map((l) => medidor.largura(l.texto, fonte, 100, cfg.espacamento) / 100);
  const larguraPorFator = Math.max(...linhas.map((l, i) => l.peso * unidade[i]));
  let alturaPorFator = 0;
  linhas.forEach((l, i) => {
    alturaPorFator += l.peso * altCaixaAlta;
    if (i > 0) alturaPorFator += cfg.vao * Math.min(l.peso, linhas[i - 1].peso);
  });

  let fator = Math.min(caixa.w / larguraPorFator, caixa.h / alturaPorFator);
  if (cfg.tamanho_max && formato) {
    const pesoMax = Math.max(...linhas.map((l) => l.peso));
    fator = Math.min(fator, (cfg.tamanho_max * formato.altura) / pesoMax);
  }

  const filhos = linhas.map((l, i) => ({
    w: l.peso * unidade[i] * fator,
    h: l.peso * altCaixaAlta * fator,
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
    tamanho: l.peso * fator,
    x: caixas[i].x,
    topo: caixas[i].y,              // topo das maiúsculas
    base: caixas[i].y + caixas[i].h, // linha de base
    largura: caixas[i].w,
  }));
}
