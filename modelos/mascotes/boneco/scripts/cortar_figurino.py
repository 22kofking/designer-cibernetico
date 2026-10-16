"""Figurinista (fase B2): corta um figurino vestido no manequim em peças presas aos encaixes do esqueleto.

Uso: python3 cortar_figurino.py farao
Lê figurinos/<x>/manequim.json (origem, pontos do manequim, medidas e as caixas de cada peça).
Saída: figurinos/<x>/pecas/*.png (no enquadramento do manequim) e figurinos/<x>/encaixes.json.

Cada peça diz em que osso ela se prende ("osso"), por qual ponto ela se alinha ("ancora") e qual medida
do corpo define a largura dela ("largura"). Assim a mesma peça serve em qualquer bicho: o montador
estica a peça da medida do manequim para a medida do bicho e gira junto com o osso.
"""
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def poligono(shape, pts):
    im = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=1)
    return np.array(im).astype(bool)


def caixa(shape, c):
    m = np.zeros(shape, bool)
    x0, y0, x1, y1 = c
    m[y0:y1, x0:x1] = True
    return m


def main(nome):
    pasta = f"{RAIZ}/figurinos/{nome}"
    cfg = json.load(open(f"{pasta}/manequim.json"))
    src = np.array(Image.open(cfg["origem"]).convert("RGB")).astype(np.float32) / 255
    shp = src.shape[:2]
    mx, mn = src.max(2), src.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    colorido = (sat > 0.30) & (mx > 0.25)
    colorido = ndi.binary_closing(colorido, np.ones((5, 5)))
    escuro = mx < 0.30
    perto = ndi.distance_transform_edt(~colorido) <= 6
    tecido = colorido | (escuro & perto)
    pele = (sat < 0.15) & (mx > 0.75)

    os.makedirs(f"{pasta}/pecas", exist_ok=True)
    rgba = np.dstack([(src * 255).astype(np.uint8), np.zeros(shp, np.uint8)])
    encaixes = {}
    for p, d in cfg["pecas"].items():
        area = np.zeros(shp, bool)
        for c in d.get("caixas", []):
            area |= caixa(shp, c)
        for pol in d.get("poligonos", []):
            area |= poligono(shp, pol)
        for c in d.get("tirar_caixas", []):
            area &= ~caixa(shp, c)
        for pol in d.get("tirar_poligonos", []):
            area &= ~poligono(shp, pol)
        m = area & (tecido if d.get("mascara", "tecido") == "tecido" else ~pele)
        m = ndi.binary_fill_holes(ndi.binary_opening(m, np.ones((2, 2))))
        lab, n = ndi.label(m)
        if n:  # tira fiapos soltos
            tam = ndi.sum(m, lab, range(1, n + 1))
            m = np.isin(lab, 1 + np.nonzero(tam >= 60)[0])
        out = rgba.copy()
        out[..., 3] = (ndi.gaussian_filter(m.astype(np.float32), 0.6) * 255).clip(0, 255).astype(np.uint8)
        Image.fromarray(out, "RGBA").save(f"{pasta}/pecas/{p}.png")
        encaixes[p] = {k: d[k] for k in ("osso", "ancora", "largura", "camada_acima_de")}
        encaixes[p]["png"] = f"pecas/{p}.png"
        print(p, int(m.sum()), "px")
    json.dump({"_leia": "Peças do figurino por encaixe. Pontos e medidas são do manequim; o montador leva cada peça "
                        "para o bicho pela âncora, pelo comprimento do osso e pela largura indicada.",
               "figurino": nome, "pontos": cfg["pontos"], "medidas": cfg["medidas"], "pecas": encaixes},
              open(f"{pasta}/encaixes.json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
