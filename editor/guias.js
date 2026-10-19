// Guias magnéticas: ao mover uma camada, ela gruda nas bordas e no centro da peça e das outras camadas.

const bordas = (r) => ({ x: [r.left, r.left + r.width / 2, r.left + r.width], y: [r.top, r.top + r.height / 2, r.top + r.height] });

// Alinha `alvo` às linhas mais próximas (a até 7 px na tela) e devolve as guias a desenhar.
export function alinharAsGuias({ alvo, objetos, largura: W, altura: H, zoom }) {
  const guias = [];
  const linhasX = [0, W / 2, W];
  const linhasY = [0, H / 2, H];
  for (const o of objetos) {
    if (o === alvo || o.efeitoDe || !o.visible || o.idNo === alvo.idNo) continue;
    const r = o.getBoundingRect();
    if (r.width >= W * 0.98 && r.height >= H * 0.98) continue; // fundo inteiro só atrapalha
    const b = bordas(r);
    linhasX.push(...b.x);
    linhasY.push(...b.y);
  }
  const limite = 7 / zoom;
  const b = bordas(alvo.getBoundingRect());
  const melhor = (minhas, linhas) => {
    let m = null;
    for (const v of minhas) for (const l of linhas) {
      const d = l - v;
      if (Math.abs(d) <= limite && (!m || Math.abs(d) < Math.abs(m.d))) m = { d, l };
    }
    return m;
  };
  const mx = melhor(b.x, linhasX);
  const my = melhor(b.y, linhasY);
  if (mx) { alvo.left += mx.d; guias.push({ x: mx.l }); }
  if (my) { alvo.top += my.d; guias.push({ y: my.l }); }
  if (mx || my) alvo.setCoords();
  return { guias, moveu: !!(mx || my) };
}

export function desenharGuiasNo(canvas, guias, zoom) {
  if (!guias.length || !canvas.contextTop) return;
  const ctx = canvas.contextTop;
  canvas.clearContext(ctx);
  ctx.save();
  ctx.strokeStyle = '#ff2fa8';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  for (const g of guias) {
    ctx.beginPath();
    if (g.x !== undefined) { ctx.moveTo(g.x * zoom + 0.5, 0); ctx.lineTo(g.x * zoom + 0.5, canvas.height); }
    else { ctx.moveTo(0, g.y * zoom + 0.5); ctx.lineTo(canvas.width, g.y * zoom + 0.5); }
    ctx.stroke();
  }
  ctx.restore();
}
