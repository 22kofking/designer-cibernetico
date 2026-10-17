"""Analista de acabamento: lê UMA referência e grava acabamento.json (fase A do plano do acabamento).

Uso: python3 ferramentas/analisar-acabamento.py <pasta-de-decomposicao> <saida-dir> [peca ...]
  pasta-de-decomposicao  ex.: /mnt/project-files/arara/decomposicao (tem <peca>.json e <peca>/mascaras/*.png)
  saida-dir              recebe <peca>/acabamento.json, <peca>/profundidade.png e <peca>/regioes.png
Opções: --imagem=<png> mede essa imagem (a montagem) no lugar da referência; --mascaras grava as máscaras suaves das regiões.
Sem peças na linha de comando, analisa todas as .json da pasta.

Mede, por região (fundo longe/meio/perto, cada parte com máscara), o que um designer ajustaria: faixa tonal, cor por
faixa de luz, fontes e direção da luz, glow, atmosfera por profundidade, borda (light wrap), contato, vinheta, grão e
nitidez. Tudo por código; a única rede é o Depth Anything V2 Small (Apache-2.0), em CPU.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

LADO_PROF = 518


def lab_de_rgb(rgb):  # rgb 0..1 (..., 3) -> Lab D65
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def hex_de_rgb(c):
    c = np.clip(np.round(np.asarray(c) * 255), 0, 255).astype(int)
    return '#%02x%02x%02x' % tuple(c)


def r(v, n=3):
    return None if v is None else round(float(v), n)


_modelo = None


def profundidade(img):
    """Mapa 0..1, 1 = perto. Depth Anything V2 Small."""
    global _modelo
    from transformers import pipeline
    if _modelo is None:
        _modelo = pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Small-hf', device=-1)
    saida = _modelo(img)['predicted_depth']
    d = saida.squeeze().numpy().astype(np.float32)
    d = np.array(Image.fromarray(d).resize(img.size, Image.BICUBIC))
    lo, hi = np.percentile(d, [1, 99])
    return np.clip((d - lo) / max(hi - lo, 1e-6), 0, 1)  # o modelo dá disparidade: maior = mais perto


def faixa_tonal(L, m):
    v = L[m]
    if v.size < 50:
        return None
    p = np.percentile(v, [1, 50, 99])
    return [r(p[0] / 100), r(p[1] / 100), r(p[2] / 100)]


def tons_rgb(rgb, m):
    """Percentis 1, 50 e 99 de cada canal (R, G, B), 0..1: a base do balanço de cor por região."""
    if m.sum() < 50:
        return None
    return [[r(x) for x in np.percentile(rgb[..., c][m], [1, 50, 99])] for c in range(3)]


def cor_por_faixa(lab, L, m):
    if m.sum() < 100:
        return None
    v = L[m]
    t = np.percentile(v, [33, 66])
    saida = {}
    for nome, sel in (('sombras', v <= t[0]), ('meios', (v > t[0]) & (v <= t[1])), ('realces', v > t[1])):
        if sel.sum() < 20:
            continue
        saida[nome] = [r(x, 1) for x in lab[m][sel].mean(0)]
    return saida


def saturacao(rgb, m):
    mx, mn = rgb.max(-1), rgb.min(-1)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return r(s[m].mean()) if m.any() else None


def fontes_de_luz(L, rgb, bg, W, H, n=3):
    """Manchas mais claras do fundo: centro, cor e força."""
    if bg.sum() < 500:
        return []
    lim = np.percentile(L[bg], 99)
    mancha = (L >= lim) & bg
    rot, k = ndi.label(ndi.binary_dilation(mancha, iterations=3))
    fontes = []
    for i in range(1, k + 1):
        sel = (rot == i) & mancha
        if sel.sum() < 40:
            continue
        ys, xs = np.nonzero(sel)
        fontes.append({'x': r(xs.mean() / W), 'y': r(ys.mean() / H), 'cor': hex_de_rgb(rgb[sel].mean(0)),
                       'area': r(sel.sum() / (W * H), 4), 'forca': r(L[sel].mean() / 100)})
    return sorted(fontes, key=lambda f: -f['area'])[:n]


def glow(L, bg, fonte, W, H):
    """Queda de luminosidade em anéis em volta da fonte (frações da largura). Raio = onde cai à metade do excesso."""
    if not fonte:
        return None
    cx, cy = fonte['x'] * W, fonte['y'] * H
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot(xx - cx, yy - cy) / W
    base = np.percentile(L[bg], 50)
    pico = np.percentile(L[bg & (d < 0.01)], 90) if (bg & (d < 0.01)).sum() > 20 else L[bg].max()
    perfil = []
    for a in np.arange(0.0, 0.5, 0.02):
        s = bg & (d >= a) & (d < a + 0.02)
        perfil.append(L[s].mean() if s.sum() > 30 else np.nan)
    perfil = np.array(perfil)
    excesso = (perfil - base) / max(pico - base, 1e-6)
    meio = next((i for i, e in enumerate(excesso) if np.isfinite(e) and e < 0.5), None)
    return {'fonte': [fonte['x'], fonte['y']], 'raio': r(0.02 * (meio if meio is not None else len(excesso))),
            'forca': r(np.clip(np.nanmean(excesso[1:4]), 0, 1)), 'perfil': [r(e, 2) if np.isfinite(e) else None for e in excesso[:12]]}


def direcao_da_luz(L, m):
    """Ajusta L = a + bx*x + by*y dentro da máscara: o lado mais claro e quão forte."""
    ys, xs = np.nonzero(m)
    if xs.size < 400:
        return None
    sub = slice(None, None, max(1, xs.size // 4000))
    x, y, v = xs[sub].astype(float), ys[sub].astype(float), L[m][sub]
    w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    A = np.stack([np.ones_like(x), (x - x.mean()) / w, (y - y.mean()) / h], 1)
    c, *_ = np.linalg.lstsq(A, v, rcond=None)
    forca = float(np.hypot(c[1], c[2])) / 100
    ang = (np.degrees(np.arctan2(-c[2], c[1])) + 360) % 360  # 0 = claro à direita, 90 = claro em cima
    return {'lado_claro_graus': r(ang, 0), 'contraste_interno': r(forca)}


def borda_e_contato(lab, m, bg_lab_media):
    """Light wrap (quanto a cor do entorno entra na borda) e contato (escurecimento ao redor)."""
    interior = ndi.binary_erosion(m, iterations=14)
    if interior.sum() < 200:
        return None
    cor_int = lab[interior].mean(0)
    saida = {}
    dist_dentro = ndi.distance_transform_edt(m)
    dist_fora = ndi.distance_transform_edt(~m)
    anel_fora = (dist_fora > 2) & (dist_fora <= 10)
    if anel_fora.sum() < 200:
        return None
    cor_fora = lab[anel_fora].mean(0)
    eixo = cor_fora - cor_int
    n2 = float(eixo @ eixo)
    if n2 < 1:
        saida['light_wrap'] = {'forca': 0.0, 'largura_px': 0}
    else:
        forcas = []
        for px in range(1, 15):
            s = (dist_dentro > px - 1) & (dist_dentro <= px)
            if s.sum() < 30:
                forcas.append(0.0)
                continue
            forcas.append(float(np.clip((lab[s].mean(0) - cor_int) @ eixo / n2, 0, 1)))
        forca = forcas[0]
        larg = next((i for i, f in enumerate(forcas) if f < forca * 0.3), len(forcas)) if forca > 0.02 else 0
        saida['light_wrap'] = {'forca': r(forca), 'largura_px': int(larg)}
    perto = (dist_fora > 0) & (dist_fora <= 10)
    longe = (dist_fora > 24) & (dist_fora <= 44)
    if perto.sum() > 100 and longe.sum() > 100:
        saida['contato'] = r(1 - lab[perto][:, 0].mean() / max(lab[longe][:, 0].mean(), 1e-6))  # > 0 = mais escuro junto à parte
    return saida


def vinheta(L, bg, W, H):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot((xx / W - 0.5) * 2, (yy / H - 0.5) * 2) / np.sqrt(2)
    c = bg & (d < 0.35)
    b = bg & (d > 0.75)
    if c.sum() < 200 or b.sum() < 200:
        return None
    return r(np.clip(1 - L[b].mean() / max(L[c].mean(), 1e-6), -1, 1))


def graos_e_nitidez(L, bg, bordas):
    """Ruído medido só em áreas lisas (sem estrutura), para não confundir grão com textura de folhas."""
    fino = L - ndi.gaussian_filter(L, 1.2)
    grad = np.hypot(ndi.sobel(ndi.gaussian_filter(L, 1.0), 0), ndi.sobel(ndi.gaussian_filter(L, 1.0), 1))
    lisa = bg & (ndi.uniform_filter(grad, 15) < np.percentile(grad[bg], 25))
    saida = {'grao_sigma': r(fino[lisa].std() / 100, 4) if lisa.sum() > 500 else None, 'area_lisa': r(lisa.sum() / max(bg.sum(), 1), 3)}
    saida['nitidez_borda'] = r(grad[bordas].mean() / 100, 4) if bordas.sum() > 200 else None
    return saida


def atmosfera(L, lab, bg, prof):
    """Contraste local e cor em função da profundidade: quanto o longe perde de contraste e ganha de cor do ar."""
    if bg.sum() < 1000:
        return None
    loc = np.sqrt(np.maximum(ndi.uniform_filter(L ** 2, 21) - ndi.uniform_filter(L, 21) ** 2, 0))
    d = prof[bg]
    c = loc[bg]
    alvo = np.stack([lab[..., 0][bg], lab[..., 1][bg], lab[..., 2][bg]], 1)
    A = np.stack([np.ones_like(d), d], 1)
    cc, *_ = np.linalg.lstsq(A, c, rcond=None)
    cor = [np.linalg.lstsq(A, alvo[:, i], rcond=None)[0] for i in range(3)]
    return {'contraste_longe': r(cc[0] / 100), 'contraste_perto': r((cc[0] + cc[1]) / 100),
            'queda_contraste_por_profundidade': r(np.clip(-cc[1] / max(cc[0] + cc[1], 1e-6), -1, 2)),
            'cor_do_ar_lab': [r(x[0], 1) for x in cor], 'cor_perto_lab': [r(x[0] + x[1], 1) for x in cor]}


def carregar_mascara(caminho, W, H):
    m = Image.open(caminho)
    if m.mode in ('RGBA', 'LA'):
        a = np.array(m.getchannel('A')).astype(float)
        if a.min() == 255:  # alfa cheio: vale a luminosidade
            a = np.array(m.convert('L')).astype(float)
    else:
        a = np.array(m.convert('L')).astype(float)
    if a.shape != (H, W):
        a = np.array(Image.fromarray(a.astype(np.uint8)).resize((W, H), Image.BILINEAR)).astype(float)
    return a > 127


def analisar(peca, pasta, saida, imagem=None, mascaras=False):
    grafo = json.load(open(os.path.join(pasta, f'{peca}.json')))
    raiz = os.path.dirname(pasta.rstrip('/'))
    while not os.path.exists(os.path.join(raiz, grafo['referencia'])) and raiz != '/':
        raiz = os.path.dirname(raiz)  # a referência é relativa à raiz do projeto (/mnt/project-files)
    ref = Image.open(os.path.join(raiz, grafo['referencia'])).convert('RGB')
    if imagem:  # mede outra imagem (a montagem) com as mesmas máscaras e caixas da referência
        ref = Image.open(imagem).convert('RGB').resize(ref.size, Image.LANCZOS)
    W, H = ref.size
    rgb = np.asarray(ref, dtype=np.float32) / 255
    lab = lab_de_rgb(rgb)
    L = lab[..., 0]
    prof = profundidade(ref)

    partes = {}
    for no in grafo['nos']:
        if no.get('mascara'):
            m = carregar_mascara(os.path.join(pasta, peca, no['mascara']), W, H)
            if no['tipo'] == 'fundo':
                continue
            partes[no['id']] = (no, m)
    # textos não têm máscara: caixas
    ocupado = np.zeros((H, W), bool)
    for _, m in partes.values():
        ocupado |= m
    texto = np.zeros((H, W), bool)
    for no in grafo['nos']:
        if no['tipo'] == 'texto':
            x, y, w, h = no['caixa']
            texto[int(y * H):int((y + h) * H), int(x * W):int((x + w) * W)] = True
    logo = next((m for n, m in partes.values() if n['tipo'] == 'logo'), np.zeros((H, W), bool))
    ocupado |= texto
    bg = ~ndi.binary_dilation(ocupado, iterations=6)

    # regiões do fundo por profundidade (tercis): longe, meio, perto
    t = np.percentile(prof[bg], [33, 66])
    regioes_bg = {'longe': bg & (prof <= t[0]), 'meio': bg & (prof > t[0]) & (prof <= t[1]), 'perto': bg & (prof > t[1])}
    ficha = {'formato': 'acabamento/0.1', 'peca': peca, 'marca': grafo.get('marca'), 'referencia': grafo['referencia'], 'tamanho_px': [W, H],
             'convencao': 'luminosidade 0..1; Lab D65; posições em fração de W e H; tudo medido por código (ver ferramentas/analisar-acabamento.py)'}
    ficha['regioes'] = {}
    for nome, m in regioes_bg.items():
        ficha['regioes'][f'fundo_{nome}'] = {'area': r(m.sum() / (W * H), 3), 'tons': faixa_tonal(L, m), 'tons_rgb': tons_rgb(rgb, m), 'cor_por_faixa_lab': cor_por_faixa(lab, L, m),
                                              'saturacao': saturacao(rgb, m), 'profundidade_media': r(prof[m].mean())}
    luzes = fontes_de_luz(L, rgb, bg, W, H)
    ficha['luz'] = {'fontes': luzes}
    ficha['glow'] = glow(L, bg, luzes[0] if luzes else None, W, H)
    ficha['atmosfera'] = atmosfera(L, lab, bg, prof)
    ficha['vinheta'] = vinheta(L, bg, W, H)
    bordas = np.zeros((H, W), bool)
    ficha['partes'] = {}
    for pid, (no, m) in partes.items():
        if m.sum() < 400:
            continue
        pousa = max(regioes_bg, key=lambda k: (regioes_bg[k] & ndi.binary_dilation(m, iterations=20)).sum())
        bordas |= m & ~ndi.binary_erosion(m, iterations=2)
        info = {'tipo': no['tipo'], 'pousa_em': f'fundo_{pousa}', 'area': r(m.sum() / (W * H), 4), 'tons': faixa_tonal(L, m), 'tons_rgb': tons_rgb(rgb, m),
                'cor_por_faixa_lab': cor_por_faixa(lab, L, m), 'saturacao': saturacao(rgb, m), 'luz': direcao_da_luz(L, m)}
        info.update(borda_e_contato(lab, m, None) or {})
        ficha['partes'][pid] = info
    if texto.any():
        info = {'tipo': 'texto', 'caixa_px': True, 'tons': faixa_tonal(L, texto & (L > np.percentile(L[texto], 70))),
                'cor_por_faixa_lab': cor_por_faixa(lab, L, texto & (L > np.percentile(L[texto], 70))),
                'nota': 'medido nos pixels mais claros das caixas de texto (sem máscara de letra)'}
        ficha['partes']['texto'] = info
    ficha['textura'] = graos_e_nitidez(L, bg, bordas)
    os.makedirs(os.path.join(saida, peca), exist_ok=True)
    if mascaras:  # máscaras suaves das regiões do fundo (branco com alfa) para a máscara de camada da Mesa
        os.makedirs(os.path.join(saida, peca, 'mascaras'), exist_ok=True)
        for nome, m in regioes_bg.items():
            suave = ndi.gaussian_filter(ndi.binary_closing(ndi.binary_opening(m, iterations=2), iterations=6).astype(np.float32), 40)
            suave = np.clip(suave * 1.0, 0, 1)
            png = np.zeros((H, W, 4), np.uint8)
            png[..., :3] = 255
            png[..., 3] = (suave * 255).astype(np.uint8)
            Image.fromarray(png, 'RGBA').save(os.path.join(saida, peca, 'mascaras', f'fundo_{nome}.png'))
    json.dump(ficha, open(os.path.join(saida, peca, 'acabamento.json'), 'w'), ensure_ascii=False, indent=1)
    Image.fromarray((prof * 255).astype(np.uint8)).save(os.path.join(saida, peca, 'profundidade.png'))
    cores = {'longe': (60, 120, 255), 'meio': (60, 200, 90), 'perto': (255, 170, 40)}
    viz = rgb.copy()
    for nome, m in regioes_bg.items():
        viz[m] = viz[m] * 0.45 + np.array(cores[nome]) / 255 * 0.55
    viz[ocupado & ~texto] = viz[ocupado & ~texto] * 0.5 + np.array([1, 0.2, 0.3]) * 0.5
    viz[texto] = viz[texto] * 0.5 + np.array([0.9, 0.9, 0.2]) * 0.5
    Image.fromarray((viz * 255).astype(np.uint8)).save(os.path.join(saida, peca, 'regioes.png'))
    return ficha


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opcoes = dict(a[2:].split('=', 1) if '=' in a else (a[2:], True) for a in sys.argv[1:] if a.startswith('--'))
    pasta, saida, *pecas = args
    pecas = pecas or sorted(f[:-5] for f in os.listdir(pasta) if f.endswith('.json'))
    for p in pecas:
        f = analisar(p, pasta, saida, imagem=opcoes.get('imagem'), mascaras=bool(opcoes.get('mascaras')))
        print(p, 'ok:', len(f['partes']), 'partes,', len(f['luz']['fontes']), 'fontes de luz, vinheta', f['vinheta'], ', grão', f['textura']['grao_sigma'])
