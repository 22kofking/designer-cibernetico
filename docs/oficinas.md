# Oficinas

## Oficina de elementos (fase 3)

Faz uma peça solta (moeda, avião de papel, raio, coroa...) **sem partir do vazio**, na ordem em que um designer faria:

1. **Reusar**: se já criamos algo quase igual (fonte `criados`), usa como está.
2. **Adaptar**: se há um vetor parecido (nosso ou público, SVG ou `.vectorcraft`), leva para o estilo da ficha no VectorCraft:
   lê as cores (`recolor.colors`), troca pela paleta seguindo a luz (o tom mais escuro vira o mais escuro da paleta; preto e
   branco de contorno e brilho ficam), põe o contorno de silhueta por fora (`edit.duplicate` + `object.pathfinder.unite` +
   `stroke.set align:outside` + `object.arrange.sendToBack`) e ajusta a prancheta (`artboard.fitToArt`).
3. **Gerar**: só com `--gerar --teto US$`. Pede matéria-prima chapada ao gateway-imagem (fundo cinza liso, sem texto),
   tira o fundo, apaga sujeira solta, vetoriza (`imageTrace.makeAndExpand`, poucas cores) e adapta como no passo 2.
4. Se nada cabe, devolve os **candidatos** (prancha) para alguém escolher com `--escolher id`.

Referências estudadas (`referencias`) servem para consultar, nunca entram na peça.

O que sai vira item `criados` no banco, com a licença derivada (`nossa (derivada de <base>: <licença>)`) e a cadeia de
origem (base, estilo e passos do VectorCraft). Na próxima vez, o passo 1 já acha.

### Uso

```bash
export VECTORCRAFT_CLI=/caminho/vectorcraft-cli
# por descrição (o CLIP entende melhor inglês)
npm run oficina -- elemento --nome moedas --texto "stack of gold coins" \
  --paleta "#f0b03a,#e5682d,#aa251c,#fef60a" --contorno "#120804:8"
# a partir de um nó da cena, trocando o desenho dele (grava cena-oficina.json ao lado)
npm run oficina -- elemento --nome moedas --cena exemplos/capivara362-home-vip/cena.json --no frente \
  --escolher signs-and-symbols-money-gold-coins-in-a-stack-jo-01 --paleta ... --trocar
# raster nosso pronto (camada exportada): só vetoriza e adapta
npm run oficina -- elemento --nome aviao --raster camada.png --cores 4 --paleta ...
# gerar pelo gateway (precisa de GATEWAY_URL e GATEWAY_CHAVE no ambiente)
npm run oficina -- elemento --nome coroa --texto "golden crown" --gerar --teto 0.01 --paleta ...
```

Saída (padrão `saidas/oficina/<nome>/`, fora do git): `resultado.svg`, `resultado.png`, `relatorio.json` (candidatos com
nota, decisão e motivo, mapa de cores, passos, gasto) e `prancha.png` (pedido, 3 candidatos com a base marcada, resultado).
`--nao-guardar` não grava no banco.

### Notas de corte

| Consulta | Reusar | Adaptar |
|---|---|---|
| imagem (CLIP + silhueta) | 0,92 | 0,82 |
| texto (CLIP + 0,02 por palavra da descrição no título ou nas tags) | 0,34 | 0,30 |

Calibradas com moedas, avião de papel, raio e coroa: os três primeiros acham vetor no Openclipart; a coroa não (o mais
parecido é um troféu, 0,29) e vai para gerar.
