# Roda no Pod: preenche o workflow fixo com as variáveis de cada pedido e manda ao ComfyUI local.
import copy, json, shutil, sys, time, urllib.request, os
WF = json.load(open('/work/mascote-model-sheet.json')); C = 'http://127.0.0.1:8188'
for f in os.listdir('/work/poses'):
    if f.endswith('.png'): shutil.copy(f'/work/poses/{f}', f'/work/ComfyUI/input/pose-{f}')
pedidos = json.load(open(sys.argv[1])); os.makedirs('/work/saida', exist_ok=True)
for p in pedidos:
    w = copy.deepcopy(WF)
    w['6']['inputs']['image'] = f"pose-{p['pose']}.png"
    w['9']['inputs']['text'] = p['prompt']; w['12']['inputs']['seed'] = p.get('seed', 1)
    w['7']['inputs']['strength'] = p.get('pose_forca', 0.75)
    if not p.get('lora', True): w['7']['inputs']['model'] = ['1', 0]
    w['14']['inputs']['filename_prefix'] = p['nome']
    t = time.time()
    pid = json.load(urllib.request.urlopen(urllib.request.Request(C + '/prompt', data=json.dumps({'prompt': w}).encode(), headers={'Content-Type': 'application/json'})))['prompt_id']
    while True:
        h = json.load(urllib.request.urlopen(f'{C}/history/{pid}'))
        if pid in h and h[pid].get('status', {}).get('completed') is not None: break
        time.sleep(1)
    st = h[pid]['status']
    if st.get('status_str') != 'success': print(p['nome'], 'ERRO', json.dumps(st)[:1500], flush=True); continue
    for img in h[pid]['outputs']['14']['images']:
        shutil.copy(f"/work/ComfyUI/output/{img['filename']}", f"/work/saida/{p['nome']}.png")
    print(p['nome'], 'ok', round(time.time() - t, 1), 's', flush=True)
