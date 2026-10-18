"""Composição por IA (fase B3): a IA redesenha a montagem do boneco como uma imagem só, no estilo A.

A montagem por código (pecas/<bicho>-<figurino>-<pose>/montagem.png) é o norte: ela fixa bicho, figurino,
pose e enquadramento. A IA (Z-Image Turbo, Public Endpoint da RunPod, img2img) refaz traço, juntas e mãos
por cima dela. A força ("strength") diz quanto a IA pode mudar: baixa segue a montagem, alta inventa mais.

Uso: RUNPOD_API_KEY=... python3 compor_ia.py --teto 0.25 capivara base farao
Saída: composicao/<bicho>-<figurino>-<pose>-f<forca>.png, gasto.json e prancha por figurino.
Custo: US$ 0,005 por imagem (preço do endpoint). Para antes de passar do teto.
"""
import argparse, base64, io, json, os, sys, time, urllib.request
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSES = ["frente", "aponta", "ergue", "punho", "abertos", "segura", "celular"]
ACOES = {"frente": "standing relaxed", "aponta": "pointing at the viewer", "ergue": "one arm raised high",
         "punho": "raising a fist in victory", "abertos": "arms wide open presenting",
         "segura": "both hands together in front of the chest", "celular": "holding up a smartphone"}
FIGURINO = {"base": "grey tank top and dark grey shorts",
            "farao": "egyptian pharaoh costume: blue and gold striped nemes headdress, gold collar, "
                     "gold belt with turquoise apron, gold bracelets"}
BICHO = {"capivara": "anthropomorphic adult capybara man, long blunt muzzle, brown fur, athletic human body",
         "onca": "anthropomorphic adult jaguar man, golden spotted fur, athletic human body"}
PRECO = 0.005


def data_uri(img):
    b = io.BytesIO(); img.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def chamar(entrada):
    chave = os.environ["RUNPOD_API_KEY"]
    h = {"Authorization": f"Bearer {chave}", "Content-Type": "application/json"}
    req = urllib.request.Request("https://api.runpod.ai/v2/z-image-turbo/runsync",
                                 data=json.dumps({"input": entrada}).encode(), headers=h)
    r = json.load(urllib.request.urlopen(req, timeout=600))
    while r.get("status") in ("IN_QUEUE", "IN_PROGRESS"):
        time.sleep(3)
        r = json.load(urllib.request.urlopen(urllib.request.Request(
            f"https://api.runpod.ai/v2/z-image-turbo/status/{r['id']}", headers=h), timeout=120))
    if r.get("status") != "COMPLETED":
        raise SystemExit(f"falhou: {json.dumps(r)[:400]}")
    out = r["output"]
    return out.get("result") or out.get("image_url"), float(out.get("cost", PRECO))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teto", type=float, required=True)
    ap.add_argument("--forcas", default="0.45,0.6")
    ap.add_argument("--semente", type=int, default=7)
    ap.add_argument("bicho")
    ap.add_argument("figurinos", nargs="+")
    a = ap.parse_args()
    forcas = [float(f) for f in a.forcas.split(",")]
    pedidos = [(f, p, s) for f in a.figurinos for p in POSES for s in forcas]
    previsto = len(pedidos) * PRECO
    print(f"{len(pedidos)} imagens, previsto US$ {previsto:.3f}, teto US$ {a.teto:.2f}")
    if previsto > a.teto:
        raise SystemExit("previsto passa do teto; reduza forças ou figurinos")
    pasta = f"{RAIZ}/composicao"; os.makedirs(pasta, exist_ok=True)
    gasto = 0.0
    for fig, pose, forca in pedidos:
        if gasto + PRECO > a.teto + 1e-9:
            print("teto atingido, parando"); break
        saida = f"{pasta}/{a.bicho}-{fig}-{pose}-f{int(forca * 100)}.png"
        if os.path.exists(saida):  # já gerada numa rodada anterior: não paga de novo
            continue
        base = Image.open(f"{RAIZ}/pecas/{a.bicho}-{fig}-{pose}/montagem.png").convert("RGBA")
        fundo = Image.new("RGBA", base.size, (238, 238, 238, 255)); fundo.alpha_composite(base)
        prompt = (f"estiloA, 2D comic illustration, thick black outlines, flat cel shading, {BICHO[a.bicho]}, "
                  f"dark sunglasses, big open grin, adult, not cute, wearing {FIGURINO[fig]}, full body, "
                  f"{ACOES[pose]}, clean anatomy, hands with fingers, light grey plain background")
        url, custo = chamar({"prompt": prompt, "image": data_uri(fundo.convert("RGB")), "strength": forca,
                             "size": f"{base.width}*{base.height}", "seed": a.semente})
        gasto += custo
        urllib.request.urlretrieve(url, saida)
        print(saida, f"US$ {custo}", flush=True)
    json.dump({"gasto_usd": round(gasto, 4), "imagens": len(pedidos), "teto_usd": a.teto},
              open(f"{pasta}/gasto-{a.bicho}.json", "w"))
    # prancha: linha 1 montagem, demais linhas uma por força
    for fig in a.figurinos:
        w, h = 256, 341
        pr = Image.new("RGB", (w * 7, h * (1 + len(forcas))), (238, 238, 238))
        for i, pose in enumerate(POSES):
            m = Image.open(f"{RAIZ}/pecas/{a.bicho}-{fig}-{pose}/montagem.png").convert("RGBA")
            bg = Image.new("RGBA", m.size, (238, 238, 238, 255)); bg.alpha_composite(m)
            pr.paste(bg.convert("RGB").resize((w, h)), (i * w, 0))
            for j, forca in enumerate(forcas):
                p = f"{pasta}/{a.bicho}-{fig}-{pose}-f{int(forca * 100)}.png"
                if os.path.exists(p):
                    pr.paste(Image.open(p).convert("RGB").resize((w, h)), (i * w, h * (j + 1)))
        pr.save(f"{pasta}/prancha-{a.bicho}-{fig}.jpg", quality=88)
    print(f"gasto total US$ {gasto:.3f}")


if __name__ == "__main__":
    main()
