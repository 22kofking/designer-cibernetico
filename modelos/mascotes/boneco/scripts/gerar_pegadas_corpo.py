"""Gera o padrão de pegada em relação ao corpo: onde o objeto fica, como cada braço chega nele,
que pegada de mão usa e como o corpo compensa o peso. Sem IA e sem custo.

Saída em modelo/maos/: pegadas-corpo.json e previa-pegadas-corpo.png (boneco de palitos sobre o esqueleto padrão).

Regras de corpo tiradas das referências (ver PADRAO-MAOS.md, Fontes):
- o centro de gravidade do corpo + objeto tem que ficar sobre os pés: carga pesada na frente inclina o tronco
  para trás; carga pesada de um lado inclina o tronco para o outro lado e baixa o ombro da carga;
- quanto mais pesado, mais perto do corpo, base mais larga e joelhos dobrados;
- o braço que segura puxa o ombro e gira o tronco; pose de carga é assimétrica, nunca neutra;
- uma mão só é a carga mais exigente: o outro braço abre para contrapeso;
- carga frontal e lateral são as menos estáveis; nas costas e nas duas mãos, as mais estáveis.
"""
import json, math, os
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = f"{RAIZ}/modelo/maos"
kit = json.load(open(f"{RAIZ}/bichos/capivara/kit.json"))  # só para a prévia; as zonas são relativas ao corpo
P = {k: tuple(v) for k, v in kit["pontos"].items()}
CX = P["pescoco"][0]
C = P["pescoco"][1] - P["cabeca_topo"][1]          # altura da cabeça
O = (P["ombro_e"][0] - P["ombro_d"][0]) / 2        # meia largura dos ombros
CINTURA = kit["medidas"]["cintura_y"]
L1 = math.dist(P["ombro_d"], P["cotovelo_d"])
L2 = math.dist(P["cotovelo_d"], P["mao_fim_d"])

# lado: d = direita do personagem = esquerda da imagem (x menor), sinal -1; e = +1
SINAL = {"d": -1, "e": 1}

# zonas de alcance, todas relativas a marcos do corpo (C = altura da cabeça, O = meia largura dos ombros)
ZONAS = {
    "acima_cabeca":   {"x": "centro + lado*0,35*O", "y": "topo da cabeça - 0,45*C", "f": lambda s: (CX + s * 0.35 * O, P["cabeca_topo"][1] - 0.45 * C)},
    "acima_lado":     {"x": "ombro + lado*0,6*O",   "y": "topo da cabeça - 0,2*C",  "f": lambda s: (P["ombro_e"][0] if s > 0 else P["ombro_d"][0]) + s * 0.6 * O, "y_f": lambda s: P["cabeca_topo"][1] - 0.2 * C},
    "rosto":          {"x": "centro + lado*0,55*O", "y": "topo + 0,65*C",           "f": lambda s: (CX + s * 0.55 * O, P["cabeca_topo"][1] + 0.65 * C)},
    "mostrar":        {"x": "centro + lado*1,05*O", "y": "pescoço - 0,25*C (ao lado do rosto)", "f": lambda s: (CX + s * 1.05 * O, P["pescoco"][1] - 0.25 * C)},
    "peito_frente":   {"x": "centro + lado*0,3*O",  "y": "pescoço + 0,6*C",         "f": lambda s: (CX + s * 0.3 * O, P["pescoco"][1] + 0.6 * C)},
    "cintura_frente": {"x": "centro + lado*0,35*O", "y": "cintura",                 "f": lambda s: (CX + s * 0.35 * O, CINTURA)},
    "mao_no_quadril": {"x": "centro + lado*0,75*O", "y": "cintura",                 "f": lambda s: (CX + s * 0.75 * O, CINTURA)},
    "lateral_baixo":  {"x": "ombro + lado*0,25*O",  "y": "quadril + 0,35*C",        "f": lambda s: ((P["ombro_e"][0] if s > 0 else P["ombro_d"][0]) + s * 0.25 * O, P["quadril_meio"][1] + 0.35 * C)},
    "lateral_aberto": {"x": "ombro + lado*1,2*O",   "y": "ombro + 0,9*C",           "f": lambda s: ((P["ombro_e"][0] if s > 0 else P["ombro_d"][0]) + s * 1.2 * O, P["ombro_e"][1] + 0.9 * C)},
    "selfie":         {"x": "ombro + lado*1,1*O",   "y": "topo + 0,2*C",            "f": lambda s: ((P["ombro_e"][0] if s > 0 else P["ombro_d"][0]) + s * 1.1 * O, P["cabeca_topo"][1] + 0.2 * C)},
    "ombro":          {"x": "ombro - lado*0,1*O",   "y": "ombro - 0,15*C",          "f": lambda s: ((P["ombro_e"][0] if s > 0 else P["ombro_d"][0]) - s * 0.1 * O, P["ombro_e"][1] - 0.15 * C)},
    "frente_estendido": {"x": "centro + lado*0,55*O", "y": "ombro + 0,25*C", "profundidade": "braço vem na direção de quem vê (encurtado)", "f": lambda s: (CX + s * 0.55 * O, P["ombro_e"][1] + 0.25 * C)},
    "alca_peito":     {"x": "ombro - lado*0,3*O (para dentro)", "y": "ombro + 0,9*C", "f": lambda s: ((P["ombro_e"][0] if s > 0 else P["ombro_d"][0]) - s * 0.3 * O, P["ombro_e"][1] + 0.9 * C)},
    "solto":          {"x": "como no kit", "y": "como no kit", "f": None},
}
for z in ZONAS.values():  # completa as zonas que deram x e y separados
    if "y_f" in z:
        fx, fy = z["f"], z.pop("y_f")
        z["f"] = (lambda fx, fy: lambda s: (fx(s), fy(s)))(fx, fy)


