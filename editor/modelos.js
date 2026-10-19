// Painel Modelos: peças prontas guardadas no Armazém para começar outras (Salvar como modelo, Usar, Excluir).

const $ = (sel, raiz = document) => raiz.querySelector(sel);

export function iniciarModelos({ paraRelativo = (h) => h, armazem, aviso, esc, cenaAtual, baseAtual, pecaAtual, miniaturaDe, descarregar, abrirPeca, projetoPadrao, aoCriarPeca = () => {} }) {
  const lista = $('#modelos-lista');

  async function desenhar() {
    const modelos = await armazem.listarModelos();
    lista.innerHTML = modelos.map((m) => {
      const f = m.formato;
      return `
      <li data-modelo="${esc(m.id)}">
        <span class="modelo-mini" style="${f ? `aspect-ratio: ${f.largura} / ${f.altura}` : ''}">${m.miniatura ? `<img src="${m.miniatura}" alt="">` : '<em>sem miniatura</em>'}</span>
        <strong>${esc(m.nome)}</strong>
        <small>${m.categoria ? `${esc(m.categoria)} · ` : ''}${f ? `${f.largura}x${f.altura}` : ''}</small>
        <span class="modelo-botoes">
          <button type="button" class="pequeno modelo-usar" title="Cria uma peça nova com este modelo">Usar</button>
          <button type="button" class="pequeno modelo-renomear">Renomear</button>
          <button type="button" class="pequeno modelo-apagar" aria-label="Excluir modelo" title="Excluir este modelo (as peças feitas com ele ficam)">✕</button>
        </span>
      </li>`;
    }).join('') || '<li class="dica">Nenhum modelo ainda. Deixe uma peça do jeito que serve de ponto de partida e use "Salvar peça aberta como modelo".</li>';
    lista.querySelectorAll('li[data-modelo]').forEach((li) => {
      const m = modelos.find((x) => x.id === li.dataset.modelo);
      li.querySelector('.modelo-usar').onclick = async () => {
        const nome = prompt('Nome da peça nova:', m.nome);
        if (!nome?.trim()) return;
        try {
          await descarregar();
          const projeto = pecaAtual()?.projeto ?? (await projetoPadrao()).id;
          const p = await armazem.criarPecaDeModelo(m.id, { projeto, nome: nome.trim() });
          aoCriarPeca(p);
          await abrirPeca(p);
          aviso(`"${p.nome}" criada a partir do modelo`);
        } catch (e) { aviso(`Não criei a peça: ${e.message}`, true); }
      };
      li.querySelector('.modelo-renomear').onclick = async () => {
        const nome = prompt('Novo nome do modelo:', m.nome);
        if (!nome?.trim()) return;
        await armazem.atualizarModelo(m.id, { nome: nome.trim() });
        desenhar();
      };
      li.querySelector('.modelo-apagar').onclick = async () => {
        if (!confirm(`Excluir o modelo "${m.nome}"?`)) return;
        await armazem.apagarModelo(m.id);
        desenhar();
      };
    });
  }

  $('#modelo-salvar').onclick = async () => {
    const peca = pecaAtual();
    const nome = prompt('Nome do modelo:', peca?.rotulo ?? peca?.nome ?? '');
    if (!nome?.trim()) return;
    try {
      await descarregar();
      const cena = structuredClone(cenaAtual());
      const base = baseAtual();
      const miniatura = await miniaturaDe(cena, base).catch(() => null);
      await armazem.salvarModelo({ nome: nome.trim(), categoria: null, cena, base: paraRelativo(base.href), miniatura });
      aviso(`Modelo "${nome.trim()}" guardado`);
      desenhar();
    } catch (e) { aviso(`Não guardei o modelo: ${e.message}`, true); }
  };

  desenhar();
  return { atualizar: desenhar };
}
