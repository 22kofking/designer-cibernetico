"""Gera o padrão de mão (esqueleto, pegadas e objetos) em JSON e uma prévia desenhada por código.

Não usa IA nem gasta nada. Saída em modelo/maos/: esqueleto-mao.json, pegadas.json, objetos.json,
previa-pegadas.png. Os ângulos são de flexão em graus (0 = dedo esticado, positivo = dobra para a palma).
"""
import json, math, os
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = f"{RAIZ}/modelo/maos"
os.makedirs(SAIDA, exist_ok=True)

# ---------------------------------------------------------------- esqueleto
# 21 pontos, na mesma ordem do OpenPose Hand e do MediaPipe Hands (servem de entrada para ControlNet).
NOMES = ["pulso",
         "polegar_cmc", "polegar_mcp", "polegar_ip", "polegar_ponta",
         "indicador_mcp", "indicador_pip", "indicador_dip", "indicador_ponta",
         "medio_mcp", "medio_pip", "medio_dip", "medio_ponta",
         "anelar_mcp", "anelar_pip", "anelar_dip", "anelar_ponta",
         "minimo_mcp", "minimo_pip", "minimo_dip", "minimo_ponta"]
DEDOS = ["indicador", "medio", "anelar", "minimo"]
# comprimentos em fração do comprimento da mão (pulso até a ponta do médio = 1,0)
FALANGES = {"indicador": [0.20, 0.13, 0.11], "medio": [0.22, 0.14, 0.11],
            "anelar": [0.20, 0.13, 0.11], "minimo": [0.16, 0.10, 0.09],
            "polegar": [0.19, 0.16, 0.13]}
PALMA = 0.46  # pulso até o início do dedo médio
# onde cada base de dedo (MCP) fica na palma, x em fração da largura da mão (lado do polegar = +)
BASE_X = {"indicador": 0.18, "medio": 0.06, "anelar": -0.06, "minimo": -0.17}
BASE_Y = {"indicador": 0.44, "medio": 0.46, "anelar": 0.43, "minimo": 0.38}
LIMITES = {"mcp": [-20, 90], "pip": [0, 110], "dip": [0, 80], "abducao": [-20, 20],
           "polegar_cmc": [0, 70], "polegar_mcp": [0, 60], "polegar_ip": [-10, 80]}

