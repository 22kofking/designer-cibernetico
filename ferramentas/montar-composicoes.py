"""Monta as composições prontas da Arara: biblioteca/composicoes.json.

Uso: python3 ferramentas/montar-composicoes.py [biblioteca=biblioteca] [raiz=/mnt/project-files]

Cada grupo de objetos de um banner (arara/elementos-v2/grupos/grupos.json) vira uma composição com a disposição
medida na referência: as camadas são os recortes da biblioteca (montar-biblioteca.py precisa ter rodado antes).
"""
import json, os, re, sys

BIB = sys.argv[1] if len(sys.argv) > 1 else 'biblioteca'
RAIZ = sys.argv[2] if len(sys.argv) > 2 else '/mnt/project-files'

ROTULO = {'baus': 'Baús', 'moedas': 'Moedas', 'coracoes': 'Corações', 'icones_instagram': 'Ícones do Instagram', 'celulares': 'Celular',
          'envelopes': 'Envelopes', 'piramide_rede': 'Pirâmide de indicação', 'notas': 'Notas', 'cartao_vip': 'Cartão VIP',
          'caca_niquel': 'Caça-níquel', 'coroa_pedestal': 'Coroa com pedestal', 'drink_e_oculos': 'Drink e óculos', 'icone_telegram': 'Ícone do Telegram'}


def slug(t):
    return re.sub(r'[^a-zA-Z0-9]+', '-', t.lower()).strip('-') or 'item'


indice = json.load(open(os.path.join(BIB, 'indice.json')))
por_id = {i['id']: i for i in indice['itens']}
grupos = json.load(open(os.path.join(RAIZ, 'arara/elementos-v2/grupos/grupos.json')))

comps = []
for grupo, banners in grupos.items():
    for banner, dados in banners.items():
        if not isinstance(dados, dict):
            continue
        nos = []
        for it in dados.get('itens', []):
            item = por_id.get(slug(f'recorte-{banner}-{it["id"]}'))
            if not item or not it.get('caixa_px'):
                continue
            x, y, w, h = it['caixa_px']
            nos.append((x, y, w, h, item, it['id']))
        if len(nos) < 2:
            continue
        x0 = min(n[0] for n in nos); y0 = min(n[1] for n in nos)
        x1 = max(n[0] + n[2] for n in nos); y1 = max(n[1] + n[3] for n in nos)
        bw, bh = x1 - x0, y1 - y0
        comps.append({
            'versao': 1, 'id': slug(f'arara-{grupo}-{banner}'), 'nome': f'{ROTULO.get(grupo, grupo)} · {banner}',
            'aspecto': round(bw / bh, 4), 'predefinida': True, 'fonte': 'disposição medida na ARARA519',
            'nos': [{'id': slug(i), 'tipo': 'imagem', 'papel': 'elemento', 'asset': item['arquivo'], 'encaixe': 'esticar',
                     'caixa': {'x': round((x - x0) / bw, 4), 'y': round((y - y0) / bh, 4), 'w': round(w / bw, 4), 'h': round(h / bh, 4)}}
                    for x, y, w, h, item, i in nos],
        })
json.dump(comps, open(os.path.join(BIB, 'composicoes.json'), 'w'), ensure_ascii=False)
print(len(comps), 'composições:', ', '.join(f'{c["nome"]} ({len(c["nos"])})' for c in comps))
