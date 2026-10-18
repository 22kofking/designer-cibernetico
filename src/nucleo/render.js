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

// Modos de mistura da camada, com os nomes do Photoshop/PhotoCraft em português.
export const MISTURAS = {
  normal: 'source-over',
  multiplicar: 'multiply',
  tela: 'screen',
  sobrepor: 'overlay',
  escurecer: 'darken',
  clarear: 'lighten',
  subexpor_cor: 'color-burn',
  superexpor_cor: 'color-dodge',
  luz_direta: 'hard-light',
  luz_suave: 'soft-light',
  diferenca: 'difference',
  exclusao: 'exclusion',
  matiz: 'hue',
  saturacao: 'saturation',
  cor: 'color',
  luminosidade: 'luminosity',
};

function aplicarComum(obj, no) {
  obj.set({
    angle: no.rotacao ?? 0,
    opacity: no.opacidade ?? 1,
    visible: no.visivel !== false,
    selectable: no.bloqueado !== true,
    evented: no.bloqueado !== true,
    flipX: no.espelhar === true,
    flipY: no.espelhar_v === true,
    globalCompositeOperation: MISTURAS[no.mistura] ?? 'source-over',
  });
  obj.idNo = no.id;
  obj.papel = no.papel;
  return obj;
}

// Estilos de camada (efeitos), em pixels do formato:
//   efeitos.sombra   { cor, opacidade, desfoque, dx, dy }
//   efeitos.brilho   { cor, opacidade, tamanho }       brilho externo
//   efeitos.contorno { cor, largura }                  só texto e retângulo
//   efeitos.relevo   { cor, profundidade, angulo }     só texto (ver aplicarRelevo)
// O Fabric tem uma sombra por objeto: o brilho vira uma cópia logo atrás,
// marcada com efeitoDe para o editor não a tratar como camada.
function sombraFabric(fabric, s, desfoque, dx = 0, dy = 0) {
  return new fabric.Shadow({ color: corComOpacidade(s.cor ?? '#000000', s.opacidade ?? 0.6), blur: desfoque, offsetX: dx, offsetY: dy });
}

function aplicarEfeitos(fabric, objs, no, copiar) {
  const ef = no.efeitos ?? {};
  const saida = [];
  const inicioDoRelevo = new Map();
  for (const obj of objs) {
    if (obj.efeitoDe) {
      if (obj.relevoDe && !inicioDoRelevo.has(obj.relevoDe)) inicioDoRelevo.set(obj.relevoDe, saida.length);
      saida.push(obj);
      continue;
    }
    if (ef.brilho && (ef.brilho.opacidade ?? 1) > 0 && copiar) {
      const atras = copiar(obj);
      atras.set({ shadow: sombraFabric(fabric, { cor: '#ffffff', opacidade: 0.8, ...ef.brilho }, ef.brilho.tamanho ?? 20), selectable: false, evented: false });
      atras.idNo = obj.idNo;
      atras.efeitoDe = no.id;
      if (obj.indiceLinha !== undefined) atras.indiceLinha = obj.indiceLinha;
      // o brilho fica atrás de tudo, inclusive do relevo
      saida.splice(inicioDoRelevo.get(obj) ?? saida.length, 0, atras);
    }
    if (ef.sombra && (ef.sombra.opacidade ?? 0.6) > 0) {
      obj.set('shadow', sombraFabric(fabric, ef.sombra, ef.sombra.desfoque ?? 10, ef.sombra.dx ?? 0, ef.sombra.dy ?? 0));
    }
    if (ef.contorno && (ef.contorno.largura ?? 0) > 0 && (no.tipo === 'bloco_texto' || no.tipo === 'retangulo')) {
      obj.set({ stroke: ef.contorno.cor ?? '#000000', strokeWidth: ef.contorno.largura, paintFirst: 'stroke', strokeLineJoin: 'round', strokeUniform: true });
    }
    saida.push(obj);
  }
  return saida;
}

// Ajustes de imagem (como as camadas de ajuste, mas no próprio nó):
//   ajustes { brilho -1..1, contraste -1..1, saturacao -1..1, matiz -180..180 (graus), tom {cor, intensidade 0..1}, desfoque 0..1 }
// Máscara de camada: PNG com alfa (o branco com alfa 0..1 é o quanto aparece), esticado sobre a imagem da camada.
function filtroMascara(fabric, mascara) {
  mascara.set({ left: 0, top: 0, scaleX: 1, scaleY: 1 });
  return new fabric.filters.BlendImage({ image: mascara, mode: 'multiply' });
}

