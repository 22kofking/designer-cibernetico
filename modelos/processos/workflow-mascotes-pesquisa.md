# Workflow de mascotes no ComfyUI: pesquisa (16/10/2026)

Pedido do Nicolas: sair do "prompt → gateway" e ter um **workflow de geração de mascotes**
que repete o mesmo padrão estético, mudando só as variáveis (animal e logo).

## O problema do jeito atual
Hoje o padrão vive dentro de um texto (prompt). O modelo interpreta o texto de um jeito
diferente a cada vez, e o resultado deriva: traço, proporção e luz mudam de uma casa para outra.
Num workflow, o padrão vive em **arquivos fixos** que entram em toda geração:
um estilo treinado, esqueletos de pose e manequins de figurino. O prompt passa a carregar só a variável.

## O que existe aberto (e como cada um entra no nosso)
| Peça | O que faz | Licença comercial | Uso no model sheet |
|---|---|---|---|
| **LoRA de estilo** (treino com ai-toolkit/ostris) | "ensina" o estilo A ao modelo com 15 a 30 imagens aprovadas | sim, sobre Z-Image Turbo, Qwen-Image 2512 ou FLUX.2 klein 4B (Apache 2.0) | trava o traço e a luz para toda casa |
| **Character sheet com OpenPose em grade** (método Mickmumpitz, Consistent Character Creator) | gera o mesmo personagem em vários ângulos numa folha só, guiado por esqueletos | o workflow é gratuito; a versão dele usa FLUX dev (**sem uso comercial**), então trocar o modelo | folha de ângulos de cada bicho em 1 geração |
| **LoRA do personagem** (10 a 15 recortes da folha) | trava a identidade de cada bicho | sim, mesmo modelo base | opcional, por casa, se a identidade derivar |
| **Qwen-Image-Edit 2511** (nativo no ComfyUI) | edita mantendo identidade; aceita 2 a 3 imagens | Apache 2.0 | vestir o figurino do manequim; já testado (US$ 0,02) |
| **LoRA Multiple-Angles** para o Edit 2511 | gira o personagem | Apache 2.0 | os 8 ângulos; já testado (US$ 0,025) |
| **ControlNet OpenPose** | copia a pose de um esqueleto | depende do modelo | as poses de cada tema viram esqueletos fixos |
| **FLUX.2 multi-referência** (até 10 imagens) | mantém estilo e identidade a partir de referências | só o klein 4B é comercial | alternativa ao LoRA de estilo, sem treino |
| **BiRefNet** | tira o fundo | MIT | já usamos, em CPU |

Os mascotes têm corpo humano (braços, pernas), então os esqueletos de pose humanos servem para
capivara, arara (asas fazendo de braços) e tucano.

## Workflow proposto (um JSON do ComfyUI, variáveis: animal e logo)
1. **Base**: modelo + LoRA de estilo A + esqueleto "frente neutra" → bicho de frente, fundo liso.
   Gera 4 opções; uma é aprovada e vira a referência daquela casa.
2. **Folha de ângulos**: a referência + grade de 8 esqueletos (ou o LoRA de ângulos) → 8 vistas.
3. **Figurinos**: referência + manequim do figurino → Edit 2511 → bicho vestido (7 figurinos).
4. **Poses de tema**: bicho vestido + esqueleto do tema + objeto → pose final (10 temas).
5. **Recorte e conferência**: BiRefNet + crítico (parecido com a base, não infantil).

Fixos e reaproveitados em toda casa: o LoRA de estilo, os 8 + 10 esqueletos e os 7 manequins.
Por casa: só a linha do animal e o logo.

Onde roda: RunPod Serverless com ComfyUI (cobrado por segundo, desligado quando parado),
com os modelos num disco de rede (~US$ 0,07 por GB por mês; ~60 GB ≈ US$ 4/mês).
Montar e testar o workflow: Pod por hora, depois apagado.

## Gerar 10 de uma vez é mais barato?
- **Nos modelos prontos da RunPod (como hoje)**: não. Cobram por imagem; 10 imagens custam 10 vezes uma.
- **No nosso ComfyUI no Serverless**: sim. Paga-se por segundo de GPU, e cada vez que a máquina
  liga ela gasta tempo carregando o modelo (dezenas de segundos). Em lote, esse carregamento é
  pago uma vez só. Estimativa, não medida: GPU de 48 GB a US$ 1,22/h (US$ 0,00034/s);
  ~25 s por imagem do Edit ≈ US$ 0,009 por imagem, mais ~US$ 0,02 de partida por lote.
  10 juntas ≈ US$ 0,11; 10 separadas, cada uma com a sua partida ≈ US$ 0,29.
- **Folha em grade**: uma geração só produz várias poses (por exemplo, 8 ângulos numa imagem),
  o que é mais barato e mais coerente, mas cada pose sai menor e pede ampliação.

## Custos de montar (estimativas, não medidas)
| Item | Quando | Custo |
|---|---|---|
| Pod para montar e testar o workflow | uma vez, ~2 a 3 h | US$ 2 a 4 |
| Treino do LoRA de estilo A | uma vez, ~1 h de GPU | US$ 1 a 3 |
| Disco de rede com os modelos | fixo mensal | ~US$ 4 por mês |
| Casa nova completa (base, 8 ângulos, 7 figurinos, 10 poses ≈ 30 imagens) | por casa | ~US$ 0,30 a 0,40 em lote |

## Próximo passo sugerido
1. Juntar 15 a 30 mascotes já aprovados no estilo A (já existem na pasta mascotes/ e em gera-imagem/9pmbet/).
2. Treinar o LoRA de estilo e montar o workflow no Pod, com teto de US$ 8 no total.
3. Testar com o tucano: base, folha e 2 temas, conferindo que o estilo bate com a capivara.

## Fontes
- Método da folha com OpenPose e LoRA (Mickmumpitz): https://www.runflow.io/blog/comfyui-consistent-characters-flux
- Consistent Character Creator 4.0: https://www.runcomfy.com/comfyui-workflows/consistent-character-creator-4-0-comfyui-flux-2-dataset
- Qwen-Image-Edit 2511 no ComfyUI: https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
- FLUX.2 multi-referência no ComfyUI: https://docs.comfy.org/tutorials/flux/flux-2-dev
- Treino de LoRA do Z-Image Turbo com ai-toolkit: https://github.com/FurkanGozukara/Stable-Diffusion/discussions/350
- Preços do Serverless da RunPod: https://www.runpod.io/pricing
