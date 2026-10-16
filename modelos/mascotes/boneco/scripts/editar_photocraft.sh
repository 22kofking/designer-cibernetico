#!/bin/sh
# Tratamento das composições da IA no PhotoCraft (CLI, sem custo): suaviza o pelo, reforça o traço,
# vibrance e contraste como camadas de ajuste (editáveis no PSD).
# Uso: editar_photocraft.sh <entrada.png> <saida.psd>
# Precisa do photocraft-cli: git clone https://github.com/storytold/photocraft && cargo build --release -p photocraft-cli
# (~8 min em 4 núcleos). Defina PHOTOCRAFT_CLI com o caminho do binário.
B=${PHOTOCRAFT_CLI:-photocraft-cli}
"$B" run "$1" \
  --cmd filter.blur.surfaceBlur --params '{"radius":4,"threshold":18}' \
  --cmd filter.sharpen.unsharpMask --params '{"amount":120,"radius":1.2,"threshold":2}' \
  --cmd layer.newAdjustmentLayer.vibrance --params '{"vibrance":25,"saturation":8}' \
  --cmd layer.newAdjustmentLayer.brightnessContrast --params '{"brightness":0,"contrast":18}' \
  --out "$2"
"$B" convert "$2" "${2%.psd}.png"
