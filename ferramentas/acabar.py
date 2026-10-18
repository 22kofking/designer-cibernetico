"""Motor de acabamento por região (fase B): leva a montagem para perto da ficha de acabamento da referência.

Uso: python3 ferramentas/acabar.py <pasta-da-peca> <ficha-da-referencia.json> <decomposicao-dir> <peca> <saida-dir> [--rodadas=3]
  pasta-da-peca        tem cena.json e assets/ (ex.: /mnt/project-files/pecas/arara519-componentes/arara-home-1)
  ficha-da-referencia  acabamento.json gerado por analisar-acabamento.py na REFERÊNCIA
  decomposicao-dir     /mnt/project-files/arara/decomposicao (máscaras e caixas das partes)
  saida-dir            recebe cena-acabada.json (editável na Mesa), assets/, mascaras/ e saida/*.png

Em cada rodada: renderiza a cena, mede a montagem com as mesmas máscaras da referência e ajusta, por região do fundo
e por parte, os níveis (ajustes.linear: ganho e desloc) e a saturação para igualar ponto preto, ponto branco, mediana
e saturação da ficha. Nada é queimado em pixel: o resultado é a cena com camadas de máscara e ajustes, editável.
"""
import copy, json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(AQUI)


def run(*cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f'falhou: {" ".join(cmd)}\n{r.stdout}\n{r.stderr}')
    return r.stdout


def renderizar(cena_json, saida):
    run('node', os.path.join(REPO, 'src/node/cli.js'), 'render', cena_json, '--saida', saida, '--formatos', 'png')
    nome = json.load(open(cena_json)).get('nome') or os.path.splitext(os.path.basename(cena_json))[0]
    return os.path.join(saida, nome + '.png')


def medir(png, decomposicao, peca, destino):
    run('python3', os.path.join(AQUI, 'analisar-acabamento.py'), decomposicao, destino, peca, f'--imagem={png}', '--mascaras')
    return json.load(open(os.path.join(destino, peca, 'acabamento.json')))


def linear_para(ours, alvo, peso=(1, 2, 1)):
    """ganho e desloc que levam [p1, p50, p99] da montagem aos da referência (mínimos quadrados, mediana com peso maior)."""
    if ours[2] - ours[0] < 0.05:
        return 1.0, 0.0
    x = np.repeat(ours, peso)
    y = np.repeat(alvo, peso)
    g, d = np.polyfit(x, y, 1)
    return float(np.clip(g, 0.6, 1.6)), float(np.clip(d, -0.25, 0.25))


def ajustar(no, ours, ref, rodada):
    """Compõe uma correção por canal (R, G, B) sobre os ajustes que o nó já tem: casa pretos, meios e brancos de cada cor,
    o que move o matiz (sombras azuladas, realces dourados) sem mexer na saturação. Passo parcial para não oscilar."""
    if not ours or not ref or not ours.get('tons_rgb') or not ref.get('tons_rgb'):
        return None
    passo = 0.7 if rodada == 0 else 0.5
    novos = [linear_para(o, r) for o, r in zip(ours['tons_rgb'], ref['tons_rgb'])]
    a = no.setdefault('ajustes', {})
    lin = a.get('linear', {'ganho': [1, 1, 1], 'desloc': [0, 0, 0]})
    ga = lin['ganho'] if isinstance(lin['ganho'], list) else [lin['ganho']] * 3
    de = lin['desloc'] if isinstance(lin['desloc'], list) else [lin['desloc']] * 3
    ganho, desloc = [], []
    for c, (g, d) in enumerate(novos):
        g, d = 1 + (g - 1) * passo, d * passo
        ganho.append(round(ga[c] * g, 4))
        desloc.append(round(de[c] * g + d, 4))
    a['linear'] = {'ganho': ganho, 'desloc': desloc}
    return a


def sombra_de_contato(no, ours, ref, rodada):
    """Nível 2 do plano: se a referência escurece mais o chão em volta da parte do que a montagem, põe (ou reforça) uma sombra."""
    co, cr = ours.get('contato'), ref.get('contato')
    if co is None or cr is None or co - cr < 0.1:
        return False
    ef = no.setdefault('efeitos', {})
    s = ef.setdefault('sombra', {'cor': '#000000', 'opacidade': 0.0, 'desfoque': 14, 'dx': 0, 'dy': 6})
    s['opacidade'] = round(min(0.85, s['opacidade'] + min(0.5, (co - cr) * 0.6)), 2)
    return True


def delta_pixel(a_png, b_png, largura=128):
    def ler(p):
        im = Image.open(p).convert('RGB')
        h = round(im.height * largura / im.width)
        return np.asarray(im.resize((largura, h), Image.LANCZOS), dtype=np.float32) / 255
    sys.path.insert(0, AQUI)
    import importlib.util
    espec = importlib.util.spec_from_file_location('analisar', os.path.join(AQUI, 'analisar-acabamento.py'))
    mod = importlib.util.module_from_spec(espec)
    espec.loader.exec_module(mod)
    a, b = ler(a_png), ler(b_png)
    return float(np.linalg.norm(mod.lab_de_rgb(a) - mod.lab_de_rgb(b), axis=-1).mean())


def tabela(ref, ficha):
    linhas = []
    for k, rv in ref['regioes'].items():
        o = ficha['regioes'][k]
        linhas.append((k, rv, o))
    for k, rv in ref['partes'].items():
        if k in ficha['partes'] and rv.get('tons'):
            linhas.append((k, rv, ficha['partes'][k]))
    return linhas


