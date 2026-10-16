# Cliente mínimo da RunPod (Public Endpoints). Chave lida de arquivo, nunca impressa.
import base64, json, sys, time, urllib.request, os
CHAVE = open(os.environ['RP_CHAVE_ARQ']).read().strip()
GASTO = os.environ.get('RP_GASTO_ARQ')
def _post(url, corpo):
    req = urllib.request.Request(url, data=json.dumps(corpo).encode(), headers={'Authorization': f'Bearer {CHAVE}', 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=600))
def _get(url):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {CHAVE}'})
    return json.load(urllib.request.urlopen(req, timeout=120))
def data_uri(caminho):
    tipo = 'png' if caminho.endswith('.png') else 'jpeg'
    return f'data:image/{tipo};base64,' + base64.b64encode(open(caminho, 'rb').read()).decode()
def rodar(endpoint, entrada, saida):
    r = _post(f'https://api.runpod.ai/v2/{endpoint}/runsync', {'input': entrada})
    while r.get('status') in ('IN_QUEUE', 'IN_PROGRESS'):
        time.sleep(3); r = _get(f"https://api.runpod.ai/v2/{endpoint}/status/{r['id']}")
    if r.get('status') != 'COMPLETED': raise SystemExit(f'falhou: {json.dumps(r)[:500]}')
    out = r['output']; url = out.get('image_url') or out.get('result')
    urllib.request.urlretrieve(url, saida)
    custo = out.get('cost', 0)
    if GASTO:
        g = float(open(GASTO).read() or 0) if os.path.exists(GASTO) else 0
        open(GASTO, 'w').write(str(g + float(custo)))
    print(saida, 'US$', custo, flush=True)
    return saida
