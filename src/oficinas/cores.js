// Cores: conversão para Lab e o mapa que leva as cores de um desenho para a
// paleta da ficha mantendo a estrutura de luz e sombra (o tom mais escuro do
// desenho vira o tom mais escuro da paleta, e assim por diante).

function hexParaRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function linear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function hexParaLab(hex) {
  return rgbParaLab(...hexParaRgb(hex));
}

export function rgbParaLab(r8, g8, b8) {
  const [r, g, b] = [r8, g8, b8].map(linear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function deltaE(a, b) {
  const [la, aa, ba] = hexParaLab(a);
  const [lb, ab, bb] = hexParaLab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
}

function quaseNeutra(hex) {
  const [l, a, b] = hexParaLab(hex);
  return { neutra: Math.hypot(a, b) < 6, l };
}

// origem: cores do desenho (hex); paleta: cores da ficha (hex).
// Preto e branco quase puros ficam como estão (contornos e brilhos), o resto
// é distribuído pela paleta na ordem de luminosidade.
export function mapaParaPaleta(origem, paleta, { manterPretoEBranco = true } = {}) {
  const mapa = {};
  const mudar = [];
  for (const c of origem) {
    const { neutra, l } = quaseNeutra(c);
    if (manterPretoEBranco && neutra && (l < 12 || l > 95)) continue;
    mudar.push({ c, l });
  }
  // Desenho só de preto e branco (um raio preto, um ícone chapado): aí tudo muda de cor.
  if (!mudar.length && manterPretoEBranco) return mapaParaPaleta(origem, paleta, { manterPretoEBranco: false });
  if (!mudar.length || !paleta.length) return mapa;
  const alvo = paleta.map((c) => ({ c, l: hexParaLab(c)[0] })).sort((a, b) => a.l - b.l);
  mudar.sort((a, b) => a.l - b.l);
  mudar.forEach(({ c }, i) => {
    const pos = mudar.length === 1 ? Math.floor((alvo.length - 1) / 2) : Math.round((i / (mudar.length - 1)) * (alvo.length - 1));
    mapa[c] = alvo[pos].c;
  });
  return mapa;
}
