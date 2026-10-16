"""Tratamento por código das composições da IA (sem gasto), para deixar no padrão do estilo A.

Passos: 1) cola o fundo cinza liso; 2) reforça o contorno preto com borda por gradiente;
3) iguala as cores com um leve aumento de contraste e saturação; 4) suaviza o degradê dos cortes.
Uso: python3 tratar.py entrada.png saida.png
"""
import sys
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage as ndi

entrada, saida = sys.argv[1], sys.argv[2]
im = Image.open(entrada).convert("RGB")
a = np.array(im).astype(np.float32)

# 1 e 2: onde o gradiente é forte e o pixel é escuro, reforça o traço preto
gray = a.mean(2)
grad = np.hypot(ndi.sobel(gray, 0), ndi.sobel(gray, 1))
contorno = (grad > 120) & (gray < 90)
contorno = ndi.binary_dilation(contorno, iterations=1)
a[contorno] = a[contorno] * 0.35

out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

# 3: contraste e saturação leves para as cores ficarem uniformes
out = ImageEnhance.Contrast(out).enhance(1.06)
out = ImageEnhance.Color(out).enhance(1.08)

# 4: suavização leve só na cor (não no traço)
blur = out.filter(ImageFilter.MedianFilter(3))
mask = Image.fromarray(((ndi.sobel(gray, 0) ** 2 + ndi.sobel(gray, 1) ** 2) < 1e4).astype(np.uint8) * 255)
out = Image.composite(blur, out, mask)

out.save(saida)
print("ok", saida)