def ik(ombro, alvo, sinal):
    """braço de dois ossos; o cotovelo dobra para fora do corpo. Devolve ângulos (graus, imagem) e pontos."""
    dx, dy = alvo[0] - ombro[0], alvo[1] - ombro[1]
    d = min(max(math.hypot(dx, dy), abs(L1 - L2) + 1), L1 + L2 - 0.5)
    base = math.atan2(dy, dx)
    a = math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))
    # das duas soluções, o cotovelo fica embaixo (como num braço relaxado); empate: o mais para fora
    def cot_de(t):
        return (ombro[0] + L1 * math.cos(t), ombro[1] + L1 * math.sin(t))
    ang1 = max((base + a, base - a), key=lambda t: (round(cot_de(t)[1] / 8), sinal * (cot_de(t)[0] - ombro[0])))
    cot = (ombro[0] + L1 * math.cos(ang1), ombro[1] + L1 * math.sin(ang1))
    ang2 = math.atan2(alvo[1] - cot[1], alvo[0] - cot[0])
    mao = (cot[0] + L2 * math.cos(ang2), cot[1] + L2 * math.sin(ang2))
    return round(math.degrees(ang1), 1), round(math.degrees(ang2), 1), cot, mao


def lado(zona, pegada, pulso, obs=None):
    return {"zona": zona, "pegada": pegada, "pulso": pulso, **({"obs": obs} if obs else {})}


def pose(nome, uso, objetos, d, e, carga, corpo, camadas, olhar="câmera", temas=None, peso="leve"):
    return {"nome": nome, "uso": uso, "objetos": objetos, "mao_d": d, "mao_e": e, "carga": carga,
            "corpo": corpo, "peso_padrao": peso, "ordem_das_camadas": camadas, "olhar": olhar, "temas": temas or []}

