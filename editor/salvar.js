// Entrega de arquivos ao usuário. Publicada como página no claude.ai, a Mesa não
// pode baixar sozinha: o pedido passa pela confirmação da página (capacidade
// "downloads"). Formatos fora da lista dela (PSD) vão dentro de um .zip.
// Fora do claude.ai (npm run editor), baixa direto.
const PERMITIDOS = /\.(png|jpe?g|webp|gif|svg|pdf|zip|txt|json|md|csv|html|ttf)$/i;

const tabela = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = tabela[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Zip de um arquivo só, sem compressão (o PSD já é grande e pouco compressível).
export function zipUnico(nome, dados) {
  const n = new TextEncoder().encode(nome);
  const crc = crc32(dados);
  const tam = dados.length;
  const local = new DataView(new ArrayBuffer(30));
  const central = new DataView(new ArrayBuffer(46));
  const fim = new DataView(new ArrayBuffer(22));
  const gravar = (dv, campos) => campos.forEach(([o, v, t]) => (t === 4 ? dv.setUint32(o, v, true) : dv.setUint16(o, v, true)));
  gravar(local, [[0, 0x04034b50, 4], [4, 20, 2], [14, crc, 4], [18, tam, 4], [22, tam, 4], [26, n.length, 2]]);
  gravar(central, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [16, crc, 4], [20, tam, 4], [24, tam, 4], [28, n.length, 2]]);
  gravar(fim, [[0, 0x06054b50, 4], [8, 1, 2], [10, 1, 2], [12, 46 + n.length, 4], [16, 30 + n.length + tam, 4]]);
  return new Blob([local, n, dados, central, n, fim], { type: 'application/zip' });
}

let downloads;
async function capacidade() {
  if (downloads === undefined) downloads = window.claude?.use ? await window.claude.use('downloads') : null;
  return downloads;
}

// Devolve 'salvo', 'recusado' ou 'baixado'.
export async function salvar(nome, blob) {
  const d = await capacidade();
  if (d) {
    let arquivo = nome;
    let dados = blob;
    if (!PERMITIDOS.test(nome)) {
      dados = zipUnico(nome, new Uint8Array(await blob.arrayBuffer()));
      arquivo = `${nome}.zip`;
    }
    try {
      await d.save({ filename: arquivo, data: dados });
      return 'salvo';
    } catch (e) {
      if (e?.code === 'declined') return 'recusado';
      throw new Error(e?.message ?? String(e));
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'baixado';
}
