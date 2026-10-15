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

1. O SlimSAM (via transformers.js, em CPU, cerca de 7 s) acha a parte pelos pontos. Fica só o maior pedaço da máscara, com
   os furos fechados, e o brilho da mesma cor em volta vai junto (o halo azul do orbe).
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
