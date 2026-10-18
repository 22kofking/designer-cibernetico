"""Monta a biblioteca da Mesa: imagens leves (lado maior até 900 px, WebP com transparência) e biblioteca/indice.json.

Uso: python3 ferramentas/montar-biblioteca.py [saida=biblioteca] [raiz=/mnt/project-files]

A biblioteca fica FORA do git (tem recortes das nossas marcas e referências): a Mesa a lê de
biblioteca/indice.json, ao lado da página (ou de window.BIBLIOTECA). Cada item do índice:
  { id, categoria, sub, nome, arquivo, w, h, fonte }
Imagens em mascotes/biblioteca-fontes (fundo tirado pelo BiRefNet) entram nos mascotes de IA.
"""
import glob, json, os, re, shutil, sys
from PIL import Image

SAIDA = sys.argv[1] if len(sys.argv) > 1 else 'biblioteca'
RAIZ = sys.argv[2] if len(sys.argv) > 2 else '/mnt/project-files'
LADO = 900

CATEGORIAS = [
    ('mascotes', 'Mascotes'),
    ('elementos-3d', 'Elementos 3D (IA)'),
    ('elementos-vetor', 'Elementos por código'),
    ('recortes', 'Recortes da Arara'),
    ('logos', 'Logos'),
]

itens = []
usados = set()


def slug(t):
    t = re.sub(r'[^a-zA-Z0-9]+', '-', t.lower()).strip('-')
    return t or 'item'


def adicionar(categoria, sub, nome, origem, fonte, id_base=None):
    if not os.path.exists(origem):
        print('falta', origem)
        return
    id_ = slug(id_base or f'{categoria}-{sub}-{nome}')
    base, k = id_, 2
    while id_ in usados:
        id_ = f'{base}-{k}'; k += 1
    usados.add(id_)
    im = Image.open(origem).convert('RGBA')
    bbox = im.getchannel('A').getbbox()
    if bbox:  # corta a folga transparente: o objeto entra na cena do tamanho dele
        im = im.crop(bbox)
    if max(im.size) > LADO:
        f = LADO / max(im.size)
        im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
    pasta = os.path.join(SAIDA, 'img', categoria)
    os.makedirs(pasta, exist_ok=True)
    arq = os.path.join(pasta, f'{id_}.webp')
    im.save(arq, 'WEBP', quality=88, method=4)
    itens.append({'id': id_, 'categoria': categoria, 'sub': sub, 'nome': nome, 'arquivo': os.path.relpath(arq, SAIDA),
                  'w': im.width, 'h': im.height, 'fonte': fonte})


def p(*partes):
    return os.path.join(RAIZ, *partes)


POSES = {'abertos': 'braços abertos', 'aponta': 'aponta', 'celular': 'celular', 'ergue': 'braço erguido', 'frente': 'de frente',
         'punho': 'punho', 'segura': 'segura'}
BICHOS = {'capivara': 'Capivara', 'onca': 'Onça'}
FIGS = {'base': 'camiseta', 'farao': 'faraó'}

# ---- mascotes
for f in sorted(glob.glob(p('arara/elementos/mascote/*.png'))):
    banner = os.path.basename(f).split('__')[0]
    adicionar('mascotes', 'Arara (recortes dos banners)', f'Arara · {banner}', f, 'recorte do banner da ARARA519', f'arara-{banner}')
FOLHA = {'arara-rei-convite': 'Arara rei · convite', 'arara-rei-deposito': 'Arara rei · depósito',
         'arara-turista-envelopes': 'Arara turista · envelopes', 'arara-turista-redes': 'Arara turista · redes'}
for f in sorted(glob.glob(p('arara/folha/*.webp'))):
    n = os.path.splitext(os.path.basename(f))[0]
    adicionar('mascotes', 'Arara (rei e turista)', FOLHA.get(n, n), f, 'folha de figurinos da arara', n)
for f in sorted(glob.glob(p('mascotes/biblioteca-fontes/capivara-*-f60.png'))):
    _, fig, pose, _f = os.path.basename(f)[:-4].split('-')
    adicionar('mascotes', 'Capivara (IA, tratada)', f'Capivara {FIGS[fig]} · {POSES[pose]}', f, 'Z-Image + PhotoCraft, fundo tirado', f'capivara-ia-{fig}-{pose}')
for d in sorted(glob.glob(p('mascotes/boneco/pecas/*/'))):
    n = os.path.basename(os.path.normpath(d))
    bicho, fig, pose = n.split('-')
    adicionar('mascotes', 'Capivara e onça (montagem por código)', f'{BICHOS[bicho]} {FIGS[fig]} · {POSES[pose]}', os.path.join(d, 'montagem.png'),
              'boneco padrão, montagem por código', f'boneco-{n}')
for parte, nome in [('farao/cabeca', 'Capivara faraó · cabeça'), ('farao/corpo', 'Capivara faraó · corpo'),
                    ('mago/corpo', 'Capivara mago · corpo'), ('mago/orbe', 'Capivara mago · orbe')]:
    adicionar('mascotes', 'Capivara (partes)', nome, p('mascotes/capivara362-a', parte + '.png'), 'partes separadas (SlimSAM)', 'parte-' + parte.replace('/', '-'))
for d, nome in [('home-vip-gateway', 'Capivara faraó · home VIP'), ('promo-telegram-gateway', 'Capivara mago · promo Telegram')]:
    adicionar('mascotes', 'Capivara (camadas 9pmbet)', nome, p('gera-imagem/9pmbet/camadas', d, '03-mascote.png'), 'camada de mascote gerada pelo gateway', 'camada-' + d)

