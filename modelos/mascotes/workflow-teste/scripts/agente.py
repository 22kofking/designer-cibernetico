# Servidor mínimo no Pod: roda comandos, mostra logs e troca arquivos. Protegido por token. Apaga o Pod ao estourar o tempo.
import http.server, json, os, subprocess, threading, time, urllib.parse
TOKEN = os.environ['AG_TOKEN']; MAXH = float(os.environ.get('AG_MAXH', '6'))
os.makedirs('/work/logs', exist_ok=True); PROCS = {}; T0 = time.time()
def vigia():
    while True:
        time.sleep(60)
        if time.time() - T0 > MAXH * 3600:
            os.system('runpodctl remove pod $RUNPOD_POD_ID >> /work/logs/vigia.log 2>&1')
threading.Thread(target=vigia, daemon=True).start()
class H(http.server.BaseHTTPRequestHandler):
    def _ok(self):
        if self.headers.get('X-Token') != TOKEN:
            self.send_response(403); self.end_headers(); return False
        return True
    def _json(self, obj, code=200):
        b = json.dumps(obj).encode(); self.send_response(code)
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if not self._ok(): return
        u = urllib.parse.urlparse(self.path); q = dict(urllib.parse.parse_qsl(u.query))
        if u.path == '/status':
            n = q['name']; p = PROCS.get(n); log = f'/work/logs/{n}.log'
            linhas = open(log, errors='replace').read().splitlines()[-int(q.get('tail', 30)):] if os.path.exists(log) else []
            self._json({'rodando': p is not None and p.poll() is None, 'saida': None if p is None else p.poll(), 'log': linhas, 'horas': round((time.time() - T0) / 3600, 3)})
        elif u.path == '/get':
            f = q['path']; tam = os.path.getsize(f); self.send_response(200)
            self.send_header('Content-Length', str(tam)); self.end_headers()
            with open(f, 'rb') as fh:
                while (c := fh.read(1 << 20)): self.wfile.write(c)
        else: self._json({'ok': True, 'horas': round((time.time() - T0) / 3600, 3)})
    def do_POST(self):
        if not self._ok(): return
        u = urllib.parse.urlparse(self.path); q = dict(urllib.parse.parse_qsl(u.query))
        corpo = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if u.path == '/run':
            d = json.loads(corpo); log = open(f"/work/logs/{d['name']}.log", 'ab')
            PROCS[d['name']] = subprocess.Popen(['bash', '-lc', d['cmd']], stdout=log, stderr=subprocess.STDOUT, cwd='/work')
            self._json({'ok': True})
        elif u.path == '/put':
            os.makedirs(os.path.dirname(q['path']), exist_ok=True); open(q['path'], 'wb').write(corpo); self._json({'ok': True, 'bytes': len(corpo)})
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('0.0.0.0', 8000), H).serve_forever()