function aplicarAjustes(fabric, img, ajustes, mascara) {
  if (!ajustes && !mascara) return;
  const f = [];
  if (!ajustes) ajustes = {};
  // linear: saída = ganho * entrada + desloc (0..1), a base dos níveis; um número vale para os três canais,
  // uma lista [R, G, B] faz balanço de cor
  if (ajustes.linear) {
    const por = (v, def) => (Array.isArray(v) ? v : [v ?? def, v ?? def, v ?? def]);
    const [gr, gg, gb] = por(ajustes.linear.ganho, 1);
    const [dr, dg, db] = por(ajustes.linear.desloc, 0);
    f.push(new fabric.filters.ColorMatrix({ matrix: [gr, 0, 0, 0, dr, 0, gg, 0, 0, dg, 0, 0, gb, 0, db, 0, 0, 0, 1, 0], colorsOnly: true }));
  }
  if (ajustes.brilho) f.push(new fabric.filters.Brightness({ brightness: ajustes.brilho }));
  if (ajustes.contraste) f.push(new fabric.filters.Contrast({ contrast: ajustes.contraste }));
  if (ajustes.saturacao) f.push(new fabric.filters.Saturation({ saturation: ajustes.saturacao }));
  if (ajustes.matiz) f.push(new fabric.filters.HueRotation({ rotation: ajustes.matiz / 180 }));
  if (ajustes.tom) f.push(new fabric.filters.BlendColor({ color: ajustes.tom.cor, mode: 'tint', alpha: ajustes.tom.intensidade ?? 0.5 }));
  if (ajustes.desfoque) f.push(new fabric.filters.Blur({ blur: ajustes.desfoque }));
  if (mascara) f.push(filtroMascara(fabric, mascara));
  if (!f.length) return;
  img.filters = f;
  img.applyFilters();
}

async function objetoImagem(fabric, no, caixa, carregarImagem) {
  const img = await carregarImagem(no.asset);
  const mascara = no.mascara ? await carregarImagem(no.mascara) : null;
  aplicarAjustes(fabric, img, no.ajustes, mascara);
  const pos = encaixar(img.width, img.height, caixa, no.encaixe ?? 'conter', no.ancora ?? 'centro');
  img.set({ left: pos.x, top: pos.y, scaleX: pos.escalaX, scaleY: pos.escalaY, originX: 'left', originY: 'top' });
  if (no.rotacao) {
    // gira em volta do centro, como no editor
    const c = img.getCenterPoint();
    img.set({ originX: 'center', originY: 'center', left: c.x, top: c.y });
  }
  aplicarComum(img, no);
  return aplicarEfeitos(fabric, [img], no, (o) => {
    const copia = new fabric.FabricImage(o.getElement(), { filters: o.filters });
    copia.set({ left: o.left, top: o.top, scaleX: o.scaleX, scaleY: o.scaleY, originX: o.originX, originY: o.originY, angle: o.angle, flipX: o.flipX, flipY: o.flipY, opacity: o.opacity, visible: o.visible });
    if (o.filters?.length) copia.applyFilters();
    return copia;
  });
}

// Cópia de um retângulo (chapado ou degradê) para o brilho externo.
const copiarRetangulo = (fabric) => (o) => new fabric.Rect({
  left: o.left, top: o.top, width: o.width, height: o.height, originX: o.originX, originY: o.originY, fill: o.fill,
  rx: o.rx, ry: o.ry, angle: o.angle, opacity: o.opacity, visible: o.visible, flipX: o.flipX, flipY: o.flipY, strokeWidth: 0,
});

function objetoGradiente(fabric, no, caixa) {
  const direcao = no.direcao ?? 'horizontal';
  const horizontal = direcao === 'horizontal';
  const rect = new fabric.Rect({
    left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h, strokeWidth: 0, originX: 'left', originY: 'top',
  });
  // radial: elipse que acompanha a caixa (vinheta); offset 0 é o centro, 1 é o canto
  const radial = direcao === 'radial';
  rect.set('fill', new fabric.Gradient({
    type: radial ? 'radial' : 'linear',
    gradientUnits: 'pixels',
    ...(radial ? { gradientTransform: [1, 0, 0, caixa.h / caixa.w, 0, 0] } : {}),
    coords: radial ? { x1: caixa.w / 2, y1: caixa.w / 2, r1: 0, x2: caixa.w / 2, y2: caixa.w / 2, r2: caixa.w * Math.SQRT1_2 } : horizontal ? { x1: 0, y1: 0, x2: caixa.w, y2: 0 } : { x1: 0, y1: 0, x2: 0, y2: caixa.h },
    colorStops: no.paradas.map(([offset, cor, opacidade]) => ({ offset, color: corComOpacidade(cor, opacidade ?? 1) })),
  }));
  return aplicarEfeitos(fabric, [aplicarComum(rect, no)], no, copiarRetangulo(fabric));
}

