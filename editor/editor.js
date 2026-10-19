// Mesa de Cena: editor de cena no navegador. Usa o mesmo núcleo do renderizador
// sem tela, então o que você vê aqui é o que o agente vê e o que é exportado.
// A cena JSON é a fonte da verdade: cada gesto muda o JSON e a tela é redesenhada.
// Ferramentas inspiradas no PhotoCraft: camadas com mistura e opacidade, estilos
// de camada (sombra, brilho externo, contorno), ajustes de imagem, histórico,
// guias magnéticas, zoom, atalhos e PSD de ida e volta.
import * as fabric from 'fabric';
import { caixaEmFracoes, caixaEmPixels, validarCena } from '../src/nucleo/cena.js';
import { criarMedidor, montarCena, MISTURAS } from '../src/nucleo/render.js';
import { abrirPsd, exportarPsd } from './psd-navegador.js';
import { salvar } from './salvar.js';
import { iniciarBiblioteca, TIPO_ARRASTO } from './biblioteca.js';
import { abrirArmazem, guardarImagem, tirarImagensDaCena } from './armazem-navegador.js';
import { iniciarProjetos } from './projetos.js';
import { iniciarInterface } from './interface.js';
import { iniciarModelos } from './modelos.js';
import { iniciarMarca } from './marca-painel.js';
import { extrairKit, aplicarCorNo, mapearEnderecos } from './marca.js';
import { $, esc, arred, aviso, guardar, ler, lerArquivo, paraRelativo, caminhoRelativo } from './util.js';
import { alinharAsGuias, desenharGuiasNo } from './guias.js';
import { acharNoEm, listaDoNoEm, idsDe } from './arvore.js';
import { capturar, instanciar, reposicionar, caixaDoConjunto, larguraInicial, validarComposicao } from './composicoes.js';

const params = new URLSearchParams(location.search);
const CENAS = window.CENAS ?? null; // [{ nome, rotulo, url }] para abas

let cena;
let urlCena;
let baseAssets;
let armazem = null; // projetos, peças, versões e composições (editor/armazem.js)
let pecaAtual = null; // peça aberta no armazém; null para cena sem peça (armazém indisponível)
let projetos = null; // janela de Projetos e painel de Versões (editor/projetos.js)
let canvas;
let selecionado = null;
let redesenhando = false;
let zoom = 1;
let guiasLigadas = true;
let guias = [];
const cacheImagens = new Map();
const medidor = criarMedidor(document.createElement('canvas').getContext('2d'));
const historico = { passos: [], i: -1 };
const marcadas = new Set(); // camadas escolhidas com Ctrl/Shift+clique, para salvar como composição

const NOMES_MISTURA = {
  normal: 'Normal', multiplicar: 'Multiplicar', tela: 'Tela', sobrepor: 'Sobrepor', escurecer: 'Escurecer', clarear: 'Clarear',
  subexpor_cor: 'Subexposição de cor', superexpor_cor: 'Superexposição de cor', luz_direta: 'Luz direta', luz_suave: 'Luz suave',
  diferenca: 'Diferença', exclusao: 'Exclusão', matiz: 'Matiz', saturacao: 'Saturação', cor: 'Cor', luminosidade: 'Luminosidade',
};
const ICONES = { imagem: '▣', bloco_texto: 'T', retangulo: '■', gradiente: '◧', grupo: '❒' };

// ---------- utilidades ----------

const acharNo = (id, nos = cena.nos) => acharNoEm(nos, id);
const listaDoNo = (id, nos = cena.nos) => listaDoNoEm(nos, id);
const idsDaCena = () => idsDe(cena.nos);

function idNovo(base) {
  const ids = idsDaCena();
  let id = base;
  for (let k = 2; ids.has(id); k++) id = `${base}-${k}`;
  return id;
}

const objetoDoNo = (id) => canvas.getObjects().find((o) => o.idNo === id && !o.efeitoDe);

// ---------- fontes e imagens ----------

async function carregarFontes(c = cena, base = baseAssets) {
  for (const f of c.fontes ?? []) {
    try {
      const face = new FontFace(f.familia, `url(${new URL(f.arquivo, base)})`, { weight: String(f.peso ?? 400) });
      document.fonts.add(await face.load());
    } catch (e) {
      aviso(`Fonte ${f.familia} não carregou`, true);
    }
  }
}

function carregarImagem(asset, base = baseAssets) {
  const url = new URL(asset, base).href;
  if (!cacheImagens.has(url)) {
    cacheImagens.set(url, new Promise((ok, erro) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => ok(img);
      img.onerror = () => { cacheImagens.delete(url); erro(new Error(`não carregou ${asset.slice(0, 80)}`)); };
      img.src = url;
    }));
  }
  return cacheImagens.get(url).then((img) => new fabric.FabricImage(img));
}

// ---------- histórico (desfazer e refazer) ----------

function registrar(rotulo) {
  clearTimeout(registrarDepois.t);
  const foto = JSON.stringify(cena);
  if (historico.passos[historico.i]?.foto === foto) return;
  historico.passos = historico.passos.slice(0, historico.i + 1);
  historico.passos.push({ rotulo, foto, hora: new Date() });
  if (historico.passos.length > 80) historico.passos.shift();
  historico.i = historico.passos.length - 1;
  if (historico.passos.length > 1) guardarCena(foto);
  desenharHistorico();
}

// Para quem digita ou arrasta um controle: um passo só, quando a pessoa para.
function registrarDepois(rotulo) {
  clearTimeout(registrarDepois.t);
  registrarDepois.t = setTimeout(() => registrar(rotulo), 450);
}

async function irParaPasso(i) {
  if (i < 0 || i >= historico.passos.length) return;
  historico.i = i;
  cena = JSON.parse(historico.passos[i].foto);
  if (selecionado && !acharNo(selecionado)) selecionado = null;
  guardarCena(historico.passos[i].foto);
  await carregarFontes();
  await redesenhar();
  mostrarPropriedades();
  desenharHistorico();
}
const desfazer = () => { clearTimeout(registrarDepois.t); irParaPasso(historico.i - 1); };
const refazer = () => irParaPasso(historico.i + 1);

function desenharHistorico() {
  const lista = $('#historico');
  lista.innerHTML = '';
  historico.passos.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = i === historico.i ? 'ativo' : i > historico.i ? 'futuro' : '';
    li.innerHTML = `<button type="button">${esc(p.rotulo)}</button>`;
    li.querySelector('button').onclick = () => irParaPasso(i);
    lista.appendChild(li);
  });
  lista.scrollTop = lista.scrollHeight;
  $('#desfazer').disabled = historico.i <= 0;
  $('#refazer').disabled = historico.i >= historico.passos.length - 1;
}

// ---------- desenho ----------

let agendado = null;
let emCurso = null;
// Junta vários pedidos de redesenho num só (controles deslizantes disparam muitos).
function agendarRedesenho() {
  if (agendado) return agendado;
  agendado = new Promise((ok) => requestAnimationFrame(async () => {
    if (emCurso) await emCurso;
    agendado = null;
    emCurso = redesenhar().finally(() => { emCurso = null; });
    ok(await emCurso);
  }));
  return agendado;
}

async function redesenhar() {
  const erros = validarCena(cena);
  $('#erros').textContent = erros.join('\n');
  // Limpar o canvas termina a transformação em curso e o Fabric dispara
  // object:modified de novo; a trava evita redesenhar em laço.
  redesenhando = true;
  try {
    canvas.discardActiveObject();
    canvas.clear();
  } finally {
    redesenhando = false;
  }
  let objetos = [];
  try {
    objetos = await montarCena(fabric, canvas, cena, { medidor, carregarImagem });
  } catch (e) {
    $('#erros').textContent += `\n${e.message}`;
  }
  // As linhas de um bloco de texto (e o brilho delas) viram um grupo só, para mover e escalar juntas.
  const porBloco = new Map();
  for (const o of objetos) {
    if (o.indiceLinha === undefined) continue;
    if (!porBloco.has(o.idNo)) porBloco.set(o.idNo, []);
    porBloco.get(o.idNo).push(o);
  }
  for (const [id, linhas] of porBloco) {
    const no = acharNo(id);
    const indice = canvas.getObjects().indexOf(linhas[0]);
    linhas.forEach((l) => canvas.remove(l));
    const grupo = new fabric.Group(linhas, { originX: 'left', originY: 'top', subTargetCheck: false });
    grupo.idNo = id;
    grupo.globalCompositeOperation = MISTURAS[no.mistura] ?? 'source-over';
    grupo.selectable = no.bloqueado !== true;
    grupo.evented = no.bloqueado !== true;
    canvas.insertAt(indice, grupo);
  }
  canvas.requestRenderAll();
  desenharCamadas();
  if (selecionado) {
    const obj = objetoDoNo(selecionado);
    if (obj?.selectable) canvas.setActiveObject(obj);
  }
}

// O brilho externo de uma imagem é uma cópia atrás dela: acompanha o gesto.
function acompanharCopias(e) {
  const alvo = e.target;
  if (!alvo?.idNo || alvo.type === 'group') return;
  for (const o of canvas.getObjects()) {
    if (o.efeitoDe !== alvo.idNo || o.indiceLinha !== undefined) continue;
    o.set({ left: alvo.left, top: alvo.top, scaleX: alvo.scaleX, scaleY: alvo.scaleY, angle: alvo.angle, originX: alvo.originX, originY: alvo.originY, flipX: alvo.flipX, flipY: alvo.flipY });
  }
}

// Depois de mover, escalar ou girar, grava a nova caixa no JSON.
function aoModificar(e) {
  const obj = e.target;
  if (redesenhando || !obj?.idNo) return;
  const no = acharNo(obj.idNo);
  if (!no) return;
  guias = [];
  limparGuias();
  if (no.tipo === 'bloco_texto') {
    // O grupo cobre só a tinta das letras; move e escala a caixa do bloco junto.
    const antes = obj._caixaAntes;
    const depois = obj.getBoundingRect();
    const f = cena.formato;
    const c = no.caixa;
    const escala = depois.width / antes.width;
    no.caixa = caixaEmFracoes({
      x: depois.left - (antes.left - c.x * f.largura) * escala,
      y: depois.top - (antes.top - c.y * f.altura) * escala,
      w: c.w * f.largura * escala,
      h: c.h * f.altura * escala,
    }, f);
  } else {
    const centro = obj.getCenterPoint();
    const w = obj.getScaledWidth();
    const h = obj.getScaledHeight();
    no.caixa = caixaEmFracoes({ x: centro.x - w / 2, y: centro.y - h / 2, w, h }, cena.formato);
    no.rotacao = Math.round(obj.angle * 10) / 10;
    if (no.tipo === 'imagem') {
      if (no.encaixe !== 'esticar') no.encaixe = 'conter';
      no.ancora = 'centro';
    }
  }
  const acao = e.action ?? e.transform?.action ?? '';
  registrar(acao.startsWith('scale') ? `Escalar ${no.id}` : acao === 'rotate' ? `Girar ${no.id}` : `Mover ${no.id}`);
  setTimeout(async () => { await redesenhar(); mostrarTransformacao(); }, 0);
}

// ---------- guias magnéticas ----------

function aoMover(e) {
  acompanharCopias(e);
  guias = [];
  const alvo = e.target;
  if (!guiasLigadas || !alvo?.idNo) return;
  const r = alinharAsGuias({ alvo, objetos: canvas.getObjects(), largura: cena.formato.largura, altura: cena.formato.altura, zoom });
  guias = r.guias;
  if (r.moveu) acompanharCopias(e);
}

function limparGuias() {
  if (canvas?.contextTop) canvas.clearContext(canvas.contextTop);
}

const desenharGuias = () => desenharGuiasNo(canvas, guias, zoom);

// ---------- zoom ----------

function aplicarZoom(novo, foco) {
  const area = $('#area');
  const antes = zoom;
  zoom = Math.min(4, Math.max(0.05, novo));
  canvas.setZoom(zoom);
  canvas.setDimensions({ width: Math.round(cena.formato.largura * zoom), height: Math.round(cena.formato.altura * zoom) });
  if (foco) {
    area.scrollLeft = (area.scrollLeft + foco.x) * (zoom / antes) - foco.x;
    area.scrollTop = (area.scrollTop + foco.y) * (zoom / antes) - foco.y;
  }
  $('#zoom-valor').textContent = `${Math.round(zoom * 100)}%`;
  canvas.requestRenderAll();
}

let zoomAjustado = null; // zoom do último "caber"; a gaveta que abre ou fecha refaz o ajuste se a peça ainda estava assim

function ajustarZoom() {
  const area = $('#area');
  const z = Math.min((area.clientWidth - 24) / cena.formato.largura, (area.clientHeight - 24) / cena.formato.altura);
  aplicarZoom(z > 0 ? z : 0.3);
  zoomAjustado = zoom;
}

