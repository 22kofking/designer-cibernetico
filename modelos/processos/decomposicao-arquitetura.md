# Decomposição: diagnóstico e arquitetura proposta

Thread "Análise da decomposição", 2026-10-16. Proposta para aprovação de Nicolas.

## Resumo

A decomposição de hoje acerta o principal (onde fica cada parte, as cores, a luz), mas é feita à mão para cada banner e
só recorta a imagem achatada: o que está escondido atrás do mascote ou do texto nunca aparece. A proposta é um
**decompositor único, automático e com prova de qualidade**, em 5 etapas. As quatro primeiras rodam em CPU, sem custo.
Só a etapa que completa o que estava escondido gasta, cerca de US$ 0,02 por banner. O resultado é um grafo que descreve
**papéis** (manchete, valor, mascote, objeto do tema), não a marca do concorrente, então o mesmo grafo serve para
CAPIVARA362, ARARA519, TUCANO362 ou qualquer outra marca.

## 1. Como está hoje

Existem dois decompositores, que não conversam:

| Onde | O que faz | Limite |
| --- | --- | --- |
| `ferramentas/desconstruir.py` do gera-o-de-imagem- (9pmbet) | Grafo `grafo-peca/0.1` de 3 das 13 referências. O designer-cibernetico só lê esse grafo (`npm run desconstruir -- importar/plano/molde`). | As outras 10 referências não têm grafo. Não está no repositório novo. |
| `/mnt/project-files/arara/decomposicao/scripts/` (Arara) | BiRefNet na metade direita, SAM por pontos, texto por cor, paleta e luz medidas. 11 grafos. | 56 pontos e caixas marcados à mão para 21 objetos (`config.json`). Fora do repositório. |

O que a análise dos 11 banners da Arara mostrou (`arara/decomposicao/prancha-todos.jpg`):

1. **Marcação manual.** Cada objeto precisa de pontos digitados. Não escala para uma marca nova.
2. **Regras presas à marca.** O texto é achado por limiar de cor (amarelo e branco) e por uma zona fixa à esquerda. Na
   9pmbet era outro amarelo. O texto lido (`texto_lido`) foi digitado.
3. **Só recorte, nada completado.** O fundo fica com buracos onde estavam o mascote, o texto e o logo. Não há placa
   limpa sem gerar imagem.
4. **Partes grudadas.** Objetos pequenos presos no mascote (notas na mão, celular), linhas de texto juntas, folhagem da
   frente presa no fundo, moedas desfocadas na frente contadas como fundo.
5. **Sem prova de que fechou.** Ninguém confere se as camadas, empilhadas de volta, dão a imagem original. Um erro de
   máscara só aparece quando a peça nova sai errada.
6. **Grafo plano.** Os nós não têm hierarquia (grupo → peça) e o texto não é texto vivo (sem fonte, tamanho e
   alinhamento por linha), então o molde precisa adivinhar.

O que funciona e fica: o formato do grafo com a origem de cada número (`fonte: medido:…`), a paleta e o perfil de luz
medidos, BiRefNet para o personagem inteiro, SAM para objetos menores, o banco recebendo as partes, o molde e o PSD.

## 2. O que a busca achou

