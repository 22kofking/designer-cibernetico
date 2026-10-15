// Editor de cena no navegador. Usa o mesmo núcleo do renderizador sem tela,
// então o que você vê aqui é o que o agente vê e o que é exportado.
import * as fabric from 'fabric';
import { caixaEmFracoes, validarCena } from '../src/nucleo/cena.js';
import { criarMedidor, montarCena } from '../src/nucleo/render.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const urlCena = new URL(params.get('cena') ?? window.CENA_PADRAO, location.href);

let cena;
let baseAssets = urlCena;
let canvas;
let selecionado = null;
let redesenhando = false;
const cacheImagens = new Map();
const medidor = criarMedidor(document.createElement('canvas').getContext('2d'));

async function carregarFontes() {
  for (const f of cena.fontes ?? []) {
    const face = new FontFace(f.familia, `url(${new URL(f.arquivo, baseAssets)})`, { weight: String(f.peso ?? 400) });
    document.fonts.add(await face.load());
  }
}

function carregarImagem(asset) {
  const url = new URL(asset, baseAssets).href;
  if (!cacheImagens.has(url)) {
    cacheImagens.set(url, new Promise((ok, erro) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => ok(img);
      img.onerror = () => erro(new Error(`não carregou ${asset}`));
      img.src = url;
    }));
  }
  return cacheImagens.get(url).then((img) => new fabric.FabricImage(img));
}

function acharNo(id, nos = cena.nos) {
  for (const no of nos) {
    if (no.id === id) return no;
    if (no.filhos) {
      const achou = acharNo(id, no.filhos);
      if (achou) return achou;
    }
  }
  return null;
}

// Redesenha a cena inteira a partir do JSON (fonte da verdade).
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
  const objetos = await montarCena(fabric, canvas, cena, { medidor, carregarImagem });
  // As linhas de um bloco de texto viram um grupo só, para mover e escalar juntas.
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
    grupo.selectable = no.bloqueado !== true;
    grupo.evented = no.bloqueado !== true;
    canvas.insertAt(indice, grupo);
  }
  canvas.requestRenderAll();
  desenharCamadas();
  if (selecionado) selecionarPorId(selecionado, false);
}

// Depois de mover, escalar ou girar, grava a nova caixa no JSON.
function aoModificar(e) {
  const obj = e.target;
  if (redesenhando || !obj?.idNo) return;
  const no = acharNo(obj.idNo);
  if (!no) return;
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
    no.encaixe = 'conter';
    no.ancora = 'centro';
  }
  setTimeout(redesenhar, 0);
}

function desenharCamadas() {
  const lista = $('#camadas');
  lista.innerHTML = '';
  // de cima para baixo, como no Photoshop
  [...cena.nos].reverse().forEach((no) => {
    const li = document.createElement('li');
    li.className = no.id === selecionado ? 'ativo' : '';
    li.innerHTML = `
      <button class="olho" title="mostrar ou esconder">${no.visivel === false ? '○' : '●'}</button>
      <span class="nome">${no.id}</span>
      <span class="papel">${no.papel ?? no.tipo}</span>
      <button class="cadeado" title="travar ou destravar" aria-pressed="${no.bloqueado === true}">${no.bloqueado ? 'travada' : 'livre'}</button>`;
    li.querySelector('.nome').onclick = () => selecionarPorId(no.id, true);
    li.querySelector('.olho').onclick = () => { no.visivel = no.visivel === false; redesenhar(); };
    li.querySelector('.cadeado').onclick = () => { no.bloqueado = !no.bloqueado; redesenhar(); };
    lista.appendChild(li);
  });
}

function selecionarPorId(id, doPainel) {
  selecionado = id;
  const obj = canvas.getObjects().find((o) => o.idNo === id);
  if (obj && obj.selectable && doPainel) canvas.setActiveObject(obj);
  canvas.requestRenderAll();
  mostrarPropriedades();
  document.querySelectorAll('#camadas li').forEach((li) => {
    li.classList.toggle('ativo', li.querySelector('.nome').textContent === id);
  });
}

// Ordem de desenho: a última camada da cena fica por cima, como no Photoshop.
function mudarOrdem(no, passo) {
  const i = cena.nos.indexOf(no);
  const j = Math.min(Math.max(i + passo, 0), cena.nos.length - 1);
  if (i === j) return;
  cena.nos.splice(i, 1);
  cena.nos.splice(j, 0, no);
  redesenhar();
}

function botoesDeOrdem(no) {
  return `<div class="ordem">
    <button id="frente" type="button">Trazer para frente</button>
    <button id="tras" type="button">Enviar para trás</button>
  </div>`;
}

function ligarBotoesDeOrdem(no) {
  $('#frente').onclick = () => mudarOrdem(no, 1);
  $('#tras').onclick = () => mudarOrdem(no, -1);
}

