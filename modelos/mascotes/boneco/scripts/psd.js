// Grava um PSD com uma camada por parte. Uso: node psd.js <lista.json> <saida.psd>
// lista.json = {largura, altura, composta: "x.png", camadas: [{nome, png, grupo?}]} (de baixo para cima)
// Precisa de ag-psd e pngjs (npm i ag-psd pngjs).
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { writePsdBuffer } = require('ag-psd');

const [lista, saida] = process.argv.slice(2);
const L = JSON.parse(fs.readFileSync(lista, 'utf8'));
const base = path.dirname(lista);
const ler = (p) => PNG.sync.read(fs.readFileSync(path.resolve(base, p)));

function camada(c) {
  const png = ler(c.png);
  const { width: w, height: h, data } = png;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * cw * 4);
  return { name: c.nome, left: x0, top: y0, imageData: { width: cw, height: ch, data: out } };
}

const camadas = L.camadas.map(camada).filter(Boolean);
// grupos (pastas) do PSD: bicho, figurino
const filhos = [];
const grupos = {};
L.camadas.forEach((c, i) => {
  const lay = camadas.find((x) => x.name === c.nome);
  if (!lay) return;
  if (!c.grupo) { filhos.push(lay); return; }
  if (!grupos[c.grupo]) { grupos[c.grupo] = { name: c.grupo, opened: true, children: [] }; filhos.push(grupos[c.grupo]); }
  grupos[c.grupo].children.push(lay);
});
const comp = ler(L.composta);
const psd = {
  width: L.largura, height: L.altura, children: filhos,
  imageData: { width: comp.width, height: comp.height, data: new Uint8ClampedArray(comp.data) },
};
fs.writeFileSync(saida, writePsdBuffer(psd, { generateThumbnail: false }));