NEUTRO = {"inclinacao_frente_tras": 0, "inclinacao_lateral": 0, "ombro_da_carga": "normal", "base": "normal", "joelhos": "retos", "peso_na_perna": "as duas"}
POSES = {
    "mostrar": pose("Mostrar para quem vê", "apresenta um objeto pequeno ao lado do rosto ou do peito", ["cartão VIP", "envelope", "ingresso", "ficha"],
                    lado("mostrar", "tripe", "palma_camera"), lado("mao_no_quadril", "punho", "dorso_camera"),
                    "uma mão, frontal leve", {**NEUTRO, "inclinacao_lateral": 4, "peso_na_perna": "do lado da mão no quadril"},
                    ["perna", "tronco", "braço livre", "cabeça", "braço que mostra", "OBJETO", "dedos da frente"], temas=["convite", "VIP", "login"]),
    "celular_mostrar": pose("Mostrar o celular", "tela virada para quem vê, na altura do peito", ["celular", "tablet"],
                            lado("mostrar", "celular", "palma_camera"), lado("mao_no_quadril", "punho", "dorso_camera"),
                            "uma mão, frontal leve", {**NEUTRO, "inclinacao_lateral": 3},
                            ["perna", "tronco", "braço livre", "cabeça", "braço que segura", "dedos de trás", "OBJETO", "polegar"], temas=["redes", "telegram", "login"]),
    "selfie": pose("Selfie", "braço esticado para o alto e para o lado; tela para o rosto", ["celular"],
                   lado("selfie", "celular", "lado_polegar", "tela para o rosto"), lado("mao_no_quadril", "joinha", "lado_polegar"),
                   "uma mão, lateral leve", {**NEUTRO, "inclinacao_lateral": -6},
                   ["perna", "tronco", "cabeça", "braço livre", "braço do celular", "OBJETO"], olhar="para o celular", temas=["redes"]),
    "erguer_uma": pose("Erguer com uma mão", "vitória: levanta o objeto acima da cabeça", ["troféu", "taça", "envelope vermelho", "moeda grande"],
                       lado("acima_lado", "cilindrica", "lado_polegar"), lado("mao_no_quadril", "punho", "dorso_camera"),
                       "uma mão, acima da cabeça", {**NEUTRO, "inclinacao_lateral": -5, "ombro_da_carga": "sobe"},
                       ["perna", "tronco", "cabeça", "braço livre", "braço que ergue", "OBJETO", "dedos da frente"], olhar="câmera ou objeto", temas=["envelopes", "rebate", "resgate"]),
    "erguer_duas": pose("Erguer com as duas mãos", "troféu ou baú acima da cabeça, braços simétricos", ["troféu", "baú pequeno", "cinturão"],
                        lado("acima_cabeca", "cilindrica", "lado_polegar"), lado("acima_cabeca", "cilindrica", "lado_polegar"),
                        "duas mãos, acima da cabeça", {**NEUTRO, "inclinacao_frente_tras": 5, "base": "larga"},
                        ["perna", "tronco", "cabeça", "braços", "OBJETO"], peso="medio", temas=["VIP", "resgate"]),
    "duas_maos_frente": pose("Segurar com as duas mãos", "objeto redondo na frente do peito, mãos dos dois lados", ["orbe", "bola", "moeda gigante", "ficha gigante"],
                             lado("peito_frente", "esferica", "palma_camera", "mãos de lado, palmas para dentro"), lado("peito_frente", "esferica", "palma_camera"),
                             "duas mãos, frontal", NEUTRO,
                             ["perna", "tronco", "braços", "OBJETO", "dedos da frente"], olhar="câmera", temas=["telegram (mago)", "depósito"]),
    "abracar": pose("Abraçar a carga", "objeto grande e pesado colado ao peito, braços por baixo e dos lados", ["baú", "saco de moedas", "caixa de presente"],
                    lado("cintura_frente", "aberta", "palma_camera", "palma por baixo do objeto"), lado("cintura_frente", "aberta", "palma_camera"),
                    "duas mãos, frontal pesada", {"inclinacao_frente_tras": 12, "inclinacao_lateral": 0, "ombro_da_carga": "os dois descem",
                                                    "base": "larga", "joelhos": "dobrados", "peso_na_perna": "as duas, calcanhares"},
                    ["perna", "tronco", "braços de cima", "OBJETO", "antebraços e mãos"], peso="pesado", temas=["resgate", "depósito", "rebate"]),
    "carregar_lateral": pose("Carregar ao lado", "sacola ou baú pela alça, braço esticado ao lado do corpo", ["sacola", "baú com alça", "maleta"],
                             lado("lateral_baixo", "gancho", "dorso_camera"), lado("lateral_aberto", "aberta", "palma_camera", "braço abre para contrapeso"),
                             "uma mão, lateral", {"inclinacao_frente_tras": 0, "inclinacao_lateral": -8, "ombro_da_carga": "desce",
                                                  "base": "normal", "joelhos": "retos", "peso_na_perna": "do lado oposto à carga"},
                             ["OBJETO (se atrás da perna)", "perna", "tronco", "braço livre", "braço da carga", "OBJETO (se ao lado)"], peso="medio", temas=["turista", "depósito"]),
    "no_ombro": pose("Carga no ombro", "saco jogado por cima do ombro, mão segura a boca do saco", ["saco de dinheiro", "rede", "trouxa"],
                     lado("ombro", "gancho", "dorso_camera"), lado("mao_no_quadril", "punho", "dorso_camera"),
                     "uma mão, ombro", {"inclinacao_frente_tras": -5, "inclinacao_lateral": -4, "ombro_da_carga": "desce", "base": "normal",
                                        "joelhos": "levemente dobrados", "peso_na_perna": "do lado da carga"},
                     ["perna", "OBJETO (parte de trás)", "tronco", "cabeça", "braço livre", "braço da carga", "OBJETO (boca do saco)"], peso="medio", temas=["pirata", "rua"]),
    "oferecer": pose("Oferecer", "estende o objeto na direção de quem vê, na palma da mão", ["moeda", "presente", "orbe pequeno", "bônus"],
                     lado("frente_estendido", "aberta", "palma_camera", "palma para cima; o braço encurta porque vem para frente"), lado("solto", "aberta", "palma_camera"),
                     "uma mão, frontal leve", {**NEUTRO, "inclinacao_frente_tras": -6},
                     ["perna", "tronco", "braço livre", "cabeça", "braço que oferece", "OBJETO"], temas=["convite", "bônus", "depósito"]),
    "cajado": pose("Cajado apoiado", "haste vertical apoiada no chão, ao lado do corpo", ["cajado", "cetro", "bastão", "ankh grande"],
                   lado("mao_no_quadril", "empunha", "lado_polegar", "punho na altura da cintura, haste vai do chão até acima da cabeça"), lado("mostrar", "aberta", "palma_camera"),
                   "uma mão, lateral apoiada", {**NEUTRO, "inclinacao_lateral": 4, "peso_na_perna": "do lado do cajado"},
                   ["OBJETO (abaixo da mão)", "perna", "tronco", "cabeça", "braço livre", "braço do cajado", "OBJETO (acima da mão)", "dedos"], temas=["telegram (mago)", "VIP (faraó)"]),
    "moeda_rosto": pose("Examinar perto do rosto", "segura algo pequeno perto do olho ou da boca", ["moeda", "ficha", "joia", "carta"],
                        lado("rosto", "pinca", "dorso_camera"), lado("mao_no_quadril", "punho", "dorso_camera"),
                        "uma mão, rosto", {**NEUTRO, "inclinacao_lateral": 3},
                        ["perna", "tronco", "cabeça", "braço livre", "braço do rosto", "OBJETO", "dedos"], olhar="para o objeto", temas=["rebate", "VIP"]),
    "lancar": pose("Jogar para o alto", "mãos abertas no alto, objetos soltos voando", ["moedas", "notas", "confete", "fichas"],
                   lado("acima_lado", "aberta", "palma_camera"), lado("acima_lado", "aberta", "palma_camera"),
                   "duas mãos, sem pegar", {**NEUTRO, "inclinacao_frente_tras": 6, "base": "larga"},
                   ["OBJETOS atrás", "perna", "tronco", "cabeça", "braços", "OBJETOS na frente"], olhar="para cima", temas=["resgate", "apostas", "rebate"]),
    "nas_costas": pose("Carga nas costas", "mochila ou baú preso nas costas, mãos nas alças na altura do peito", ["mochila", "baú nas costas", "aljava"],
                       lado("alca_peito", "punho", "dorso_camera"), lado("alca_peito", "punho", "dorso_camera"),
                       "costas (a mais estável)", {**NEUTRO, "inclinacao_frente_tras": -6, "ombro_da_carga": "os dois puxados para trás"},
                       ["OBJETO", "perna", "tronco", "alças", "braços", "mãos"], peso="medio", temas=["turista"]),
}

