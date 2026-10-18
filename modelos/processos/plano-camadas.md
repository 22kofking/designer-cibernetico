# Plano: sair da imagem monolítica

Thread "Nova estrutura do projeto", 2026-10-15. Proposta para aprovação de Nicolas.

## O problema

O gateway (Z-Image Turbo) e o ComfyUI devolvem uma imagem só, achatada. Para editar, hoje a gente desmonta depois:
BiRefNet tira o fundo, o SAM separa as partes, e o buraco que fica atrás de cada parte é tapado com um remendo borrado
(nitidez 0,16 a 0,25 no corpo do mago). O que estava escondido atrás do mascote nunca existiu na imagem, então nenhum
recorte consegue devolver.

Há duas saídas, e elas se completam:

1. **Gerar já em partes**, como você desenhou: referência, decomposição, geração de cada parte, recomposição.
2. **Decompor com IA que completa o que estava escondido**, para quando a entrada é monolítica (referência de
   concorrente ou imagem já gerada).

## Saída 1: gerar por partes (o caminho principal)

O nosso fluxo já tem quase tudo: o grafo diz quais partes existem e onde ficam, e a cena JSON monta camadas. Falta a
geração respeitar essa divisão.

| Parte | Como nasce | Por que fica editável |
| --- | --- | --- |
| Fundo | Gerado sozinho, sem personagem e sem objetos (o prompt pede só o cenário: fogo, raios, clarão). | Já nasce como placa limpa, sem buraco para tapar. |
| Mascote | Gerado sozinho, sobre fundo liso, com o personagem travado e a pose do tema. BiRefNet tira o fundo. | É uma camada inteira. As partes dele (mão, objeto) saem por SAM sobre um fundo liso, onde o recorte é fácil. |
| Objeto na mão | Gerado à parte (orbe, envelope), ou o mascote é gerado duas vezes: com e sem o objeto. | O par com e sem o objeto entrega o corpo completo atrás da mão, sem remendo. |
| Elementos | Banco, vetor recolorido no VectorCraft ou desenho por código (já existe). | Vetor ou PNG próprio. |
| Texto e logo | Código (já existe). | Texto vivo. |
| Luz e sombra de encaixe | Camadas próprias por código: clarão atrás do mascote, sombra no chão, brilho nas bordas. | É o que faz as partes parecerem uma imagem só, sem achatar nada. |

- **Recomposição:** a cena JSON com as caixas do grafo (já existe). O crítico mede contra a referência como hoje.
- **PSD:** é só a saída. Por dentro tudo fica na cena JSON com camadas RGBA. O PSD sai dela com uma camada por nó,
  nomeada (biblioteca ag-psd em Node, licença MIT, ou o export de PSD com camadas do VectorCraft).
- **Risco:** partes geradas separadas podem não casar na luz e na perspectiva. Para segurar isso:
  - cada parte é gerada com a paleta medida da referência e, quando ajuda, com o recorte da referência como guia (img2img);
  - as camadas de luz e sombra fazem a costura;
  - uma passada de harmonização (img2img fraco na peça inteira) pode existir só como prévia, nunca gravada por cima das
    camadas.
- **Custo:** cerca de 3 a 5 imagens por peça (fundo, mascote, par sem objeto, objeto), de US$ 0,015 a 0,025 no Z-Image
  Turbo.

### LayerDiffuse

LayerDiffuse gera a imagem já com transparência (alfa nativo, sem recorte), inclusive cabelo e brilho semitransparente.

- Tem versão para SDXL e uma adaptação para Flux, como nós do ComfyUI.
- Não existe para o Z-Image nem na RunPod pronta, então exigiria o nosso próprio worker com GPU.
- Fica como melhoria depois que o fluxo por partes estiver de pé com o BiRefNet.

## Saída 2: decompor a imagem monolítica com IA