function objetoRetangulo(fabric, no, caixa) {
  const rect = new fabric.Rect({
    left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h, originX: 'left', originY: 'top',
    fill: corComOpacidade(no.cor ?? '#000000', no.opacidade_cor ?? 1), rx: no.raio ?? 0, ry: no.raio ?? 0, strokeWidth: 0,
  });
  return aplicarEfeitos(fabric, [aplicarComum(rect, no)], no, copiarRetangulo(fabric));
}

function objetosTexto(fabric, no, caixa, medidor, formato) {
  const linhas = encaixarTexto(no, caixa, medidor, formato);
  const base = linhaDeBase(fabric, no.fonte);
  const { altCaixaAlta } = medidor.metricas(no.fonte);
  const objs = [];
  linhas.forEach((l, i) => {
    const pedacos = l.trechos ?? [{ texto: l.texto, estilo: l.estilo, dx: 0, escala: 1 }];
    for (const p of pedacos) {
      if (!p.texto) continue;
      const estilo = no.estilos?.[p.estilo ?? l.estilo] ?? {};
      const tamanho = l.tamanho * (p.escala ?? 1);
      const t = new fabric.FabricText(p.texto, {
        left: l.x + p.dx,
        top: l.base - base * tamanho,
        fontSize: tamanho,
        fontFamily: no.fonte.familia,
        fontWeight: no.fonte.peso,
        charSpacing: (l.espacamento ?? 0) * 1000,
        fill: estilo.cor ?? '#ffffff',
        originX: 'left',
        originY: 'top',
      });
      if (estilo.rampa) {
        // degradê vertical do topo da maiúscula até a linha de base
        const y1 = (base - altCaixaAlta) * tamanho;
        const y2 = base * tamanho;
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
          blur: (sombra.desfoque ?? 0) * tamanho,
          offsetX: (sombra.desvio?.[0] ?? 0) * tamanho,
          offsetY: (sombra.desvio?.[1] ?? 0) * tamanho,
        }));
      }
      aplicarComum(t, no);
      t.idNo = no.id;
      t.indiceLinha = i;
      t.corRelevo = estilo.relevo;
      objs.push(t);
    }
  });
  const copiarTexto = (o) => new fabric.FabricText(o.text, {
    left: o.left, top: o.top, fontSize: o.fontSize, fontFamily: o.fontFamily, fontWeight: o.fontWeight, charSpacing: o.charSpacing,
    fill: o.fill, originX: 'left', originY: 'top', angle: o.angle, opacity: o.opacity, visible: o.visible, flipX: o.flipX, flipY: o.flipY,
  });
  return aplicarEfeitos(fabric, aplicarRelevo(objs, no, copiarTexto), no, copiarTexto);
}

// Relevo 3D (extrusão) do texto, como o "bisel" dos banners: cópias da letra
// empilhadas na direção do ângulo, na cor do relevo, atrás da letra.
//   efeitos.relevo { cor, profundidade (fração do corpo), angulo (graus, 90 = para baixo) }
// Cada estilo pode trocar a cor (estilos.dourado.relevo = '#7a3d00').
// A sombra da letra passa para a cópia mais funda, para cair atrás do relevo.
function aplicarRelevo(objs, no, copiar) {
  const r = no.efeitos?.relevo;
  if (!r || !(r.profundidade > 0)) return objs;
  const saida = [];
  const ang = ((r.angulo ?? 90) * Math.PI) / 180;
  for (const o of objs) {
    const prof = r.profundidade * o.fontSize;
    const passos = Math.max(1, Math.min(40, Math.ceil(prof)));
    const passo = prof / passos;
    const cor = o.corRelevo ?? r.cor ?? '#5a3200';
    for (let k = passos; k >= 1; k--) {
      const c = copiar(o);
      c.set({
        left: o.left + Math.cos(ang) * passo * k, top: o.top + Math.sin(ang) * passo * k,
        fill: cor, stroke: cor, strokeWidth: passo * 1.5, strokeLineJoin: 'round', selectable: false, evented: false,
      });
      if (k === passos && o.shadow) c.set('shadow', o.shadow);
      c.idNo = o.idNo;
      c.efeitoDe = o.idNo;
      c.relevoDe = o;
      c.indiceLinha = o.indiceLinha;
      saida.push(c);
    }
    o.set('shadow', null);
    saida.push(o);
  }
  return saida;
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