function mostrarPropriedades() {
  const painel = $('#propriedades');
  const no = selecionado && acharNo(selecionado);
  if (!no) { painel.innerHTML = '<p class="dica">Clique numa camada ou no canvas.</p>'; return; }
  const origem = no.origem ? `<p class="dica">Origem: ${no.origem.fonte ?? ''} ${no.origem.como ? '· ' + no.origem.como : ''} · licença ${no.origem.licenca ?? '?'}</p>` : '';
  if (no.tipo !== 'bloco_texto') {
    painel.innerHTML = `<h3>${no.id}</h3>${origem}<p class="dica">Arraste, escale ou gire no canvas.</p>${botoesDeOrdem(no)}`;
    ligarBotoesDeOrdem(no);
    return;
  }
  const estilos = Object.keys(no.estilos ?? {});
  painel.innerHTML = `<h3>${no.id}</h3><p class="dica">Cada linha: texto, estilo e peso (a linha de peso 4 sai 4x maior). O encaixe é refeito sozinho.</p>
    <div id="linhas"></div>
    <button id="mais">+ linha</button>
    <label>Alinhamento <select id="alinhamento">${['esquerda', 'centro', 'direita'].map((a) => `<option ${no.alinhamento === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
    <label>Vão entre linhas <input id="vao" type="number" step="0.02" min="0" value="${no.vao ?? 0.28}"></label>
    ${botoesDeOrdem(no)}`;
    ligarBotoesDeOrdem(no);
  const div = $('#linhas');
  no.linhas.forEach((l, i) => {
    const linha = document.createElement('div');
    linha.className = 'linha';
    linha.innerHTML = `<input class="t" value="${l.texto.replace(/"/g, '&quot;')}">
      <select class="e">${estilos.map((e) => `<option ${l.estilo === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
      <input class="p" type="number" step="0.25" min="0.25" value="${l.peso ?? 1}">
      <button class="x" title="remover">×</button>`;
    linha.querySelector('.t').oninput = (ev) => { l.texto = ev.target.value; redesenhar(); };
    linha.querySelector('.e').onchange = (ev) => { l.estilo = ev.target.value; redesenhar(); };
    linha.querySelector('.p').oninput = (ev) => { l.peso = Number(ev.target.value) || 1; redesenhar(); };
    linha.querySelector('.x').onclick = () => { no.linhas.splice(i, 1); mostrarPropriedades(); redesenhar(); };
    div.appendChild(linha);
  });
  $('#mais').onclick = () => { no.linhas.push({ texto: 'Nova linha', estilo: estilos[0], peso: 1 }); mostrarPropriedades(); redesenhar(); };
  $('#alinhamento').onchange = (ev) => { no.alinhamento = ev.target.value; redesenhar(); };
  $('#vao').oninput = (ev) => { no.vao = Number(ev.target.value); redesenhar(); };
}

function ajustarZoom() {
  const area = $('#area');
  const z = Math.min(1, (area.clientWidth - 2) / cena.formato.largura);
  canvas.setZoom(z);
  canvas.setDimensions({ width: cena.formato.largura * z, height: cena.formato.altura * z });
}

function baixar(nome, url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
}

async function abrir(json, base) {
  cena = json;
  baseAssets = base;
  selecionado = null;
  $('#titulo').textContent = cena.nome ?? 'cena';
  await carregarFontes();
  ajustarZoom();
  await redesenhar();
  mostrarPropriedades();
}

async function iniciar() {
  canvas = new fabric.Canvas($('#tela'), { preserveObjectStacking: true, selection: false });
  canvas.on('before:transform', (e) => { e.transform.target._caixaAntes = e.transform.target.getBoundingRect(); });
  canvas.on('object:modified', aoModificar);
  canvas.on('selection:created', (e) => selecionarPorId(e.selected[0].idNo, false));
  canvas.on('selection:updated', (e) => selecionarPorId(e.selected[0].idNo, false));
  window.addEventListener('resize', () => { ajustarZoom(); canvas.requestRenderAll(); });

  $('#baixar-json').onclick = () => {
    const blob = new Blob([JSON.stringify(cena, null, 2)], { type: 'application/json' });
    baixar(`${cena.nome ?? 'cena'}.json`, URL.createObjectURL(blob));
  };
  $('#baixar-png').onclick = () => {
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    baixar(`${cena.nome ?? 'cena'}.png`, canvas.toDataURL({ format: 'png', multiplier: 1 / canvas.getZoom() }));
  };
  $('#abrir').onchange = async (ev) => {
    const arquivo = ev.target.files[0];
    if (arquivo) await abrir(JSON.parse(await arquivo.text()), baseAssets);
  };

  const resposta = await fetch(urlCena);
  await abrir(await resposta.json(), urlCena);
}

// Acesso para depuração e para testes automáticos.
window.mesa = { cena: () => cena };

iniciar().catch((e) => { $('#erros').textContent = e.stack ?? String(e); });
