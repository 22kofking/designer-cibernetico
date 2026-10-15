# Desconstrução → banco → molde (fase 4)

A desconstrução de uma referência (grafo `grafo-peca/0.1`, feito pelo `ferramentas/desconstruir.py` do
gera-o-de-imagem-) traz um nó por parte: caixa, camada, máscara, descrição, paleta, relações entre as partes. Esta fase
usa esse grafo de três jeitos.

## 1. Alimentar o banco

```bash
npm run desconstruir -- importar grafos/promo-vip.json grafos/home-telegram.json --referencias /mnt/project-files/gera-imagem/9pmbet/referencias
```

Cada parte com imagem (fundo, mascote, objetos) é recortada pela máscara e entra como `referencias`. Os dados do nó
(descrição, tema, figurino, caixa, z, relações) ficam em `origem.no`. Para o fundo vale a placa "cena limpa" (sem texto
nem mascote). Um grupo (5 moedas em volta) entra inteiro e também peça por peça. Texto e logo não viram recorte: a letra
sai sempre por código e o logo é o nosso. Referência é só guia de forma e nunca entra numa peça.

## 2. Consultar o banco parte por parte (plano)

```bash
npm run desconstruir -- plano grafos/promo-vip.json
```

Para cada parte, busca no que é nosso e nos públicos e diz o que a oficina faria (reusar, adaptar, gerar ou mostrar
candidatos). Regras:

- **Mascote e fundo:** busca só no nosso material, com o mesmo papel.
- **Grupo:** busca pelo maior pedaço (uma moeda acha moeda).
- **Vetor público:** só vale se o nome concorda com a parte. Um glossário leva a descrição em português para os termos
  em inglês das bibliotecas ("moedas" → coin, "envelope" → envelope).
- **Notas de corte:** reusar 0,80 e adaptar 0,72. Nosso material contra o do concorrente nunca é quase igual.
- **Reusar:** só quando o nosso está no topo.

Saída: `plano.json` e `prancha-plano.png`, com uma linha por parte (o recorte e os candidatos, com a base marcada).

## 3. Molde de cena

```bash
npm run desconstruir -- molde grafos/promo-vip.json --logo exemplos/capivara362-home-vip/assets/logo-capivara362.png
```

Gera um documento de cena com o layout da referência e o nosso material. As caixas e a ordem das camadas são as da
referência, no dobro do tamanho.

- **Fundo:** o nosso equivalente, ou um gradiente com a paleta medida.
- **Escurecimento:** segue o perfil de luz medido.
- **Peças de um grupo:** cada uma no seu lugar.
- **Mascote:** o nosso mais parecido entra como rascunho (mascote em partes é a fase 5).
- **Objeto na mão do mascote:** fica para o mascote.
- **Texto:** um bloco com as linhas, o peso de cada uma (branco ou dourado) e o vão medidos. Fica "linha 1, linha 2…" para
  escrever.

Onde o banco não tem nada fica um retângulo, e a lista `pendentes` do `plano.json` diz o que falta. Nada da referência
entra no molde. O `cena.json` abre na Mesa de Cena e renderiza com `npm run render`.