PESO = {"leve": {"distancia_do_corpo": "livre", "inclinacao": "a da pose", "base": "a da pose", "joelhos": "a da pose"},
        "medio": {"distancia_do_corpo": "perto", "inclinacao": "+5 graus contra a carga", "base": "normal", "joelhos": "levemente dobrados"},
        "pesado": {"distancia_do_corpo": "colado", "inclinacao": "+10 a 15 graus contra a carga", "base": "larga", "joelhos": "dobrados",
                   "extra": "ombro da carga desce; o outro braço abre para contrapeso; o objeto encosta no tronco"}}

# calcula os ângulos de braço de cada pose (mesma convenção das poses do boneco)
for pid, p in POSES.items():
    ang = {}
    for s, k in (("d", "mao_d"), ("e", "mao_e")):
        z = p[k]["zona"]
        if ZONAS[z]["f"] is None:
            ang[f"braco_{s}"], ang[f"antebraco_{s}"] = kit["angulos_repouso"][f"braco_{s}"], kit["angulos_repouso"][f"antebraco_{s}"]
            continue
        alvo = ZONAS[z]["f"](SINAL[s])
        a1, a2, _, _ = ik(P[f"ombro_{s}"], alvo, SINAL[s])
        ang[f"braco_{s}"], ang[f"antebraco_{s}"] = a1, a2
    p["angulos_bracos"] = ang

