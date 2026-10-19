// Painel Marca: o kit de uma casa (cores, fontes e logos) para aplicar na peça com um clique.
// A extração e a troca de cor ficam em marca.js; quem mexe na cena é o editor (aplicarCor, aplicarFonte, colocarLogo).

import { extrairKit, mesclarKit, normalizarHex, mapearEnderecos } from './marca.js';
import { paraRelativo } from './util.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);

export function iniciarMarca({ armazem, aviso, esc, cenaAtual, baseAtual, aplicarCor, aplicarFonte, colocarLogo }) {
  const estado = { marca: null };

  async function desenhar() {
    const marcas = (await armazem.listarMarcas()).map((m) => mapearEnderecos(m, paraRelativo)); // kits antigos guardaram o endereço com a versão da página
    if (!marcas.some((m) => m.id === estado.marca)) estado.marca = marcas[0]?.id ?? null;
    const marca = marcas.find((m) => m.id === estado.marca) ?? null;
    $('#marca-sel').innerHTML = marcas.map((m) => `<option value="${esc(m.id)}"${m.id === estado.marca ? ' selected' : ''}>${esc(m.nome)}</option>`).join('') || '<option value="">Nenhuma marca</option>';
    for (const id of ['marca-atualizar', 'marca-renomear', 'marca-apagar', 'marca-nova-cor']) $(`#${id}`).disabled = !marca;
    const corpo = $('#marca-corpo');
    if (!marca) { corpo.innerHTML = '<p class="dica">Crie um kit a partir da peça aberta: as cores, fontes e logos dela viram o kit da marca.</p>'; return; }
    corpo.innerHTML = `
      <h4>Cores</h4>
      <p class="dica">Escolha uma camada de texto ou retângulo e clique na cor. No texto, vale a linha de destaque; com Shift, todas.</p>
      <div class="kit-cores">${marca.cores.map((c, i) => `
        <span class="kit-cor"><button type="button" class="amostra kit-amostra" data-i="${i}" style="background:${esc(c.hex)}" title="${esc(c.nome ?? c.hex)}" aria-label="Aplicar ${esc(c.hex)}"></button><button type="button" class="kit-tirar" data-i="${i}" aria-label="Tirar ${esc(c.hex)} do kit" title="Tirar do kit">×</button></span>`).join('') || '<span class="dica">Sem cores.</span>'}</div>
      <h4>Fontes</h4>
      <div class="kit-fontes">${marca.fontes.map((f, i) => `<button type="button" class="pequeno kit-fonte" data-i="${i}" title="Aplicar ao texto escolhido" style="font-family:'${esc(f.familia)}', sans-serif; font-weight:${Number(f.peso) || 400}">${esc(f.familia)} ${esc(f.peso)}</button>`).join('') || '<span class="dica">Sem fontes.</span>'}</div>
      <h4>Logos</h4>
      <div class="kit-logos">${marca.logos.map((l, i) => `<button type="button" class="kit-logo" data-i="${i}" title="Colocar ${esc(l.nome)} na peça"><img src="${esc(new URL(l.asset, location.href).href)}" alt="${esc(l.nome)}" loading="lazy"></button>`).join('') || '<span class="dica">Sem logos.</span>'}</div>`;
    corpo.querySelectorAll('.kit-amostra').forEach((b) => { b.onclick = (e) => aplicarCor(marca.cores[Number(b.dataset.i)].hex, { todas: e.shiftKey }); });
    corpo.querySelectorAll('.kit-tirar').forEach((b) => { b.onclick = () => salvar(marca, { cores: marca.cores.filter((_, i) => i !== Number(b.dataset.i)) }); });
    corpo.querySelectorAll('.kit-fonte').forEach((b) => { b.onclick = () => aplicarFonte(marca.fontes[Number(b.dataset.i)]); });
    corpo.querySelectorAll('.kit-logo').forEach((b) => { b.onclick = () => colocarLogo(marca.logos[Number(b.dataset.i)]); });
  }

  const marcaAtual = async () => (await armazem.listarMarcas()).map((m) => mapearEnderecos(m, paraRelativo)).find((x) => x.id === estado.marca);

  async function salvar(marca, campos) {
    try { await armazem.atualizarMarca(marca.id, campos); } catch (e) { aviso(`Não guardei o kit: ${e.message}`, true); }
    desenhar();
  }

  $('#marca-sel').onchange = (e) => { estado.marca = e.target.value || null; desenhar(); };
  $('#marca-nova').onclick = async () => {
    const nome = prompt('Nome da marca (o kit sai da peça aberta):');
    if (!nome?.trim()) return;
    try {
      const m = await armazem.criarMarca(nome.trim(), mapearEnderecos(extrairKit(cenaAtual(), baseAtual()), paraRelativo));
      estado.marca = m.id;
      aviso(`Kit "${m.nome}" criado com ${m.cores.length} cores, ${m.fontes.length} fonte(s) e ${m.logos.length} logo(s)`);
    } catch (e) { aviso(`Não criei o kit: ${e.message}`, true); }
    desenhar();
  };
  $('#marca-atualizar').onclick = async () => {
    const m = await marcaAtual();
    if (!m) return;
    await salvar(m, mesclarKit(m, mapearEnderecos(extrairKit(cenaAtual(), baseAtual()), paraRelativo)));
    aviso('O que a peça aberta traz foi somado ao kit');
  };
  $('#marca-renomear').onclick = async () => {
    const m = await marcaAtual();
    const nome = m && prompt('Novo nome da marca:', m.nome);
    if (nome?.trim()) await salvar(m, { nome: nome.trim() });
  };
  $('#marca-apagar').onclick = async () => {
    const m = await marcaAtual();
    if (!m || !confirm(`Apagar o kit "${m.nome}"?`)) return;
    await armazem.apagarMarca(m.id);
    desenhar();
  };
  $('#marca-nova-cor').oninput = async (e) => {
    const m = await marcaAtual();
    const hex = normalizarHex(e.target.value);
    if (m && hex && !m.cores.some((c) => c.hex === hex)) await salvar(m, { cores: [...m.cores, { hex }] });
  };

  desenhar();
  return { atualizar: desenhar };
}
