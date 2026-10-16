# Cliente do agente no Pod e funções de criar/apagar o Pod.
import json, os, sys, time, urllib.request, base64
from rpgql import gql
EST = 'pod-estado.json'
def estado(): return json.load(open(EST)) if os.path.exists(EST) else {}
def criar(gpu, nuvem='SECURE', maxh=6):
    tok = base64.urlsafe_b64encode(os.urandom(24)).decode()
    ag = base64.b64encode(open('agente.py', 'rb').read()).decode()
    inp = {'cloudType': nuvem, 'gpuCount': 1, 'volumeInGb': 0, 'containerDiskInGb': 160, 'minVcpuCount': 8, 'minMemoryInGb': 48,
           'gpuTypeId': gpu, 'name': 'mascote-workflow-teste', 'imageName': 'runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04',
           'dockerArgs': "bash -c 'mkdir -p /work && echo $AG_SRC | base64 -d > /work/agente.py && python3 /work/agente.py'",
           'ports': '8000/http,8188/http', 'volumeMountPath': '/workspace',
           'env': [{'key': 'AG_TOKEN', 'value': tok}, {'key': 'AG_SRC', 'value': ag}, {'key': 'AG_MAXH', 'value': str(maxh)}]}
    r = gql('mutation($i: PodFindAndDeployOnDemandInput){ podFindAndDeployOnDemand(input:$i){ id costPerHr machine{ gpuDisplayName } } }', {'i': inp})
    if r.get('errors'): print(json.dumps(r['errors'])[:800]); sys.exit(1)
    p = r['data']['podFindAndDeployOnDemand']; json.dump({'id': p['id'], 'tok': tok, 'custo_h': p['costPerHr'], 't0': time.time()}, open(EST, 'w'))
    print('pod', p['id'], 'US$/h', p['costPerHr'], p['machine'])
def url(porta=8000): return f"https://{estado()['id']}-{porta}.proxy.runpod.net"
def req(caminho, dados=None, metodo=None, timeout=120):
    r = urllib.request.Request(url() + caminho, data=dados, method=metodo, headers={'X-Token': estado()['tok'], 'User-Agent': 'curl/8'})
    return urllib.request.urlopen(r, timeout=timeout)
def run(nome, cmd): return json.load(req('/run', json.dumps({'name': nome, 'cmd': cmd}).encode()))
def status(nome, tail=30): return json.load(req(f'/status?name={nome}&tail={tail}'))
def put(local, remoto): return json.load(req('/put?path=' + urllib.parse.quote(remoto), open(local, 'rb').read(), 'POST', 600))
def get(remoto, local):
    with req('/get?path=' + urllib.parse.quote(remoto), timeout=900) as r, open(local, 'wb') as f:
        while (c := r.read(1 << 20)): f.write(c)
def apagar():
    print(json.dumps(gql('mutation($i: PodTerminateInput!){ podTerminate(input:$i) }', {'i': {'podId': estado()['id']}})))
import urllib.parse
if __name__ == '__main__':
    a = sys.argv[1]
    if a == 'criar': criar(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'SECURE')
    elif a == 'ping': print(json.load(req('/')))
    elif a == 'run': print(run(sys.argv[2], sys.argv[3]))
    elif a == 'status':
        s = status(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 30); print('rodando', s['rodando'], 'saida', s['saida'], 'horas', s['horas']); print('\n'.join(s['log']))
    elif a == 'put': print(put(sys.argv[2], sys.argv[3]))
    elif a == 'get': get(sys.argv[2], sys.argv[3]); print('ok')
    elif a == 'apagar': apagar()