// Espaço + arrastar move a vista; Ctrl + rodinha aproxima.
function ligarNavegacao() {
  const area = $('#area');
  let espaco = false;
  let arraste = null;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !digitando(e)) { espaco = true; area.classList.add('mao'); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') { espaco = false; area.classList.remove('mao'); } });
  area.addEventListener('pointerdown', (e) => {
    if (!espaco && e.button !== 1) return;
    arraste = { x: e.clientX, y: e.clientY, l: area.scrollLeft, t: area.scrollTop };
    e.preventDefault();
    e.stopPropagation();
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!arraste) return;
    area.scrollLeft = arraste.l - (e.clientX - arraste.x);
    area.scrollTop = arraste.t - (e.clientY - arraste.y);
  });
  window.addEventListener('pointerup', () => { arraste = null; });
  area.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = area.getBoundingClientRect();
    aplicarZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - r.left, y: e.clientY - r.top });
  }, { passive: false });
}

// ---------- camadas ----------

function desenharCamadas() {
  const lista = $('#camadas');
  lista.innerHTML = '';
  // de cima para baixo, como no Photoshop
  [...cena.nos].reverse().forEach((no) => {
    const li = document.createElement('li');
    li.className = `${no.id === selecionado ? 'ativo' : ''} ${marcadas.has(no.id) ? 'marcada' : ''}`.trim();
    li.draggable = true;
    li.dataset.id = no.id;
    li.innerHTML = `
      <button class="olho" type="button" title="Mostrar ou esconder" aria-pressed="${no.visivel !== false}">${no.visivel === false ? '○' : '●'}</button>
      <span class="icone" aria-hidden="true">${ICONES[no.tipo] ?? '?'}</span>
      <span class="nome" title="Duplo clique para renomear">${esc(no.id)}</span>
      <span class="papel">${no.secao ? `❒ ${esc(no.secao)} · ` : ''}${esc(no.mistura && no.mistura !== 'normal' ? NOMES_MISTURA[no.mistura] : no.papel ?? no.tipo)}${(no.opacidade ?? 1) < 1 ? ` · ${Math.round(no.opacidade * 100)}%` : ''}</span>
      <button class="cadeado" type="button" title="Travar ou destravar" aria-pressed="${no.bloqueado === true}">${no.bloqueado ? '🔒' : '🔓'}</button>`;
    li.onclick = (e) => {
      if (e.target.closest('button')) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        // escolhe várias camadas (a que já estava selecionada entra junto)
        if (!marcadas.size && selecionado) marcadas.add(selecionado);
        if (marcadas.has(no.id)) marcadas.delete(no.id); else marcadas.add(no.id);
        desenharCamadas();
        desenharComposicoes();
        return;
      }
      marcadas.clear();
      selecionarPorId(no.id, true);
    };
    li.querySelector('.nome').ondblclick = () => renomear(li, no);
    li.querySelector('.olho').onclick = () => { no.visivel = no.visivel === false; registrar(`${no.visivel ? 'Mostrar' : 'Esconder'} ${no.id}`); agendarRedesenho(); };
    li.querySelector('.cadeado').onclick = () => { no.bloqueado = !no.bloqueado; registrar(`${no.bloqueado ? 'Travar' : 'Destravar'} ${no.id}`); agendarRedesenho(); };
    li.ondragstart = (e) => { e.dataTransfer.setData('text/plain', no.id); li.classList.add('arrastando'); };
    li.ondragend = () => li.classList.remove('arrastando');
    li.ondragover = (e) => { e.preventDefault(); li.classList.add('alvo'); };
    li.ondragleave = () => li.classList.remove('alvo');
    li.ondrop = (e) => {
      e.preventDefault();
      li.classList.remove('alvo');
      const id = e.dataTransfer.getData('text/plain');
      if (id && id !== no.id) moverPara(id, no.id);
    };
    lista.appendChild(li);
  });
  const no = selecionado && acharNo(selecionado);
  $('#camada-mistura').disabled = !no;
  $('#camada-opacidade').disabled = !no;
  $('#camada-mistura').value = no?.mistura ?? 'normal';
  $('#camada-opacidade').value = Math.round((no?.opacidade ?? 1) * 100);
  ['#duplicar', '#excluir'].forEach((s) => { $(s).disabled = !no; });
  desenharComposicoes();
}

function renomear(li, no) {
  const nome = li.querySelector('.nome');
  const campo = document.createElement('input');
  campo.value = no.id;
  campo.className = 'renomear';
  nome.replaceWith(campo);
  campo.focus();
  campo.select();
  const terminar = (gravar) => {
    const novo = campo.value.trim();
    if (gravar && novo && novo !== no.id) {
      if (idsDaCena().has(novo)) aviso(`Já existe uma camada "${novo}"`, true);
      else {
        if (selecionado === no.id) selecionado = novo;
        no.id = novo;
        registrar(`Renomear para ${novo}`);
      }
    }
    agendarRedesenho();
    mostrarPropriedades();
  };
  campo.onkeydown = (e) => { if (e.key === 'Enter') campo.blur(); if (e.key === 'Escape') { campo.value = no.id; campo.blur(); } };
  campo.onblur = () => terminar(true);
}

// Solta a camada arrastada na posição da camada alvo (lista de cima para baixo).
function moverPara(id, idAlvo) {
  const i = cena.nos.findIndex((n) => n.id === id);
  const j = cena.nos.findIndex((n) => n.id === idAlvo);
  if (i < 0 || j < 0) return;
  const [no] = cena.nos.splice(i, 1);
  cena.nos.splice(j, 0, no);
  registrar(`Reordenar ${id}`);
  agendarRedesenho();
}

function mudarOrdem(no, passo) {
  const lista = listaDoNo(no.id);
  const i = lista.indexOf(no);
  const j = passo === Infinity ? lista.length - 1 : passo === -Infinity ? 0 : Math.min(Math.max(i + passo, 0), lista.length - 1);
  if (i === j) return;
  lista.splice(i, 1);
  lista.splice(j, 0, no);
  registrar(passo > 0 ? `Trazer ${no.id} para frente` : `Enviar ${no.id} para trás`);
  agendarRedesenho();
}

function selecionarPorId(id, doPainel) {
  selecionado = id;
  const obj = id && objetoDoNo(id);
  if (obj && obj.selectable && doPainel) canvas.setActiveObject(obj);
  if (!id) canvas.discardActiveObject();
  canvas.requestRenderAll();
  desenharCamadas();
  mostrarPropriedades();
}

// ---------- novas camadas ----------

function inserirNo(no, rotulo) {
  const lista = selecionado ? listaDoNo(selecionado) : cena.nos;
  const i = selecionado ? lista.findIndex((n) => n.id === selecionado) : lista.length - 1;
  lista.splice(i + 1, 0, no);
  selecionado = no.id;
  registrar(rotulo);
  agendarRedesenho().then(() => { selecionarPorId(no.id, true); });
}

function fonteDaCena() {
  const f = cena.fontes?.[0];
  return f ? { familia: f.familia, peso: f.peso ?? 400 } : { familia: 'Arial', peso: 900 };
}

const NOVOS = {
  texto: () => ({
    id: idNovo('texto'), tipo: 'bloco_texto', papel: 'texto', caixa: { x: 0.08, y: 0.3, w: 0.4, h: 0.3 },
    fonte: fonteDaCena(), caixa_alta: true, alinhamento: 'esquerda',
    linhas: [{ texto: 'Novo texto', estilo: 'base', peso: 1 }], estilos: { base: { cor: '#ffffff' } },
  }),
  retangulo: () => ({ id: idNovo('retangulo'), tipo: 'retangulo', papel: 'elemento', caixa: { x: 0.35, y: 0.3, w: 0.3, h: 0.4 }, cor: '#f5c400', raio: 0 }),
  gradiente: () => ({
    id: idNovo('gradiente'), tipo: 'gradiente', papel: 'efeito', caixa: { x: 0, y: 0, w: 0.5, h: 1 }, direcao: 'horizontal',
    paradas: [[0, '#000000', 0.9], [1, '#000000', 0]],
  }),
};

// Coloca uma imagem (data URL ou endereço) como camada nova, no meio da peça e em tamanho que caiba.
async function colocarImagem(asset, nome, origem, centro = null) {
  const img = await carregarImagem(asset);
  const { largura: W, altura: H } = cena.formato;
  const f = Math.min(1, (W * 0.4) / img.width, (H * 0.8) / img.height);
  const w = img.width * f;
  const h = img.height * f;
  // `centro` (em pixels da peça) vem de um item arrastado até ali; sem ele, a imagem fica no meio
  const x = centro ? Math.min(Math.max(centro.x - w / 2, 0), W - w) : (W - w) / 2;
  const y = centro ? Math.min(Math.max(centro.y - h / 2, 0), H - h) : (H - h) / 2;
  inserirNo({
    id: idNovo(nome.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'imagem'),
    tipo: 'imagem', papel: 'elemento', asset, encaixe: 'conter',
    caixa: caixaEmFracoes({ x, y, w, h }, cena.formato),
    origem: { como: origem },
  }, `Colocar ${nome}`);
}

// Na Mesa online a imagem vai para o depósito dela; fora dele, fica dentro da cena.
async function novaImagem(arquivo) {
  const { asset } = await guardarImagem(arquivo, (a) => lerArquivo(a, 'url'));
  await colocarImagem(asset, arquivo.name, `colocada na Mesa (${arquivo.name})`);
}

// Item da biblioteca: clique coloca como camada nova; Shift+clique troca a imagem da camada de imagem selecionada
// (a caixa fica a mesma, o encaixe "conter" mantém a proporção do novo desenho).
async function colocarDaBiblioteca(item, url, { trocar, centro = null }) {
  const no = trocar && selecionado ? acharNo(selecionado) : null;
  try {
    if (no?.tipo === 'imagem') {
      await carregarImagem(url);
      no.asset = url;
      no.encaixe = 'conter';
      no.origem = { como: `biblioteca: ${item.nome} (${item.sub})` };
      registrar(`Trocar imagem de ${no.id} por ${item.nome}`);
      await agendarRedesenho();
      return;
    }
    await colocarImagem(url, item.nome, `biblioteca: ${item.nome} (${item.sub})`, centro);
  } catch (e) {
    aviso(`Não consegui colocar ${item.nome}: ${e.message}`, true);
  }
}

function duplicar() {
  const no = selecionado && acharNo(selecionado);
  if (!no) return;
  const copia = structuredClone(no);
  const renomearTudo = (n) => { n.id = idNovo(`${n.id}-copia`); (n.filhos ?? []).forEach(renomearTudo); };
  renomearTudo(copia);
  if (copia.caixa) copia.caixa = { ...copia.caixa, x: arred(copia.caixa.x + 0.02, 4), y: arred(copia.caixa.y + 0.02, 4) };
  const lista = listaDoNo(no.id);
  lista.splice(lista.indexOf(no) + 1, 0, copia);
  selecionado = copia.id;
  registrar(`Duplicar ${no.id}`);
  agendarRedesenho().then(() => selecionarPorId(copia.id, true));
}

function excluir() {
  const no = selecionado && acharNo(selecionado);
  if (!no) return;
  const lista = listaDoNo(no.id);
  lista.splice(lista.indexOf(no), 1);
  selecionado = null;
  registrar(`Excluir ${no.id}`);
  agendarRedesenho();
  mostrarPropriedades();
}


// ---------- composições e seções ----------
// Composição: camadas numa disposição espacial, guardadas para reutilizar (no Armazém e em arquivo .json).
// Seção: as camadas que vieram de uma composição ficam marcadas (campo "secao") e se movem e escalam juntas.

const CHAVE_COMPOSICOES = 'mesa:composicoes:v1';

let predefinidas = []; // composições que vêm prontas com a biblioteca (biblioteca/composicoes.json)
let minhas = []; // as do usuário, lidas do Armazém (sem armazém, do localStorage como antes)

const composicoesAntigas = () => {
  try { return JSON.parse(ler(CHAVE_COMPOSICOES) ?? '[]').filter((c) => !validarComposicao(c)); } catch { return []; }
};
const lerComposicoes = () => minhas;

async function carregarComposicoes() {
  minhas = armazem ? (await armazem.listarComposicoes()).filter((c) => !validarComposicao(c)) : composicoesAntigas();
  desenharComposicoes();
}

async function carregarPredefinidas(urlBiblioteca) {
  try {
    const r = await fetch(new URL('composicoes.json', urlBiblioteca));
    if (!r.ok) return;
    const base = new URL('.', urlBiblioteca);
    // os arquivos de imagem ficam ao lado do índice: o endereço de cada camada vira absoluto
    predefinidas = (await r.json()).filter((c) => !validarComposicao(c)).map((c) => ({
      ...c, predefinida: true, nos: c.nos.map((n) => ({ ...n, asset: n.asset ? new URL(n.asset, base).href : n.asset })),
    }));
  } catch { /* sem composições prontas: só as do usuário */ }
  desenharComposicoes();
}

// Grava uma composição (ou apaga, com `apagar`) e atualiza a lista.
async function gravarComposicao(comp, { apagar = false } = {}) {
  try {
    if (armazem) {
      if (apagar) await armazem.apagarComposicao(comp.id); else await armazem.gravarComposicao(comp);
    } else {
      const lista = composicoesAntigas().filter((c) => c.id !== comp.id);
      if (!apagar) lista.push(comp);
      if (!guardar(CHAVE_COMPOSICOES, JSON.stringify(lista))) throw new Error('o navegador está cheio; use Exportar para ficar com o arquivo');
    }
  } catch (e) {
    aviso(`Não consegui guardar a composição: ${e.message}`, true);
  }
  await carregarComposicoes();
}

