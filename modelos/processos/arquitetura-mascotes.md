# Arquitetura dos mascotes: boneco padrão, poses e figurinos reutilizáveis

Proposta de 16/10/2026, a pedido do Nicolas. Nada gerado, nada gasto.

## 1. O problema
Até aqui, cada mascote nasce como **uma imagem inteira** feita pela IA. Por isso:
- não há padrão: cada geração decide sozinha o enquadramento, a proporção e o rosto;
- a pose, o figurino e o bicho vêm "colados" numa imagem só, e trocar um deles exige gerar tudo de novo;
- a edição no PhotoCraft ou no VectorCraft vale para uma imagem e se perde na próxima;
- separar em camadas depois é caro e frágil (a Arara precisou de 56 pontos à mão).

O que a indústria de animação 2D faz há anos é o contrário: **o personagem é um boneco montado por partes
sobre um esqueleto**. É assim no Spine, no DragonBones, no Live2D, no Inochi2D (aberto, BSD) e no
Animated Drawings da Meta (aberto, MIT). Nesses sistemas:
- o **esqueleto** é um só, e a pose é só o ângulo de cada osso;
- o **visual** é um conjunto de partes presas aos ossos (cabeça, tronco, braço, antebraço, mão...);
- o **figurino** é uma "pele" (skin): peças presas aos mesmos encaixes do esqueleto. Por isso, a mesma roupa e a
  mesma animação servem para personagens diferentes que dividem o esqueleto.

## 2. A proposta: o boneco padrão
Uma estrutura em 5 camadas. As 3 primeiras são **fixas para todas as casas**; o bicho é a única variável.

```
MODELO (fixo)
├─ 1. Esqueleto padrão      um só para todos: proporções, articulações, chão, enquadramento
├─ 2. Biblioteca de poses   cada pose = ângulos dos ossos + forma das mãos (aberta, punho, apontando, segurando)
├─ 3. Guarda-roupa          cada figurino = peças por encaixe (chapéu→cabeça, jaqueta→tronco+mangas, calça→pernas)
│
├─ 4. Kit do bicho  ◄── VARIÁVEL: tipo de mascote
│     partes recortadas do animal (cabeça de frente e de 3/4, tronco, braços, mãos, pernas, pés, cauda),
│     cada uma com o ponto de giro; o "tipo" (ave, mamífero, réptil) diz quais partes existem
│
└─ 5. Objetos de cena       envelope, orbe, celular... presos ao encaixe "mão que segura"
```

Uma peça (por exemplo, "tucano, convite") vira uma receita de 4 linhas:
`{ bicho: tucano, pose: aponta, figurino: sorte, objeto: nenhum }`.
O **montador** (código, sem IA) prende as partes do bicho e as peças do figurino no esqueleto, gira os ossos
conforme a pose e entrega **um PSD com uma camada por parte**.

### Por que isso resolve o que você apontou
| Problema visto | Como o boneco resolve |
|---|---|
| Corpo inteiro misturado com meio corpo | O esqueleto fixa o chão e o tamanho. O meio corpo é um recorte do corpo inteiro. |
| Pose que muda de bicho para bicho | A pose é um arquivo de ângulos e vale igual para todo bicho. |
| Figurino diferente em cada geração | O figurino é feito uma vez, em peças, e preso aos mesmos encaixes. |
| Tucano com boca humana | O kit do tucano é aprovado uma vez. Depois ele só é montado, nunca regerado. |
| Edição que se perde | Você edita **uma parte** no PhotoCraft ou no VectorCraft, ela volta para o kit, e toda peça que usa essa parte é remontada com a edição. |
| Separar camadas depois | Não precisa: a peça já nasce em camadas, porque foi montada. |

## 3. Onde entra a IA
A IA sai do papel de "gerar a peça final" e passa a **fabricar matéria-prima uma vez** e, se quisermos,
**dar o acabamento**:
1. **Kit de um bicho novo (uma vez por bicho):** uma folha do bicho no esqueleto padrão (pose neutra, de frente e
   de 3/4, com o LoRA do estilo A e o ControlNet de pose que já temos). Como a pose foi forçada, sabemos onde está
   cada articulação, e o recorte de cada parte sai pelos pontos do esqueleto mais o SAM, sem pontos digitados.
2. **Figurino novo (uma vez por figurino):** vestido no **manequim** (o próprio boneco padrão, sem bicho) e recortado
   nos mesmos encaixes. O teste de 15/10 já mostrou que roupa vinda do manequim serve em qualquer bicho.
