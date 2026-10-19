// Utilidades da Mesa que não dependem do estado do editor.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);

export const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const arred = (v, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;

export function aviso(texto, erro = false) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.toggle('erro', erro);
  el.classList.add('visivel');
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => el.classList.remove('visivel'), erro ? 6000 : 2600);
}

export function guardar(chave, valor) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
    return true;
  } catch { return false; }
}
export function ler(chave) {
  try { return localStorage.getItem(chave); } catch { return null; }
}

export function lerArquivo(arquivo, como) {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => erro(r.error);
    if (como === 'url') r.readAsDataURL(arquivo);
    else if (como === 'texto') r.readAsText(arquivo);
    else r.readAsArrayBuffer(arquivo);
  });
}
