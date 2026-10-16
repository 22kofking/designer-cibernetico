"""Construtor de bicho (fase B1): recorta o desenho de frente de um bicho em partes presas ao esqueleto padrão.

Uso: python3 cortar_bicho.py <bicho>     (lê bichos/<bicho>/articulacoes-origem.json)
Saída: bichos/<bicho>/kit.json e bichos/<bicho>/partes/*.png (RGBA no enquadramento padrão 768x1024).

Como corta, sem IA e sem pontos digitados além das articulações:
1. tira o fundo (cinza liso ligado à borda) e põe o bicho no enquadramento padrão (topo da cabeça y 250, pés y 950);
2. separa as áreas de cor entre os traços pretos; cada área vai inteira para o grupo (cabeça, tronco, braço, perna)
   cujo osso está mais perto da maioria dos pixels, então o corte segue o traço do desenho;
3. os traços pretos entram em todo grupo vizinho (cada parte fica com o próprio contorno);
4. o braço é dividido em braço e antebraço pelo osso mais perto, com sobra nas juntas (ombro e cotovelo)
   para não abrir buraco quando o osso gira.
"""
import json, sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESQ = json.load(open(f"{RAIZ}/modelo/esqueleto.json"))
W, H = ESQ["enquadramento"]["tamanho"]
TOPO, PES, CX = ESQ["enquadramento"]["cabeca_topo_y"], ESQ["enquadramento"]["pes_y"], ESQ["enquadramento"]["centro_x"]

# grupo de cada osso e raio típico (px no enquadramento padrão) para a distância normalizada
OSSO_GRUPO = {"cabeca": "cabeca", "tronco": "tronco",
              "braco_d": "braco_d", "antebraco_d": "braco_d", "braco_e": "braco_e", "antebraco_e": "braco_e",
              "coxa_d": "perna_d", "canela_d": "perna_d", "coxa_e": "perna_e", "canela_e": "perna_e"}
RAIO = {"cabeca": 140, "tronco": 110, "braco_d": 38, "antebraco_d": 38, "braco_e": 38, "antebraco_e": 38,
        "coxa_d": 45, "canela_d": 45, "coxa_e": 45, "canela_e": 45}


def mascara_bicho(rgb):
    a = rgb.astype(np.float32)
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    fundo_ref = np.median(np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3)]), 0)
    parecido = (sat < 0.12) & (np.abs(a - fundo_ref).max(2) < 75)  # fundo e sombra no chão
    lab, _ = ndi.label(parecido)
    borda = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fundo = np.isin(lab, list(borda))
    fg = ~fundo
    lab, n = ndi.label(fg)
    tam = ndi.sum(fg, lab, range(1, n + 1))
    fg = lab == (1 + int(np.argmax(tam)))
    return ndi.binary_fill_holes(fg)


def dist_segmento(px, py, a, b):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / max(dx * dx + dy * dy, 1e-6), 0, 1)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))