function nosParaComposicao() {
  if (!cena) return [];
  const ids = marcadas.size ? [...marcadas] : selecionado ? [selecionado] : [];
  return cena.nos.filter((n) => ids.includes(n.id) && n.caixa); // na ordem de empilhamento da peça
}

function secaoDe(no) {
  return cena.nos.filter((n) => n.secao && n.secao === no.secao);
}

function desenharComposicoes() {
  const raiz = $('#composicoes');
  if (!raiz) return;
  const lista = [...lerComposicoes(), ...predefinidas];
  const escolhidas = nosParaComposicao();
  $('#comp-salvar').disabled = !escolhidas.length;
  $('#comp-escolha').textContent = marcadas.size > 1 ? `${marcadas.size} camadas escolhidas` : selecionado ? `camada ${selecionado}` : 'nenhuma camada escolhida';
  $('#comp-lista').innerHTML = lista.map((c, i) => `
    <li data-i="${i}">
      <button type="button" class="comp-colocar" title="Colocar na peça">
        <strong>${esc(c.nome)}</strong><small>${c.nos.length} camada${c.nos.length > 1 ? 's' : ''}${c.predefinida ? ' · pronta' : ''}</small>
      </button>
      <button type="button" class="comp-baixar" title="Exportar arquivo .json">⭳</button>
      ${c.predefinida ? '<span></span>' : '<button type="button" class="comp-apagar" title="Apagar">✕</button>'}
    </li>`).join('') || '<li class="dica">Nenhuma composição ainda.</li>';
  $('#comp-lista').querySelectorAll('li[data-i]').forEach((li) => {
    const c = lista[Number(li.dataset.i)];
    li.querySelector('.comp-colocar').onclick = () => colocarComposicao(c);
    li.querySelector('.comp-baixar').onclick = () => baixarComposicao(c);
    const apagar = li.querySelector('.comp-apagar');
    if (apagar) apagar.onclick = () => {
      if (!confirm(`Apagar a composição "${c.nome}"?`)) return;
      gravarComposicao(c, { apagar: true });
    };
  });
}

function salvarComposicao(nos, nomeSugerido) {
  if (!nos.length) return;
  const nome = (prompt('Nome da composição:', nomeSugerido ?? '') ?? '').trim();
  if (!nome) return;
  let comp;
  try { comp = capturar(nos, cena.formato, nome); } catch (e) { aviso(e.message, true); return; }
  const existente = lerComposicoes().find((c) => c.id === comp.id);
  if (existente && !confirm(`Já existe "${existente.nome}". Substituir?`)) return;
  gravarComposicao(comp).then(() => aviso(`Composição "${nome}" guardada (${comp.nos.length} camadas)`));
}

async function colocarComposicao(comp) {
  const f = cena.formato;
  const largura = larguraInicial(comp, f);
  const altura = largura / comp.aspecto;
  const secaoId = idNovoSecao(comp.id);
  const novos = instanciar(comp, f, { x: (f.largura - largura) / 2, y: (f.altura - altura) / 2, largura }, idNovo, secaoId);
  // idNovo olha só a cena; os ids novos já foram conferidos um a um dentro do conjunto
  const ocupados = idsDaCena();
  for (const n of novos) if (ocupados.has(n.id)) n.id = idNovo(`${n.id}-sec`);
  try {
    for (const n of novos) if (n.tipo === 'imagem' && n.asset) await carregarImagem(n.asset);
  } catch (e) { aviso(`Uma imagem da composição não abriu: ${e.message}`, true); return; }
  const lista = selecionado ? listaDoNo(selecionado) : cena.nos;
  const i = selecionado ? lista.findIndex((n) => n.id === selecionado) : lista.length - 1;
  lista.splice(i + 1, 0, ...novos);
  selecionado = novos[novos.length - 1].id;
  marcadas.clear();
  novos.forEach((n) => marcadas.add(n.id));
  registrar(`Colocar composição ${comp.nome}`);
  await agendarRedesenho();
  selecionarPorId(selecionado, true);
}

function idNovoSecao(base) {
  const usadas = new Set(cena.nos.map((n) => n.secao).filter(Boolean));
  let id = base;
  for (let k = 2; usadas.has(id); k++) id = `${base}-${k}`;
  return id;
}

