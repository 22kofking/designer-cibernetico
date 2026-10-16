# Esqueletos fixos do model sheet (formato OpenPose/DWPose de 18 pontos), iguais para todo bicho.
import math, json
from PIL import Image, ImageDraw
W, H = 768, 1024
LIMB = [[2,3],[2,6],[3,4],[4,5],[6,7],[7,8],[2,9],[9,10],[10,11],[2,12],[12,13],[13,14],[2,1],[1,15],[15,17],[1,16],[16,18]]
COR = [[255,0,0],[255,85,0],[255,170,0],[255,255,0],[170,255,0],[85,255,0],[0,255,0],[0,255,85],[0,255,170],[0,255,255],
       [0,170,255],[0,85,255],[0,0,255],[85,0,255],[170,0,255],[255,0,255],[255,0,170],[255,0,85]]
# 0 nariz 1 pescoço 2 ombroD 3 cotoveloD 4 pulsoD 5 ombroE 6 cotoveloE 7 pulsoE 8 quadrilD 9 joelhoD 10 tornozeloD
# 11 quadrilE 12 joelhoE 13 tornozeloE 14 olhoD 15 olhoE 16 orelhaD 17 orelhaE  (D = direita do personagem = esquerda da imagem)
BASE = {0:(384,250),1:(384,350),2:(284,365),5:(484,365),8:(330,640),11:(438,640),9:(326,795),12:(442,795),
        10:(322,945),13:(446,945),14:(358,222),15:(410,222),16:(326,232),17:(442,232)}
BRACOS = {
 'frente':     {3:(236,500),4:(212,630),6:(532,500),7:(556,630)},              # A-pose neutra
 'aponta':     {3:(262,480),4:(340,430),6:(540,490),7:(468,600)},              # aponta para quem vê, mão na cintura
 'ergue':      {3:(226,260),4:(214,130),6:(540,490),7:(468,600)},              # braço erguido segurando objeto
 'punho':      {3:(214,300),4:(256,160),6:(530,505),7:(552,635)},              # punho erguido
 'abertos':    {3:(196,420),4:(96,330),6:(572,420),7:(672,330)},               # braços abertos apresentando
 'segura':     {3:(276,505),4:(352,470),6:(492,505),7:(416,470)},              # segura objeto com as duas mãos
 'celular':    {3:(262,480),4:(340,430),6:(572,430),7:(560,290)},              # mostra celular erguido e aponta
}
def desenhar(pts, nome):
    im = Image.new('RGB', (W, H), 'black')
    for i, (a, b) in enumerate(LIMB):
        a, b = a - 1, b - 1
        if a not in pts or b not in pts: continue
        (x1, y1), (x2, y2) = pts[a], pts[b]
        cor = tuple(int(c * 0.6) for c in COR[i])
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        L = math.hypot(x2 - x1, y2 - y1) / 2; ang = math.atan2(y2 - y1, x2 - x1); sw = 6
        poly = [(mx + L * math.cos(t) * math.cos(ang) - sw * math.sin(t) * math.sin(ang),
                 my + L * math.cos(t) * math.sin(ang) + sw * math.sin(t) * math.cos(ang)) for t in [k * math.pi / 18 for k in range(36)]]
        ov = Image.new('RGB', (W, H), 'black'); ImageDraw.Draw(ov).polygon(poly, fill=cor)
        im = Image.composite(ov, im, ov.convert('L').point(lambda v: 255 if v else 0))
    d = ImageDraw.Draw(im)
    for k, (x, y) in pts.items():
        d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=tuple(COR[k]))
    im.save(f'poses/{nome}.png')
for nome, b in BRACOS.items():
    desenhar({**BASE, **b}, nome)
json.dump({n: {**BASE, **b} for n, b in BRACOS.items()}, open('poses/poses.json', 'w'))
# prancha
S = Image.new('RGB', (len(BRACOS) * 192, 270), 'white'); d = ImageDraw.Draw(S)
for i, n in enumerate(BRACOS):
    S.paste(Image.open(f'poses/{n}.png').resize((192, 256)), (i * 192, 14)); d.text((i * 192 + 4, 1), n, fill='black')
S.save('poses-prancha.png')