def main(bicho):
    pasta = f"{RAIZ}/bichos/{bicho}"
    org = json.load(open(f"{pasta}/articulacoes-origem.json"))
    src = np.array(Image.open(org["origem"]).convert("RGB"))
    fg = mascara_bicho(src)
    ys, xs = np.nonzero(fg)
    # escala: do topo da cabeça até a sola dos pés
    s = (PES - TOPO) / (ys.max() - ys.min())
    pesc = org["pontos"]["pescoco"]
    ox, oy = CX - pesc[0] * s, TOPO - ys.min() * s
    T = lambda p: [round(p[0] * s + ox, 1), round(p[1] * s + oy, 1)]
    # imagem normalizada
    rgba = np.dstack([src, (fg * 255).astype(np.uint8)])
    im = Image.fromarray(rgba, "RGBA").resize((round(src.shape[1] * s), round(src.shape[0] * s)), Image.LANCZOS)
    tela = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tela.alpha_composite(im, (round(ox), round(oy)))
    arr = np.array(tela)
    a = arr[..., 3] > 127
    pts = {k: T(v) for k, v in org["pontos"].items()}
    pts["quadril_meio"] = [(pts["quadril_d"][0] + pts["quadril_e"][0]) / 2, (pts["quadril_d"][1] + pts["quadril_e"][1]) / 2]

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nd = {o: dist_segmento(xx, yy, pts[p], pts[q]) / RAIO[o] for o, (p, q) in ESQ["ossos"].items()}
    ossos = list(nd)
    pilha = np.stack([nd[o] for o in ossos])
    perto = np.argmin(pilha, 0)
    grupos = ["cabeca", "tronco", "braco_d", "braco_e", "perna_d", "perna_e"]
    g_idx = np.array([grupos.index(OSSO_GRUPO[o]) for o in ossos])
    grupo_px = g_idx[perto]
    # cabeça x tronco: a linha do pescoço decide
    ct = (grupo_px == grupos.index("cabeca")) | (grupo_px == grupos.index("tronco"))
    grupo_px[ct] = np.where(yy[ct] < pts["pescoco"][1] + 8, grupos.index("cabeca"), grupos.index("tronco"))

    # áreas de cor entre os traços
    v = arr[..., :3].max(2)
    escuro = a & (v < 55)
    areas, n = ndi.label(a & ~escuro)
    grupo = np.full((H, W), -1, np.int16)
    for i, sl in enumerate(ndi.find_objects(areas), 1):
        m = areas[sl] == i
        votos = np.bincount(grupo_px[sl][m], minlength=len(grupos))
        frac = votos / votos.sum()
        if frac.max() >= 0.8 or m.sum() < 40:
            grupo[sl][m] = int(np.argmax(votos))
        elif {grupos[j] for j in np.argsort(votos)[-2:]} <= {"tronco", "perna_d", "perna_e"} or \
                frac[grupos.index("tronco")] + frac[grupos.index("perna_d")] + frac[grupos.index("perna_e")] > 0.9:
            grupo[sl][m] = grupos.index("tronco")  # bermuda: fica inteira no tronco, as pernas são o que sai dela
        else:  # área que atravessa dois grupos (pelo do ombro ligado ao pescoço etc.): divide por pixel
            grupo[sl][m] = grupo_px[sl][m]
    # traço preto: entra em todo grupo cuja área está a até 6 px
    mascaras = {}
    dists = {g: ndi.distance_transform_edt(~(grupo == gi)) for gi, g in enumerate(grupos)}
    dmin = np.min(np.stack(list(dists.values())), 0)
    for gi, g in enumerate(grupos):
        # traço vai para o grupo mais perto e para os que estão quase tão perto (traço dividido entre duas partes)
        folga = 0 if g == "tronco" else 3  # o tronco não fica com o traço dos braços (sobrava traço solto ao girar)
        mascaras[g] = (grupo == gi) | (escuro & (dists[g] <= 6) & (dists[g] <= dmin + folga))
    # traço sem vizinho de cor (raro): vai para o osso mais perto
    sobra = a & ~np.any(np.stack(list(mascaras.values())), 0)
    for gi, g in enumerate(grupos):
        mascaras[g] |= sobra & (grupo_px == gi)

    # tira pedaços soltos de traço (traço do punho que ficou mais perto da bermuda, por exemplo)
    for g, m in mascaras.items():
        lab, n = ndi.label(m, np.ones((3, 3)))
        if n > 1:
            tam = ndi.sum(m, lab, range(1, n + 1))
            mascaras[g] = np.isin(lab, 1 + np.nonzero(tam >= 0.02 * tam.max())[0])

    # braço -> braço + antebraço, com sobra nas juntas
    partes = {"cabeca": mascaras["cabeca"], "tronco": mascaras["tronco"].copy(),
              "perna_d": mascaras["perna_d"], "perna_e": mascaras["perna_e"]}
    for lado in "de":
        m = mascaras[f"braco_{lado}"]
        db, da = nd[f"braco_{lado}"], nd[f"antebraco_{lado}"]
        cot = pts[f"cotovelo_{lado}"]; omb = pts[f"ombro_{lado}"]
        r_cot = np.hypot(xx - cot[0], yy - cot[1])
        r_omb = np.hypot(xx - omb[0], yy - omb[1])
        partes[f"braco_{lado}"] = m & ((db <= da) | (r_cot < 34))  # tampa do cotovelo fica embaixo do antebraço
        partes[f"antebraco_{lado}"] = m & ((da < db) | (r_cot < 26))  # ponta redonda no cotovelo
        # tampa do ombro: o tronco guarda uma cópia do pelo do ombro, que aparece quando o braço sobe
        partes["tronco"] |= m & (r_omb < 48) & ~escuro

    # contorno nas bordas de corte (onde a parte foi separada de outra), como num boneco de recorte
    fundo_perto = ndi.binary_dilation(~a, iterations=4)
    contorno = {}
    for nome in ["tronco", "braco_d", "antebraco_d", "braco_e", "antebraco_e"]:
        m = partes[nome]
        borda = m & ~ndi.binary_erosion(m, iterations=3)
        contorno[nome] = borda & ~fundo_perto & ~escuro
    # no tronco, só onde ele foi separado dos braços (pescoço e cintura ficam cobertos e não giram)
    perto_braco = ndi.distance_transform_edt(~(mascaras["braco_d"] | mascaras["braco_e"])) <= 8
    contorno["tronco"] &= perto_braco

    os.makedirs(f"{pasta}/partes", exist_ok=True)
    caixas = {}
    for nome, m in partes.items():
        out = arr.copy()
        out[..., 3] = np.where(m, arr[..., 3], 0)
        if nome in contorno:
            out[contorno[nome], :3] = (28, 22, 22)
        Image.fromarray(out, "RGBA").save(f"{pasta}/partes/{nome}.png")
        ys, xs = np.nonzero(m)
        caixas[nome] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]

    med = {k: (round(v * s, 1) if k != "cintura_y" else round(v * s + oy, 1)) for k, v in org["medidas"].items()}
    kit = {"_leia": "Kit do bicho no enquadramento padrão. Partes em partes/*.png (768x1024, transparentes). "
                    "Pontos = articulações já no enquadramento. Editar uma parte no PhotoCraft e salvar com o mesmo nome "
                    "basta para todas as poses saírem com a edição.",
           "bicho": bicho, "tipo": org["tipo"], "aprovado": None,
           "pontos": pts, "medidas": med, "caixas": caixas,
           "camadas_de_baixo_para_cima": ESQ["camadas_de_baixo_para_cima"],
           "angulos_repouso": {o: round(float(np.degrees(np.arctan2(pts[q][1] - pts[p][1], pts[q][0] - pts[p][0]))), 1)
                               for o, (p, q) in ESQ["ossos"].items() if o.startswith(("braco", "antebraco"))}}
    json.dump(kit, open(f"{pasta}/kit.json", "w"), ensure_ascii=False, indent=1)
    # mapa de conferência: cada parte numa cor
    cores = {"cabeca": (230, 80, 80), "tronco": (80, 160, 230), "braco_d": (80, 200, 80), "antebraco_d": (40, 120, 40),
             "braco_e": (230, 200, 60), "antebraco_e": (180, 130, 20), "perna_d": (170, 90, 210), "perna_e": (120, 50, 160)}
    mapa = np.full((H, W, 3), 255, np.uint8)
    for nome in ESQ["camadas_de_baixo_para_cima"]:
        mapa[partes[nome]] = cores[nome]
    mix = (arr[..., :3] * 0.5 + mapa * 0.5).astype(np.uint8)
    Image.fromarray(mix).save(f"{pasta}/mapa-partes.png")
    print(bicho, "escala", round(s, 3), {k: v for k, v in caixas.items()})


if __name__ == "__main__":
    main(sys.argv[1])
