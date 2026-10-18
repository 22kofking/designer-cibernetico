"""Montador (fases B1 e B2): monta uma peça a partir de uma receita {bicho, pose, figurino}, sem IA.

Uso: python3 montar.py <bicho> <pose> [figurino]        (figurino "base" ou ausente = sem figurino)
Saída: pecas/<bicho>-<figurino>-<pose>/montagem.png, montagem.psd (uma camada por parte) e receita.json.

O que faz:
- prende cada parte do kit do bicho no seu osso e gira braço e antebraço até os ângulos da pose;
- leva cada peça do figurino do manequim para o bicho (âncora, comprimento do osso e largura da medida)
  e gira junto com o osso em que ela está presa;
- empilha as camadas na ordem do esqueleto (peça do figurino logo acima da parte em que está presa).
"""
import json, sys, os, subprocess, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESQ = json.load(open(f"{RAIZ}/modelo/esqueleto.json"))
W, H = ESQ["enquadramento"]["tamanho"]
NODE_PATH = ":".join(filter(None, [os.environ.get("BONECO_NODE_MODULES", "/tmp/claude-0/-home-user/5cbeca93-d84f-507d-90c2-2d99eb356373/scratchpad/boneco/node_modules"), os.environ.get("NODE_PATH")]))


def rot(theta):
    c, s = np.cos(np.radians(theta)), np.sin(np.radians(theta))
    return np.array([[c, -s], [s, c]])


def afim(M, t):
    """matriz 3x3 a partir de M (2x2) e t"""
    A = np.eye(3); A[:2, :2] = M; A[:2, 2] = t
    return A


def gira_em(theta, pivo, destino=None):
    """gira em torno de pivo e leva o pivo para destino"""
    R = rot(theta)
    pivo = np.asarray(pivo, float)
    destino = pivo if destino is None else np.asarray(destino, float)
    return afim(R, destino - R @ pivo)


def aplica(img, F, tam=(W, H)):
    inv = np.linalg.inv(F)
    return img.transform(tam, Image.AFFINE, tuple(inv[:2].ravel()), resample=Image.BICUBIC)


def eixo(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    L = np.hypot(*d)
    u = d / L
    return u, np.array([-u[1], u[0]]), L


def pontos_osso(pts, osso):
    p, q = ESQ["ossos"][osso]
    return pts[p], pts[q]


def montar(bicho, pose, figurino=None):
    kit = json.load(open(f"{RAIZ}/bichos/{bicho}/kit.json"))
    P = json.load(open(f"{RAIZ}/modelo/poses/{pose}.json"))
    pts = {k: np.asarray(v, float) for k, v in kit["pontos"].items()}
    pts["cintura"] = np.array([pts["pescoco"][0], kit["medidas"]["cintura_y"]])
    rep = kit["angulos_repouso"]

    # transformação de cada osso na pose
    T = {o: np.eye(3) for o in ESQ["ossos"]}
    for lado in "de":
        ombro, cot = pts[f"ombro_{lado}"], pts[f"cotovelo_{lado}"]
        t1 = P["angulos"][f"braco_{lado}"] - rep[f"braco_{lado}"]
        T[f"braco_{lado}"] = gira_em(t1, ombro)
        novo_cot = ombro + rot(t1) @ (cot - ombro)
        t2 = P["angulos"][f"antebraco_{lado}"] - rep[f"antebraco_{lado}"]
        T[f"antebraco_{lado}"] = gira_em(t2, cot, novo_cot)
    osso_da_parte = {"cabeca": "cabeca", "tronco": "tronco", "perna_d": "coxa_d", "perna_e": "coxa_e",
                     "braco_d": "braco_d", "antebraco_d": "antebraco_d", "braco_e": "braco_e", "antebraco_e": "antebraco_e"}

    camadas = []
    # sombra no chão, feita por código
    som = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx, py = ESQ["enquadramento"]["centro_x"], ESQ["enquadramento"]["pes_y"]
    ImageDraw.Draw(som).ellipse([cx - 210, py - 22, cx + 210, py + 18], fill=(0, 0, 0, 70))
    camadas.append(("sombra", som.filter(ImageFilter.GaussianBlur(6)), None))

    pecas_fig = {}
    if figurino:
        F = json.load(open(f"{RAIZ}/figurinos/{figurino}/encaixes.json"))
        mpts = {k: np.asarray(v, float) for k, v in F["pontos"].items()}
        for nome, d in F["pecas"].items():
            osso = d["osso"]
            am, bm = pontos_osso(mpts, osso)
            ak, bk = pontos_osso(pts, osso)
            um, vm, Lm = eixo(am, bm)
            uk, vk, Lk = eixo(ak, bk)
            su, sv = Lk / Lm, kit["medidas"][d["largura"]] / F["medidas"][d["largura"]]
            M = np.column_stack([uk, vk]) @ np.diag([su, sv]) @ np.vstack([um, vm])
            A = afim(M, pts[d["ancora"]] - M @ mpts[d["ancora"]])
            img = Image.open(f"{RAIZ}/figurinos/{figurino}/{d['png']}").convert("RGBA")
            pecas_fig.setdefault(d["camada_acima_de"], []).append((f"{figurino}_{nome}", img, T[osso] @ A))

    for parte in ESQ["camadas_de_baixo_para_cima"]:
        img = Image.open(f"{RAIZ}/bichos/{bicho}/partes/{parte}.png").convert("RGBA")
        camadas.append((f"{bicho}_{parte}", aplica(img, T[osso_da_parte[parte]]), "bicho"))
        for nome, img, Fm in pecas_fig.get(parte, []):
            camadas.append((nome, aplica(img, Fm), "figurino"))

    comp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for _, img, _ in camadas:
        comp.alpha_composite(img)

    nome_fig = figurino or "base"
    pasta = f"{RAIZ}/pecas/{bicho}-{nome_fig}-{pose}"
    os.makedirs(pasta, exist_ok=True)
    comp.save(f"{pasta}/montagem.png")
    receita = {"bicho": bicho, "pose": pose, "figurino": nome_fig, "objeto": None,
               "camadas": [n for n, _, _ in camadas]}
    json.dump(receita, open(f"{pasta}/receita.json", "w"), ensure_ascii=False, indent=1)
    with tempfile.TemporaryDirectory() as tmp:
        lista = {"largura": W, "altura": H, "composta": "comp.png", "camadas": []}
        comp.save(f"{tmp}/comp.png")
        for i, (n, img, g) in enumerate(camadas):
            img.save(f"{tmp}/{i:02d}.png")
            lista["camadas"].append({"nome": n, "png": f"{i:02d}.png"})
        json.dump(lista, open(f"{tmp}/lista.json", "w"))
        subprocess.run(["node", f"{RAIZ}/scripts/psd.js", f"{tmp}/lista.json", f"{pasta}/montagem.psd"],
                       check=True, env={**os.environ, "NODE_PATH": NODE_PATH})
    return comp


if __name__ == "__main__":
    montar(sys.argv[1], sys.argv[2], None if len(sys.argv) < 4 or sys.argv[3] == "base" else sys.argv[3])