zonas_json = {k: {kk: vv for kk, vv in v.items() if kk != "f"} for k, v in ZONAS.items()}
json.dump({"_leia": "Pegada em relação ao corpo. Cada pose diz em que zona do corpo cada mão fica, que pegada de mão usa "
                    "(pegadas.json), como o corpo compensa a carga e a ordem das camadas com o objeto. As zonas são relativas "
                    "a marcos do esqueleto padrão (C = altura da cabeça, O = meia largura dos ombros, lado = -1 para a mão direita "
                    "do personagem e +1 para a esquerda), então valem para qualquer bicho. 'angulos_bracos' sai por cinemática "
                    "inversa no kit da capivara, na mesma convenção de modelo/poses/*.json (graus da imagem, 0 = direita, 90 = baixo). "
                    "Inclinação em graus: frente_tras + = tronco para trás; lateral + = para a esquerda da imagem (lado d do personagem); com carga num lado, o tronco inclina para o lado oposto.",
           "zonas": zonas_json, "peso": PESO, "poses": POSES,
           "ligacao_com_as_7_poses": {"frente": "solto", "aponta": "sem objeto (pegada aponta)", "ergue": "erguer_uma",
                                      "punho": "sem objeto (pegada punho)", "abertos": "lancar", "segura": "duas_maos_frente",
                                      "celular": "celular_mostrar"}},
          open(f"{SAIDA}/pegadas-corpo.json", "w"), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- prévia
def gira(pt, centro, graus):
    r = math.radians(graus)
    x, y = pt[0] - centro[0], pt[1] - centro[1]
    return (centro[0] + x * math.cos(r) - y * math.sin(r), centro[1] + x * math.sin(r) + y * math.cos(r))

ids = list(POSES)
cols, Wc, Hc, esc = 5, 300, 330, 0.36
rows = math.ceil(len(ids) / cols)
img = Image.new("RGB", (cols * Wc, rows * Hc), (246, 246, 246))
dr = ImageDraw.Draw(img)
try:
    ft, fs = ImageFont.truetype("DejaVuSans-Bold.ttf", 15), ImageFont.truetype("DejaVuSans.ttf", 11)
except Exception:
    ft = fs = None
for i, pid in enumerate(ids):
    p = POSES[pid]
    ox, oy = (i % cols) * Wc, (i // cols) * Hc
    T = lambda q: (ox + Wc / 2 + (q[0] - CX) * esc, oy + 40 + (q[1] - 150) * esc)
    corpo = p["corpo"]
    base = 1.3 if corpo["base"] == "larga" else 1.0
    desce = 22 if "dobrados" in corpo["joelhos"] else (10 if "levemente" in corpo["joelhos"] else 0)
    lat = -corpo["inclinacao_lateral"]
    quad = (P["quadril_meio"][0], P["quadril_meio"][1] + desce)
    up = lambda q: gira((q[0], q[1] + desce), quad, lat)
    # pernas
    for s in "de":
        qx = P[f"quadril_{s}"]
        jo, to, pe = P[f"joelho_{s}"], P[f"tornozelo_{s}"], P[f"pe_fim_{s}"]
        sp = lambda q: (CX + (q[0] - CX) * base, q[1])
        jo2 = (sp(jo)[0] + SINAL[s] * desce * 0.8, jo[1] + desce * 0.4)
        dr.line([T((qx[0], qx[1] + desce)), T(jo2), T(sp(to)), T(sp(pe))], fill=(110, 110, 110), width=5)
    # tronco e cabeça
    pesc, topo = up(P["pescoco"]), up(P["cabeca_topo"])
    dr.line([T(quad), T(pesc)], fill=(90, 90, 90), width=8)
    hc = ((pesc[0] + topo[0]) / 2, (pesc[1] + topo[1]) / 2)
    r = C * 0.5 * esc
    dr.ellipse([T(hc)[0] - r, T(hc)[1] - r, T(hc)[0] + r, T(hc)[1] + r], outline=(90, 90, 90), width=4)
    # braços (IK sobre o ombro inclinado)
    maos = {}
    for s, k in (("d", "mao_d"), ("e", "mao_e")):
        omb = up(P[f"ombro_{s}"])
        if "desce" in corpo["ombro_da_carga"] and (k == "mao_d" or "os dois" in corpo["ombro_da_carga"]):
            omb = (omb[0], omb[1] + 12)
        dr.line([T(pesc), T(omb)], fill=(90, 90, 90), width=6)
        z = p[k]["zona"]
        if ZONAS[z]["f"] is None:
            cot, mao = up(P[f"cotovelo_{s}"]), up(P[f"mao_fim_{s}"])
        else:
            alvo = up(ZONAS[z]["f"](SINAL[s]))
            _, _, cot, mao = ik(omb, alvo, SINAL[s])
        cor = (40, 110, 200) if s == "d" else (60, 160, 90)
        dr.line([T(omb), T(cot), T(mao)], fill=cor, width=6)
        dr.ellipse([T(mao)[0] - 6, T(mao)[1] - 6, T(mao)[0] + 6, T(mao)[1] + 6], fill=cor)
        maos[s] = mao
    # objeto
    o = None
    if pid in ("duas_maos_frente", "abracar", "erguer_duas"):
        o = ((maos["d"][0] + maos["e"][0]) / 2, (maos["d"][1] + maos["e"][1]) / 2 - (20 if pid == "erguer_duas" else 0))
        rr = (70 if pid == "abracar" else 48) * esc * 2
    elif pid == "lancar":
        for k2 in range(7):
            q = (CX - 200 + k2 * 66, 150 + (k2 % 3) * 40)
            dr.ellipse([T(q)[0] - 6, T(q)[1] - 6, T(q)[0] + 6, T(q)[1] + 6], fill=(220, 170, 30))
    elif pid == "cajado":
        m = maos["d"]
        dr.line([T((m[0], 950)), T((m[0], P["cabeca_topo"][1] - 60))], fill=(150, 90, 40), width=6)
    elif pid == "nas_costas":
        dr.rectangle([T((CX - 120, 470)), T((CX + 120, 700))], outline=(220, 170, 30), width=4)
    else:
        o, rr = maos["d"], 26 * esc * 2
        if pid in ("carregar_lateral",):
            o, rr = (maos["d"][0], maos["d"][1] + 60), 45 * esc * 2
        if pid == "no_ombro":
            o, rr = (up(P["ombro_d"])[0] + 30, up(P["ombro_d"])[1] - 50), 60 * esc * 2
    if o:
        dr.ellipse([T(o)[0] - rr, T(o)[1] - rr, T(o)[0] + rr, T(o)[1] + rr], outline=(220, 150, 20), width=4)
    dr.text((ox + 8, oy + 6), p["nome"], fill=(20, 20, 20), font=ft)
    info = f'mão d: {p["mao_d"]["pegada"]} · e: {p["mao_e"]["pegada"]} · peso {p["peso_padrao"]}'
    dr.text((ox + 8, oy + Hc - 34), info, fill=(70, 70, 70), font=fs)
    inc = f'tronco: {corpo["inclinacao_frente_tras"]:+d}° frente/trás, {corpo["inclinacao_lateral"]:+d}° lado; base {corpo["base"]}'
    dr.text((ox + 8, oy + Hc - 18), inc, fill=(70, 70, 70), font=fs)
img.save(f"{SAIDA}/previa-pegadas-corpo.png")
print("ok", len(POSES), "poses de pegada")
