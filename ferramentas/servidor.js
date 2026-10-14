// Servidor estático mínimo para abrir o editor: npm run editor
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.webp': 'image/webp', '.ttf': 'font/ttf', '.css': 'text/css', '.svg': 'image/svg+xml' };
const porta = Number(process.env.PORTA ?? 5173);

createServer(async (req, res) => {
  const caminho = path.join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!caminho.startsWith(raiz)) { res.writeHead(403).end(); return; }
  try {
    const corpo = await readFile(caminho.endsWith('/') ? path.join(caminho, 'index.html') : caminho);
    res.writeHead(200, { 'content-type': tipos[path.extname(caminho)] ?? 'application/octet-stream' }).end(corpo);
  } catch {
    res.writeHead(404).end('não encontrado');
  }
}).listen(porta, () => console.log(`editor em http://localhost:${porta}/editor/`));
