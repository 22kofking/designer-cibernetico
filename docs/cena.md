# Documento de cena (versão 0.1)

A cena é a fonte da verdade. Agentes escrevem e leem a cena; o editor só desenha e grava o que você mexeu; o
exportador desenha a mesma cena sem tela. O esquema completo está em `esquemas/cena.schema.json`.

## Convenções

- `caixa.x` e `caixa.w` são frações da largura; `caixa.y` e `caixa.h`, frações da altura (as mesmas das fichas).
  A mesma cena serve para qualquer resolução do formato.
- Os nós são desenhados na ordem da lista, de baixo para cima.
- Caminhos de `asset` e de fontes são relativos ao arquivo da cena.

## Tipos de nó

| Tipo | Campos próprios | Uso |
|---|---|---|
| `imagem` | `asset`, `encaixe` (conter, cobrir, esticar), `ancora` (centro, base, topo, esquerda, direita) | fundo, mascote, elementos, logo |
| `gradiente` | `direcao`, `paradas: [[posição, cor, opacidade]]` | escurecimento, luzes |
| `retangulo` | `cor`, `raio` | placas, faixas |
| `bloco_texto` | `fonte`, `linhas: [{texto, estilo, peso}]`, `estilos`, `vao`, `alinhamento`, `vertical`, `sombra` | toda a tipografia |
| `grupo` | `flex` (direcao, justificar, alinhar, espaco, quebrar), `filhos` | fileiras e listas encaixadas pelo Yoga |

Campos comuns: `id`, `papel` (fundo, texto, mascote, elemento, logo, efeito), `rotacao`, `opacidade`, `visivel`,
`bloqueado`, `espelhar` e `origem`.

Campos de camada, como no PhotoCraft (todos opcionais):

| Campo | O que faz |
|---|---|
| `mistura` | modo de mistura: normal, multiplicar, tela, sobrepor, escurecer, clarear, subexpor_cor, superexpor_cor, luz_direta, luz_suave, diferenca, exclusao, matiz, saturacao, cor, luminosidade. Vira o modo da camada no PSD |
| `espelhar_v` | espelha na vertical |
| `ajustes` (imagem) | `brilho`, `contraste`, `saturacao` (-1 a 1), `matiz` (graus), `desfoque` (0 a 1) |
| `efeitos` | estilos de camada em pixels da peça: `sombra {cor, opacidade, desfoque, dx, dy}`, `brilho {cor, opacidade, tamanho}` (brilho externo), `contorno {cor, largura}` (texto e retângulo) |

`asset` e `fontes[].arquivo` aceitam `data:` (imagem colocada ou fonte subida na Mesa, camadas vindas de um PSD).

## Origem e licença

`origem` diz de onde o material veio e é o elo com o banco de referências:

```json
"origem": { "fonte": "publicos", "como": "openclipart", "licenca": "CC0", "url": "https://..." }
```

`fonte` é `criados` (feito por nós e aprovado), `referencias` (só guia de forma, nunca entra na peça final) ou
`publicos` (biblioteca aberta, com a licença de cada item).

## Como o texto é encaixado

Cada linha tem um `peso`; o corpo da linha é proporcional a ele. A oficina procura o maior corpo que faz o bloco
caber na largura e na altura da caixa ao mesmo tempo, usando a altura da maiúscula da fonte real e o `vao` entre
linhas (em frações do corpo da linha menor). O Yoga distribui as linhas na caixa conforme `vertical` e
`alinhamento`. Mudou o texto, o encaixe é refeito sozinho.
