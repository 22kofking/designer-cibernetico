// Encaixe por flexbox (Yoga, em wasm). O canvas só desenha; quem decide onde
// cada coisa fica é este módulo. Roda no Node e no navegador.
import Yoga, { Align, Direction, Edge, FlexDirection, Gutter, Justify, Wrap } from 'yoga-layout';

const JUSTIFICAR = {
  inicio: Justify.FlexStart,
  centro: Justify.Center,
  fim: Justify.FlexEnd,
  entre: Justify.SpaceBetween,
  em_volta: Justify.SpaceAround,
};
const ALINHAR = {
  inicio: Align.FlexStart,
  centro: Align.Center,
  fim: Align.FlexEnd,
  esquerda: Align.FlexStart,
  direita: Align.FlexEnd,
};

// Distribui filhos de tamanho conhecido dentro de uma caixa.
//   caixa   {x, y, w, h} em pixels
//   filhos  [{w, h, margemAntes?, crescer?}]
//   opcoes  {direcao: 'coluna'|'linha', justificar, alinhar, espaco, quebrar}
// Devolve [{x, y, w, h}] em pixels absolutos, na ordem dos filhos.
export function distribuir(caixa, filhos, opcoes = {}) {
  const raiz = Yoga.Node.create();
  try {
    raiz.setWidth(caixa.w);
    raiz.setHeight(caixa.h);
    raiz.setFlexDirection(opcoes.direcao === 'linha' ? FlexDirection.Row : FlexDirection.Column);
    raiz.setJustifyContent(JUSTIFICAR[opcoes.justificar ?? 'inicio'] ?? Justify.FlexStart);
    raiz.setAlignItems(ALINHAR[opcoes.alinhar ?? 'inicio'] ?? Align.FlexStart);
    if (opcoes.quebrar) raiz.setFlexWrap(Wrap.Wrap);
    if (opcoes.espaco) raiz.setGap(opcoes.direcao === 'linha' ? Gutter.Column : Gutter.Row, opcoes.espaco);
    const nos = filhos.map((f, i) => {
      const n = Yoga.Node.create();
      n.setWidth(f.w);
      n.setHeight(f.h);
      n.setFlexShrink(0);
      if (f.crescer) n.setFlexGrow(f.crescer);
      if (f.margemAntes) n.setMargin(opcoes.direcao === 'linha' ? Edge.Left : Edge.Top, f.margemAntes);
      raiz.insertChild(n, i);
      return n;
    });
    raiz.calculateLayout(caixa.w, caixa.h, Direction.LTR);
    return nos.map((n) => ({
      x: caixa.x + n.getComputedLeft(),
      y: caixa.y + n.getComputedTop(),
      w: n.getComputedWidth(),
      h: n.getComputedHeight(),
    }));
  } finally {
    raiz.freeRecursive();
  }
}
