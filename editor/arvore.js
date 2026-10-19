// Consulta à árvore de nós de uma cena (os nós podem ter `filhos`).

export function acharNoEm(nos, id) {
  for (const no of nos) {
    if (no.id === id) return no;
    if (no.filhos) {
      const achou = acharNoEm(no.filhos, id);
      if (achou) return achou;
    }
  }
  return null;
}

// A lista (da cena ou de um grupo) em que o nó está.
export function listaDoNoEm(nos, id) {
  for (const no of nos) {
    if (no.id === id) return nos;
    if (no.filhos) {
      const achou = listaDoNoEm(no.filhos, id);
      if (achou) return achou;
    }
  }
  return null;
}

export function idsDe(nos) {
  const ids = new Set();
  const andar = (lista) => lista.forEach((n) => { ids.add(n.id); if (n.filhos) andar(n.filhos); });
  andar(nos);
  return ids;
}