| Ferramenta | O que faz | Licença | Onde roda | Uso aqui |
| --- | --- | --- | --- | --- |
| [Qwen-Image-Layered](https://huggingface.co/Qwen/Qwen-Image-Layered) (dez. 2025) | Divide uma imagem em 3, 4 ou 8 camadas RGBA e completa o que estava escondido. Cada camada pode ser dividida de novo. | Apache 2.0 | Nativo no ComfyUI. Pesado: 20B, cerca de 45 GB de VRAM, 2 min por imagem a 1024 (FP8 reduz). Não está nos modelos prontos da RunPod. | Decompor as referências de concorrentes e as imagens monolíticas que já temos, como o mago, o faraó e os banners antigos. |
| [LayerD](https://github.com/CyberAgentAILab/LayerD) (ICCV 2025) | Feito para banners e peças gráficas: tira a camada da frente, completa o que está atrás e repete. Separa texto, vetor e imagem. | Código Apache 2.0 (conferir os pesos) | Os exemplos rodam em CPU, então dá para testar aqui sem gastar. | Primeiro teste grátis nas 13 referências da 9pmbet. Pode gerar os grafos das 10 que ainda não têm. |
| Qwen-Image-Edit 2511 | Edição por instrução: "remova o mascote", "remova o objeto da mão". Devolve a placa limpa. | Apache 2.0 | Já está nos modelos prontos da RunPod, por US$ 0,02 por imagem. Entra no gateway como um modelo "editar". | Trocar o remendo borrado do SAM por uma placa gerada, no fundo e no corpo atrás da mão. |
| PhotoCraft (Remover, Cura) | Completa sem IA, por amostra da própria imagem. | Aberto (ArtCraft) | Local, em CPU. | Reserva sem custo para buracos pequenos. |

## Como tudo se encaixa

```
referência ──► decomposição (grafo + LayerD / Qwen-Image-Layered) ──► banco (partes estudadas)
                                   │
                                   ▼
                       plano por parte (diretor)
      ┌──────────────┬─────────────┼──────────────┬──────────────┐
    fundo         mascote        objeto        elementos        texto
   (gerado       (gerado em     (gerado à     (banco, vetor,   (código)
   sozinho)      fundo liso,    parte ou par  código)
                 BiRefNet)      com/sem)
      └──────────────┴─────────────┼──────────────┴──────────────┘
                                   ▼
                cena JSON (camadas RGBA + luz e sombra por código)
                                   ▼
                    crítico ──► PSD / PNG / WebP ──► banco (criados)
```

A geração vira por parte. A decomposição por IA fica para o que chega pronto.

## Experimentos propostos, em ordem

| # | Experimento | Custo | Precisa de |
| --- | --- | --- | --- |
| 1 | LayerD nas 13 referências da 9pmbet, comparado com os grafos que já temos e com o SAM. | Grátis (CPU) | Só o seu ok. |
| 2 | Exportar PSD com camadas a partir da cena JSON (as 3 peças atuais). | Grátis | Só o seu ok. |
| 3 | Peça de envelopes gerada por partes: fundo sozinho, capivara de roupa chinesa em fundo liso, envelope à parte. Recompor e medir contra a peça monolítica. | Cerca de US$ 0,05 | Chave no ambiente do projeto (hoje não tem). |
| 4 | Modelo "editar" (Qwen-Image-Edit 2511) no gateway: placa sem o mascote e corpo sem o orbe, comparando a nitidez com o remendo atual. | Cerca de US$ 0,10 | Chave no ambiente e mudança pequena no gateway-imagem. |
| 5 | Qwen-Image-Layered num Pod da RunPod com GPU de 48 GB ou mais, nas referências e no mago. | Cerca de US$ 1 a 2 (Pod por hora) | Chave e o seu ok para o gasto. |

Os experimentos 1 e 2 não gastam nada e podem começar já. Os de 3 a 5 dependem de uma chave da RunPod (ou do gateway)
no ambiente do projeto, colocada por você nas configurações, nunca colada no chat de outra thread.

## Resultados (2026-10-15)

- **LayerD nas 13 referências** (CPU, de 40 a 125 s cada): ele não serve para estes banners.
  - O texto saiu limpo só em 1 de 13 (home-telegram).
  - Nas outras 12, ele tira o texto pequeno e o logo, mas deixa a manchete grande no fundo, às vezes pela metade.
  - A ilustração (personagem, fogo, objetos) nunca se separa.
  - Comparação em `/mnt/project-files/gera-imagem/9pmbet/layerd/comparacao-13.jpg`.
- **PSD com camadas:** pronto. `npm run psd` grava uma camada por nó, com grupos. As 3 peças estão em
  `/mnt/project-files/pecas/capivara362/*/*.psd`.
- **Geração por componentes:** pronta no código (PR #6 do designer-cibernetico). `npm run peca -- componentes` mostra o
  plano e o custo (US$ 0,03 para os envelopes). Falta a chave do gateway no ambiente para rodar de verdade.

## Recomendação

Adotar a saída 1 como fluxo padrão (gerar por partes, guiado pelo grafo). Usar a saída 2 para as referências e para o
que já está monolítico. Começar pelos experimentos 1 e 2, que são grátis, e fazer o 3 assim que houver chave, porque é
ele que prova o fluxo inteiro numa peça real.
