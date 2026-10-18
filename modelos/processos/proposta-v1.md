# Nova estrutura: o designer cibernético (proposta v1, para conversar)

A ideia central: o sistema não "gera imagem". Ele faz o que um designer faz com uma referência:
**entender → consultar → construir cada parte com a ferramenta certa → montar → conferir**.
E tudo que ele constrói vira material reutilizável.

---

## 1. Entender (já temos a base)

A desconstrução em grafos que já existe vira o ponto de partida de tudo. Cada peça de referência sai como
um **grafo de cena**: um nó por parte (fundo, texto, mascote, cada elemento), com caixa delimitadora
(posição, escala, rotação), ordem de camada, papel na composição e paleta.

## 2. Consultar: o banco de referências

Duas coleções, como você desenhou:

| Coleção | O que guarda | Onde fica |
|---|---|---|
| **Referências** | recortes dos banners estudados (concorrentes, inspirações) | privado, nunca no repositório público |
| **Criados** | tudo que nós fizemos e foi aprovado (moedas, ícones, mascotes, fundos, textos), versionado | privado; o que for nosso pode ser público |

Cada item guarda: imagem com máscara, vetor (SVG) quando existir, metadados (tipo, estilo, marca, origem)
e um **vetor de busca** (embedding visual, tipo CLIP/SigLIP, mais um descritor de forma).

A consulta: para cada nó decomposto da referência, o agente busca os mais parecidos nos dois bancos.
- Achou um **criado** parecido? Reusa e só varia (cor, pose, rotação).
- Achou só **referências**? Usa como guia de forma para construir (nunca cola o recorte do concorrente).
- Não achou nada? Aí sim gera do zero, mas com o grafo como guia.

É exatamente o "designer não projeta do vácuo". Tecnologia sugerida: Postgres com pgvector (ou LanceDB
para começar mais simples), arquivos no bucket que o gateway já usa.

## 3. Construir: cada parte tem sua oficina

Respondendo sua pergunta: **não**, as partes não devem ser feitas pela mesma estrutura.

| Parte | Como um designer faz | Como o sistema faz | IA entra? |
|---|---|---|---|
| **Texto / tipografia** | escolhe fonte, ajusta peso, kerning, encaixa na caixa | 100% código: fontes reais, encaixe por regras (Yoga), efeitos como parâmetros | só o LLM escolhendo fonte e hierarquia dentro do catálogo. A IA nunca desenha letra |
| **Elementos** (moedas, raios, avião, ícones) | pega um asset da biblioteca ou desenha no Illustrator | 1º reusa do banco; senão gera matéria-prima pelo Comfy (fundo liso), vetoriza e limpa no ArtCraft, e salva como asset paramétrico | só para a matéria-prima. Ícones de marca (Telegram etc.) vêm do SVG oficial |
| **Mascote** | tem uma folha de personagem e desenha poses | personagem travado (folha do padrão A, depois LoRA ou IP-Adapter), poses por demanda pela IA, depois separado em partes (corpo, braço, objeto na mão) no PhotoCraft | sim, mas preso ao personagem |
| **Fundo** | gradiente, textura, luz | procedural quando a forma é simples (gradiente, raios, faíscas); img2img guiado pela referência quando é cena | às vezes |

A regra que vale para todas: **a IA produz matéria-prima, o agente transforma em material** com a
ferramenta certa, sempre conferindo contra a referência com o delta < 10.

Sobre o ArtCraft: é a suíte da mesma família do PhotoCraft (open source). O app vetorial dela é o
VectorCraft (caneta, vetorização de imagem). O PhotoCraft já tem controle por agente (servidor MCP); o
VectorCraft ainda não confirmei, e a suíte toda se declara em alfa. Proposta: usar o PhotoCraft já e
testar o VectorCraft numa prova pequena (vetorizar uma moeda) antes de depender dele.

## 4. Montar: o canvas (Canva + Illustrator)

Um **documento de cena único em JSON** é o coração: cada nó com transformação afim, caixa, camada,
restrições de encaixe e referência ao asset do banco. Tudo lê e escreve esse formato: os agentes, o
editor que você usa e o exportador.

- **Motor de canvas:** Fabric.js (melhor com vetor e SVG, importa e exporta, hit-testing pronto).
  Konva é mais rápido com muitas camadas, mas é mais "bitmap". Polotno é ótimo, mas é Konva com
  licença paga para uso comercial.
- **Encaixe em tempo real:** Yoga (flexbox em wasm) calcula as caixas; o canvas só desenha.
- **Mesmo motor nos dois lados:** no navegador para você editar, e sem tela (Node com canvas) para o
  agente renderizar e medir. Assim o que o agente vê é o que você vê.
- **Saída:** PSD, PNG, WebP e SVG, como hoje.

## 5. Os agentes (a "equipe de design")

- **Diretor de arte:** lê o grafo da referência e a ficha da marca, faz o plano (que parte vem de onde).
- **Especialistas:** tipógrafo, ilustrador de elementos, ilustrador do mascote, cenarista. Cada um só
  mexe na sua oficina.
- **Crítico:** mede cada parte e o todo contra a referência (o delta < 10 e o QA atual) e devolve só a
  parte que errou, em vez de refazer tudo.
- **Bibliotecário:** depois da aprovação, guarda o que foi criado no banco "criados".

---

## O que reaproveitamos e o que é novo

| Reaproveita | Novo |
|---|---|
| gateway-imagem como motor de IA (sem mudança) | banco de referências + busca por similaridade |
| desconstrução em grafos e recortes | documento de cena JSON |
| fichas de marca | canvas (Fabric + Yoga), editor e renderizador |
| loop de medição e QA (delta < 10) | oficinas separadas por tipo de parte |
| PhotoCraft | ArtCraft (VectorCraft), depois da prova |

## Ordem sugerida

1. Documento de cena + canvas mínimo + oficina de texto (ganho imediato: texto perfeito, editável).
2. Banco "criados" com os assets que já temos (moedas, Telegram, mascote A) + busca.
3. Oficina de elementos (reusa ou gera, vetoriza, guarda).
4. Banco "referências" alimentado pela desconstrução + consulta por nó.
5. Mascote em partes e personagem travado.
6. Agentes orquestrando tudo e editor no navegador para você ajustar.
