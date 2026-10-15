// Busca por parecidos: compara o embedding visual (o que o objeto "é") e a
// silhueta (a forma dele). Consulta por imagem usa os dois; por texto, só o visual.
import { cosseno } from './visual.js';

// O Openclipart repete o mesmo desenho em várias categorias: resultados quase
// idênticos (cosseno visual acima de `repetido`) aparecem uma vez só.
export function buscar(banco, consulta, { k = 8, fontes, papel, pesos, repetido = 0.995 } = {}) {
  const pv = pesos?.visual ?? (consulta.forma ? 0.8 : 1);
  const pf = pesos?.forma ?? (consulta.forma ? 0.2 : 0);
  const resultados = [];
  banco.itens.forEach((item, i) => {
    if (fontes?.length && !fontes.includes(item.fonte)) return;
    if (papel && item.papel !== papel) return;
    const sv = consulta.visual ? cosseno(consulta.visual, banco.visual[i]) : 0;
    const sf = consulta.forma ? cosseno(consulta.forma, banco.forma[i]) : 0;
    resultados.push({ item, indice: i, nota: pv * sv + pf * sf, visual: sv, forma: sf });
  });
  resultados.sort((a, b) => b.nota - a.nota);
  const escolhidos = [];
  const vetores = [];
  for (const r of resultados) {
    const v = banco.visual[r.indice];
    if (vetores.some((u) => cosseno(u, v) > repetido)) continue;
    escolhidos.push(r);
    vetores.push(v);
    if (escolhidos.length === k) break;
  }
  return escolhidos;
}
