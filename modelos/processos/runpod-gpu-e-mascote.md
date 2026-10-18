# GPU na RunPod e mascote em folha de ângulos

Thread "Nova estrutura do projeto", 2026-10-15. Teste real com a chave de Nicolas, usada só nesta conversa.
Gasto total do dia: US$ 0,455. A peça de envelopes custou US$ 0,03 e os testes do mascote, US$ 0,425.

## 1. Gargalo atual

Hoje o BiRefNet, o SAM e o LayerD rodam na CPU deste ambiente:

- o BiRefNet leva 20 s e 7,5 GB por imagem;
- o LayerD leva cerca de 1 min por banner;
- com 16 GB de RAM, dois modelos juntos derrubam o processo.

A geração já vai para a RunPod pelo gateway. A ideia é levar também as ferramentas pesadas.

## 2. Três jeitos de usar GPU na RunPod

| Jeito | Como cobra | Serve para | Não serve para |
| --- | --- | --- | --- |
| **Modelos prontos** (Public Endpoints) | Por imagem, sem servidor | Gerar e editar: Z-Image Turbo (US$ 0,005), Qwen-Image (0,02), Qwen-Image-Edit 2511 (0,02, aceita até 3 imagens), Qwen-Image-Edit 2511 com LoRA (0,025), FLUX Kontext (0,025), Seedream 4 Edit (0,027), Nano Banana 2 Edit (0,0875 a 0,175) | Modelos que não estão no catálogo: BiRefNet, SAM, LayerDiffuse, Qwen-Image-Layered |
| **Serverless próprio** | Por segundo, só enquanto roda; desliga sozinho sem pedidos | Uma imagem nossa com ComfyUI (ou o `worker/` do gateway-imagem) e os modelos que quisermos. É chamado pelo gateway como mais um modelo. | Partida a frio é cobrada; endpoint parado 7 dias precisa ser reativado |
| **Pod por hora** | Por hora ligada | Montar e testar fluxos no ComfyUI com interface, antes de virar Serverless | Ficar ligado: cobra mesmo parado |

Preço por hora de Pod, lido na API da RunPod em 2026-10-15 (comunidade / seguro, US$):

| VRAM | GPU | Comunidade | Seguro |
| --- | --- | --- | --- |
| 24 GB | RTX A5000 | 0,16 | 0,27 |
| 24 GB | RTX 4090 | 0,34 | 0,89 |
| 48 GB | RTX A6000 | 0,33 | 0,59 |
| 48 GB | L40S | 0,79 | 1,09 |
| 80 GB | A100 | 1,19 | 1,79 |
| 80 GB | H100 PCIe | 1,99 | 2,89 |

- **Armazenamento:** volume de rede a US$ 0,07 por GB por mês, para guardar os modelos e evitar baixar de novo a cada
  partida.
- **Limite padrão de gasto da conta:** US$ 80 por hora.

### Recomendação

1. **Gerar e editar: modelos prontos.** Já está ligado no gateway. Basta acrescentar os modelos de edição
   (Qwen-Image-Edit 2511, com e sem LoRA).
2. **Ferramentas pesadas: um Serverless "ferramentas" com ComfyUI**, chamado pelo gateway:
   - BiRefNet e SAM cabem em 24 GB;
   - LayerDiffuse (SDXL ou Flux) cabe em 24 GB;
   - Qwen-Image-Layered em FP8 precisa de 48 GB.
   
   Pela tabela de Pods, 2 minutos de uma GPU de 48 GB custam de US$ 0,01 a 0,04. É uma estimativa: o preço do
   Serverless por segundo é outro e não aparece na documentação aberta.
3. **Pod por hora só para montar o fluxo**, e desligar logo depois.

Com isso, este ambiente só orquestra (cena, crítico, PSD), e nada pesado roda aqui.

## 3. Mascote como folha de ângulos (model sheet)

Nicolas pediu um mascote que não seja um bloco único: um modelo com todos os ângulos, para que uma roupa feita uma vez
sirva em qualquer mascote do mesmo padrão.

Teste feito, com resultado em `/mnt/project-files/mascotes/padrao-folha/resumo.jpg`:

1. **Base neutra.** Capivara estilo A de corpo inteiro, em pose A, com regata e short cinza. Z-Image Turbo, US$ 0,005.
2. **Ângulos.** Qwen-Image-Edit 2511 com a LoRA
   [Multiple-Angles](https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA) (Apache 2.0). São 8
   direções × 4 alturas × 3 distâncias. Saíram frente, 3/4, lados, costas, de cima e de baixo, todos com o mesmo
   personagem, a US$ 0,025 cada. O ângulo "de baixo" inventou uma praia de fundo; falta pedir fundo liso.
3. **Vestir.** Qwen-Image-Edit 2511 com 2 imagens (a base e a roupa), a US$ 0,02. Funcionou com o faraó e o mago tirados
   das camadas que já temos.
4. **Girar a roupa junto.** O ângulo aplicado à capivara já vestida mantém a roupa (3/4 e costas).
5. **Outro bicho do mesmo padrão** (onça):
   - Com a roupa tirada da capivara vestida, o rosto da capivara vaza para a onça. Não serve.
   - Com a roupa num **manequim** (gerado só a roupa, US$ 0,005), a onça veste certo e continua onça.
   - Regra: **a roupa é guardada no manequim, nunca vestida num bicho.**

### Como fica o padrão

```
bicho base (pose A, roupa neutra)  ──► folha de ângulos do bicho
roupa no manequim (catálogo)       ──┐
                                     ├─► bicho vestido (frente) ──► folha de ângulos vestida ──► poses e peças
bicho base ──────────────────────────┘
```

- **Catálogo de roupas:** faraó, mago, sorte, rua e pirata, cada uma num manequim. Vale para capivara, onça, tucano ou
  qualquer bicho novo.
- **Custo de um bicho novo com 5 roupas:** base (0,005) + 5 vestidos (0,10) + 4 ângulos de cada (0,50). Cerca de
  US$ 0,60.
- **Limites vistos:**
  - Ao vestir, o corpo perde um pouco do ar atlético.
  - Os óculos às vezes aparecem nas costas.
  - Os ângulos de baixo e de costas às vezes ganham cenário.
  
  Isso se resolve com o prompt (fundo liso) e com a conferência do personagem que já existe.

## Próximos passos propostos

1. **Comandos do mascote.** Transformar o teste em `npm run mascote -- base|angulos|manequim|vestir`, guardando
   tudo no banco como material do personagem. A folha de ângulos passa a ser a referência da conferência.
2. **Modelos de edição no gateway.** Pôr o Qwen-Image-Edit 2511 (com e sem LoRA) no gateway, para o designer não
   chamar a RunPod direto.
3. **Serverless "ferramentas".** Montar o ComfyUI com BiRefNet, SAM e LayerDiffuse primeiro num Pod, depois em
   Serverless.
