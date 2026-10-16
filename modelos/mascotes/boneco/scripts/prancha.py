"""Monta todas as receitas pedidas e faz uma prancha por bicho e figurino.
Uso: python3 prancha.py <bicho> <figurino|base> [...]   (pares)"""
import sys, os
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from montar import montar, RAIZ
POSES = ["frente", "aponta", "ergue", "punho", "abertos", "segura", "celular"]
args = sys.argv[1:]
for bicho, fig in zip(args[::2], args[1::2]):
    imgs = [montar(bicho, p, None if fig == "base" else fig) for p in POSES]
    w, h = 384, 512
    pr = Image.new("RGB", (w * 7, h + 40), (238, 238, 238))
    d = ImageDraw.Draw(pr)
    try: fnt = ImageFont.truetype("DejaVuSans-Bold.ttf", 22)
    except Exception: fnt = None
    for i, (p, im) in enumerate(zip(POSES, imgs)):
        bg = Image.new("RGBA", im.size, (238, 238, 238, 255)); bg.alpha_composite(im)
        pr.paste(bg.convert("RGB").resize((w, h), Image.LANCZOS), (i * w, 40))
        d.text((i * w + 12, 8), p, fill=(30, 30, 30), font=fnt)
    os.makedirs(f"{RAIZ}/pranchas", exist_ok=True)
    pr.save(f"{RAIZ}/pranchas/{bicho}-{fig}.jpg", quality=88)
    print("ok", bicho, fig)