function baixarComposicao(comp) {
  const blob = new Blob([JSON.stringify(comp, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${comp.id}.composicao.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importarComposicoes(arquivos) {
  let n = 0;
  for (const arq of arquivos) {
    try {
      const lido = JSON.parse(await lerArquivo(arq, 'texto'));
      for (const comp of Array.isArray(lido) ? lido : [lido]) {
        const erro = validarComposicao(comp);
        if (erro) { aviso(`${arq.name}: ${erro}`, true); continue; }
        await gravarComposicao(comp);
        n++;
      }
    } catch (e) { aviso(`${arq.name}: ${e.message}`, true); }
  }
  if (n) aviso(`${n} composição(ões) importada(s)`);
  desenharComposicoes();
}

function painelSecao(no) {
  const caixa = caixaDoConjunto(secaoDe(no), cena.formato);
  const px = caixa ?? { x: 0, y: 0, w: 0, h: 0 };
  return secao(`Seção ❒ ${esc(no.secao)}`, `
    <p class="dica">${secaoDe(no).length} camadas movem e escalam juntas.</p>
    <div class="grade2">${campoNumero('X', arred(px.x, 0), { id: 's-x' })}${campoNumero('Y', arred(px.y, 0), { id: 's-y' })}${campoNumero('L', arred(px.w, 0), { id: 's-w', min: 1 })}${campoNumero('A', arred(px.h, 0), { id: 's-h', min: 1 })}</div>
    <div class="botoes">
      <button type="button" id="secao-escolher">Escolher a seção</button>
      <button type="button" id="secao-salvar">Salvar como composição</button>
      <button type="button" id="secao-soltar">Desfazer a seção</button>
    </div>`, true, 'secao');
}

function ligarSecao(painel, no) {
  const nos = () => secaoDe(no);
  const proporcional = (k, v) => {
    const c = caixaDoConjunto(nos(), cena.formato);
    if (!c) return;
    const destino = { ...c, [k]: v };
    // largura e altura mudam juntas, na proporção do conjunto
    if (k === 'w') destino.h = c.h * (v / c.w);
    if (k === 'h') destino.w = c.w * (v / c.h);
    reposicionar(nos(), cena.formato, destino);
  };
  for (const k of ['x', 'y', 'w', 'h']) ligar(painel, no, `s-${k}`, (v) => proporcional(k, k === 'w' || k === 'h' ? Math.max(1, v) : v), `Seção ${no.secao}`);
  $('#secao-escolher').onclick = () => { marcadas.clear(); nos().forEach((n) => marcadas.add(n.id)); desenharCamadas(); aviso(`${marcadas.size} camadas escolhidas`); };
  $('#secao-salvar').onclick = () => salvarComposicao(nos(), no.secao);
  $('#secao-soltar').onclick = () => { nos().forEach((n) => { delete n.secao; }); registrar(`Desfazer seção ${no.secao}`); agendarRedesenho(); mostrarPropriedades(); };
}

// ---------- propriedades ----------

function campoNumero(rotulo, valor, { passo = 1, min, max, id, sufixo = '' } = {}) {
  return `<label class="num"><span>${rotulo}</span><input type="number" data-campo="${id}" step="${passo}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} value="${valor}">${sufixo ? `<i>${sufixo}</i>` : ''}</label>`;
}

const CANAIS = ['R', 'G', 'B'];
// Níveis do nó como [ganho[3], desloc[3]] (o renderizador aceita número único ou lista por canal).
function niveisDe(a) {
  const lin = a.linear ?? {};
  const tres = (v, def) => (Array.isArray(v) ? [...v] : [v ?? def, v ?? def, v ?? def]);
  return [tres(lin.ganho, 1), tres(lin.desloc, 0)];
}

function deslizante(rotulo, valor, { min, max, passo, id, mostrar = (v) => v }) {
  return `<label class="desl"><span>${rotulo}</span><input type="range" data-campo="${id}" min="${min}" max="${max}" step="${passo}" value="${valor}"><output>${mostrar(valor)}</output></label>`;
}

// Cores que já aparecem na cena (textos, fundos, efeitos): viram amostras para tingir camadas.
function coresDaCena() {
  const achadas = [...new Set((JSON.stringify(cena).match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toLowerCase()))];
  return achadas.slice(0, 16);
}

function corCampo(rotulo, valor, id) {
  return `<label class="cor"><span>${rotulo}</span><input type="color" data-campo="${id}" value="${valor ?? '#000000'}"></label>`;
}

function secao(titulo, corpo, aberta = true, chave = titulo) {
  const salva = ler(`mesa:secao:${chave}`);
  const abrir = salva === null ? aberta : salva === '1';
  return `<details class="secao" data-chave="${esc(chave)}" ${abrir ? 'open' : ''}><summary>${titulo}</summary><div class="corpo">${corpo}</div></details>`;
}

// Liga um controle a um caminho dentro do nó; muda o JSON e redesenha.
function ligar(painel, no, campo, aplicar, rotulo) {
  painel.querySelectorAll(`[data-campo="${campo}"]`).forEach((el) => {
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const v = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.type === 'range' ? Number(el.value) : el.value;
      aplicar(v, el);
      const out = el.parentElement.querySelector('output');
      if (out && el.dataset.mostrar) out.textContent = el.dataset.mostrar;
      agendarRedesenho();
      registrarDepois(rotulo);
    });
  });
}

function mostrarTransformacao() {
  const no = selecionado && acharNo(selecionado);
  const painel = $('#propriedades');
  if (!no || !no.caixa) return;
  const px = caixaEmPixels(no.caixa, cena.formato);
  for (const [k, v] of Object.entries({ x: px.x, y: px.y, w: px.w, h: px.h, rotacao: no.rotacao ?? 0 })) {
    const el = painel.querySelector(`[data-campo="t-${k}"]`);
    if (el && document.activeElement !== el) el.value = arred(v, 0);
  }
}

function mostrarPropriedades() {
  const painel = $('#propriedades');
  const no = selecionado && acharNo(selecionado);
  if (!no) {
    painel.innerHTML = `<p class="dica">Clique numa camada ou no canvas. Para colocar algo novo, use os botões embaixo da lista de camadas.</p>
      ${secao('Peça', `${campoNumero('Largura', cena.formato.largura, { id: 'f-w', min: 16 })}${campoNumero('Altura', cena.formato.altura, { id: 'f-h', min: 16 })}${corCampo('Cor de fundo', /^#[0-9a-f]{6}$/i.test(cena.formato.fundo ?? '') ? cena.formato.fundo : '#000000', 'f-fundo')}`)}`;
    ligarPainelPeca(painel);
    return;
  }
  const px = no.caixa ? caixaEmPixels(no.caixa, cena.formato) : null;
  const partes = [];
  partes.push(`<h3>${esc(no.id)} <small>${esc(no.papel ?? '')} · ${esc(no.tipo)}</small></h3>`);
  if (no.origem) partes.push(`<p class="dica">Origem: ${esc(no.origem.fonte ?? '')} ${no.origem.como ? '· ' + esc(no.origem.como) : ''}${no.origem.licenca ? ' · licença ' + esc(no.origem.licenca) : ''}</p>`);

  if (px) {
    partes.push(secao('Transformar', `
      <div class="grade2">${campoNumero('X', arred(px.x, 0), { id: 't-x' })}${campoNumero('Y', arred(px.y, 0), { id: 't-y' })}${campoNumero('L', arred(px.w, 0), { id: 't-w', min: 1 })}${campoNumero('A', arred(px.h, 0), { id: 't-h', min: 1 })}</div>
      <div class="linha-ctl"><span class="girar">${campoNumero('Girar', arred(no.rotacao ?? 0), { id: 't-rotacao', passo: 1, sufixo: '°' })}</span>
        <label class="chk"><input type="checkbox" data-campo="t-espelhar" ${no.espelhar ? 'checked' : ''}> Espelhar ↔</label>
        <label class="chk"><input type="checkbox" data-campo="t-espelhar_v" ${no.espelhar_v ? 'checked' : ''}> Espelhar ↕</label></div>
      ${no.tipo === 'imagem' ? `<div class="linha-ctl"><label class="sel"><span>Encaixe</span><select data-campo="t-encaixe">${['conter', 'cobrir', 'esticar'].map((v) => `<option ${no.encaixe === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="sel"><span>Âncora</span><select data-campo="t-ancora">${['centro', 'base', 'topo', 'esquerda', 'direita'].map((v) => `<option ${no.ancora === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>` : ''}
      <div class="botoes alinhar" role="group" aria-label="Alinhar à peça">
        <button type="button" data-alinhar="esq" title="Alinhar à esquerda">⇤</button>
        <button type="button" data-alinhar="ch" title="Centralizar na horizontal">↔</button>
        <button type="button" data-alinhar="dir" title="Alinhar à direita">⇥</button>
        <button type="button" data-alinhar="topo" title="Alinhar ao topo">⤒</button>
        <button type="button" data-alinhar="cv" title="Centralizar na vertical">↕</button>
        <button type="button" data-alinhar="base" title="Alinhar à base">⤓</button>
      </div>
      <div class="botoes ordem">
        <button type="button" data-ordem="topo">Trazer à frente</button>
        <button type="button" id="frente" data-ordem="1">Para frente</button>
        <button type="button" id="tras" data-ordem="-1">Para trás</button>
        <button type="button" data-ordem="fundo">Enviar ao fundo</button>
      </div>`, true, 'transformar'));
  }

  if (no.tipo === 'bloco_texto') partes.push(secao('Texto', painelTexto(no), true, 'texto'));
  if (no.tipo === 'retangulo') {
    partes.push(secao('Preenchimento', `${corCampo('Cor', no.cor ?? '#000000', 'r-cor')}
      ${deslizante('Opacidade da cor', no.opacidade_cor ?? 1, { min: 0, max: 1, passo: 0.01, id: 'r-opacidade_cor', mostrar: (v) => `${Math.round(v * 100)}%` })}
      ${campoNumero('Cantos', no.raio ?? 0, { id: 'r-raio', min: 0 })}`, true, 'preenchimento'));
  }
  if (no.tipo === 'gradiente') {
    partes.push(secao('Gradiente', `<label class="sel"><span>Direção</span><select data-campo="g-direcao">${['horizontal', 'vertical', 'radial'].map((v) => `<option ${no.direcao === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div id="paradas">${(no.paradas ?? []).map((p, i) => `<div class="parada"><input type="color" data-parada="${i}" data-k="1" value="${p[1]}"><input type="range" data-parada="${i}" data-k="0" min="0" max="1" step="0.01" value="${p[0]}" title="posição"><input type="range" data-parada="${i}" data-k="2" min="0" max="1" step="0.01" value="${p[2] ?? 1}" title="opacidade"></div>`).join('')}</div>
      <p class="dica">Cada parada: cor, posição e opacidade.</p>`, true, 'gradiente'));
  }
  if (no.tipo === 'imagem') {
    const a = no.ajustes ?? {};
    partes.push(secao('Ajustes', `
      ${deslizante('Brilho', a.brilho ?? 0, { min: -1, max: 1, passo: 0.01, id: 'a-brilho', mostrar: (v) => Math.round(v * 100) })}
      ${deslizante('Contraste', a.contraste ?? 0, { min: -1, max: 1, passo: 0.01, id: 'a-contraste', mostrar: (v) => Math.round(v * 100) })}
      ${deslizante('Saturação', a.saturacao ?? 0, { min: -1, max: 1, passo: 0.01, id: 'a-saturacao', mostrar: (v) => Math.round(v * 100) })}
      ${deslizante('Matiz', a.matiz ?? 0, { min: -180, max: 180, passo: 1, id: 'a-matiz', mostrar: (v) => `${v}°` })}
      <div class="tom">
        <span>Tom da cor</span>
        <label class="cor"><span>Cor</span><input type="color" id="a-tom-cor" value="${a.tom?.cor ?? '#ffffff'}"></label>
        ${deslizante('Intensidade', a.tom?.intensidade ?? 0.5, { min: 0, max: 1, passo: 0.01, id: 'a-tom-int', mostrar: (v) => Math.round(v * 100) })}
        <div class="amostras">${coresDaCena().map((c) => `<button type="button" class="amostra" data-cor="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
        <div class="botoes"><button type="button" id="sem-tom">Sem tom</button></div>
      </div>
      ${deslizante('Desfoque', a.desfoque ?? 0, { min: 0, max: 1, passo: 0.01, id: 'a-desfoque', mostrar: (v) => Math.round(v * 100) })}
      <div class="tom">
        <span>Níveis por canal (ganho = brancos, desloc = pretos)</span>
        ${CANAIS.map((c, i) => `${deslizante(`${c} ganho`, niveisDe(a)[0][i], { min: 0.5, max: 1.6, passo: 0.01, id: `n-g${i}`, mostrar: (v) => Number(v).toFixed(2) })}
        ${deslizante(`${c} desloc`, niveisDe(a)[1][i], { min: -0.25, max: 0.25, passo: 0.005, id: `n-d${i}`, mostrar: (v) => Number(v).toFixed(2) })}`).join('')}
      </div>
      <div class="botoes"><button type="button" id="zerar-ajustes">Zerar ajustes</button></div>`, false, 'ajustes'));
  }
  if (no.tipo === 'imagem') {
    partes.push(secao('Máscara', `
      <p class="dica">${no.mascara ? 'A camada aparece só onde a máscara (PNG com alfa) deixa.' : 'Sem máscara. Escolha um PNG com alfa: o alfa decide o quanto a camada aparece em cada ponto.'}</p>
      <div class="botoes">
        <label class="botao pequeno">${no.mascara ? 'Trocar máscara' : 'Escolher máscara'}<input id="mascara-arquivo" type="file" accept="image/png,image/webp"></label>
        ${no.mascara ? '<button type="button" id="mascara-tirar">Tirar máscara</button>' : ''}
      </div>`, !!no.mascara, 'mascara'));
  }
  if (no.tipo !== 'grupo') partes.push(secao('Estilos de camada', painelEfeitos(no), false, 'efeitos'));
  if (no.secao) partes.push(painelSecao(no));

  painel.innerHTML = partes.join('');
  painel.querySelectorAll('details.secao').forEach((d) => { d.ontoggle = () => guardar(`mesa:secao:${d.dataset.chave}`, d.open ? '1' : '0'); });
  ligarTransformar(painel, no);
  if (no.tipo === 'bloco_texto') { ligarTexto(painel, no); focarLinhaPendente(painel); }
  if (no.tipo === 'retangulo') {
    ligar(painel, no, 'r-cor', (v) => { no.cor = v; }, `Cor de ${no.id}`);
    ligar(painel, no, 'r-opacidade_cor', (v, el) => { no.opacidade_cor = v; el.dataset.mostrar = `${Math.round(v * 100)}%`; }, `Cor de ${no.id}`);
    ligar(painel, no, 'r-raio', (v) => { no.raio = v; }, `Cantos de ${no.id}`);
  }
  if (no.tipo === 'gradiente') {
    ligar(painel, no, 'g-direcao', (v) => { no.direcao = v; }, `Gradiente de ${no.id}`);
    painel.querySelectorAll('[data-parada]').forEach((el) => {
      el.oninput = () => {
        const p = no.paradas[Number(el.dataset.parada)];
        const k = Number(el.dataset.k);
        while (p.length <= k) p.push(1);
        p[k] = k === 1 ? el.value : Number(el.value);
        agendarRedesenho();
        registrarDepois(`Gradiente de ${no.id}`);
      };
    });
  }
  if (no.tipo === 'imagem') {
    $('#mascara-arquivo').onchange = async (e) => {
      const arq = e.target.files[0];
      e.target.value = '';
      if (!arq) return;
      try {
        const url = await lerArquivo(arq, 'url');
        await carregarImagem(url);
        no.mascara = url;
        registrar(`Máscara em ${no.id}`);
        await agendarRedesenho();
        mostrarPropriedades();
      } catch (err) { aviso(`Não consegui abrir a máscara: ${err.message}`, true); }
    };
    const tirar = $('#mascara-tirar');
    if (tirar) tirar.onclick = () => { delete no.mascara; registrar(`Tirar máscara de ${no.id}`); agendarRedesenho(); mostrarPropriedades(); };
    for (const k of ['brilho', 'contraste', 'saturacao', 'matiz', 'desfoque']) {
      ligar(painel, no, `a-${k}`, (v, el) => {
        no.ajustes = { ...(no.ajustes ?? {}), [k]: v };
        if (!v) delete no.ajustes[k];
        if (!Object.keys(no.ajustes).length) delete no.ajustes;
        el.dataset.mostrar = k === 'matiz' ? `${v}°` : String(Math.round(v * 100));
      }, `Ajuste de ${no.id}`);
    }
    for (let i = 0; i < 3; i++) {
      for (const [k, def] of [['g', 1], ['d', 0]]) {
        ligar(painel, no, `n-${k}${i}`, (v, el) => {
          const [ganho, desloc] = niveisDe(no.ajustes ?? {});
          (k === 'g' ? ganho : desloc)[i] = v;
          const neutro = ganho.every((x) => x === 1) && desloc.every((x) => x === 0);
          no.ajustes = { ...(no.ajustes ?? {}) };
          if (neutro) delete no.ajustes.linear; else no.ajustes.linear = { ganho, desloc };
          if (!Object.keys(no.ajustes).length) delete no.ajustes;
          el.dataset.mostrar = v.toFixed(2);
        }, `Níveis de ${no.id}`);
      }
    }
    const tomAtual = () => ({ cor: no.ajustes?.tom?.cor ?? '#ffffff', intensidade: no.ajustes?.tom?.intensidade ?? 0.5 });
    const aplicarTom = (mudanca, rotulo) => {
      no.ajustes = { ...(no.ajustes ?? {}), tom: { ...tomAtual(), ...mudanca } };
      agendarRedesenho();
      registrarDepois(rotulo);
    };
    const rotuloTom = `Tom de ${no.id}`;
    $('#a-tom-cor').oninput = (e) => aplicarTom({ cor: e.target.value }, rotuloTom);
    painel.querySelector('[data-campo="a-tom-int"]').oninput = (e) => {
      aplicarTom({ intensidade: Number(e.target.value) }, rotuloTom);
      e.target.parentElement.querySelector('output').textContent = Math.round(Number(e.target.value) * 100);
    };
    painel.querySelectorAll('.amostra').forEach((b) => { b.onclick = () => { $('#a-tom-cor').value = b.dataset.cor; aplicarTom({ cor: b.dataset.cor }, rotuloTom); mostrarPropriedades(); }; });
    $('#sem-tom').onclick = () => { if (no.ajustes) delete no.ajustes.tom; if (no.ajustes && !Object.keys(no.ajustes).length) delete no.ajustes; registrar(rotuloTom); agendarRedesenho(); mostrarPropriedades(); };
    $('#zerar-ajustes').onclick = () => { delete no.ajustes; registrar(`Zerar ajustes de ${no.id}`); agendarRedesenho(); mostrarPropriedades(); };
  }
  if (no.tipo !== 'grupo') ligarEfeitos(painel, no);
  if (no.secao) ligarSecao(painel, no);
}

function ligarPainelPeca(painel) {
  const mudar = (fn, rotulo) => (el) => el.addEventListener('change', async () => { fn(el); registrar(rotulo); ajustarZoom(); await agendarRedesenho(); });
  painel.querySelectorAll('[data-campo="f-w"]').forEach(mudar((el) => { cena.formato.largura = Math.max(16, Number(el.value)); }, 'Tamanho da peça'));
  painel.querySelectorAll('[data-campo="f-h"]').forEach(mudar((el) => { cena.formato.altura = Math.max(16, Number(el.value)); }, 'Tamanho da peça'));
  painel.querySelectorAll('[data-campo="f-fundo"]').forEach((el) => el.addEventListener('input', () => { cena.formato.fundo = el.value; agendarRedesenho(); registrarDepois('Cor de fundo'); }));
}

function ligarTransformar(painel, no) {
  if (!no.caixa) return;
  const f = cena.formato;
  const caixaPx = () => caixaEmPixels(no.caixa, f);
  for (const k of ['x', 'y', 'w', 'h']) {
    ligar(painel, no, `t-${k}`, (v) => {
      const c = caixaPx();
      c[k] = k === 'w' || k === 'h' ? Math.max(1, v) : v;
      no.caixa = caixaEmFracoes(c, f);
    }, `Transformar ${no.id}`);
  }
  ligar(painel, no, 't-rotacao', (v) => { no.rotacao = v; }, `Girar ${no.id}`);
  ligar(painel, no, 't-espelhar', (v) => { no.espelhar = v || undefined; }, `Espelhar ${no.id}`);
  ligar(painel, no, 't-espelhar_v', (v) => { no.espelhar_v = v || undefined; }, `Espelhar ${no.id}`);
  ligar(painel, no, 't-encaixe', (v) => { no.encaixe = v; }, `Encaixe de ${no.id}`);
  ligar(painel, no, 't-ancora', (v) => { no.ancora = v; }, `Âncora de ${no.id}`);
  painel.querySelectorAll('[data-alinhar]').forEach((b) => { b.onclick = () => alinhar(no, b.dataset.alinhar); });
  painel.querySelectorAll('[data-ordem]').forEach((b) => {
    const v = b.dataset.ordem;
    b.onclick = () => mudarOrdem(no, v === 'topo' ? Infinity : v === 'fundo' ? -Infinity : Number(v));
  });
}

// Alinha pelo que aparece (a tinta), não pela caixa, como o Photoshop.
function alinhar(no, como) {
  const obj = objetoDoNo(no.id);
  if (!obj) return;
  const r = obj.getBoundingRect();
  const { largura: W, altura: H } = cena.formato;
  let dx = 0;
  let dy = 0;
  if (como === 'esq') dx = -r.left;
  if (como === 'ch') dx = W / 2 - (r.left + r.width / 2);
  if (como === 'dir') dx = W - (r.left + r.width);
  if (como === 'topo') dy = -r.top;
  if (como === 'cv') dy = H / 2 - (r.top + r.height / 2);
  if (como === 'base') dy = H - (r.top + r.height);
  deslocar(no, dx, dy);
  registrar(`Alinhar ${no.id}`);
}

function deslocar(no, dx, dy) {
  const c = caixaEmPixels(no.caixa, cena.formato);
  no.caixa = caixaEmFracoes({ ...c, x: c.x + dx, y: c.y + dy }, cena.formato);
  agendarRedesenho().then(mostrarTransformacao);
}

const opcoesEstilo = (estilos, atual) => estilos.map((e) => `<option ${atual === e ? 'selected' : ''}>${esc(e)}</option>`).join('');

// Enter quebra a linha onde está o cursor (como num editor de texto); Backspace no
// começo junta com a linha de cima. Vale também dentro dos pedaços de cor.
let focoPendente = null;

function teclaNaLinha(ev, no, i, k = null) {
  const el = ev.target;
  const l = no.linhas[i];
  const pos = el.selectionStart ?? el.value.length;
  if (ev.key === 'Enter') {
    ev.preventDefault();
    let nova;
    if (k === null) {
      nova = { ...structuredClone(l), texto: l.texto.slice(el.selectionEnd ?? pos).replace(/^\s+/, '') };
      l.texto = l.texto.slice(0, pos).replace(/\s+$/, '');
    } else {
      // divide os pedaços: o que vem antes do cursor fica, o resto vai para a linha nova
      const t = l.trechos[k];
      const resto = [{ ...t, texto: t.texto.slice(pos).replace(/^\s+/, '') }, ...l.trechos.slice(k + 1)].filter((x) => x.texto);
      t.texto = t.texto.slice(0, pos).replace(/\s+$/, '');
      l.trechos = l.trechos.slice(0, k + 1).filter((x) => x.texto);
      nova = { ...structuredClone(l), trechos: resto.length ? resto : [{ ...t, texto: '' }] };
      for (const linha of [l, nova]) {
        if (linha.trechos.length === 1) { linha.estilo = linha.trechos[0].estilo; linha.texto = linha.trechos[0].texto; delete linha.trechos; }
        else if (!linha.trechos.length) { delete linha.trechos; linha.texto = ''; }
        else linha.texto = linha.trechos.map((x) => x.texto).join('');
      }
    }
    no.linhas.splice(i + 1, 0, nova);
    focoPendente = { linha: i + 1, pos: 0 };
    registrar(`Quebrar linha em ${no.id}`);
    agendarRedesenho();
    mostrarPropriedades();
  } else if (ev.key === 'Backspace' && pos === 0 && el.selectionEnd === 0 && i > 0 && (k === null || k === 0)) {
    ev.preventDefault();
    const cima = no.linhas[i - 1];
    const fim = cima.texto.length;
    const pedacos = (linha) => linha.trechos ?? [{ texto: linha.texto, estilo: linha.estilo }];
    const juntos = [...pedacos(cima), ...pedacos(l)];
    if (juntos.every((t) => t.estilo === juntos[0].estilo && !t.escala)) {
      cima.texto = `${cima.texto} ${l.texto}`.trim();
      delete cima.trechos;
    } else {
      if (juntos[pedacos(cima).length - 1]) juntos[pedacos(cima).length - 1] = { ...juntos[pedacos(cima).length - 1], texto: `${juntos[pedacos(cima).length - 1].texto} ` };
      // pedaços vizinhos iguais viram um só
      cima.trechos = juntos.reduce((acc, t) => {
        const ult = acc.at(-1);
        if (ult && ult.estilo === t.estilo && (ult.escala ?? 1) === (t.escala ?? 1) && ult.caixa_alta === t.caixa_alta) ult.texto += t.texto;
        else acc.push({ ...t });
        return acc;
      }, []);
      cima.texto = cima.trechos.map((t) => t.texto).join('');
    }
    no.linhas.splice(i, 1);
    focoPendente = { linha: i - 1, pos: fim + 1 };
    registrar(`Juntar linhas em ${no.id}`);
    agendarRedesenho();
    mostrarPropriedades();
  }
}

function focarLinhaPendente(painel) {
  if (!focoPendente) return;
  const { linha, pos } = focoPendente;
  focoPendente = null;
  const campo = painel.querySelector(`.linha[data-i="${linha}"] .t, .linha[data-i="${linha}"] .tt`);
  if (!campo) return;
  campo.focus();
  const p = Math.min(pos, campo.value.length);
  campo.setSelectionRange(p, p);
}

function linhaDeTexto(no, l, i, estilos) {
  const trechos = l.trechos?.length ? `<div class="trechos">${l.trechos.map((t, k) => `<div class="trecho" data-k="${k}">
      <input class="tt" value="${esc(t.texto)}" aria-label="Pedaço ${k + 1}">
      <select class="te" aria-label="Estilo do pedaço">${opcoesEstilo(estilos, t.estilo)}</select>
      <input class="tz" type="number" step="0.05" min="0.3" max="4" value="${t.escala ?? 1}" title="Tamanho do pedaço (1 = igual à linha)" aria-label="Tamanho do pedaço">
      <button class="tx" type="button" title="Remover pedaço">×</button></div>`).join('')}
      <div class="botoes"><button class="tmais pequeno" type="button">+ pedaço</button><button class="tjuntar pequeno" type="button">Uma cor só</button></div></div>` : '';
  return `<div class="linha" data-i="${i}">
    ${l.trechos?.length ? `<span class="texto-trechos">${esc(l.trechos.map((t) => t.texto).join(''))}</span>` : `<input class="t" value="${esc(l.texto)}" aria-label="Texto da linha ${i + 1}">`}
    <div class="ctl">
      ${l.trechos?.length ? '' : `<select class="e" aria-label="Estilo">${opcoesEstilo(estilos, l.estilo)}</select>`}
      <label title="Peso: tamanho relativo da linha">peso<input class="p" type="number" step="0.05" min="0.2" value="${l.peso ?? 1}"></label>
      <label title="Espaço entre letras desta linha (em)">esp.<input class="s" type="number" step="0.005" value="${l.espacamento ?? ''}" placeholder="${no.espacamento ?? 0}"></label>
      ${l.trechos?.length ? '' : '<button class="dividir pequeno" type="button" title="Cores e tamanhos diferentes na mesma linha">Cores</button>'}
      <button class="x" type="button" title="Remover linha">×</button>
    </div>${trechos}</div>`;
}

function painelTexto(no) {
  const estilos = Object.keys(no.estilos ?? {});
  const familias = [...new Set([...(cena.fontes ?? []).map((f) => f.familia), no.fonte?.familia, 'Arial', 'Impact', 'Georgia'].filter(Boolean))];
  return `<p class="dica">Enter quebra a linha onde está o cursor; Backspace no começo junta com a de cima. Cada linha: texto, estilo, peso (a linha de peso 4 sai 4x maior) e espaço entre letras. "Cores" divide a linha em pedaços, cada um com a sua cor e tamanho. O encaixe é refeito sozinho.</p>
    <div id="linhas">${no.linhas.map((l, i) => linhaDeTexto(no, l, i, estilos)).join('')}</div>
    <div class="botoes"><button id="mais" type="button">+ linha</button></div>
    <div class="linha-ctl">
      <label class="sel"><span>Fonte</span><select data-campo="x-familia">${familias.map((f) => `<option ${no.fonte?.familia === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      ${campoNumero('Peso', no.fonte?.peso ?? 400, { id: 'x-peso', passo: 100, min: 100, max: 900 })}
      <label class="botao pequeno">+ fonte<input id="subir-fonte" type="file" accept=".ttf,.otf,.woff,.woff2"></label>
    </div>
    <div class="linha-ctl">
      <label class="sel"><span>Alinhar</span><select data-campo="x-alinhamento">${['esquerda', 'centro', 'direita'].map((a) => `<option ${(no.alinhamento ?? 'esquerda') === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="sel"><span>Vertical</span><select data-campo="x-vertical">${['inicio', 'centro', 'fim'].map((a) => `<option ${(no.vertical ?? 'centro') === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" data-campo="x-caixa_alta" ${no.caixa_alta !== false ? 'checked' : ''}> Caixa alta</label>
    </div>
    ${deslizante('Vão entre linhas', no.vao ?? 0.28, { min: 0, max: 1, passo: 0.01, id: 'x-vao', mostrar: (v) => v })}
    ${deslizante('Espaço entre letras', no.espacamento ?? 0, { min: -0.1, max: 0.3, passo: 0.005, id: 'x-espacamento', mostrar: (v) => v })}
    <h4>Estilos das linhas</h4>
    <div id="estilos">${estilos.map((e) => {
      const st = no.estilos[e];
      return `<div class="estilo" data-estilo="${esc(e)}"><span>${esc(e)}</span>${st.rampa
        ? st.rampa.map((p, i) => `<input type="color" data-rampa="${i}" value="${p[1]}" title="parada ${Math.round(p[0] * 100)}%">`).join('') + '<button type="button" class="sem-rampa" title="Trocar o degradê por cor chapada">chapada</button>'
        : `<input type="color" data-cor value="${st.cor ?? '#ffffff'}"><button type="button" class="com-rampa" title="Trocar por degradê">degradê</button>`}
        <label class="cor" title="Cor do relevo 3D deste estilo">relevo<input type="color" data-relevo value="${st.relevo ?? no.efeitos?.relevo?.cor ?? '#5a3200'}"></label></div>`;
    }).join('')}</div>
    <div class="botoes"><button id="novo-estilo" type="button">+ estilo</button></div>`;
}

function ligarTexto(painel, no) {
  const estilos = Object.keys(no.estilos ?? {});
  painel.querySelectorAll('#linhas .linha').forEach((div) => {
    const i = Number(div.dataset.i);
    const l = no.linhas[i];
    const q = (sel) => div.querySelector(sel);
    const sincronizar = () => { l.texto = l.trechos.map((t) => t.texto).join(''); const span = q('.texto-trechos'); if (span) span.textContent = l.texto; };
    if (q('.t')) q('.t').oninput = (ev) => { l.texto = ev.target.value; agendarRedesenho(); registrarDepois(`Texto de ${no.id}`); };
    if (q('.t')) q('.t').onkeydown = (ev) => teclaNaLinha(ev, no, i);
    if (q('.e')) q('.e').onchange = (ev) => { l.estilo = ev.target.value; agendarRedesenho(); registrar(`Estilo da linha de ${no.id}`); };
    q('.p').oninput = (ev) => { l.peso = Number(ev.target.value) || 1; agendarRedesenho(); registrarDepois(`Peso da linha de ${no.id}`); };
    q('.s').oninput = (ev) => {
      if (ev.target.value === '') delete l.espacamento; else l.espacamento = Number(ev.target.value);
      agendarRedesenho(); registrarDepois(`Espaçamento da linha de ${no.id}`);
    };
    q('.x').onclick = () => {
      if (no.linhas.length < 2) { aviso('O bloco precisa de pelo menos uma linha', true); return; }
      no.linhas.splice(i, 1); registrar(`Remover linha de ${no.id}`); agendarRedesenho(); mostrarPropriedades();
    };
    if (q('.dividir')) q('.dividir').onclick = () => {
      // divide na última palavra: "DE ATÉ 2%" vira "DE ATÉ " + "2%"
      const m = l.texto.match(/^(.*\s)(\S+)$/);
      l.trechos = m ? [{ texto: m[1], estilo: l.estilo }, { texto: m[2], estilo: estilos.find((e) => e !== l.estilo) ?? l.estilo }] : [{ texto: l.texto, estilo: l.estilo }];
      registrar(`Cores por palavra em ${no.id}`); agendarRedesenho(); mostrarPropriedades();
    };
    div.querySelectorAll('.trecho').forEach((tdiv) => {
      const t = l.trechos[Number(tdiv.dataset.k)];
      tdiv.querySelector('.tt').oninput = (ev) => { t.texto = ev.target.value; sincronizar(); agendarRedesenho(); registrarDepois(`Texto de ${no.id}`); };
      tdiv.querySelector('.tt').onkeydown = (ev) => teclaNaLinha(ev, no, i, Number(tdiv.dataset.k));
      tdiv.querySelector('.te').onchange = (ev) => { t.estilo = ev.target.value; agendarRedesenho(); registrar(`Cor do pedaço em ${no.id}`); };
      tdiv.querySelector('.tz').oninput = (ev) => {
        const v = Number(ev.target.value);
        if (!v || v === 1) delete t.escala; else t.escala = v;
        agendarRedesenho(); registrarDepois(`Tamanho do pedaço em ${no.id}`);
      };
      tdiv.querySelector('.tx').onclick = () => {
        l.trechos.splice(Number(tdiv.dataset.k), 1);
        if (!l.trechos.length) delete l.trechos; else sincronizar();
        registrar(`Remover pedaço em ${no.id}`); agendarRedesenho(); mostrarPropriedades();
      };
    });
    if (q('.tmais')) q('.tmais').onclick = () => { l.trechos.push({ texto: ' novo', estilo: l.trechos.at(-1).estilo }); sincronizar(); registrar(`Novo pedaço em ${no.id}`); agendarRedesenho(); mostrarPropriedades(); };
    if (q('.tjuntar')) q('.tjuntar').onclick = () => { l.estilo = l.trechos[0].estilo; delete l.trechos; registrar(`Uma cor só em ${no.id}`); agendarRedesenho(); mostrarPropriedades(); };
  });
  $('#mais').onclick = () => { no.linhas.push({ texto: 'Nova linha', estilo: estilos[0], peso: 1 }); registrar(`Nova linha em ${no.id}`); agendarRedesenho(); mostrarPropriedades(); };
  ligar(painel, no, 'x-familia', (v) => { no.fonte = { ...no.fonte, familia: v }; }, `Fonte de ${no.id}`);
  ligar(painel, no, 'x-peso', (v) => { no.fonte = { ...no.fonte, peso: v }; }, `Fonte de ${no.id}`);
  ligar(painel, no, 'x-alinhamento', (v) => { no.alinhamento = v; }, `Alinhamento de ${no.id}`);
  ligar(painel, no, 'x-vertical', (v) => { no.vertical = v; }, `Alinhamento de ${no.id}`);
  ligar(painel, no, 'x-caixa_alta', (v) => { no.caixa_alta = v; }, `Caixa alta de ${no.id}`);
  ligar(painel, no, 'x-vao', (v, el) => { no.vao = v; el.dataset.mostrar = v; }, `Vão de ${no.id}`);
  ligar(painel, no, 'x-espacamento', (v, el) => { no.espacamento = v; el.dataset.mostrar = v; }, `Espaçamento de ${no.id}`);
  $('#subir-fonte').onchange = async (ev) => {
    const arquivo = ev.target.files[0];
    if (!arquivo) return;
    try {
      const familia = arquivo.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      const dados = await lerArquivo(arquivo, 'url');
      const face = new FontFace(familia, `url(${dados})`);
      document.fonts.add(await face.load());
      cena.fontes = [...(cena.fontes ?? []), { familia, arquivo: dados, peso: 400 }];
      no.fonte = { familia, peso: 400 };
      registrar(`Fonte ${familia}`);
      await agendarRedesenho();
      mostrarPropriedades();
    } catch (e) {
      aviso(`Essa fonte não abriu: ${e.message}`, true);
    }
  };
  painel.querySelectorAll('#estilos .estilo').forEach((div) => {
    const st = no.estilos[div.dataset.estilo];
    div.querySelectorAll('[data-rampa]').forEach((el) => { el.oninput = () => { st.rampa[Number(el.dataset.rampa)][1] = el.value; agendarRedesenho(); registrarDepois(`Cor de ${no.id}`); }; });
    const relevo = div.querySelector('[data-relevo]');
    if (relevo) relevo.oninput = () => { st.relevo = relevo.value; agendarRedesenho(); registrarDepois(`Relevo de ${no.id}`); };
    const cor = div.querySelector('[data-cor]');
    if (cor) cor.oninput = () => { st.cor = cor.value; agendarRedesenho(); registrarDepois(`Cor de ${no.id}`); };
    const sem = div.querySelector('.sem-rampa');
    if (sem) sem.onclick = () => { st.cor = st.rampa[0][1]; delete st.rampa; registrar(`Cor chapada em ${no.id}`); agendarRedesenho(); mostrarPropriedades(); };
    const com = div.querySelector('.com-rampa');
    if (com) com.onclick = () => { st.rampa = [[0, '#ffffff'], [1, st.cor ?? '#f5c400']]; registrar(`Degradê em ${no.id}`); agendarRedesenho(); mostrarPropriedades(); };
  });
  $('#novo-estilo').onclick = () => {
    const nome = idNovoEstilo(no);
    no.estilos[nome] = { cor: '#f5c400' };
    registrar(`Estilo ${nome} em ${no.id}`);
    mostrarPropriedades();
  };
}

function idNovoEstilo(no) {
  let k = Object.keys(no.estilos).length + 1;
  while (no.estilos[`estilo${k}`]) k++;
  return `estilo${k}`;
}

// Estilos de camada, como na janela do PhotoCraft: cada um liga e desliga.
const PADRAO_EFEITO = {
  sombra: { cor: '#000000', opacidade: 0.6, desfoque: 18, dx: 6, dy: 8 },
  brilho: { cor: '#ffe066', opacidade: 0.85, tamanho: 28 },
  contorno: { cor: '#000000', largura: 4 },
  relevo: { cor: '#5a3200', profundidade: 0.05, angulo: 90 },
};

function painelEfeitos(no) {
  const ef = no.efeitos ?? {};
  const legado = false;
  const bloco = (k, titulo, corpo) => `<div class="efeito ${ef[k] ? 'ligado' : ''}"><label class="chk titulo"><input type="checkbox" data-efeito="${k}" ${ef[k] ? 'checked' : ''}> ${titulo}</label>${ef[k] ? `<div class="corpo-efeito">${corpo(ef[k])}</div>` : ''}</div>`;
  const pode = no.tipo === 'bloco_texto' || no.tipo === 'retangulo';
  return `${legado ? '<p class="dica">Este texto já tem a sombra da ficha (proporcional à letra). Ligar a sombra aqui troca pela sombra em pixels.</p>' : ''}
    ${no.tipo === 'bloco_texto' ? sombraDaLetra(no) : ''}
    ${bloco('sombra', 'Sombra projetada', (s) => `${corCampo('Cor', s.cor, 'e-sombra-cor')}
      ${deslizante('Opacidade', s.opacidade ?? 0.6, { min: 0, max: 1, passo: 0.01, id: 'e-sombra-opacidade', mostrar: (v) => `${Math.round(v * 100)}%` })}
      ${deslizante('Desfoque', s.desfoque ?? 10, { min: 0, max: 120, passo: 1, id: 'e-sombra-desfoque', mostrar: (v) => `${v}px` })}
      <div class="grade2">${campoNumero('X', s.dx ?? 0, { id: 'e-sombra-dx' })}${campoNumero('Y', s.dy ?? 0, { id: 'e-sombra-dy' })}</div>`)}
    ${bloco('brilho', 'Brilho externo', (s) => `${corCampo('Cor', s.cor, 'e-brilho-cor')}
      ${deslizante('Opacidade', s.opacidade ?? 0.8, { min: 0, max: 1, passo: 0.01, id: 'e-brilho-opacidade', mostrar: (v) => `${Math.round(v * 100)}%` })}
      ${deslizante('Tamanho', s.tamanho ?? 20, { min: 0, max: 160, passo: 1, id: 'e-brilho-tamanho', mostrar: (v) => `${v}px` })}`)}
    ${no.tipo === 'bloco_texto' ? bloco('relevo', 'Relevo 3D', (s) => `${corCampo('Cor', s.cor, 'e-relevo-cor')}
      ${deslizante('Profundidade', s.profundidade ?? 0.05, { min: 0, max: 0.25, passo: 0.005, id: 'e-relevo-profundidade', mostrar: (v) => `${Math.round(v * 100)}%` })}
      ${deslizante('Ângulo', s.angulo ?? 90, { min: 0, max: 180, passo: 1, id: 'e-relevo-angulo', mostrar: (v) => `${v}°` })}
      <p class="dica">Profundidade em % do corpo da letra. Cada estilo pode ter a própria cor de relevo (em Estilos das linhas).</p>`) : ''}
    ${pode ? bloco('contorno', 'Contorno', (s) => `${corCampo('Cor', s.cor, 'e-contorno-cor')}
      ${deslizante('Largura', s.largura ?? 4, { min: 0, max: 40, passo: 0.5, id: 'e-contorno-largura', mostrar: (v) => `${v}px` })}`) : '<p class="dica">Contorno: só em texto e retângulo.</p>'}`;
}

// Sombra proporcional à letra (campo "sombra" do bloco, em frações do corpo):
// é o halo escuro atrás do texto dos banners; acompanha o tamanho de cada linha.
function sombraDaLetra(no) {
  const s = no.sombra;
  return `<div class="efeito ${s ? 'ligado' : ''}"><label class="chk titulo"><input type="checkbox" data-sombra-letra ${s ? 'checked' : ''}> Sombra da letra (proporcional)</label>${s ? `<div class="corpo-efeito">
    ${corCampo('Cor', s.cor ?? '#000000', 'l-cor')}
    ${deslizante('Opacidade', s.opacidade ?? 0.8, { min: 0, max: 1, passo: 0.01, id: 'l-opacidade', mostrar: (v) => `${Math.round(v * 100)}%` })}
    ${deslizante('Desfoque', s.desfoque ?? 0.2, { min: 0, max: 1, passo: 0.01, id: 'l-desfoque', mostrar: (v) => `${Math.round(v * 100)}%` })}
    ${deslizante('Descer', s.desvio?.[1] ?? 0.05, { min: -0.3, max: 0.3, passo: 0.005, id: 'l-dy', mostrar: (v) => `${Math.round(v * 100)}%` })}</div>` : ''}</div>`;
}

function ligarEfeitos(painel, no) {
  const chk = painel.querySelector('[data-sombra-letra]');
  if (chk) {
    chk.onchange = () => {
      if (chk.checked) no.sombra = { cor: '#000000', opacidade: 0.85, desfoque: 0.3, desvio: [0, 0.06] }; else delete no.sombra;
      registrar(`${chk.checked ? 'Ligar' : 'Desligar'} sombra da letra em ${no.id}`); agendarRedesenho(); mostrarPropriedades();
    };
    const pct = (v) => `${Math.round(v * 100)}%`;
    ligar(painel, no, 'l-cor', (v) => { no.sombra.cor = v; }, `Sombra de ${no.id}`);
    ligar(painel, no, 'l-opacidade', (v, el) => { no.sombra.opacidade = v; el.dataset.mostrar = pct(v); }, `Sombra de ${no.id}`);
    ligar(painel, no, 'l-desfoque', (v, el) => { no.sombra.desfoque = v; el.dataset.mostrar = pct(v); }, `Sombra de ${no.id}`);
    ligar(painel, no, 'l-dy', (v, el) => { no.sombra.desvio = [no.sombra.desvio?.[0] ?? 0, v]; el.dataset.mostrar = pct(v); }, `Sombra de ${no.id}`);
  }
  painel.querySelectorAll('[data-efeito]').forEach((el) => {
    el.onchange = () => {
      const k = el.dataset.efeito;
      no.efeitos = { ...(no.efeitos ?? {}) };
      if (el.checked) {
        no.efeitos[k] = { ...PADRAO_EFEITO[k] };
        if (k === 'sombra' && no.sombra) delete no.sombra;
      } else delete no.efeitos[k];
      if (!Object.keys(no.efeitos).length) delete no.efeitos;
      registrar(`${el.checked ? 'Ligar' : 'Desligar'} ${k} em ${no.id}`);
      agendarRedesenho();
      mostrarPropriedades();
    };
  });
  const mostrarEfeito = { opacidade: (v) => `${Math.round(v * 100)}%`, profundidade: (v) => `${Math.round(v * 100)}%`, angulo: (v) => `${v}°` };
  for (const [k, campos] of Object.entries({ sombra: ['cor', 'opacidade', 'desfoque', 'dx', 'dy'], brilho: ['cor', 'opacidade', 'tamanho'], contorno: ['cor', 'largura'], relevo: ['cor', 'profundidade', 'angulo'] })) {
    for (const c of campos) {
      ligar(painel, no, `e-${k}-${c}`, (v, el) => {
        no.efeitos[k][c] = v;
        if (el.type === 'range') el.dataset.mostrar = (mostrarEfeito[c] ?? ((x) => `${x}px`))(v);
      }, `${k[0].toUpperCase() + k.slice(1)} de ${no.id}`);
    }
  }
}

// ---------- abrir, guardar e exportar ----------
// Toda cena aberta é uma peça do Armazém (editor/armazem.js): cada edição fica guardada na peça, no
// navegador e, na Mesa online, no banco dela. Sem armazém (navegador sem IndexedDB), a edição fica
// como rascunho no localStorage, como antes.

const chaveRascunhoAntigo = (url) => `mesa:rascunho:v2:${url}`;
let aGravar = null; // { id, foto } esperando a pessoa parar de mexer
let filaGravacao = Promise.resolve();

function marcarSalvo(estado, detalhe = '') {
  const el = $('#salvo');
  if (!el) return;
  el.dataset.estado = estado;
  el.textContent = { guardando: 'Guardando…', salvo: `Salvo${detalhe}`, erro: 'Não salvou', local: 'Salvo só neste navegador' }[estado] ?? '';
  el.title = estado === 'erro' ? detalhe : '';
}

function guardarCena(foto) {
  if (!armazem || !pecaAtual) {
    guardar(chaveRascunhoAntigo(urlCena?.href ?? cena?.nome ?? 'cena'), foto);
    return;
  }
  aGravar = { id: pecaAtual.id, foto };
  marcarSalvo('guardando');
  clearTimeout(guardarCena.t);
  guardarCena.t = setTimeout(descarregar, 700);
}

// Grava já o que está esperando (antes de trocar de peça, por exemplo).
function descarregar() {
  clearTimeout(guardarCena.t);
  const pedido = aGravar;
  aGravar = null;
  if (!pedido) return filaGravacao;
  filaGravacao = filaGravacao.then(async () => {
    try {
      const peca = await armazem.gravarCena(pedido.id, JSON.parse(pedido.foto));
      if (pecaAtual?.id === peca.id) pecaAtual = peca;
      if (!aGravar) marcarSalvo('salvo', onde === 'online' ? '' : ' neste navegador');
      if (pecaAtual?.id === peca.id) {
        projetos?.aoGuardar(peca);
        if (peca.origem) $('#rascunho').hidden = false; // agora dá para voltar ao original
        agendarMiniatura();
      }
    } catch (e) {
      marcarSalvo('erro', e.message);
      aviso(`Não consegui guardar a peça: ${e.message}`, true);
    }
  });
  return filaGravacao;
}
window.addEventListener('pagehide', () => { descarregar(); });

let onde = 'nenhum'; // 'online', 'navegador' ou 'nenhum'

async function abrir(json, base, { editada = false, rascunhoAntigo = false } = {}) {
  cena = json;
  baseAssets = base;
  selecionado = null;
  marcadas.clear();
  historico.passos = [];
  historico.i = -1;
  let salvo = null;
  if (rascunhoAntigo) {
    try { salvo = JSON.parse(ler(chaveRascunhoAntigo(urlCena?.href)) ?? 'null'); } catch { salvo = null; }
    if (salvo) cena = salvo;
  }
  $('#rascunho').hidden = !(editada || salvo);
  $('#titulo').textContent = pecaAtual ? `${pecaAtual.rotulo ?? pecaAtual.nome}` : (cena.nome ?? 'cena');
  await carregarFontes();
  ajustarZoom();
  await redesenhar();
  mostrarPropriedades();
  registrar(salvo ? 'Rascunho restaurado' : 'Abrir');
}

const resolver = (endereco) => new URL(endereco, location.href);

async function abrirPeca(peca) {
  await descarregar();
  let json = peca.cena;
  const origem = peca.origem ? resolver(peca.origem) : null;
  if (!json) {
    if (!origem) throw new Error(`a peça ${peca.nome} está vazia`);
    const r = await fetch(origem);
    if (!r.ok) throw new Error(`não achei a cena ${origem.pathname} (${r.status})`);
    json = await r.json();
  }
  pecaAtual = peca;
  urlCena = origem ?? new URL(`peca:${peca.id}`);
  guardar('mesa:peca', peca.id);
  desenharAbas();
  await abrir(structuredClone(json), resolver(peca.base ?? peca.origem ?? location.href), { editada: !!(peca.cena && peca.origem) });
  marcarSalvo(onde === 'online' ? 'salvo' : 'local');
  projetos?.aoAbrir(peca);
  if (!peca.miniatura) agendarMiniatura();
}

// Peça de uma cena que veio pronta com a página (aba ou ?cena=); cria na hora se ainda não existe.
async function pecaDaOrigem(origem, rotulo) {
  return (await armazem.pecaPelaOrigem(origem))
    ?? armazem.criarPeca({ projeto: (await projetoAvulsas()).id, nome: rotulo ?? origem.split('/').slice(-2, -1)[0] ?? 'peça', origem });
}

// Cenas e PSD abertos do computador, e cenas avulsas, ficam no projeto "Peças avulsas".
async function projetoAvulsas() {
  const p = (await armazem.listarProjetos({ arquivados: true })).find((x) => x.id === 'pecas-avulsas');
  return p ?? armazem.criarProjeto('Peças avulsas');
}

async function voltarAoOriginal() {
  if (armazem && pecaAtual?.origem) {
    await descarregar();
    await abrirPeca(await armazem.voltarAoOriginal(pecaAtual.id));
    aviso('Voltou ao original; a edição ficou guardada em Versões');
    return;
  }
  guardar(chaveRascunhoAntigo(urlCena?.href), null);
  const resposta = await fetch(urlCena);
  await abrir(await resposta.json(), urlCena);
  aviso('Voltou à versão original da cena');
}

// Desenha a cena num canvas fora da tela, no tamanho real (para PNG e PSD).
async function desenharFora(c, escala = 1, base = baseAssets) {
  const el = document.createElement('canvas');
  const tela = new fabric.StaticCanvas(el, { width: c.formato.largura, height: c.formato.altura, enableRetinaScaling: false, renderOnAddRemove: false });
  await montarCena(fabric, tela, c, { medidor, carregarImagem: (a) => carregarImagem(a, base) });
  const saida = tela.toCanvasElement(escala);
  tela.dispose();
  return saida;
}

// Miniatura da peça para a tela de Projetos: JPEG de uns 360 px de largura, desenhado fora da tela.
async function miniaturaDe(c, base, largura = 360) {
  await carregarFontes(c, base);
  const el = await desenharFora(c, Math.min(1, largura / c.formato.largura), base);
  const fundo = document.createElement('canvas');
  fundo.width = el.width;
  fundo.height = el.height;
  const g = fundo.getContext('2d');
  g.fillStyle = '#26262b';
  g.fillRect(0, 0, fundo.width, fundo.height);
  g.drawImage(el, 0, 0);
  return fundo.toDataURL('image/jpeg', 0.72);
}

// Guarda a miniatura sem mexer na cena; entra na mesma fila das gravações para não pisar numa edição.
function guardarMiniatura(id, miniatura) {
  filaGravacao = filaGravacao.then(async () => {
    try {
      const p = await armazem.definirMiniatura(id, miniatura);
      if (p && pecaAtual?.id === id) pecaAtual = { ...pecaAtual, miniatura };
    } catch { /* a miniatura é só um enfeite: sem ela a tela mostra o formato */ }
  });
  return filaGravacao;
}

// Da peça aberta: pouco depois da última edição (e já na abertura, se ainda não tem).
async function atualizarMiniaturaAtual() {
  clearTimeout(atualizarMiniaturaAtual.t);
  if (!armazem || !pecaAtual || !cena) return;
  const id = pecaAtual.id;
  try { await guardarMiniatura(id, await miniaturaDe(structuredClone(cena), baseAssets)); } catch { /* idem */ }
}
const agendarMiniatura = () => { clearTimeout(atualizarMiniaturaAtual.t); atualizarMiniaturaAtual.t = setTimeout(atualizarMiniaturaAtual, 4000); };

// De uma peça que não está aberta (a tela de Projetos pede as que faltam, uma de cada vez).
async function gerarMiniatura(peca) {
  const origem = peca.origem ? resolver(peca.origem) : null;
  let json = peca.cena;
  if (!json) {
    if (!origem) return null;
    const r = await fetch(origem);
    if (!r.ok) throw new Error(`cena ${origem.pathname} (${r.status})`);
    json = await r.json();
  }
  const m = await miniaturaDe(json, resolver(peca.base ?? peca.origem ?? location.href));
  await guardarMiniatura(peca.id, m);
  return m;
}

async function pixelsDe(c) {
  const el = await desenharFora(c);
  return el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
}

const blobDe = (el, tipo, qualidade) => new Promise((ok) => el.toBlob(ok, tipo, qualidade));

async function exportar(formato) {
  const nome = cena.nome ?? 'cena';
  const escala = Number($('#escala').value) || 1;
  const botao = $('#exportar');
  botao.disabled = true;
  try {
    let blob;
    let arquivo;
    if (formato === 'json') {
      blob = new Blob([JSON.stringify(cena, null, 2)], { type: 'application/json' });
      arquivo = `${nome}.json`;
    } else if (formato === 'psd') {
      aviso('Montando o PSD com uma camada por nó…');
      blob = await exportarPsd(cena, pixelsDe);
      arquivo = `${nome}.psd`;
    } else {
      const el = await desenharFora(cena, escala);
      const tipo = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg' }[formato];
      blob = await blobDe(el, tipo, formato === 'png' ? undefined : 0.92);
      arquivo = `${nome}${escala !== 1 ? `@${escala}x` : ''}.${formato}`;
    }
    const r = await salvar(arquivo, blob);
    if (r === 'salvo' || r === 'baixado') aviso(`${arquivo} pronto${formato === 'psd' && r === 'salvo' ? ' (dentro de um .zip)' : ''}`);
  } catch (e) {
    aviso(`Não deu para exportar: ${e.message}`, true);
  } finally {
    botao.disabled = false;
  }
}

async function abrirArquivo(arquivo) {
  try {
    let json = null;
    if (/\.json$/i.test(arquivo.name)) {
      json = JSON.parse(await lerArquivo(arquivo, 'texto'));
    } else if (/\.(psd|psb)$/i.test(arquivo.name)) {
      aviso('Abrindo o PSD…');
      json = await abrirPsd(await lerArquivo(arquivo, 'buffer'), arquivo.name);
    } else if (/^image\//.test(arquivo.type)) {
      await novaImagem(arquivo);
      return;
    } else {
      aviso('Abro cena (.json), PSD ou imagem', true);
      return;
    }
    // Cena ou PSD do computador vira uma peça nova em "Peças avulsas".
    if (!armazem) {
      urlCena = new URL(`arquivo:${encodeURIComponent(arquivo.name)}`);
      desenharAbas();
      await abrir(json, baseAssets);
    } else {
      await tirarImagensDaCena(json);
      const peca = await armazem.criarPeca({
        projeto: (await projetoAvulsas()).id, nome: arquivo.name.replace(/\.[^.]+$/, ''), cena: json, base: paraRelativo(baseAssets.href),
      });
      await abrirPeca(peca);
      projetos?.atualizar();
    }
    if (/\.(psd|psb)$/i.test(arquivo.name)) aviso(`${cena.nos.length} camadas abertas do PSD`);
  } catch (e) {
    aviso(`Não abriu ${arquivo.name}: ${e.message}`, true);
  }
}

// ---------- atalhos ----------

function digitando(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function ligarAtalhos() {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { if (!digitando(e)) { e.preventDefault(); desfazer(); } return; }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { if (!digitando(e)) { e.preventDefault(); refazer(); } return; }
    if (mod && k === 's') { e.preventDefault(); exportar('json'); return; }
    if (mod && k === '0') { e.preventDefault(); ajustarZoom(); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); aplicarZoom(zoom * 1.25); return; }
    if (mod && k === '-') { e.preventDefault(); aplicarZoom(zoom / 1.25); return; }
    if (digitando(e)) return;
    const no = selecionado && acharNo(selecionado);
    if (mod && k === 'd') { e.preventDefault(); duplicar(); return; }
    if (mod && k === 'j') { e.preventDefault(); duplicar(); return; }
    if (k === 'escape') { selecionarPorId(null); return; }
    if (k === "'" || k === ';') { guiasLigadas = !guiasLigadas; atualizarBotaoGuias(); return; }
    if (!no) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); excluir(); return; }
    if (mod && k === ']') { e.preventDefault(); mudarOrdem(no, e.shiftKey ? Infinity : 1); return; }
    if (mod && k === '[') { e.preventDefault(); mudarOrdem(no, e.shiftKey ? -Infinity : -1); return; }
    const passo = e.shiftKey ? 10 : 1;
    const setas = { arrowleft: [-passo, 0], arrowright: [passo, 0], arrowup: [0, -passo], arrowdown: [0, passo] };
    if (setas[k] && no.caixa && !no.bloqueado) {
      e.preventDefault();
      deslocar(no, ...setas[k]);
      registrarDepois(`Mover ${no.id}`);
    }
  });
}

function atualizarBotaoGuias() {
  const b = $('#guias');
  b.setAttribute('aria-pressed', String(guiasLigadas));
  b.textContent = guiasLigadas ? 'Guias: ligadas' : 'Guias: desligadas';
}

// ---------- abas ----------

// Cenas com `grupo` (um bicho, uma marca) ganham um seletor de grupo antes das abas;
// só as abas do grupo escolhido aparecem. window.GRUPOS_CENAS dá o nome de cada grupo.
const grupoDe = (c) => c.grupo ?? '';
const NOMES_GRUPO = window.GRUPOS_CENAS ?? {};

async function abrirAba(c) {
  guardar('mesa:aba', c.url);
  if (armazem) {
    await abrirPeca(await pecaDaOrigem(c.url, c.rotulo ?? c.nome));
    return;
  }
  urlCena = new URL(c.url, location.href);
  desenharAbas();
  const resposta = await fetch(urlCena);
  await abrir(await resposta.json(), urlCena, { rascunhoAntigo: true });
}

function desenharAbas() {
  const nav = $('#abas');
  if (!CENAS?.length) { nav.hidden = true; return; }
  nav.hidden = false;
  // a aba fica marcada só para a peça que veio com ela (uma cópia da mesma cena não marca)
  const atual = CENAS.find((c) => (pecaAtual ? pecaAtual.ordem != null && c.url === pecaAtual.origem : new URL(c.url, location.href).href === urlCena.href));
  const grupos = [...new Set(CENAS.map(grupoDe))];
  const grupo = atual ? grupoDe(atual) : grupos[0];
  const seletor = grupos.length > 1
    ? `<select id="abas-grupo" aria-label="Grupo de peças">${grupos.map((g) => `<option value="${esc(g)}"${g === grupo ? ' selected' : ''}>${esc(NOMES_GRUPO[g] ?? (g || 'Peças'))}</option>`).join('')}</select>`
    : '';
  nav.innerHTML = seletor + CENAS.map((c, i) => (grupoDe(c) === grupo
    ? `<button type="button" role="tab" data-i="${i}" aria-selected="${c === atual}">${esc(c.rotulo ?? c.nome)}</button>` : '')).join('');
  nav.querySelectorAll('button').forEach((b) => {
    b.onclick = async () => {
      await abrirAba(CENAS[Number(b.dataset.i)]);
      nav.querySelector(`button[data-i="${b.dataset.i}"]`)?.focus();
    };
  });
  const sel = $('#abas-grupo');
  if (sel) {
    sel.onchange = async () => {
      // troca de grupo: abre a mesma peça no outro grupo, quando existe, senão a primeira dele
      const mesma = CENAS.find((c) => grupoDe(c) === sel.value && atual && c.rotulo === atual.rotulo);
      await abrirAba(mesma ?? CENAS.find((c) => grupoDe(c) === sel.value));
      $('#abas-grupo')?.focus();
    };
  }
}

// ---------- início ----------

async function iniciar() {
  const preferida = CENAS?.length ? (CENAS.find((c) => c.url === ler('mesa:aba')) ?? CENAS[0]).url : null;
  const pedida = params.get('cena') ?? preferida ?? window.CENA_PADRAO;
  urlCena = new URL(pedida, location.href);
  baseAssets = urlCena;

  canvas = new fabric.Canvas($('#tela'), { preserveObjectStacking: true, selection: false, enableRetinaScaling: true });
  canvas.on('before:transform', (e) => { e.transform.target._caixaAntes = e.transform.target.getBoundingRect(); });
  canvas.on('object:modified', aoModificar);
  canvas.on('object:moving', aoMover);
  canvas.on('object:scaling', acompanharCopias);
  canvas.on('object:rotating', acompanharCopias);
  canvas.on('after:render', desenharGuias);
  canvas.on('mouse:up', () => { if (guias.length) { guias = []; limparGuias(); } });
  // O redesenho volta a selecionar a mesma camada; refazer o painel nessa hora tiraria o
  // cursor do campo em que a pessoa está digitando.
  const aoSelecionar = (e) => { const id = e.selected?.[0]?.idNo; if (id && id !== selecionado) selecionarPorId(id, false); };
  canvas.on('selection:created', aoSelecionar);
  canvas.on('selection:updated', aoSelecionar);
  canvas.on('selection:cleared', () => { if (!redesenhando && selecionado) { selecionado = null; desenharCamadas(); mostrarPropriedades(); } });
  window.addEventListener('resize', () => canvas.requestRenderAll());

  $('#camada-mistura').innerHTML = Object.entries(NOMES_MISTURA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#camada-mistura').onchange = (e) => {
    const no = acharNo(selecionado);
    if (!no) return;
    if (e.target.value === 'normal') delete no.mistura; else no.mistura = e.target.value;
    registrar(`Mistura ${NOMES_MISTURA[e.target.value]} em ${no.id}`);
    agendarRedesenho();
  };
  $('#camada-opacidade').oninput = (e) => {
    const no = acharNo(selecionado);
    if (!no) return;
    no.opacidade = Math.min(1, Math.max(0, Number(e.target.value) / 100));
    agendarRedesenho();
    registrarDepois(`Opacidade de ${no.id}`);
  };
  $('#novo-texto').onclick = () => inserirNo(NOVOS.texto(), 'Novo texto');
  $('#novo-retangulo').onclick = () => inserirNo(NOVOS.retangulo(), 'Novo retângulo');
  $('#novo-gradiente').onclick = () => inserirNo(NOVOS.gradiente(), 'Novo gradiente');
  $('#nova-imagem').onchange = (e) => { if (e.target.files[0]) novaImagem(e.target.files[0]); e.target.value = ''; };
  $('#comp-salvar').onclick = () => salvarComposicao(nosParaComposicao(), '');
  $('#comp-agrupar').onclick = () => {
    const nos = nosParaComposicao();
    if (nos.length < 2) { aviso('Escolha 2 ou mais camadas (Ctrl ou Shift + clique na lista)', true); return; }
    const id = idNovoSecao('secao');
    nos.forEach((n) => { n.secao = id; });
    registrar(`Agrupar em seção ${id}`);
    agendarRedesenho();
    mostrarPropriedades();
  };
  $('#comp-importar').onchange = (e) => { importarComposicoes([...e.target.files]); e.target.value = ''; };
  $('#duplicar').onclick = duplicar;
  $('#excluir').onclick = excluir;
  $('#desfazer').onclick = desfazer;
  $('#refazer').onclick = refazer;
  $('#zoom-menos').onclick = () => aplicarZoom(zoom / 1.25);
  $('#zoom-mais').onclick = () => aplicarZoom(zoom * 1.25);
  $('#zoom-ajustar').onclick = ajustarZoom;
  $('#zoom-100').onclick = () => aplicarZoom(1);
  $('#guias').onclick = () => { guiasLigadas = !guiasLigadas; atualizarBotaoGuias(); };
  $('#voltar-original').onclick = voltarAoOriginal;
  $('#abrir').onchange = async (ev) => { const a = ev.target.files[0]; ev.target.value = ''; if (a) await abrirArquivo(a); };
  $('#exportar').onclick = () => exportar($('#formato').value);
  const area = $('#area');
  area.addEventListener('dragover', (e) => {
    const tipos = e.dataTransfer?.types;
    if (tipos?.includes('Files') || tipos?.includes(TIPO_ARRASTO)) { e.preventDefault(); area.classList.add('soltar'); }
  });
  area.addEventListener('dragleave', () => area.classList.remove('soltar'));
  area.addEventListener('drop', async (e) => {
    area.classList.remove('soltar');
    const arrasto = e.dataTransfer?.getData(TIPO_ARRASTO);
    if (arrasto) {
      e.preventDefault();
      try {
        const item = JSON.parse(arrasto);
        const r = canvas.upperCanvasEl.getBoundingClientRect();
        await colocarDaBiblioteca(item, item.url, { trocar: false, centro: { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom } });
      } catch (erro) { aviso(`Não consegui colocar o item: ${erro.message}`, true); }
      return;
    }
    const arquivo = e.dataTransfer?.files?.[0];
    if (!arquivo) return;
    e.preventDefault();
    await abrirArquivo(arquivo);
  });
  ligarNavegacao();
  ligarAtalhos();
  iniciarInterface({ ler, guardar, aoMudar: () => { if (cena && zoomAjustado !== null && Math.abs(zoom - zoomAjustado) < 1e-6) ajustarZoom(); } });
  atualizarBotaoGuias();
  desenharAbas();
  const urlIndice = new URL(window.BIBLIOTECA ?? '../biblioteca/indice.json', location.href);
  // Favoritos e recentes: no Armazém quando há (valem em qualquer aparelho), senão neste navegador.
  const preferenciasBiblioteca = {
    async ler() {
      if (armazem) return (await armazem.lerPreferencia('biblioteca')) ?? {};
      try { return JSON.parse(ler('mesa:biblioteca') ?? '{}'); } catch { return {}; }
    },
    async gravar(p) {
      if (armazem) await armazem.gravarPreferencia('biblioteca', p);
      else guardar('mesa:biblioteca', JSON.stringify(p));
    },
  };
  const biblioteca = iniciarBiblioteca({ raiz: $('#biblioteca'), urlIndice, aoEscolher: colocarDaBiblioteca, preferencias: preferenciasBiblioteca });
  carregarPredefinidas(urlIndice);

  await ligarArmazem();
  biblioteca.then((b) => b?.recarregar());
  if (!armazem) {
    const resposta = await fetch(urlCena);
    if (!resposta.ok) throw new Error(`não achei a cena ${urlCena.pathname} (${resposta.status})`);
    await abrir(await resposta.json(), urlCena, { rascunhoAntigo: true });
    return;
  }
  // a peça da última visita, ou a pedida no endereço (?cena=), ou a primeira aba
  const ultima = !params.get('cena') && ler('mesa:peca') ? await armazem.lerPeca(ler('mesa:peca')) : null;
  await abrirPeca(ultima && !ultima.arquivado ? ultima : await pecaDaOrigem(pedida));
}

// Abre o Armazém (Mesa online: banco dela + cópia no navegador; local: só o navegador) e, na primeira
// vez, transforma as cenas que vêm com a página em projetos e peças, trazendo rascunhos e composições antigos.
async function ligarArmazem() {
  const r = await abrirArmazem({
    aoFalhar: (e, colecao) => aviso(`O banco da Mesa online recusou ${colecao === 'pecas' ? 'a peça' : colecao} (${e.code}): ficou guardada só neste navegador.`, true),
  });
  armazem = r.armazem;
  onde = r.onde;
  if (!armazem) { marcarSalvo('local'); await carregarComposicoes(); return; }
  const cenas = CENAS?.length ? CENAS : [{ url: params.get('cena') ?? window.CENA_PADRAO }];
  try {
    const novos = await armazem.semear(cenas.map((c) => ({ ...c, nome: c.nome ?? c.url.split('/').slice(-2, -1)[0], origem: c.url })), {
      nomesGrupo: NOMES_GRUPO,
      rascunhoDe: (origem) => { try { return JSON.parse(ler(chaveRascunhoAntigo(resolver(origem).href)) ?? 'null'); } catch { return null; } },
      composicoesAntigas: composicoesAntigas(),
    });
    if (novos.rascunhos || novos.composicoes) aviso(`Trouxe para o Armazém ${novos.rascunhos} rascunho(s) e ${novos.composicoes} composição(ões) deste navegador`);
  } catch (e) {
    aviso(`Não consegui preparar os projetos: ${e.message}`, true);
  }
  await carregarComposicoes();
  projetos = iniciarProjetos({
    armazem, onde, aviso, esc,
    abrirPeca: async (p) => { try { await abrirPeca(p); } catch (e) { aviso(e.message, true); } },
    pecaAtual: () => pecaAtual,
    cenaAtual: () => cena,
    descarregar,
    atualizarMiniatura: atualizarMiniaturaAtual,
    gerarMiniatura,
  });
  iniciarModelos({
    paraRelativo, armazem, aviso, esc,
    cenaAtual: () => cena,
    baseAtual: () => baseAssets,
    pecaAtual: () => pecaAtual,
    miniaturaDe,
    descarregar,
    abrirPeca: async (p) => { await abrirPeca(p); },
    projetoPadrao: projetoAvulsas,
    aoCriarPeca: () => projetos?.atualizar(),
  });
  const marca = iniciarMarca({
    armazem, aviso, esc,
    cenaAtual: () => cena,
    baseAtual: () => baseAssets,
    aplicarCor: aplicarCorDaMarca,
    aplicarFonte: aplicarFonteDaMarca,
    colocarLogo: colocarLogoDaMarca,
  });
  $('#trilho-modelos').hidden = false;
  $('#trilho-marca').hidden = false;
  semearMarcas(cenas).then(() => marca.atualizar()); // em segundo plano: não segura a abertura da peça
}

// Aplicar o kit da marca à camada escolhida (as funções puras estão em marca.js).
function aplicarCorDaMarca(hex, { todas = false } = {}) {
  const no = selecionado ? acharNo(selecionado) : null;
  if (!no) { aviso('Escolha antes uma camada de texto ou um retângulo', true); return; }
  const rotulo = aplicarCorNo(no, hex, { todas });
  if (!rotulo) { aviso('Esta camada não tem uma cor para trocar', true); return; }
  registrar(rotulo);
  agendarRedesenho();
  mostrarPropriedades();
}

async function aplicarFonteDaMarca(f) {
  const no = selecionado ? acharNo(selecionado) : null;
  if (no?.tipo !== 'bloco_texto') { aviso('Escolha antes uma camada de texto', true); return; }
  try {
    cena.fontes = cena.fontes ?? [];
    const arquivo = f.arquivo ? caminhoRelativo(baseAssets.href, new URL(paraRelativo(f.arquivo), location.href).href) : null;
    if (arquivo && !cena.fontes.some((x) => x.familia === f.familia && (x.peso ?? 400) === f.peso)) cena.fontes.push({ familia: f.familia, peso: f.peso, arquivo });
    await carregarFontes(cena, baseAssets);
    no.fonte = { ...no.fonte, familia: f.familia, peso: f.peso };
    registrar(`Fonte ${f.familia} em ${no.id}`);
    await agendarRedesenho();
    mostrarPropriedades();
  } catch (e) { aviso(`Não apliquei a fonte: ${e.message}`, true); }
}

const colocarLogoDaMarca = (l) => colocarImagem(caminhoRelativo(baseAssets.href, new URL(paraRelativo(l.asset), location.href).href), l.nome, 'kit da marca').catch((e) => aviso(`Não consegui colocar o logo: ${e.message}`, true));

// Na primeira vez, cada grupo de peças ganha um kit tirado da sua primeira peça (editável depois).
async function semearMarcas(cenas) {
  if ((await armazem.listarMarcas()).length) return;
  const primeiras = new Map();
  for (const c of cenas) if (c.url && !primeiras.has(c.grupo ?? '')) primeiras.set(c.grupo ?? '', c);
  for (const [grupo, c] of primeiras) {
    try {
      const url = resolver(c.url);
      const r = await fetch(url);
      if (!r.ok) continue;
      await armazem.criarMarca(NOMES_GRUPO[grupo] ?? (grupo || 'Peças'), mapearEnderecos(extrairKit(await r.json(), url), paraRelativo));
    } catch { /* sem o kit desse grupo; dá para criar à mão */ }
  }
}

// Acesso para depuração e para testes automáticos.
window.mesa = { cena: () => cena, historico: () => historico, selecionar: (id) => selecionarPorId(id, true), exportar, desfazer, refazer };

iniciar().catch((e) => { $('#erros').textContent = e.stack ?? String(e); });