3. **Acabamento (opcional, por peça):** o boneco montado tem cara de "recorte de papel" nas juntas. Uma passada de
   IA leve (img2img com o LoRA do estilo e ControlNet de traço, guiada pela própria montagem) unifica traço e
   sombra. Como sabemos onde cada parte foi colocada, as camadas são refeitas pelas máscaras da montagem.

## 4. A equipe de agentes (extensão da fase 6 que já existe)
| Agente | Faz | Quando |
|---|---|---|
| Diretor de personagem | lê o pedido, monta as receitas e o plano de custo | todo pedido |
| Construtor de bicho | fabrica o kit de partes de um animal novo e o deixa para aprovação | 1 vez por bicho |
| Figurinista | fabrica um figurino no manequim e corta em peças por encaixe | 1 vez por figurino |
| Montador | aplica pose, bicho e figurino no esqueleto e grava o PSD em camadas | toda peça, sem custo |
| Acabador | passada de IA opcional para unificar traço, devolvendo as camadas | quando pedido |
| Crítico | confere proporções contra o esqueleto, parecido com o kit aprovado, não infantil, anatomia por tipo (ave sem boca humana), cor (ΔE) | toda peça |
| Bibliotecário | guarda kits, figurinos e poses no banco, com versões, e remonta o que depende de uma parte editada | toda edição |

**Sua edição entra como etapa oficial:** o kit de um bicho e cada figurino só viram "padrão" depois do seu ok.
Se você corrigir uma parte no PhotoCraft ou no VectorCraft, o bibliotecário guarda a versão nova e o montador
refaz as peças que a usam.

## 5. Formato dos arquivos
```
modelo/
  esqueleto.json        ossos, comprimentos, pontos de giro, chão, enquadramento 768x1024
  poses/aponta.json     ângulo de cada osso + forma das mãos
  figurinos/farao/      chapeu.png, tronco.png, manga_d.png ... + encaixes.json
bichos/
  tucano/kit.json       tipo: ave, partes, pontos de giro, cores; aprovado em <data>
  tucano/partes/*.png   (ou .svg, se vetorizado no VectorCraft)
pecas/
  tucano-convite.json   { bicho, pose, figurino, objeto } → montagem.psd
```
O formato é próprio e simples, em JSON. Se um dia quisermos animar, ele pode ser exportado para o Inochi2D
(aberto, BSD) ou para o Spine.

## 6. Riscos
- **Juntas aparentes:** braço e antebraço precisam de sobreposição e pontas arredondadas, como no recorte de animação. A passada de acabamento resolve o resto.
- **Ângulo:** costas e perfil pedem partes próprias (cabeça de perfil, tronco de costas). Começamos só com frente e 3/4.
- **Mãos:** são o ponto mais difícil. Uma biblioteca de 4 formas de mão por tipo de bicho resolve as 7 poses atuais.
- **Chapéus:** cada tipo de cabeça (orelhas, bico, crista) precisa de um ponto de encaixe para o chapéu.

## 7. Fases sugeridas
| Fase | O que prova | Custo |
|---|---|---|
| **B1** | Esqueleto padrão + 7 poses em JSON + montador. A capivara de base que já existe (folha de ângulos, de frente) é recortada em partes e montada nas 7 poses, com PSD em camadas. | grátis (CPU) |
| **B2** | Figurino em peças: o faraó do manequim que já existe é cortado por encaixe e vestido na capivara e na onça (também já existe). | grátis (CPU) |
| **B3** | Acabamento por IA sobre a montagem, devolvendo camadas. | centavos por peça, na GPU |
| **B4** | Kit de um bicho novo (tucano) pelo construtor de bicho, aprovado por você e montado nas 7 poses. | ~US$ 0,10 a 0,50 |

As fases B1 e B2 respondem à pergunta principal (o padrão e a portabilidade de poses e figurinos) sem gastar nada.
O código entraria no repositório designer-cibernetico, que hoje é cuidado pela thread "Nova estrutura do projeto".

## Fontes
- Spine, figurinos como skins sobre o mesmo esqueleto: https://de.esotericsoftware.com/forum/d/4143-character-customisation-w-spine e https://ar.esotericsoftware.com/forum/d/15480
- Animated Drawings (Meta, MIT, arquivado em 09/2025): https://github.com/facebookresearch/AnimatedDrawings
- Inochi2D (BSD): https://nlnet.nl/project/Inochi2D/
- See-through, separação de personagem em ~23 camadas para Live2D: https://dl.acm.org/doi/10.1145/3799902.3811209 e https://lilting.ch/en/articles/see-through-anime-layer-decomposition
- Outline and Detail, personagem 2D em camadas com esqueleto: https://dl.acm.org/doi/10.1145/3746059.3747707
