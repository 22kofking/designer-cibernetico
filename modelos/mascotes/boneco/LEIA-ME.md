# Boneco padrão: fases B1 e B2 (16/10/2026, custo zero, tudo em CPU)

Protótipo da arquitetura em `/mnt/project-files/estrutura/arquitetura-mascotes.md`.
O bicho é a única variável: esqueleto, poses e figurino são os mesmos arquivos para todos.

## O que tem aqui
- `modelo/esqueleto.json`: enquadramento fixo 768x1024 (topo da cabeça y 250, pés y 950, centro x 384),
  articulações, ossos, ordem das camadas e encaixes de figurino.
- `modelo/poses/*.json`: as 7 poses (frente, aponta, ergue, punho, abertos, segura, celular) como ângulos de osso.
- `bichos/<bicho>/`: `articulacoes-origem.json` (18 pontos marcados uma vez no desenho), `kit.json`,
  `partes/*.png` (cabeça, tronco, 2 pernas, 2 braços, 2 antebraços) e `mapa-partes.png` (conferência do corte).
  Prontos: capivara e onça.
- `figurinos/farao/`: `manequim.json` (pontos do manequim e caixas das peças), `encaixes.json` e `pecas/*.png`
  (toucado, barba, colar, cinto com avental, 2 braceletes, braçadeira).
- `pecas/<bicho>-<figurino>-<pose>/`: `montagem.png`, `montagem.psd` (uma camada por parte, peça do figurino logo
  acima da parte em que está presa) e `receita.json`. 28 peças: 2 bichos x (base e faraó) x 7 poses.
- `pranchas/`: uma prancha por bicho e figurino e `resumo-b1-b2.jpg` com as quatro.

## Como rodar
```
python3 scripts/cortar_bicho.py capivara          # kit do bicho
python3 scripts/cortar_figurino.py farao          # peças do figurino
python3 scripts/montar.py onca ergue farao        # uma peça
python3 scripts/prancha.py capivara base onca farao   # pranchas (pares bicho figurino)
```
Precisa de numpy, scipy e Pillow; para o PSD, node com `ag-psd` e `pngjs` (`npm i ag-psd pngjs` e apontar
`BONECO_NODE_MODULES` para a pasta node_modules).

## Editar
Uma parte editada no PhotoCraft (ex.: `bichos/onca/partes/cabeca.png`, salva com o mesmo nome e tamanho) entra em
todas as poses na próxima montagem. Rodar `cortar_bicho.py` de novo sobrescreve as partes.

## Limites conhecidos
- Mãos: não há biblioteca de formas de mão; toda pose usa o punho do desenho original (o "aponta" não aponta).
- Emendas: ombro e cotovelo têm cara de boneco de recorte (contorno desenhado no corte). A fase B3 (acabamento por IA)
  é que deixa contínuo.
- Toucado e barba esticados pela largura da cabeça; as orelhas do bicho aparecem por cima ou pelos lados.
- O manequim do faraó é magro e alto; o cinto e o colar são esticados para os bichos fortes e podem ficar altos ou curtos.
- Só vista de frente. 3/4, perfil e costas pedem partes próprias.
