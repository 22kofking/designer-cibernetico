# Elementos desenhados por código (procedural)

A 5ª via de criar elementos, além de reusar do banco, adaptar um vetor no VectorCraft, gerar pelo gateway e montar o
mascote em partes. Um gerador é uma função que recebe parâmetros (tamanho, semente, paleta) e devolve um SVG. O mesmo
gerador faz quantas variações quiser, todas nossas (licença própria), vetoriais e de graça.

Serve para o que é geométrico ou repetitivo. Mascote, cenas e texturas complexas continuam nas outras vias.

## Geradores

Código em `src/oficinas/procedural.js`.

| Gerador | O que desenha |
| --- | --- |
| `moeda` | Moeda inclinada com espessura, aro, face em gradiente, símbolo em relevo (estrela, cifrão, coroa, diamante) e reflexo. |
| `moeda_furada` | Moeda chinesa com furo quadrado. |
| `chuva_de_moedas` | Moedas espalhadas sem se sobrepor demais; as pequenas (mais longe) saem desfocadas e ficam atrás. |
| `medalhao` | Moeda grande com faixa de pontos gravados e emblema no centro. |
| `envelopes_com_moedas` | Envelopes vermelhos com borda dourada e selo, e moedas furadas por cima; a quantidade segue a proporção da caixa. |
| `raio` | Raio por deslocamento do ponto médio, com galhos; brilho largo e miolo branco. |
| `faiscas` | Riscos curtos e brilhantes saindo de um centro. |

- **Semente:** a mesma semente desenha a mesma peça; outra semente dá outra variação.
- **Paleta:** as cores tiradas da parte na referência viram uma rampa do escuro ao claro. Só a cor vem da referência; a
  forma é toda nossa.

```bash
npm run procedural -- lista
npm run procedural -- medalhao --largura 300 --altura 360 --semente 2 --paleta "#f8e54f,#d1581c,#ebb626,#9d2e0c"
```

## Na equipe de agentes

- O diretor escolhe o gerador pela descrição da parte no grafo (`geradorParaParte`: "moedas" vira `chuva_de_moedas`,
  "moeda gigante" vira `medalhao`, "envelopes" vira `envelopes_com_moedas` etc.).
- A opção procedural entra logo depois do melhor item do banco. Se o reuso for reprovado pelo crítico, a segunda
  tentativa já é a procedural.
- O ilustrador de elementos desenha a parte inteira no tamanho da caixa e guarda o SVG ao lado do PNG em `assets/`, para
  edição no VectorCraft ou no editor.

## Medição contra a referência (ΔE2000 de paleta, limite 10)

| Parte | Banco ou VectorCraft (antes) | Procedural |
| --- | --- | --- |
| moedas, home Telegram | 11,1 | 7,0 |
| moedas, promo VIP | 10,7 | 6,8 |
| medalhão, promo VIP | 10,9 | 4,0 |
| envelopes no chão, home envelopes | 16,4 | 6,2 |

## Outras soluções pesquisadas

| Solução | O que é | Por que não agora |
| --- | --- | --- |
| [StarVector](https://github.com/joanrod/star-vector) | Modelo que escreve SVG a partir de texto ou imagem (CVPR 2025), Apache 2.0. | Precisa de GPU; os SVGs saem simples (ícones), aquém do acabamento de banner. Candidato para vetorizar recortes. |
| [OmniSVG](https://huggingface.co/OmniSVG/OmniSVG1.1_4B) | Modelo de 4B que gera SVG; os pesos são Apache 2.0. | O conjunto de dados (MMSVG-2M) é CC BY-NC-SA, o que pede cuidado para uso comercial. Precisa de GPU. |
| VectorFusion / SVGDreamer | Difusão que otimiza um SVG a partir de texto. | Muito pesado (minutos de GPU por imagem). |
| LLM escrevendo SVG | O agente escreve o SVG direto. | É o que este módulo é: o código foi escrito uma vez e vira gerador reutilizável, sem custo por peça. |
| Bibliotecas JS (paper.js, roughjs, simplex-noise) | Geometria, traço à mão, ruído. | Desnecessárias até aqui; o SVG puro com gradientes e filtro de desfoque bastou. |
