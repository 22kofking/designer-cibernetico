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

// Endereços que vão para o banco não podem levar a versão da página (/_f/<versão>/), que muda a cada publicação:
// os que ficam dentro da página (ou de uma versão antiga dela) são guardados relativos a ela.
export function paraRelativo(href) {
  const texto = String(href ?? '');
  const m = texto.match(/^https?:\/\/[^/]+\/_f\/[^/]+\/(.*)$/);
  if (m) return m[1];
  const raiz = new URL('.', location.href).href;
  return texto.startsWith(raiz) ? texto.slice(raiz.length) : texto;
}

// Caminho para chegar em `para` a partir do arquivo `de` (dois endereços completos); outra origem, devolve `para`.
export function caminhoRelativo(de, para) {
  const a = new URL(de);
  const b = new URL(para);
  if (a.origin !== b.origin) return b.href;
  const doDir = a.pathname.split('/').slice(0, -1);
  const alvo = b.pathname.split('/');
  let i = 0;
  while (i < doDir.length && i < alvo.length - 1 && doDir[i] === alvo[i]) i++;
  return '../'.repeat(doDir.length - i) + alvo.slice(i).join('/') + b.search;
}
