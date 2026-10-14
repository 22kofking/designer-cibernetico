// Grupo com encaixe flexbox: os filhos dizem só o tamanho (caixa.w e
// caixa.h, em frações da peça) e o Yoga decide a posição dentro do grupo.
// Serve para fileiras de ícones, selos, botões, listas de benefícios etc.
import { caixaEmPixels } from './cena.js';
import { distribuir } from './layout.js';

export function distribuirGrupo(grupo, caixa, formato) {
  const flex = grupo.flex ?? {};
  const filhos = grupo.filhos ?? [];
  const tamanhos = filhos.map((f) => {
    const px = caixaEmPixels({ x: 0, y: 0, ...f.caixa }, formato);
    return { w: px.w, h: px.h, crescer: f.crescer };
  });
  const espaco = (flex.espaco ?? 0) * (flex.direcao === 'linha' ? formato.largura : formato.altura);
  const caixas = distribuir(caixa, tamanhos, { ...flex, espaco });
  return filhos.map((f, i) => ({ ...f, caixaPx: caixas[i] }));
}
