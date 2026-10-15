# Mascote em partes e personagem travado (fase 5)

## Personagem travado

`personagens/capivara362-a/personagem.json` guarda o padrão A da capivara. Ele foi escolhido em 14/10/2026: quadrinho 2D,
óculos escuros, sorriso aberto, dedo apontando, adulto e nunca infantil. O arquivo fixa:

- o **prompt** (o mesmo da ficha CAPIVARA362), com `{figurino}` e `{segura}`;
- os **figurinos** (sorte, mago, faraó, rua, pirata) e, para cada **tema**, o figurino e o que o mascote segura;
- a **folha**: as versões aprovadas que estão no banco, contra as quais toda pose nova é conferida;
- a **conferência**: parecido com a folha (≥ 0,80) e não infantil (a nota do CLIP para "fofo para crianças" contra "mascote
  adulto"; alerta acima de 0,6, reprova acima de 0,8).

```bash
npm run mascote -- prompt --tema envelopes          # prompt travado da pose do tema
npm run mascote -- conferir imagem.png              # parece o personagem? saiu infantil?
npm run mascote -- pose --tema envelopes --teto 0.02 --quantas 2   # gera pelo gateway, confere e guarda só as aprovadas
```

Calibragem (15/10/2026):

| Imagem | Infantil | Resultado |
|---|---|---|
| Padrão A | 0,17 a 0,52 | aprovado |
| 3D adulto | 0,49 a 0,72 | aprovado com alerta |
| Versão infantil (descartada) | 0,87 a 0,95 | reprovado |
| Tucano do kit de logos | parecido 0,71 | reprovado (é outro personagem) |

## Mascote em partes

Uma receita (`personagens/<nome>/montagens/<x>.json`) diz onde fica cada parte, com pontos em pixels do mascote. Os pontos
positivos vão em cima da parte e os negativos no que não é dela, como na marcação dos grafos.

```bash
npm run mascote -- partes personagens/capivara362-a/montagens/mago.json
```

1. O SlimSAM (via transformers.js, em CPU, cerca de 7 s) acha a parte pelos pontos e devolve 3 opções de máscara. Em cada
   uma fica só o maior pedaço, com os furos fechados. O **QA do recorte** (abaixo) escolhe a opção: a de maior nota entre
   as que passam. Depois, o brilho da mesma cor em volta vai junto (o halo azul do orbe).
2. O corpo perde a parte e ganha um **remendo**: a cor de volta é puxada de fora para dentro e alisada. Assim, trocar o
   objeto não deixa buraco. É um remendo simples: serve quando o objeto novo cobre a área. Um remendo de verdade pede img2img
   pelo gateway.
3. As camadas vão para `/mnt/project-files/mascotes/<personagem>/<montagem>/` (corpo.png, partes, `montagem.json` com as
   caixas) e entram no banco como `criados`.

Para colocar o mascote em camadas numa cena e trocar uma parte:

```bash
npm run mascote -- trocar cena.json --no mascote --montagem /mnt/project-files/mascotes/capivara362-a/mago/montagem.json \
  --parte orbe --por envelope.png
```

O nó do mascote vira as camadas (corpo atrás, partes na frente) no mesmo lugar. A parte trocada encaixa na caixa da
original. A nova cena vai para `cena-mascote.json`.

Montagens feitas:
- **mago:** corpo + orbe (objeto na mão).
- **faraó:** corpo + cabeça. O separador pegou o toucado com o rosto.

## QA do recorte

`src/qualidade/recorte.js` mede cada máscara sem IA (geometria e cor). O resultado vai para o campo `qa` de cada parte em
`montagem.json`.

| Medida | O que acusa | Limiar |
| --- | --- | --- |
| pedaços | migalhas soltas (pedaços com ≥ 1% da área) | até 1 |
| furos | buracos dentro da parte | ≤ 2% da área |
| solidez | área / contorno convexo; forma rasgada | ≥ 0,6 |
| mancha | pedaço com a cor do resto da imagem na borda da parte (dedos no orbe, braço, fundo) | ≤ 2% da área |
| franja | cinza claro de fundo na borda | ≤ 25% da borda |
| empate | as duas melhores opções do modelo quase empatadas e bem diferentes | só alerta |
| nitidez do remendo | detalhe dentro do remendo / detalhe em volta | < 0,35 vira alerta no corpo |

Como a mancha funciona: a borda da parte é comparada com as cores do miolo dela e com as cores do resto da imagem. Um dedo
marrom no orbe azul fica mais perto do corpo do que do miolo do orbe. Contorno escuro e brilho branco não contam, porque
aparecem em todas as partes de um desenho. A mancha só reprova partes que são **objeto**. Em parte do corpo (`cabeca`,
`braco`, `mao`, `perna`, `rabo`) ela é só medida, porque ali as cores do corpo aparecem de verdade. Para mudar isso, use
`"objeto": true|false` na parte da receita.

Calibração no mago e no faraó (SlimSAM e SAM ViT-base dão os mesmos números):
- **Orbe com a mão:** mancha de 0,034 a 0,061. Era a opção de maior nota (0,940), e o QA reprova.
- **Orbe sozinho:** mancha ≤ 0,004, e o QA escolhe (nota 0,931). Os dedos ficam no corpo, porque estão na frente do orbe.
- **Cabeça do faraó:** mancha de 0,018. Passa, e por ser parte do corpo, a mancha nem reprovaria.
- **Remendos atuais:** nitidez 0,25 no mago e 0,16 no faraó. Os dois entram como alerta. O remendo de verdade pede o par de
  imagens com e sem o objeto pelo gateway.

## Tirar o fundo com IA (BiRefNet)

`src/mascote/fundo.js` usa o BiRefNet lite (licença MIT, ONNX pelo transformers.js) para tirar o fundo do **personagem
inteiro**, com borda suave.

```bash
npm run mascote -- fundo pose.png [--saida pose-sem-fundo.png]
npm run mascote -- pose --tema telegram --teto 0.02 --fundo ia   # pose gerada com fundo cheio
```

Medido no mago colado sobre o fogo (a resposta certa é conhecida):
- **BiRefNet:** IoU 0,996, com alfa suave. Leva cerca de 22 s e usa cerca de 7,5 GB de memória, porque o modelo só aceita
  1024x1024. Baixa 224 MB em fp32, que no CPU foi mais rápido que o fp16.
- **SlimSAM com pontos:** IoU 0,950, com borda dura.

Ele não separa partes: na caixa do orbe, ele pega o orbe, a mão e a manga juntos. Partes continuam com o SAM e o QA. Na
referência do mago deles, ele recortou bem o corpo, mas perdeu o orbe transparente.

Modelos: `MASCOTE_MODELO_FUNDO` (padrão `onnx-community/BiRefNet_lite-ONNX`). Para o separador de partes,
`MASCOTE_MODELO_SAM` aceita `Xenova/sam-vit-base` (101 MB). Ele deu o mesmo resultado do SlimSAM (IoU 0,96 entre os dois)
e foi mais lento, então o padrão continua o SlimSAM.
