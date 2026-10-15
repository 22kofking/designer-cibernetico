# Geração por componentes e PSD com camadas

Uma imagem gerada inteira pelo gateway sai achatada. Para editar, era preciso desmontá-la depois: tirar o fundo,
separar as partes e tapar com um remendo borrado o buraco atrás de cada uma. Aqui o caminho é o contrário: cada parte
nasce sozinha e já separada, e a peça é recomposta na cena JSON.

```
referência ──► grafo (partes e caixas) ──► uma geração por parte ──► cena JSON ──► crítico ──► PNG / WebP / PSD
```

## O que nasce sozinho

Código em `src/geracao/componentes.js`.

| Parte | Pedido ao gateway | Por que fica editável |
| --- | --- | --- |
| Fundo | Só o cenário da marca para o tema (`marca.geracao.fundos`), "sem personagem, sem objetos, sem texto, sem logo", na proporção da peça. | Já nasce como placa limpa, sem buraco atrás do mascote. |
| Mascote | O personagem travado (`personagem.json`) em fundo liso. Quando a peça tem um objeto na mão, o mascote nasce de mão aberta e vazia. | Camada inteira, recortada pela cor da borda ou pelo BiRefNet quando a borda não é lisa. |
| Objeto na mão | O objeto do tema (`temas.<tema>.objeto`), sozinho, em fundo liso. | Camada própria, posta na caixa que o grafo mediu. |

Moedas, envelopes no chão e ícones continuam com o banco, o VectorCraft ou o desenho por código. Texto e logo continuam
por código.

- **Duas tentativas por parte.** O fundo e o objeto ficam com a que mede mais perto da parte da referência. O mascote
  fica com a mais parecida com a folha do personagem que não saiu infantil.
- **Arquivos.** Todas as tentativas ficam em `<peça>/componentes/<parte>/`, junto com o `componente.json`, que guarda o
  prompt, o gasto e a tentativa escolhida.

## Gasto

- Só com `--gerar` e `--teto`. As gerações de uma peça dividem o mesmo orçamento: cada uma recebe só o que sobra do
  teto.
- Com o Z-Image Turbo (US$ 0,005 por imagem), uma peça com fundo, mascote e objeto custa US$ 0,03.

```bash
npm run peca -- componentes grafo.json                          # o que pediria e quanto custaria (não gasta)
npm run peca -- produzir grafo.json --gerar --teto 0.05         # precisa de GATEWAY_URL e GATEWAY_CHAVE
```

Na equipe de agentes, a geração entra como uma opção a mais de cada parte:

- **Fundo e objeto:** a geração é a primeira opção.
- **Mascote:** a montagem em partes pronta do mesmo tema vem antes, porque não gasta nada.
- **Falhas:** se a geração falhar (sem chave ou acima do teto), o especialista passa para a próxima opção e a nota
  fica no relatório.

## PSD

A cena JSON é a fonte, e o PSD é só uma saída. `src/node/psd.js` monta o arquivo assim:

- desenha cada nó sozinho, no tamanho da peça, recortado na área que ele ocupa;
- grava uma camada por nó, na ordem da cena, com a opacidade do nó;
- põe num grupo os pedaços da mesma parte (por exemplo, `mascote-corpo` e `mascote-orbe` no grupo `mascote`).

A biblioteca é a ag-psd, com licença MIT.

```bash
npm run psd -- pasta/cena.json            # grava pasta/<nome>.psd
```

O `npm run peca -- produzir` já grava o PSD ao lado da prévia. Conferido no psd-tools: a imagem montada a partir das
camadas difere da prévia em menos de 1 nível, numa escala de 0 a 255.

## Decompor o que já chega monolítico

Para referências e imagens antigas, o plano completo está em `/mnt/project-files/estrutura/plano-camadas.md`.

O LayerD (CyberAgent, ICCV 2025, código e pesos Apache 2.0) roda em CPU (cerca de 1 min por banner). Ele separa bem o
que é gráfico chapado: tira texto e logo e completa o que estava atrás deles. A ilustração (personagem, fogo, objetos)
continua no fundo. Para separar a ilustração, as opções são o Qwen-Image-Layered (GPU grande) ou gerar por
componentes desde o início.
