# Banco de referências (fase 2)

O designer não projeta do vácuo: antes de criar uma parte, o agente consulta o banco e parte do que já existe.

## Três fontes

| Fonte | O que tem hoje | Licença | Como entra na peça |
|---|---|---|---|
| `criados` | camadas que já fizemos (moedas, ícones do Telegram, avião, mascotes, fundos, logos) | nossa | reusa e varia |
| `referencias` | os 13 banners da 9pmbet e os recortes dos grafos | só referência | guia de forma; nunca entra na peça final |
| `publicos` | Openclipart 0.18 (~7,4 mil vetores), exemplos do VectorCraft, ícones de marca (Simple Icons) | CC0 / MIT-Apache | abre no VectorCraft e adapta ao estilo da ficha |

Todo item guarda a licença e a origem; item sem licença não entra. O SVG Repo fica para depois: a licença lá muda
de item para item e o site limita o acesso automático.

## Onde fica

Fora do git, em `BANCO_DIR` (padrão `/mnt/project-files/banco`), porque tem recortes de concorrentes:

```
itens/<fonte>/<id>/original.<ext>   o arquivo como veio
itens/<fonte>/<id>/miniatura.png    256 px, fundo transparente
indice.jsonl                        metadados, um item por linha
vetores.f32                         embedding visual (CLIP) de cada item
forma.f32                           silhueta de cada item
```

Não tem banco de dados: o índice cabe na memória e a busca é força bruta, o que basta para dezenas de milhares de
itens e funciona bem numa pasta de rede.

## Como a busca compara

- **Visual (CLIP ViT-B/32, quantizado, CPU):** o que o objeto é. A mesma régua mede imagens e textos, então dá para
  buscar por um recorte ou por uma descrição. O CLIP entende melhor descrições em inglês ("gold coin").
- **Forma:** a silhueta do objeto recortado numa grade 16x16, mais a proporção. Pega objetos de mesmo contorno
  mesmo com cor e estilo diferentes. Sem transparência, o objeto é separado do fundo pela cor das bordas.
- Consulta por imagem usa 80% visual e 20% forma; por texto, só o visual.

Vetores (SVG, `.vectorcraft`, PDF) são rasterizados pelo VectorCraft (`vectorcraft-cli convert`). Sem ele, SVG cai
no rasterizador do sharp.

## Comandos

```bash
export VECTORCRAFT_CLI=/caminho/vectorcraft-cli     # release Linux do VectorCraft 0.9.0
npm run banco -- resumo
npm run banco -- buscar --texto "gold coin" --fontes publicos --prancha moedas.png
npm run banco -- buscar --imagem recorte.png --k 10
npm run banco -- buscar --cena exemplos/capivara362-home-vip/cena.json --no logo
npm run banco -- importar criados <pasta> --prefixo nome
npm run banco -- importar referencias <pasta> --prefixo nome
npm run banco -- importar openclipart <pasta-svg> [--categorias shapes,animals] [--limite 100]
npm run banco -- importar vectorcraft <pasta-examples>
npm run banco -- importar marcas telegram,whatsapp
```

`--prancha` grava uma folha com a consulta e os resultados (fonte, licença e nota), para o agente e para você
olharem. `--json` devolve os resultados para outro programa.

## De onde vêm os públicos

- Openclipart: o site não respondia em 15/10/2026; usamos o pacote `openclipart-svg` 0.18 do Debian
  (`deb.debian.org/debian/pool/main/o/openclipart/`), que é o acervo em domínio público.
- VectorCraft: `examples/` do repositório `storytold/vectorcraft` e a release `vectorcraft-0.9.0-linux-x86_64`.
- Ícones de marca: pacote `simple-icons@13.0.0` pelo jsDelivr, pintados na cor oficial.

## Próximo passo

A fase 3 (oficina de elementos) usa a busca para decidir: reusar um criado, adaptar um público no VectorCraft ou,
só se nada servir, gerar a matéria-prima pelo gateway.
