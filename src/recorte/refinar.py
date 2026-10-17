# Refina a borda de um recorte por alpha matting (pymatting, closed-form) em cima da
# máscara dura do SAM: o miolo vale 1, o fora vale 0 e só uma faixa estreita é decidida
# pela imagem em resolução cheia. Entrada: imagem RGB, máscara 0/255, faixa em px.
# Saída: PNG RGBA com a cor do objeto já separada do fundo (sem halo).
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from pymatting import estimate_alpha_cf, estimate_foreground_ml

img_path, mask_path, out_path = sys.argv[1:4]
faixa = int(sys.argv[4]) if len(sys.argv) > 4 else 4
img = np.asarray(Image.open(img_path).convert('RGB'), dtype=np.float64) / 255.0
m = np.asarray(Image.open(mask_path).convert('L')) > 127
# borda da imagem não é borda do objeto: a máscara que encosta nela segue até lá
fg = ndi.binary_erosion(m, iterations=faixa, border_value=1)
bg = ~ndi.binary_dilation(m, iterations=faixa, border_value=0)
tri = np.full(m.shape, 0.5)
tri[fg] = 1.0
tri[bg] = 0.0
alpha = estimate_alpha_cf(img, tri)
alpha = np.clip(alpha, 0, 1)
alpha[fg] = 1.0
alpha[bg] = 0.0
fgc = np.clip(estimate_foreground_ml(img, alpha), 0, 1)
out = np.dstack([fgc, alpha])
Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(out_path)