| Ferramenta | O que faz | Licença | Onde roda | Papel aqui |
| --- | --- | --- | --- | --- |
| [Qwen-Image-Layered](https://github.com/QwenLM/Qwen-Image-Layered) (CVPR 2026) | Divide a imagem em 3 a 8 camadas RGBA e completa o que estava escondido. | Apache 2.0 | GPU de 48 GB (Pod). Resolução recomendada ~640 a 1024. | Sendo testado agora na thread "Nova estrutura do projeto". Entra como etapa opcional, conforme o resultado. |
| [Ming-Image-0.1-Design-Layer](https://huggingface.co/inclusionAI/Ming-Image-0.1-Design-Layer) (set. 2026) | Igual, mas recebe **um plano de camadas** junto com a imagem. Feito para pôster e interface. | MIT | Testado só em GPU de 80 GB, 1024 px. | O nosso grafo pode virar esse plano. Candidato a testar depois do Qwen. |
| Referring Layer Decomposition (ICLR 2026) | Tira uma camada RGBA de um objeto apontado por texto, ponto ou caixa. | Pesquisa | GPU | Ideia certa (uma camada por nó do grafo); ainda sem modelo pronto para uso. |
| [LayerD](https://github.com/CyberAgentAILab/LayerD) | Camadas de banner, de frente para trás. | Apache 2.0 | CPU | Já testado nas 13 referências e descartado. |
| Florence-2 (Microsoft) | Descreve a imagem e acha caixas por texto ("parrot", "coin", "chest"). | MIT | CPU, com transformers.js | **Troca os pontos manuais**: dá as caixas que o SAM usa. |
| PaddleOCR | Lê o texto com a caixa de cada linha e palavra. | Apache 2.0 | CPU (ONNX) | Texto lido, linhas separadas e tamanho de cada linha, sem limiar de cor. |
| LaMa (big-lama) | Completa buracos (inpainting) sem gerar imagem nova. | Apache 2.0 | CPU (ONNX) | Tira texto e logo do fundo de graça. |
| Qwen-Image-Edit 2511 | Edição por instrução: "remova o personagem e os objetos". | Apache 2.0 | Modelo pronto da RunPod, US$ 0,02 | Placa limpa onde o buraco é grande (atrás do mascote). |
| SAM 3 (Meta) | Segmenta por texto, todas as ocorrências de um conceito. | Licença própria da Meta (conferir antes de uso comercial) | GPU | Fica de fora até a licença ser lida. O SlimSAM com as caixas do Florence-2 cobre o mesmo papel. |

Resumo da busca: os modelos de camadas por IA melhoraram, mas todos pedem GPU grande e nenhum foi medido em banner de
apostas. Para o nosso caso, o ganho mais barato e garantido vem de automatizar o que já fazemos (caixas, texto, placa
limpa) e de provar a qualidade a cada decomposição.

## 3. Arquitetura proposta

```
referência (PNG/WebP/AVIF/PSD)
   │
   ▼
1. LER (CPU)        OCR das linhas · Florence-2: legenda + caixas por objeto · logo · paleta · luz
   │
   ▼
2. SEPARAR (CPU)    BiRefNet (personagem) · SAM com as caixas do passo 1 (objetos) · máscara do texto pelo OCR
   │                regras de conflito: objeto na mão sai do mascote, texto sai do fundo, frente desfocada vira camada
   ▼
3. COMPLETAR        texto e logo → LaMa (CPU, grátis)
   (só se preciso)  atrás do mascote → Qwen-Image-Edit "remova" (US$ 0,02)
   │                opcional: Qwen-Image-Layered / Ming-Layer num Serverless, se o teste aprovar
   ▼
4. CONFERIR (CPU)   empilha as camadas de volta e compara com a original (ΔE e SSIM por região)
   │                nó com nota baixa → fila de revisão na Mesa de Cena (corrige uma caixa, não 56 pontos)
   ▼
5. GRAVAR           grafo-peca/0.2 · camadas RGBA · PSD · banco (cada parte com o vetor de busca)
   │
   ▼
plano por parte (banco: reusar / adaptar / desenhar por código / gerar) → geração por componentes (PR #6)
   → crítico por parte contra o nó da referência → cena JSON → PSD / PNG / WebP → banco (criados)
```

### O que muda no grafo (0.1 → 0.2)

- **Papel de cada nó**, além do tipo: `manchete`, `valor`, `subtitulo`, `cta`, `mascote`, `objeto_do_tema`,
  `objeto_segurado`, `particulas`, `placa`, `luz`. É o papel que deixa o grafo servir para qualquer marca.
- **Hierarquia**: grupo → peças (14 medalhões da rede de convite são um grupo com 14 filhos e uma regra de arranjo).
- **Texto vivo**: conteúdo, caixa por linha, altura da letra, peso, cor, alinhamento e a fonte mais parecida do nosso
  banco de fontes. O molde deixa de adivinhar.
- **Camada completa**: cada nó aponta para a sua camada RGBA e diz se a parte escondida foi completada e como
  (`lama`, `edit`, `layered`, `nao`).
- **Nota de qualidade** por nó (resultado da etapa 4) e a origem de cada número, como hoje.

### Por que essa ordem

- O designer de verdade primeiro **lê** a peça (o que diz, o que tem, onde está), depois separa. Ler primeiro dá as
  caixas para separar sem pontos manuais.
- A conferência no fim troca "marcar tudo à mão" por "corrigir só o que reprovou", e mede a decomposição do mesmo jeito
  que o crítico já mede a peça.
- O gasto só aparece onde não tem saída de graça (o buraco grande atrás do mascote), sempre com teto, como no gateway.

### Onde roda e quanto custa

| Etapa | Onde | Tempo por banner (estimado) | Custo |
| --- | --- | --- | --- |
| 1 Ler, 2 Separar, 4 Conferir | Este ambiente ou o computador do Nicolas, em CPU (transformers.js e ONNX, como o BiRefNet e o SlimSAM de hoje) | 2 a 4 min | Grátis |
| 3 Completar: texto e logo | CPU (LaMa) | menos de 1 min | Grátis |
| 3 Completar: atrás do mascote | Modelo pronto da RunPod pelo gateway (modelo "editar") | ~10 s | ~US$ 0,02 |
| 3 Opcional: camadas por IA | Serverless com ComfyUI, só se o teste do Qwen-Image-Layered aprovar | ~1 a 2 min | a medir no teste |
| Geração da peça nova por partes | Gateway, como no PR #6 | — | ~US$ 0,03 |

Total por banner novo, da referência à peça pronta: **cerca de US$ 0,05**, sem Pod ligado.

## 4. Como fazer, por fases

| Fase | Entrega | Custo |
| --- | --- | --- |
| D1 | Decompositor único no designer-cibernetico (`npm run desconstruir -- analisar <imagem>`), juntando os scripts da Arara e o da 9pmbet. OCR e Florence-2 no lugar dos pontos manuais. Conferência por recomposição. Meta: refazer os 11 da Arara sem nenhum ponto digitado e chegar perto da nota dos grafos atuais. | Grátis |
| D2 | Placa limpa: LaMa para texto e logo; modelo "editar" no gateway para o buraco do mascote. Rodar nas 13 da 9pmbet e nas 11 da Arara. | ~US$ 0,50 (24 banners) |
| D3 | Grafo 0.2 com papéis, hierarquia e texto vivo. O molde e a geração por componentes passam a ler o 0.2. Prova: o mesmo grafo da Arara gerando uma peça da CAPIVARA362 e outra de um terceiro bicho. | ~US$ 0,10 |
| D4 | Camadas por IA como etapa opcional, com o resultado do teste do Qwen-Image-Layered (e, se valer, do Ming-Layer). | conforme o teste |

O código da decomposição hoje é cuidado pela thread "Nova estrutura do projeto". A fase D1 deve ser feita lá ou
combinada com ela, para ninguém mexer no mesmo arquivo ao mesmo tempo.

## 5. Riscos

- **Florence-2 erra objeto estilizado** (arara 3D com roupa). Mitigação: a descrição do grafo vira o texto da busca, e o
  que reprovar na conferência vai para a fila de revisão.
- **LaMa borra em textura forte** (fogo, folhagem). Mitigação: a conferência mede a nitidez da área completada; abaixo do
  limite, sobe para o modelo "editar".
- **Edit muda o fundo além do buraco.** Mitigação: só a área da máscara é aproveitada; o resto continua o original.
- **Fontes**: o texto vivo depende de achar uma fonte parecida; sem banco de fontes, cai na fonte da marca.

## Fontes

- [Qwen-Image-Layered, artigo CVPR 2026](https://openaccess.thecvf.com/content/CVPR2026/papers/Yin_Qwen-Image-Layered_Towards_Inherent_Editability_via_Layer_Decomposition_CVPR_2026_paper.pdf)
- [Qwen-Image-Layered no GitHub](https://github.com/QwenLM/Qwen-Image-Layered) e [blog do Qwen](https://qwen.ai/blog?id=qwen-image-layered)
- [Ming-Image-0.1-Design-Layer](https://huggingface.co/inclusionAI/Ming-Image-0.1-Design-Layer) e [resumo da Digital Applied](https://www.digitalapplied.com/blog/ming-image-design-layer-open-weights-editable-graphics)
- [SAM 3, licença comentada pela Roboflow](https://roboflow.com/blog/what-is-sam3)
- Resultados do LayerD: `/mnt/project-files/gera-imagem/9pmbet/layerd/comparacao-13.jpg`
- Plano anterior: `/mnt/project-files/estrutura/plano-camadas.md`
