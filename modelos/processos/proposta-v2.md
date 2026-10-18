# Nova estrutura: o designer cibernético (proposta v2, 2026-10-14)

A ideia central: o sistema não "gera imagem". Ele faz o que um designer faz com uma referência:
**entender → consultar → construir cada parte com a ferramenta certa → montar → conferir**.
E tudo que ele constrói vira material reutilizável.

---

## 1. Entender (já temos a base)

A desconstrução em grafos que já existe vira o ponto de partida de tudo. Cada peça de referência sai como
um **grafo de cena**: um nó por parte (fundo, texto, mascote, cada elemento), com caixa delimitadora
(posição, escala, rotação), ordem de camada, papel na composição e paleta.

## 2. Consultar: o banco de referências

Três fontes, todas consultadas pela mesma busca:

| Coleção | O que guarda | Licença / onde fica |
|---|---|---|
| **Criados** | tudo que nós fizemos e foi aprovado (moedas, ícones, mascotes, fundos, textos), versionado | nosso; privado |
| **Referências estudadas** | recortes dos banners analisados (concorrentes, inspirações) | só como guia de forma, nunca entra na peça; privado |
| **Públicos** | bibliotecas abertas de vetor, importadas com a licença de cada item | ver abaixo |

Bibliotecas públicas para importar:
- **Openclipart:** tudo em CC0 (domínio público), uso comercial livre.
- **SVG Repo:** mais de 500 mil vetores, mas a licença é por item. A importação só aceita os itens com licença comercial aberta (CC0, MIT, Apache etc.) e guarda a licença e o link de origem de cada um.
- **Exemplos do VectorCraft:** arquivos `.vectorcraft` da pasta `examples/` (MIT ou Apache; os assets embutidos seguem o `ASSETS.md`). Servem também como modelo de como a ferramenta estrutura um desenho.
- **Ícones de marca** (Telegram, WhatsApp etc.): conjuntos de logos oficiais em SVG, como Simple Icons, em vez de gerar com IA.

Cada item guarda: o arquivo original (SVG ou `.vectorcraft`), uma renderização em PNG, metadados (tipo, estilo, marca, origem, **licença**), e um **vetor de busca** (embedding visual, tipo CLIP/SigLIP, mais um descritor de forma). Item sem licença registrada não entra no banco.

Vantagem dos públicos serem vetor: o agente não recebe só uma imagem parecida, recebe a **estrutura** (caminhos, nós, camadas), que abre direto no VectorCraft para ser variada.

A consulta: para cada nó decomposto da referência, o agente busca os mais parecidos nas três fontes.
- Achou um **criado** parecido? Reusa e só varia (cor, pose, rotação).
- Achou um vetor **público** parecido? Abre no VectorCraft e adapta ao estilo da ficha.
- Achou só **referências estudadas**? Usa como guia de forma para construir (nunca cola o recorte do concorrente).
- Não achou nada? Aí sim gera do zero, mas com o grafo como guia.

É exatamente o "designer não projeta do vácuo". Tecnologia sugerida: Postgres com pgvector (ou LanceDB
para começar mais simples), arquivos no bucket que o gateway já usa.

## 3. Construir: cada parte tem sua oficina

Respondendo sua pergunta: **não**, as partes não devem ser feitas pela mesma estrutura.

| Parte | Como um designer faz | Como o sistema faz | IA entra? |
|---|---|---|---|
| **Texto / tipografia** | escolhe fonte, ajusta peso, kerning, encaixa na caixa | 100% código: fontes reais, encaixe por regras (Yoga), efeitos como parâmetros | só o LLM escolhendo fonte e hierarquia dentro do catálogo. A IA nunca desenha letra |
| **Elementos** (moedas, raios, avião, ícones) | pega um asset da biblioteca ou desenha no Illustrator | 1º reusa do banco; senão gera matéria-prima pelo Comfy (fundo liso), vetoriza e limpa no VectorCraft, e salva como asset paramétrico | só para a matéria-prima. Ícones de marca (Telegram etc.) vêm do SVG oficial |
| **Mascote** | tem uma folha de personagem e desenha poses | personagem travado (folha do padrão A, depois LoRA ou IP-Adapter), poses por demanda pela IA, depois separado em partes (corpo, braço, objeto na mão) no PhotoCraft | sim, mas preso ao personagem |
| **Fundo** | gradiente, textura, luz | procedural quando a forma é simples (gradiente, raios, faíscas); img2img guiado pela referência quando é cena | às vezes |

A regra que vale para todas: **a IA produz matéria-prima, o agente transforma em material** com a
ferramenta certa, sempre conferindo contra a referência com o delta < 10.

### A suíte ArtCraft como bancada de ferramentas (confirmado)

Li a documentação. A suíte é open source (MIT ou Apache), em Rust, roda em desktop e no navegador (WebAssembly), e cada app funciona sozinho:

| App | Papel no projeto | Controle por agente |
|---|---|---|
| **VectorCraft** | oficina de elementos e tipografia vetorial: caneta, Pathfinder, Shape Builder, blends, gradient mesh, envelope distort, texto com estilos. Abre e salva SVG, PDF e `.ai` compatível; formato próprio `.vectorcraft` em JSON | servidor MCP (`vectorcraft-cli mcp`), canal de controle JSON e execução sem tela (`vectorcraft-cli run`) |
| **PhotoCraft** | oficina raster: limpar e separar o mascote em partes, máscaras, PSD final | servidor MCP, CLI e canal de controle (já usamos a 0.7.0) |
| **ArtCraft (estúdio)** | estúdio de IA controlável: pose de personagem, recorte de fundo, composição 2D/3D. Candidato para as poses do mascote | a página não descreve API; conferir no repositório antes de ligar nos agentes |
| **DesignCraft** | diagramação; pode servir de referência para o editor de cena | não verificado |

Ponto de atenção: a suíte se declara em alfa (o VectorCraft estima ~88% do Illustrator e ainda não tem scripting próprio nem IA generativa embutida). Como o controle é por MCP, isso não nos bloqueia: a IA vem do gateway, e o VectorCraft entra como a mão que desenha com precisão.

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
| | importador das bibliotecas públicas com controle de licença |
| fichas de marca | canvas (Fabric + Yoga), editor e renderizador |
| loop de medição e QA (delta < 10) | oficinas separadas por tipo de parte |
| PhotoCraft | VectorCraft e estúdio ArtCraft via MCP |

## Ordem sugerida

1. Documento de cena + canvas mínimo + oficina de texto (ganho imediato: texto perfeito, editável).
2. Banco com os assets que já temos (moedas, Telegram, mascote A) + Openclipart + exemplos do VectorCraft + busca. SVG Repo entra com o filtro de licença.
3. Oficina de elementos no VectorCraft via MCP (reusa, adapta ou gera, vetoriza, guarda).
4. Banco "referências" alimentado pela desconstrução + consulta por nó.
5. Mascote em partes e personagem travado.
6. Agentes orquestrando tudo e editor no navegador para você ajustar.
