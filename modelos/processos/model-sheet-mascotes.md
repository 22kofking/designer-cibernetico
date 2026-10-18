# Model sheet único dos mascotes (proposta, 16/10/2026)

Estilo escolhido por Nicolas em 16/10/2026: quadrinho 2D (estilo A da capivara) para todas as casas; a arara será refeita em 2D.

## A ideia
Todas as casas usam o mesmo model sheet. Fundo, elementos e textos já são fixos por tema;
o que muda de uma casa para outra é só o **animal** e o **logo**.

## O que fica fixo (um arquivo só, igual para todas as casas)
- **Estilo**: um traço, uma luz, proporção adulta, enquadramento da cintura para cima,
  óculos escuros, sorriso aberto, nunca infantil.
- **8 ângulos**: frente, 3/4 dir., lado dir., costas, lado esq., 3/4 esq., de cima, de baixo.
- **Figurinos** (cada um guardado num manequim, nunca vestido num bicho, para não vazar o rosto):
  sorte (roupa chinesa), mago, faraó, rua, pirata, rei, turista.
- **Poses por tema** (figurino + o que segura):
  resgate, convite, depósito, telegram, envelopes, VIP, rebate, apostas, login, redes.

## O que cada casa preenche
- Nome da casa e logo.
- Animal: uma linha (ex.: "capivara de focinho longo", "arara-vermelha", "tucano de bico laranja")
  e as cores dele.

Hoje cada casa tem o próprio estilo, figurinos e temas
(personagens/capivara362-a e personagens/arara519 no designer-cibernetico).
A mudança é tirar essas listas de dentro de cada personagem e pôr num model sheet comum.

## Como uma casa nova é gerada
1. Base do bicho, de frente, pose neutra: 4 opções para escolher.
2. Vestir cada figurino a partir do manequim.
3. Pose de cada tema a partir do bicho vestido.
4. Recorte do fundo (BiRefNet, em CPU, sem custo).
5. Crítico confere: parecido com a base e não infantil.

## Custo (preços da RunPod já medidos)
| Item | Quando | Conta | Custo |
|---|---|---|---|
| Manequins dos 7 figurinos | uma vez só | 7 x US$ 0,02 | US$ 0,14 fixo |
| Base do bicho | por casa | 4 x US$ 0,005 | US$ 0,02 |
| Figurinos vestidos | por casa | 7 x US$ 0,02 | US$ 0,14 |
| Poses dos temas | por casa | 10 x US$ 0,02 | US$ 0,20 |
| 8 ângulos (opcional) | por casa | 8 x US$ 0,025 | US$ 0,20 |

Total por casa: ~US$ 0,36 sem os ângulos, ~US$ 0,56 com eles (variável),
mais US$ 0,14 fixos uma única vez. Repetir uma imagem reprovada custa o mesmo item de novo.

Para gerar, a nuvem do projeto precisa da chave da RunPod no ambiente (hoje não tem).

## Primeiro teste proposto
Montar os 7 manequins e gerar o tucano completo (base, 7 figurinos, 10 poses, sem ângulos),
com teto de US$ 0,60 no total. A mudança no código (model sheet comum no designer-cibernetico)
fica com a thread "Nova estrutura do projeto", que cuida desse repositório.