# ---- elementos 3D (IA) e por código
NOMES = {'bau': 'Baú', 'notas': 'Notas', 'cartao_vip': 'Cartão VIP', 'coroa_pedestal': 'Coroa com pedestal', 'drink': 'Drink',
         'oculos': 'Óculos', 'medalhao': 'Medalhão', 'faixa': 'Faixa', 'caca_niquel': 'Caça-níquel',
         'moedas_coroa': 'Moeda com coroa', 'moedas_furadas': 'Moeda furada', 'moedas_ouro': 'Moeda de ouro', 'envelopes': 'Envelope',
         'coracoes': 'Coração (curtida)', 'icones_instagram': 'Ícone do Instagram', 'icone_telegram': 'Ícone do Telegram',
         'celulares': 'Celular (Instagram)', 'celulares_telegram': 'Celular (Telegram)'}
for f in sorted(glob.glob(p('arara/recriados/elementos-ia/camadas/*.png'))):
    n = os.path.basename(f)[:-4]
    adicionar('elementos-3d', 'Refeitos da referência (Z-Image)', NOMES.get(n, n), f, 'recorte refeito com IA', 'ia-' + n)
for f in sorted(glob.glob(p('arara/recriados/aprimorados-z/mestres/*.png'))):
    n = os.path.basename(f)[:-4]
    if n.endswith('_vetor'):
        continue
    adicionar('elementos-3d', 'Mestres aprimorados (de frente)', NOMES.get(n, n), f, 'desenho por código + Z-Image força 0,8', 'mestre-' + n)
for f in sorted(glob.glob(p('arara/recriados/aprimorados-z/soltos-3d/*.png'))):
    n = os.path.basename(f)[:-4]
    adicionar('elementos-3d', 'Em perspectiva (avulsos)', NOMES.get(n, n), f, 'Z-Image força 0,9, fundo tirado', 'perspectiva-' + n)
for f in sorted(glob.glob(p('arara/recriados/aprimorados-cpu/mestres/*_vetor.png'))):
    n = os.path.basename(f)[:-10]
    adicionar('elementos-vetor', 'Mestres desenhados por código', NOMES.get(n, n), f, 'SVG por código (recriar-elementos)', 'vetor-' + n)

# ---- recortes da Arara (sem os que têm defeito)
G = p('arara/elementos-v2/grupos')
grupos = json.load(open(os.path.join(G, 'grupos.json')))
ROTULO = {'baus': 'Baús', 'moedas': 'Moedas', 'coracoes': 'Corações', 'icones_instagram': 'Ícones do Instagram', 'celulares': 'Celulares',
          'envelopes': 'Envelopes', 'piramide_rede': 'Pirâmide de indicação', 'notas': 'Notas', 'cartao_vip': 'Cartão VIP',
          'caca_niquel': 'Caça-níquel', 'coroa_pedestal': 'Coroa com pedestal', 'drink_e_oculos': 'Drink e óculos', 'icone_telegram': 'Ícone do Telegram'}
for f in sorted(glob.glob(os.path.join(G, '*', '*__*.png'))):
    grupo = os.path.basename(os.path.dirname(f))
    if grupo == 'scripts':
        continue
    banner, id_ = os.path.basename(f)[:-4].split('__', 1)
    status = next((i.get('status') for b, bv in grupos.get(grupo, {}).items() if isinstance(bv, dict) and b == banner for i in bv.get('itens', []) if i['id'] == id_), None)
    if status == 'com_defeito' or id_ in ('caca_niquel', 'linhas_luz', 'piramide_inteira'):
        continue
    adicionar('recortes', ROTULO.get(grupo, grupo), f'{id_.replace("_", " ")} · {banner}', f, f'recorte da ARARA519 ({banner})', f'recorte-{banner}-{id_}')

# ---- recortes da GPU (BiRefNet HR, zoom na caixa do grafo; ver estrutura/recorte-birefnet-runpod.md)
for f in sorted(glob.glob(p('estrutura/recorte-teste/gpu/finais/*.png'))):
    banner, id_ = os.path.basename(f)[:-4].split('__', 1)
    adicionar('recortes', 'Recortes da GPU (BiRefNet HR)', f'{id_.replace("_", " ")} · {banner}', f, 'recorte GPU (BiRefNet HR, 2026-10-17)', f'recorte-gpu-{banner}-{id_}')

# ---- logos
for f, nome in [(p('logos/capivara362.png'), 'CAPIVARA362'), (p('logos/tucano362.png'), 'TUCANO362'), (p('arara/logo/logo.webp'), 'ARARA519')]:
    adicionar('logos', 'Logos das casas', nome, f, 'logo transparente', 'logo-' + nome)
for f in sorted(glob.glob(p('logos-do-zero/capivara362/[1-5]*.png'))):
    n = os.path.basename(f)[:-4]
    if n == '5-neon-fundo-escuro':
        continue
    adicionar('logos', 'CAPIVARA362 do zero (vetorial)', 'CAPIVARA362 · ' + n.split('-', 1)[1].replace('-', ' '), f, 'logo vetorial do zero', 'logo-do-zero-' + n)

contagem = {c: sum(1 for i in itens if i['categoria'] == c) for c, _ in CATEGORIAS}
indice = {'versao': 1, 'categorias': [{'id': c, 'rotulo': r, 'total': contagem[c]} for c, r in CATEGORIAS], 'itens': itens}
json.dump(indice, open(os.path.join(SAIDA, 'indice.json'), 'w'), ensure_ascii=False, indent=0)
tam = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(os.path.join(SAIDA, 'img')) for f in fs)
print(contagem, f'{len(itens)} itens, {tam / 1e6:.1f} MB')
