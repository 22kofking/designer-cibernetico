# Equipe de agentes (fase 6)

A equipe recria uma peça de referência com a nossa marca, parte por parte, sem gastar gateway: o material vem do banco
(criados e públicos) e das montagens do mascote.

```bash
npm run peca -- produzir <grafo.json> [mais grafos...] [--marca marcas/capivara362.json] [--rodadas 8] [--saida pasta]
npm run peca -- guardar /mnt/project-files/pecas/capivara362/promo-vip --aprovado-por Nicolas
```

Para usar a oficina do VectorCraft (recolorir vetores), defina `VECTORCRAFT_CLI`.

## Quem faz o quê

| Agente | Código | O que faz |
| --- | --- | --- |
| Diretor de arte | `src/agentes/diretor.js` | Lê o grafo e a marca, consulta o banco parte por parte (plano da fase 4), monta o molde e dá a cada especialista a sua parte com as opções em ordem de preferência. |
| Cenarista | `src/agentes/especialistas.js` | Fundo do banco ou gradiente com a paleta medida. |
| Ilustrador de elementos | `src/agentes/especialistas.js` | Material do banco. Um vetor também pode ir para o VectorCraft, recolorido com as cores da parte na referência. |
| Ilustrador do mascote | `src/agentes/especialistas.js` | Mascote em partes da marca para o tema (a montagem já traz o objeto na mão). Mascotes de outro tema ficam só como rascunho. |
| Tipógrafo | `src/agentes/especialistas.js` | Escreve os textos da marca no layout medido (linhas, pesos, vão). |
| Crítico | `src/agentes/critico.js` | Renderiza como o editor e mede cada parte contra a referência, conferindo também as regras da ficha. |
| Bibliotecário | `src/agentes/bibliotecario.js` | Guarda a peça no banco (criados), só com a aprovação do dono. |

O orquestrador (`src/agentes/orquestrador.js`) segue estes passos:
1. Cada especialista entra com a opção preferida.
2. O crítico mede.
3. Só a parte que errou volta para o especialista dela, que tenta a próxima opção.
4. No fim, cada parte fica com a opção que passou. Se nenhuma passou, fica a preferida do diretor, porque a régua de cor
   não sabe o que o objeto é.

## O crítico

- **Régua de cor:** `src/qualidade/cor.js` faz paletas ponderadas (k-médias em Lab) e mede o ΔE2000 nos dois sentidos.
  "Parecido" é ΔE < 10, como no loop de medição do gera-o-de-imagem-.
  - A peça antiga do gateway contra a referência dá ~9.
  - Duas referências da mesma campanha dão de 8 a 11.
  - Moedas de duas referências diferentes dão de 5 a 8.
- **Elementos:** o nosso desenho é comparado com a parte recortada da referência pela máscara do grafo. A caixa inteira
  misturaria o fundo e o mascote.
- **Fundo, texto e mascote:** comparados pela região da caixa. No mascote, a cor é só aviso, porque ele é o nosso de
  propósito. Mascote com figurino de outro tema reprova.
- **Texto:** a letra não pode ficar abaixo de 70% da altura da letra da referência.
- **Regras da ficha** (`critico` em `marcas/<marca>.json`, vindas do `qa` da ficha-v1.0):
  - luz mediana entre 45 e 150;
  - esquerda mais escura que o centro;
  - ouro presente (≥ 1%);
  - peça inteira com ΔE < 10.
- **Recortes:** o QA de cada camada do mascote (fase 5) entra na conta.
- **Material da referência:** nunca entra na peça. Se entrar, reprova.

Limite conhecido: a régua mede cor, não o que o objeto é. Envelopes vermelhos com moedas medem 9 contra moedas de ouro.
Por isso, a ordem das opções vem do diretor, pela busca no banco.

## A marca

`marcas/capivara362.json` traz:
- logo e personagem;
- as montagens do mascote por tema;
- os textos por tema;
- as regras do crítico.

Tema novo pede textos novos e, de preferência, uma montagem do mascote naquele figurino. Sem montagem, o crítico manda
gerar a pose (`npm run mascote -- pose --tema ...`, que gasta gateway).

## Saída

Cada peça vai para `/mnt/project-files/pecas/<marca>/<peça>/` com estes arquivos:
- `cena.json`: abre no editor e renderiza igual;
- `previa.png` e `previa.webp`;
- `rodada-1.png`;
- `relatorio.json`: partes, opção escolhida, ΔE, problemas, pendentes, notas e histórico das rodadas;
- `prancha.png`: referência, rodada 1 e final.

## Primeiras 3 peças (CAPIVARA362)

| Peça | ΔE da peça | O que falta |
| --- | --- | --- |
| home Telegram | 8,6 | As moedas medem 11,1. Os ícones foram de 34 para 4,7 com o avião recolorido no VectorCraft. |
| home envelopes | 7,8 | Falta a pose do mascote no figurino "sorte" com o envelope (gateway). O envelope vermelho mede 16,4 pela régua de cor. |
| promo VIP | 7,2 | O medalhão e as moedas medem 10,9 e 10,7. O mascote faraó em partes passou. |
