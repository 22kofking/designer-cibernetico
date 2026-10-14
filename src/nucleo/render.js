// Desenha uma cena num canvas do Fabric.js. O mesmo código roda no
// renderizador sem tela (fabric/node) e no editor do navegador (fabric do
// CDN): quem chama passa o namespace do Fabric, o canvas e o medidor.
import { caixaEmPixels, encaixar } from './cena.js';
import { encaixarTexto } from './texto.js';
import { distribuirGrupo } from './grupo.js';

// Medidor de texto sobre qualquer contexto 2D (node-canvas ou navegador).
export function criarMedidor(ctx) {
  const cssFonte = (fonte, tamanho) => `${fonte.peso ?? 400} ${tamanho}px "${fonte.familia}"`;
  const cache = new Map();
  return {
    largura(texto, fonte, tamanho, espacamentoEm = 0) {
      ctx.font = cssFonte(fonte, tamanho);
      return ctx.measureText(texto).width + espacamentoEm * tamanho * texto.length;
    },
    metricas(fonte) {
      const chave = `${fonte.familia}/${fonte.peso}`;
      if (!cache.has(chave)) {
        ctx.font = cssFonte(fonte, 100);
        cache.set(chave, { altCaixaAlta: ctx.measureText('H').actualBoundingBoxAscent / 100 });
      }
      return cache.get(chave);
    },
  };
}

// Onde fica a linha de base dentro de um objeto de texto do Fabric, em
// frações do corpo. Medido desenhando um "H", para não depender de detalhes
// internos do Fabric que mudam entre versões.
const calibracoes = new Map();
function linhaDeBase(fabric, fonte) {
  const chave = `${fonte.familia}/${fonte.peso}`;
  if (calibracoes.has(chave)) return calibracoes.get(chave);
  const tamanho = 100;
  const tela = new fabric.StaticCanvas(null, { width: 200, height: 200, enableRetinaScaling: false });
  tela.add(new fabric.FabricText('H', {
    left: 0, top: 0, originX: 'left', originY: 'top', fontSize: tamanho, fontFamily: fonte.familia, fontWeight: fonte.peso, fill: '#000',
  }));
  tela.renderAll();
  const dados = tela.getElement().getContext('2d').getImageData(0, 0, 200, 200).data;
  let base = 0;
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      if (dados[(y * 200 + x) * 4 + 3] > 128) { base = y + 1; break; }
    }
  }
  tela.dispose();
  const r = base / tamanho;
  calibracoes.set(chave, r);
  return r;
}