esqueleto = {
    "_leia": "Esqueleto de mão padrão, igual para todo bicho. Pontos na ordem do OpenPose Hand (21). "
             "Coordenadas locais, mão esticada, palma para a câmera: x para o lado do polegar, y do pulso para as pontas. "
             "O comprimento da mão é 1,0; o kit do bicho escala tudo.",
    "pontos": NOMES,
    "ossos": [["pulso", "polegar_cmc"], ["polegar_cmc", "polegar_mcp"], ["polegar_mcp", "polegar_ip"], ["polegar_ip", "polegar_ponta"]]
             + [[a, b] for d in DEDOS for a, b in
                [("pulso", f"{d}_mcp"), (f"{d}_mcp", f"{d}_pip"), (f"{d}_pip", f"{d}_dip"), (f"{d}_dip", f"{d}_ponta")]],
    "falanges": FALANGES, "palma": PALMA, "base_dos_dedos": {d: [BASE_X[d], BASE_Y[d]] for d in DEDOS},
    "polegar_base": [0.20, 0.10],
    "articulacoes_por_dedo": {"dedos": ["mcp", "pip", "dip"], "polegar": ["cmc", "mcp", "ip"]},
    "limites_graus": LIMITES,
    "orientacoes_do_pulso": {
        "palma_camera": "palma para quem vê (empurrar, apresentar, mostrar)",
        "dorso_camera": "costas da mão para quem vê (punho, segurar de cima)",
        "lado_polegar": "mão de perfil, polegar para cima (cilíndrica, joinha, bastão)",
        "lado_minimo": "mão de perfil, mindinho para cima (aperto de mão, cartão)"},
    "pulso_graus": {"_leia": "giro do pulso em relação ao antebraço, em graus", "flexao": [-70, 80], "desvio": [-20, 30]},
    "dedos_visiveis": {"_leia": "o kit do bicho diz quantos dedos desenha; o esqueleto é sempre de 5",
                       "humano": ["polegar", "indicador", "medio", "anelar", "minimo"],
                       "quadrinho_4": ["polegar", "indicador", "medio", "anelar"],
                       "ave": "asa ou garra: usa polegar, indicador e médio como 3 dedos de pena ou garra"},
    "camadas_da_mao": ["palma_dorso", "polegar", "dedos_atras", "OBJETO", "dedos_frente"],
}
json.dump(esqueleto, open(f"{SAIDA}/esqueleto-mao.json", "w"), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- pegadas
Z = [0, 0, 0]


def pegada(nome, tipo, descricao, polegar, ind, med, ane, mini, abd=0, pulso="dorso_camera", pontos=None,
           camadas=None, objetos=None, apoio=None):
    return {"nome": nome, "tipo": tipo, "descricao": descricao,
            "polegar_cmc_mcp_ip": polegar,
            "indicador_mcp_pip_dip": ind, "medio_mcp_pip_dip": med, "anelar_mcp_pip_dip": ane, "minimo_mcp_pip_dip": mini,
            "abertura_dos_dedos": abd, "pulso": pulso,
            "contato": pontos or [], "ordem_das_camadas": camadas or ["palma_dorso", "polegar", "dedos_atras", "OBJETO", "dedos_frente"],
            "objetos": objetos or [], "apoio": apoio}

CURL = [85, 100, 60]
PEGADAS = {
    "aberta": pegada("Mão aberta", "contato", "todos os dedos esticados, levemente abertos; apresentar, saudar, segurar algo por cima",
                     [15, 5, 5], Z, Z, Z, Z, abd=10, pulso="palma_camera",
                     camadas=["palma_dorso", "polegar", "dedos_atras", "dedos_frente", "OBJETO"],
                     objetos=["orbe", "bandeja", "moedas"], apoio="objeto repousa na palma, sem dedos na frente"),
    "empurra": pegada("Palma plana", "contato", "mão aberta com a palma para a câmera, dedos juntos; parar, empurrar, pedir calma",
                      [10, 0, 0], Z, Z, Z, Z, abd=0, pulso="palma_camera", objetos=[]),
    "punho": pegada("Punho cerrado", "forca", "os 4 dedos dobrados e o polegar por cima do indicador e do médio",
                    [30, 40, 50], CURL, CURL, CURL, [85, 100, 55], pulso="dorso_camera", objetos=[]),
    "aponta": pegada("Apontar", "contato", "indicador esticado, os outros dobrados, polegar sobre o médio; aponta para quem vê ou para o alto",
                     [30, 30, 40], Z, CURL, CURL, [85, 100, 55], pulso="dorso_camera", objetos=["seta", "tela"]),
    "joinha": pegada("Joinha", "contato", "punho com o polegar esticado para cima",
                     [0, 0, 0], CURL, CURL, CURL, [85, 100, 55], pulso="lado_polegar", objetos=[]),
    "cilindrica": pegada("Pegada cilíndrica", "forca", "dedos envolvem um objeto comprido na vertical; o polegar fecha pelo outro lado",
                         [40, 25, 25], [55, 70, 40], [58, 72, 42], [60, 74, 44], [62, 76, 46], pulso="lado_polegar",
                         pontos=["palma", "face interna dos 4 dedos", "ponta do polegar"],
                         camadas=["palma_dorso", "dedos_atras", "OBJETO", "dedos_frente", "polegar"],
                         objetos=["taça", "troféu", "microfone", "lata"], apoio="eixo do objeto na vertical, cruzando a palma"),
    "empunha": pegada("Empunhadura", "forca", "punho fechado em volta de uma haste fina; a haste atravessa a mão",
                      [35, 35, 40], [80, 95, 55], [82, 97, 55], [84, 98, 56], [85, 100, 55], pulso="lado_polegar",
                      pontos=["palma", "dedos", "polegar"],
                      camadas=["palma_dorso", "dedos_atras", "OBJETO", "dedos_frente", "polegar"],
                      objetos=["cajado", "bastão", "ankh", "espada"], apoio="haste sai pelos dois lados do punho"),
    "esferica": pegada("Pegada esférica", "forca", "dedos abertos e curvados, como em volta de uma bola; polegar do lado oposto",
                       [45, 20, 20], [35, 45, 30], [38, 48, 32], [40, 50, 34], [42, 52, 36], abd=15, pulso="palma_camera",
                       pontos=["palma", "pontas dos 4 dedos", "ponta do polegar"],
                       camadas=["palma_dorso", "OBJETO", "dedos_frente", "polegar"],
                       objetos=["orbe", "bola", "ficha grande", "globo"], apoio="centro do objeto a ~0,3 da mão acima da palma"),
    "pinca": pegada("Pinça", "precisao", "ponta do polegar toca a ponta do indicador; os outros dedos soltos e semidobrados",
                    [50, 25, 35], [35, 50, 25], [55, 65, 35], [60, 72, 40], [65, 76, 42], pulso="dorso_camera",
                    pontos=["ponta do polegar", "ponta do indicador"],
                    camadas=["palma_dorso", "dedos_atras", "OBJETO", "polegar", "dedos_frente"],
                    objetos=["moeda", "ficha", "envelope pequeno", "carta"], apoio="objeto fica entre as duas pontas, de frente para a câmera"),
    "tripe": pegada("Tripé", "precisao", "polegar, indicador e médio se encontram; anelar e mínimo dobrados",
                    [48, 28, 30], [38, 50, 28], [40, 55, 30], [80, 95, 55], [82, 98, 56], pulso="dorso_camera",
                    pontos=["ponta do polegar", "ponta do indicador", "ponta do médio"],
                    camadas=["palma_dorso", "dedos_atras", "OBJETO", "polegar", "dedos_frente"],
                    objetos=["caneta", "carta", "cartão VIP", "envelope"], apoio="objeto entre as 3 pontas"),
    "lateral": pegada("Pegada lateral", "precisao", "polegar esticado apertando o objeto contra o lado do indicador dobrado",
                      [10, 5, 5], [80, 95, 55], [82, 97, 55], [84, 98, 56], [85, 100, 55], pulso="lado_polegar",
                      pontos=["ponta do polegar", "lado do indicador"],
                      camadas=["palma_dorso", "dedos_atras", "OBJETO", "polegar"],
                      objetos=["chave", "cartão", "envelope", "ingresso"], apoio="objeto plano e fino, de lado para a câmera"),
    "gancho": pegada("Gancho", "forca", "os 4 dedos em gancho (primeira junta reta, as outras dobradas), polegar solto; carga pendurada",
                     [15, 10, 10], [10, 90, 70], [10, 92, 72], [10, 94, 74], [10, 96, 76], pulso="dorso_camera",
                     pontos=["face interna dos 4 dedos"],
                     camadas=["palma_dorso", "OBJETO", "dedos_frente", "polegar"],
                     objetos=["sacola", "baú com alça", "bolsa", "cesta"], apoio="alça passa por dentro dos dedos; o objeto pende para baixo"),
    "celular": pegada("Segurar celular", "precisao", "dedos por trás do aparelho, polegar na lateral ou na frente, apoio na palma",
                      [35, 20, 15], [40, 45, 25], [42, 48, 26], [44, 50, 28], [46, 52, 30], pulso="palma_camera",
                      pontos=["palma", "dedos por trás", "ponta do polegar"],
                      camadas=["palma_dorso", "dedos_atras", "OBJETO", "polegar"],
                      objetos=["celular", "tablet", "painel"], apoio="aparelho em pé, tela para a câmera, dedos não aparecem"),
}
json.dump({"_leia": "Estilos de pegar objetos. Ângulos de flexão em graus (0 esticado, + dobra para a palma), por dedo na ordem "
                    "base, meio e ponta (mcp, pip, dip); polegar na ordem cmc, mcp, ip. 'contato' diz onde o objeto toca a mão. "
                    "'ordem_das_camadas' é de baixo para cima e diz o que fica na frente do objeto: é o que o montador usa.",
           "pegadas": PEGADAS}, open(f"{SAIDA}/pegadas.json", "w"), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- objetos (pontos de pega)
OBJETOS = {
    "envelope": {"pegada": "pinca", "ponto": "canto superior do envelope", "eixo": "lado maior na horizontal"},
    "moeda": {"pegada": "pinca", "ponto": "borda esquerda e direita", "eixo": "face para a câmera"},
    "ficha": {"pegada": "pinca", "ponto": "bordas opostas", "eixo": "face para a câmera"},
    "cartao_vip": {"pegada": "tripe", "ponto": "meio do lado menor", "eixo": "horizontal"},
    "orbe": {"pegada": "esferica", "ponto": "centro do orbe acima da palma", "eixo": "sem eixo"},
    "celular": {"pegada": "celular", "ponto": "meio do lado direito (ou esquerdo)", "eixo": "vertical, tela para a câmera"},
    "taca": {"pegada": "cilindrica", "ponto": "haste", "eixo": "vertical"},
    "trofeu": {"pegada": "cilindrica", "ponto": "base da haste", "eixo": "vertical"},
    "bau": {"pegada": "gancho", "ponto": "alça", "eixo": "pende para baixo"},
    "cajado": {"pegada": "empunha", "ponto": "a um terço da altura", "eixo": "vertical, sai dos dois lados da mão"},
    "chave": {"pegada": "lateral", "ponto": "corpo da chave", "eixo": "horizontal"},
    "dedo_aponta": {"pegada": "aponta", "ponto": "ponta do indicador", "eixo": "na direção do alvo"},
}
json.dump({"_leia": "Ponto de pega de cada objeto do projeto. O objeto não tem esqueleto: só um ponto, um eixo e a pegada que usa.",
           "objetos": OBJETOS}, open(f"{SAIDA}/objetos.json", "w"), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- prévia (perfil, cinemática direta)
def cadeia(base, comp, ang):
    pts, a, (x, y) = [base], 0.0, base
    for l, f in zip(comp, ang):
        a += math.radians(f)
        x += l * math.cos(-a + math.pi / 2) * 1.0
        y += l * math.sin(-a + math.pi / 2) * 1.0
        pts.append((x, y))
    return pts

COR = {"polegar": (220, 90, 60), "indicador": (40, 110, 200), "medio": (60, 160, 90), "anelar": (170, 110, 200), "minimo": (200, 150, 40)}
ids = list(PEGADAS)
cols = 4
rows = math.ceil(len(ids) / cols)
W, H, ESC = 260, 260, 190
prev = Image.new("RGB", (W * cols, H * rows), (245, 245, 245))
d = ImageDraw.Draw(prev)
try:
    f = ImageFont.truetype("DejaVuSans-Bold.ttf", 15)
except Exception:
    f = None
for i, pid in enumerate(ids):
    p = PEGADAS[pid]
    ox, oy = (i % cols) * W + 70, (i // cols) * H + 225
    d.text((ox - 60, oy - 215), p["nome"], fill=(20, 20, 20), font=f)
    tr = lambda q: (ox + q[0] * ESC, oy - q[1] * ESC)
    d.line([tr((0.0, 0)), tr((0.0, PALMA))], fill=(120, 120, 120), width=7)
    for dedo, key in zip(DEDOS, ["indicador", "medio", "anelar", "minimo"]):
        ang = p[f"{key}_mcp_pip_dip"]
        pts = cadeia((0.0, PALMA), FALANGES[dedo], ang)
        d.line([tr(q) for q in pts], fill=COR[dedo], width=4)
    cmc, mcp, ip = p["polegar_cmc_mcp_ip"]
    pts = cadeia((0.0, 0.12), FALANGES["polegar"], [-70 + cmc * 0.6, mcp * 0.9, ip])
    d.line([tr(q) for q in pts], fill=COR["polegar"], width=4)
prev.save(f"{SAIDA}/previa-pegadas.png")
print("ok", SAIDA, len(PEGADAS), "pegadas,", len(OBJETOS), "objetos")
