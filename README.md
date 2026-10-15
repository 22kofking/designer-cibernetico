# designer-cibernetico

Agentes que fazem o que um designer faz com uma referência: **entender, consultar, construir cada parte com a
ferramenta certa, montar e conferir**. Tudo que é criado vira material reutilizável.

A estrutura completa (banco de referências, oficinas por parte, suíte ArtCraft, agentes) está em
[docs/estrutura.md](docs/estrutura.md). Fases prontas: **1** (documento de cena, canvas e oficina de texto), **2** (banco de
referências com busca por parecidos, ver [docs/banco.md](docs/banco.md)) **3** (oficina de elementos, ver
[docs/oficinas.md](docs/oficinas.md)) e **4** (desconstrução alimentando o banco, consulta por parte e molde de cena, ver
[docs/desconstrucao.md](docs/desconstrucao.md)) e **5** (personagem travado e mascote em partes, ver [docs/mascote.md](docs/mascote.md)).

## O que já funciona

| Peça | Onde | O que faz |
|---|---|---|
| Documento de cena | [docs/cena.md](docs/cena.md), [esquemas/cena.schema.json](esquemas/cena.schema.json) | JSON único com cada camada: papel, caixa em frações, encaixe, origem e licença |
| Núcleo | `src/nucleo/` | roda igual no Node e no navegador: encaixe de caixas, Yoga (flexbox em wasm), oficina de texto e desenho com Fabric.js |
| Oficina de texto | `src/nucleo/texto.js` | encaixa as linhas na caixa com fonte real; cada linha tem um peso (a palavra-chave de peso 4 sai 4x maior); a IA nunca desenha letra |
| Renderizador sem tela | `src/node/` | o agente vê e mede exatamente o que o editor mostra; exporta PNG e WebP |
| Banco de referências | `src/banco/`, [docs/banco.md](docs/banco.md) | criados, referências e públicos com licença; busca por imagem, texto ou nó da cena (CLIP + silhueta); prancha de resultados |
| Oficina de elementos | `src/oficinas/`, [docs/oficinas.md](docs/oficinas.md) | reusa o que já temos, adapta um vetor parecido no VectorCraft (paleta e contorno da ficha) ou gera matéria-prima pelo gateway com teto e vetoriza; guarda o resultado no banco e troca o nó na cena |
| Desconstrução → banco → molde | `src/desconstrucao/`, [docs/desconstrucao.md](docs/desconstrucao.md) | lê o grafo de uma referência, guarda cada parte no banco, consulta o banco parte por parte e monta um molde de cena com o layout dela e o nosso material |
| Mascote | `src/mascote/`, `personagens/`, [docs/mascote.md](docs/mascote.md) | ficha do personagem (prompt, figurinos, temas, folha), conferência "parece o personagem e não é infantil", separação em partes por pontos (SlimSAM em CPU) com QA do recorte e remendo, fundo tirado com BiRefNet, troca de parte na cena |
| Mesa de Cena | `editor/` | editor no navegador: camadas, arrastar, escalar, girar, editar o texto, salvar a cena e exportar PNG |

## Como usar

```bash
npm install
npm test                                               # testes do núcleo e do renderizador
npm run validar -- exemplos/capivara362-home-vip/cena.json
npm run render  -- exemplos/capivara362-home-vip/cena.json --saida saida/
npm run editor                                         # abre em http://localhost:5173/editor/
npm run banco -- buscar --texto "gold coin" --prancha moedas.png
npm run oficina -- elemento --nome moedas --texto "stack of gold coins" \
  --paleta "#f0b03a,#e5682d,#aa251c,#fef60a" --contorno "#120804:8"   # precisa do vectorcraft-cli (VECTORCRAFT_CLI)
npm run desconstruir -- molde grafos/promo-vip.json --logo nosso-logo.png
npm run mascote -- partes personagens/capivara362-a/montagens/mago.json
```

O exemplo `exemplos/capivara362-home-vip/` é o banner home VIP da CAPIVARA362 (padrão 9pmbet, mascote estilo A),
montado a partir das camadas geradas pelo gateway-imagem.

## Regras do repositório

- Gasto com IA (gateway-imagem) só com autorização do dono, sempre com teto.
- Recortes de banners de concorrentes não entram no git: ficam no banco de referências, fora do repositório.
- Todo material de biblioteca pública entra com a licença registrada no campo `origem` da cena.
- Fonte padrão: Montserrat Black (SIL Open Font License, `assets/fontes/OFL.txt`).