function corComOpacidade(cor, opacidade = 1) {
  if (opacidade >= 1) return cor;
  const h = cor.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${opacidade})`;
}

function aplicarComum(obj, no) {
  obj.set({
    angle: no.rotacao ?? 0,
    opacity: no.opacidade ?? 1,
    visible: no.visivel !== false,
    selectable: no.bloqueado !== true,
    evented: no.bloqueado !== true,
    flipX: no.espelhar === true,
  });
  obj.idNo = no.id;
  obj.papel = no.papel;
  return obj;
}

async function objetoImagem(fabric, no, caixa, carregarImagem) {
  const img = await carregarImagem(no.asset);
  const pos = encaixar(img.width, img.height, caixa, no.encaixe ?? 'conter', no.ancora ?? 'centro');
  img.set({ left: pos.x, top: pos.y, scaleX: pos.escalaX, scaleY: pos.escalaY, originX: 'left', originY: 'top' });
  if (no.rotacao) {
    // gira em volta do centro, como no editor
    const c = img.getCenterPoint();
    img.set({ originX: 'center', originY: 'center', left: c.x, top: c.y });
  }
  return [aplicarComum(img, no)];
}

function objetoGradiente(fabric, no, caixa) {
  const horizontal = (no.direcao ?? 'horizontal') === 'horizontal';
  const rect = new fabric.Rect({
    left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h, strokeWidth: 0, originX: 'left', originY: 'top',
  });
  rect.set('fill', new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: horizontal ? { x1: 0, y1: 0, x2: caixa.w, y2: 0 } : { x1: 0, y1: 0, x2: 0, y2: caixa.h },
    colorStops: no.paradas.map(([offset, cor, opacidade]) => ({ offset, color: corComOpacidade(cor, opacidade ?? 1) })),
  }));
  return [aplicarComum(rect, no)];
}

function objetoRetangulo(fabric, no, caixa) {
  const rect = new fabric.Rect({
    left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h, originX: 'left', originY: 'top',
    fill: corComOpacidade(no.cor ?? '#000000', no.opacidade_cor ?? 1), rx: no.raio ?? 0, ry: no.raio ?? 0, strokeWidth: 0,
  });
  return [aplicarComum(rect, no)];
}

function objetosTexto(fabric, no, caixa, medidor, formato) {
  const linhas = encaixarTexto(no, caixa, medidor, formato);
  const base = linhaDeBase(fabric, no.fonte);
  const { altCaixaAlta } = medidor.metricas(no.fonte);
  return linhas.map((l, i) => {
    const estilo = no.estilos?.[l.estilo] ?? {};
    const topoObjeto = l.base - base * l.tamanho;
    const t = new fabric.FabricText(l.texto, {
      left: l.x,
      top: topoObjeto,
      fontSize: l.tamanho,
      fontFamily: no.fonte.familia,
      fontWeight: no.fonte.peso,
      charSpacing: (no.espacamento ?? 0) * 1000,
      fill: estilo.cor ?? '#ffffff',
      originX: 'left',
      originY: 'top',
    });
    if (estilo.rampa) {
      // degradê vertical do topo da maiúscula até a linha de base
      const y1 = (base - altCaixaAlta) * l.tamanho;
      const y2 = base * l.tamanho;
      t.set('fill', new fabric.Gradient({
        type: 'linear',
        gradientUnits: 'pixels',
        coords: { x1: 0, y1, x2: 0, y2 },
        colorStops: estilo.rampa.map(([offset, color]) => ({ offset, color })),
      }));
    }
    const sombra = no.sombra;
    if (sombra && sombra.opacidade > 0) {
      t.set('shadow', new fabric.Shadow({
        color: corComOpacidade(sombra.cor ?? '#000000', sombra.opacidade),
        blur: (sombra.desfoque ?? 0) * l.tamanho,
        offsetX: (sombra.desvio?.[0] ?? 0) * l.tamanho,
        offsetY: (sombra.desvio?.[1] ?? 0) * l.tamanho,
      }));
    }
    aplicarComum(t, no);
    t.idNo = no.id;
    t.indiceLinha = i;
    return t;
  });
}

// Monta todos os nós da cena no canvas, de baixo para cima.
//   opcoes.medidor        criarMedidor(ctx)
//   opcoes.carregarImagem (caminho do asset) -> Promise<fabric.FabricImage>
export async function montarCena(fabric, canvas, cena, { medidor, carregarImagem }) {
  const formato = cena.formato;
  canvas.backgroundColor = formato.fundo ?? '#000000';
  const objetos = [];
  async function montar(no) {
    const caixa = no.caixaPx ?? caixaEmPixels(no.caixa, formato);
    let objs = [];
    if (no.tipo === 'imagem') objs = await objetoImagem(fabric, no, caixa, carregarImagem);
    else if (no.tipo === 'gradiente') objs = objetoGradiente(fabric, no, caixa);
    else if (no.tipo === 'retangulo') objs = objetoRetangulo(fabric, no, caixa);
    else if (no.tipo === 'bloco_texto') objs = objetosTexto(fabric, no, caixa, medidor, formato);
    else if (no.tipo === 'grupo') {
      for (const filho of distribuirGrupo(no, caixa, formato)) await montar(filho);
      return;
    }
    for (const o of objs) { canvas.add(o); objetos.push(o); }
  }
  for (const no of cena.nos) await montar(no);
  canvas.renderAll();
  return objetos;
}
