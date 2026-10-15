# designer-cibernetico

Agentes que fazem o que um designer faz com uma referência: **entender, consultar, construir cada parte com a
ferramenta certa, montar e conferir**. Tudo que é criado vira material reutilizável.

A estrutura completa (banco de referências, oficinas por parte, suíte ArtCraft, agentes) está em
[docs/estrutura.md](docs/estrutura.md). Fases prontas: **1** (documento de cena, canvas e oficina de texto) e **2** (banco de
referências com busca por parecidos, ver [docs/banco.md](docs/banco.md)).

## O que já funciona

| Peça | Onde | O que faz |
|---|---|---|
| Documento de cena | [docs/cena.md](docs/cena.md), [esquemas/cena.schema.json](esquemas/cena.schema.json) | JSON único com cada camada: papel, caixa em frações, encaixe, origem e licença |
| Núcleo | `src/nucleo/` | roda igual no Node e no navegador: encaixe de caixas, Yoga (flexbox em wasm), oficina de texto e desenho com Fabric.js |
| Oficina de texto | `src/nucleo/texto.js` | encaixa as linhas na caixa com fonte real; cada linha tem um peso (a palavra-chave de peso 4 sai 4x maior); a IA nunca desenha letra |
| Renderizador sem tela | `src/node/` | o agente vê e mede exatamente o que o editor mostra; exporta PNG e WebP |
| Banco de referências | `src/banco/`, [docs/banco.md](docs/banco.md) | criados, referências e públicos com licença; busca por imagem, texto ou nó da cena (CLIP + silhueta); prancha de resultados |
| Mesa de Cena | `editor/` | editor no navegador: camadas, arrastar, escalar, girar, editar o texto, salvar a cena e exportar PNG |

## Como usar

```bash
npm install
npm test                                               # testes do núcleo e do renderizador
npm run validar -- exemplos/capivara362-home-vip/cena.json
npm run render  -- exemplos/capivara362-home-vip/cena.json --saida saida/
npm run editor                                         # abre em http://localhost:5173/editor/
npm run banco -- buscar --texto "gold coin" --prancha moedas.png
```

O exemplo `exemplos/capivara362-home-vip/` é o banner home VIP da CAPIVARA362 (padrão 9pmbet, mascote estilo A),
montado a partir das camadas geradas pelo gateway-imagem.

## Regras do repositório

- Gasto com IA (gateway-imagem) só com autorização do dono, sempre com teto.
- Recortes de banners de concorrentes não entram no git: ficam no banco de referências, fora do repositório.
- Todo material de biblioteca pública entra com a licença registrada no campo `origem` da cena.
- Fonte padrão: Montserrat Black (SIL Open Font License, `assets/fontes/OFL.txt`).