def resumo(titulo, ref, ficha):
    print(f'-- {titulo}')
    print(f'{"região/parte":22} {"p1 ref/ours":>14} {"p50 ref/ours":>14} {"p99 ref/ours":>14} {"sat ref/ours":>14}')
    for k, rv, o in tabela(ref, ficha):
        if not o.get('tons'):
            continue
        t, u = rv['tons'], o['tons']
        sr, so = rv.get('saturacao'), o.get('saturacao')
        print(f'{k:22} {t[0]:6.2f}/{u[0]:<6.2f}  {t[1]:6.2f}/{u[1]:<6.2f}  {t[2]:6.2f}/{u[2]:<6.2f}  ' + (f'{sr:6.2f}/{so:<6.2f}' if sr is not None and so is not None else ''))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opcoes = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    pasta, ficha_ref, decomp, peca, saida = args
    rodadas = int(opcoes.get('rodadas', 3))
    ref = json.load(open(ficha_ref))
    os.makedirs(saida, exist_ok=True)
    shutil.copytree(os.path.join(pasta, 'assets'), os.path.join(saida, 'assets'), dirs_exist_ok=True)
    cena = json.load(open(os.path.join(pasta, 'cena.json')))
    cena['nome'] = cena.get('nome', peca) + '-acabada'
    destino_cena = os.path.join(saida, 'cena-acabada.json')

    # rodada 0: a montagem como está
    json.dump(cena, open(destino_cena, 'w'), ensure_ascii=False, indent=1)
    png0 = renderizar(destino_cena, os.path.join(saida, 'saida0'))
    ficha = medir(png0, decomp, peca, os.path.join(saida, 'medida0'))
    resumo('montagem original', ref, ficha)
    antes = png0

    # camadas de região: cópias do fundo, cada uma com a máscara da sua região, logo acima do fundo
    fundo = next(n for n in cena['nos'] if n['tipo'] == 'imagem' and n.get('papel') == 'fundo')
    i0 = cena['nos'].index(fundo)
    shutil.copytree(os.path.join(saida, 'medida0', peca, 'mascaras'), os.path.join(saida, 'mascaras'), dirs_exist_ok=True)
    regioes = []
    for k, nome in enumerate(['longe', 'meio', 'perto']):
        n = copy.deepcopy(fundo)
        n['id'] = f'{fundo["id"]}-{nome}'
        n['mascara'] = f'../mascaras/fundo_{nome}.png' if False else f'mascaras/fundo_{nome}.png'
        n['encaixe'] = 'esticar'
        regioes.append((f'fundo_{nome}', n))
        cena['nos'].insert(i0 + 1 + k, n)
    nos_por_id = {n['id']: n for n in cena['nos']}
    # o logo e o texto são da marca: não entram no ajuste de tom
    partes = {k: nos_por_id[k] for k, v in ref['partes'].items() if k in nos_por_id and nos_por_id[k]['tipo'] == 'imagem' and v.get('tipo') not in ('logo', 'texto')}
    refpng = None
    raiz = os.path.dirname(decomp.rstrip('/'))
    nome_ref = json.load(open(os.path.join(decomp, f'{peca}.json')))['referencia']
    while raiz != '/' and not os.path.exists(os.path.join(raiz, nome_ref)):
        raiz = os.path.dirname(raiz)
    if os.path.exists(os.path.join(raiz, nome_ref)):
        refpng = os.path.join(raiz, nome_ref)
    rp = os.path.join(saida, 'referencia.png')
    if refpng:
        Image.open(refpng).convert('RGB').save(rp)
    pal = lambda p: float(run('node', '-e', f"import('{REPO}/src/qualidade/cor.js').then(async m=>console.log(await m.deltaDeCor('{p}','{rp}')))").strip())
    melhor = pal(png0) if refpng else None
    atual = ficha
    for r in range(rodadas):
        guardado = copy.deepcopy(cena)
        for chave, no in ([] if opcoes.get('sem-tom') else regioes):
            ajustar(no, atual['regioes'].get(chave), ref['regioes'].get(chave), r)
        for chave, no in ([] if opcoes.get('so-fundo') or opcoes.get('sem-tom') else partes.items()):
            ajustar(no, atual['partes'].get(chave), ref['partes'].get(chave), r)
        json.dump(cena, open(destino_cena, 'w'), ensure_ascii=False, indent=1)
        png = renderizar(destino_cena, os.path.join(saida, f'saida{r + 1}'))
        if opcoes.get('contato'):
            for chave, no in partes.items():
                if atual['partes'].get(chave) and ref['partes'].get(chave):
                    sombra_de_contato(no, atual['partes'][chave], ref['partes'][chave], r)
            json.dump(cena, open(destino_cena, 'w'), ensure_ascii=False, indent=1)
            png = renderizar(destino_cena, os.path.join(saida, f'saida{r + 1}'))
        if refpng:
            nova = pal(png)
            print(f'rodada {r + 1}: ΔE de paleta {melhor:.2f} -> {nova:.2f}')
            if nova > melhor + 0.05:
                print('  piorou: volta a rodada anterior e para')
                cena.clear(); cena.update(guardado)
                json.dump(cena, open(destino_cena, 'w'), ensure_ascii=False, indent=1)
                png = renderizar(destino_cena, os.path.join(saida, f'saida{r + 1}'))
                break
            melhor = nova
        atual = medir(png, decomp, peca, os.path.join(saida, f'medida{r + 1}'))
        resumo(f'rodada {r + 1}', ref, atual)
    if refpng:
        print('\nΔE por pixel (128 px de largura):  antes', round(delta_pixel(antes, rp), 2), ' depois', round(delta_pixel(png, rp), 2))
        print('ΔE de paleta:                      antes', round(pal(antes), 2), ' depois', round(pal(png), 2))
    shutil.copy(png, os.path.join(saida, 'acabada.png'))
    shutil.copy(antes, os.path.join(saida, 'antes.png'))
    print('cena editável:', destino_cena)


if __name__ == '__main__':
    main()
