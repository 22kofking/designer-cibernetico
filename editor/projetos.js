// Janela de Projetos (projetos e peças guardados no Armazém) e painel de Versões da peça aberta.
// A tela recebe o armazém e as ações do editor; não mexe na cena diretamente.

const $ = (sel, raiz = document) => raiz.querySelector(sel);

const quando = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? `hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export function iniciarProjetos({ armazem, onde, aviso, esc, abrirPeca, pecaAtual, cenaAtual, descarregar, atualizarMiniatura = async () => {}, gerarMiniatura = async () => null }) {
  const janela = $('#janela-projetos');
  const estado = { projeto: null, busca: '', arquivados: false, pasta: null }; // pasta: null = todas, '' = sem pasta

  const tentar = async (f, rotulo) => {
    try { return await f(); } catch (e) { aviso(`${rotulo}: ${e.message}`, true); return null; }
  };

  // ---------- janela de Projetos ----------

  async function desenharJanela() {
    const projetos = await armazem.listarProjetos({ arquivados: estado.arquivados });
    const pecas = await armazem.listarPecas({ arquivadas: estado.arquivados });
    const atual = pecaAtual();
    if (!estado.projeto || !projetos.some((p) => p.id === estado.projeto)) estado.projeto = atual?.projeto ?? projetos[0]?.id ?? null;
    const contagem = (id) => pecas.filter((p) => p.projeto === id).length;
    $('#proj-onde').textContent = onde === 'online'
      ? 'Guardado na Mesa online: abre igual em qualquer aparelho.'
      : 'Guardado neste navegador.';
    $('#proj-lista').innerHTML = projetos.map((p) => `
      <li><button type="button" data-projeto="${esc(p.id)}" aria-current="${p.id === estado.projeto && !estado.busca}">
        <span>${esc(p.nome)}${p.arquivado ? ' <small>(arquivado)</small>' : ''}</span><small>${contagem(p.id)}</small>
      </button></li>`).join('') || '<li class="dica">Nenhum projeto.</li>';
    const termo = estado.busca.trim().toLowerCase();
    let visiveis = termo
      ? pecas.filter((p) => `${p.nome} ${p.rotulo} ${projetos.find((x) => x.id === p.projeto)?.nome ?? ''}`.toLowerCase().includes(termo))
      : pecas.filter((p) => p.projeto === estado.projeto);
    const projetoAtual = projetos.find((p) => p.id === estado.projeto);
    $('#proj-titulo').textContent = termo ? `Busca: ${estado.busca}` : (projetoAtual?.nome ?? 'Peças');
    $('#proj-acoes-projeto').hidden = !!termo || !projetoAtual;
    if (projetoAtual) $('#proj-arquivar-projeto').textContent = projetoAtual.arquivado ? 'Desarquivar projeto' : 'Arquivar projeto';
    const opcoes = projetos.map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('');
    // Pastas do projeto: as guardadas no projeto (podem estar vazias) mais as que as peças já usam.
    const doProjeto = pecas.filter((p) => p.projeto === estado.projeto);
    const pastas = [...new Set([...(projetoAtual?.pastas ?? []), ...doProjeto.map((p) => p.pasta).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    if (estado.pasta && !pastas.includes(estado.pasta)) estado.pasta = null;
    const barra = $('#proj-pastas');
    barra.hidden = !!termo || !projetoAtual;
    if (!barra.hidden) {
      const chip = (valor, rotulo, n) => `<button type="button" class="pasta" data-pasta="${esc(valor ?? '*')}" aria-pressed="${estado.pasta === valor}">${esc(rotulo)} <small>${n}</small></button>`;
      barra.innerHTML = chip(null, 'Todas', doProjeto.length)
        + pastas.map((n) => chip(n, n, doProjeto.filter((p) => p.pasta === n).length)).join('')
        + (pastas.length ? chip('', 'Sem pasta', doProjeto.filter((p) => !p.pasta).length) : '')
        + '<button type="button" class="pasta pasta-nova" id="proj-nova-pasta">+ Pasta</button>'
        + (estado.pasta ? '<button type="button" class="pequeno" id="proj-renomear-pasta">Renomear pasta</button><button type="button" class="pequeno" id="proj-apagar-pasta">Apagar pasta</button>' : '');
    }
    const naPasta = termo || estado.pasta === null ? visiveis : visiveis.filter((p) => (p.pasta ?? '') === estado.pasta);
    const opcoesPasta = (atual) => `<option value="">Pasta…</option><option value="-">Sem pasta</option>${pastas.map((n) => `<option value="${esc(n)}"${n === atual ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="+">Nova pasta…</option>`;
    $('#proj-pecas').innerHTML = naPasta.map((p) => {
      const f = p.formato ?? p.cena?.formato;
      return `
      <li data-peca="${esc(p.id)}" class="${p.id === atual?.id ? 'aberta' : ''}">
        <button type="button" class="proj-abrir" title="Abrir esta peça">
          <span class="proj-mini" style="${f ? `aspect-ratio: ${f.largura} / ${f.altura}` : ''}">${p.miniatura ? `<img src="${p.miniatura}" alt="">` : '<em>sem miniatura</em>'}</span>
          <strong>${esc(p.rotulo ?? p.nome)}</strong>
          <small>${termo ? `${esc(projetos.find((x) => x.id === p.projeto)?.nome ?? '')} · ` : ''}${p.pasta ? `${esc(p.pasta)} · ` : ''}${f ? `${f.largura}x${f.altura} · ` : ''}${p.cena ? (p.origem ? 'editada' : 'própria') : 'original'} · ${quando(p.alterado)}${p.arquivado ? ' · arquivada' : ''}</small>
        </button>
        <div class="proj-mais">
          <button type="button" class="pequeno proj-duplicar" title="Criar uma cópia para editar à parte">Duplicar</button>
          <button type="button" class="pequeno proj-renomear">Renomear</button>
          <select class="proj-pasta" aria-label="Pasta da peça">${opcoesPasta(p.pasta)}</select>
          <select class="proj-mover" aria-label="Mover para o projeto"><option value="">Mover para…</option>${opcoes}</select>
          <button type="button" class="pequeno proj-arquivar">${p.arquivado ? 'Desarquivar' : 'Arquivar'}</button>
        </div>
      </li>`;
    }).join('') || `<li class="dica">${termo ? 'Nada encontrado.' : estado.pasta !== null ? 'Esta pasta está vazia. Escolha "Pasta…" numa peça para colocá-la aqui.' : 'Este projeto ainda não tem peças. Duplique uma peça ou abra um arquivo para começar.'}</li>`;
    visiveis = naPasta;
    ligarPecas(visiveis, projetoAtual, pastas);
    gerarFaltantes(visiveis);
  }

  // Peças que ainda não têm miniatura: gera uma de cada vez e troca na tela, sem refazer a lista.
  let gerando = false;
  async function gerarFaltantes(lista) {
    if (gerando) return;
    gerando = true;
    try {
      for (const p of lista.filter((x) => !x.miniatura)) {
        if (!janela.open) break;
        let m = null;
        try { m = await gerarMiniatura(p); } catch { /* fica sem miniatura; tenta de novo da próxima vez */ }
        const mini = m && $(`#proj-pecas li[data-peca="${CSS.escape(p.id)}"] .proj-mini`);
        if (mini) mini.innerHTML = `<img src="${m}" alt="">`;
      }
    } finally { gerando = false; }
  }

  // Muda a pasta de uma peça (nome vazio tira da pasta) e guarda a pasta no projeto, para existir mesmo vazia.
  async function porNaPasta(peca, projeto, pasta) {
    if (peca.id === pecaAtual()?.id) await descarregar();
    await tentar(async () => {
      await armazem.atualizarPeca(peca.id, { pasta: pasta || null });
      if (pasta && projeto && !(projeto.pastas ?? []).includes(pasta)) await armazem.atualizarProjeto(projeto.id, { pastas: [...(projeto.pastas ?? []), pasta] });
    }, 'Não mudou de pasta');
  }

  function ligarPecas(visiveis, projeto, pastas) {
    $('#proj-pastas').querySelectorAll('button[data-pasta]').forEach((b) => {
      b.onclick = () => { estado.pasta = b.dataset.pasta === '*' ? null : b.dataset.pasta; desenharJanela(); };
    });
    const nomeDePasta = (padrao = '') => {
      const nome = prompt('Nome da pasta:', padrao)?.trim();
      return nome || null;
    };
    if ($('#proj-nova-pasta')) $('#proj-nova-pasta').onclick = async () => {
      const nome = nomeDePasta();
      if (!nome || !projeto) return;
      if (!pastas.includes(nome)) await tentar(() => armazem.atualizarProjeto(projeto.id, { pastas: [...(projeto.pastas ?? []), nome] }), 'Não criou a pasta');
      estado.pasta = nome;
      desenharJanela();
    };
    if ($('#proj-renomear-pasta')) $('#proj-renomear-pasta').onclick = async () => {
      const antigo = estado.pasta;
      const nome = nomeDePasta(antigo);
      if (!nome || nome === antigo) return;
      await descarregar();
      await tentar(async () => {
        for (const p of (await armazem.listarPecas({ projeto: projeto.id, arquivadas: true })).filter((x) => x.pasta === antigo)) await armazem.atualizarPeca(p.id, { pasta: nome });
        await armazem.atualizarProjeto(projeto.id, { pastas: [...new Set((projeto.pastas ?? []).filter((n) => n !== antigo).concat(nome))] });
      }, 'Não renomeou a pasta');
      estado.pasta = nome;
      desenharJanela();
    };
    if ($('#proj-apagar-pasta')) $('#proj-apagar-pasta').onclick = async () => {
      const antigo = estado.pasta;
      if (!confirm(`Apagar a pasta "${antigo}"? As peças ficam no projeto, só saem da pasta.`)) return;
      await descarregar();
      await tentar(async () => {
        for (const p of (await armazem.listarPecas({ projeto: projeto.id, arquivadas: true })).filter((x) => x.pasta === antigo)) await armazem.atualizarPeca(p.id, { pasta: null });
        await armazem.atualizarProjeto(projeto.id, { pastas: (projeto.pastas ?? []).filter((n) => n !== antigo) });
      }, 'Não apagou a pasta');
      estado.pasta = null;
      desenharJanela();
    };
    $('#proj-lista').querySelectorAll('button[data-projeto]').forEach((b) => {
      b.onclick = () => { estado.projeto = b.dataset.projeto; estado.pasta = null; estado.busca = ''; $('#proj-busca').value = ''; desenharJanela(); };
    });
    $('#proj-pecas').querySelectorAll('li[data-peca]').forEach((li) => {
      const peca = visiveis.find((p) => p.id === li.dataset.peca);
      li.querySelector('.proj-abrir').onclick = async () => { janela.close(); await abrirPeca(await armazem.lerPeca(peca.id)); };
      li.querySelector('.proj-duplicar').onclick = async () => {
        if (peca.id === pecaAtual()?.id) await descarregar();
        const nome = prompt('Nome da cópia:', `${peca.rotulo ?? peca.nome} (cópia)`);
        if (!nome?.trim()) return;
        const copia = await tentar(() => armazem.duplicarPeca(peca.id, nome.trim()), 'Não duplicou');
        if (copia) { aviso(`"${copia.rotulo}" criada`); desenharJanela(); }
      };
      li.querySelector('.proj-renomear').onclick = async () => {
        const nome = prompt('Novo nome da peça:', peca.rotulo ?? peca.nome);
        if (!nome?.trim()) return;
        if (peca.id === pecaAtual()?.id) await descarregar();
        await tentar(() => armazem.atualizarPeca(peca.id, { nome: nome.trim(), rotulo: nome.trim() }), 'Não renomeou');
        if (peca.id === pecaAtual()?.id) $('#titulo').textContent = nome.trim();
        desenharJanela();
      };
      li.querySelector('.proj-pasta').onchange = async (e) => {
        let pasta = e.target.value;
        if (!pasta) return;
        if (pasta === '+') { pasta = nomeDePasta(); if (!pasta) { desenharJanela(); return; } }
        await porNaPasta(peca, projeto, pasta === '-' ? null : pasta);
        desenharJanela();
      };
      li.querySelector('.proj-mover').onchange = async (e) => {
        if (!e.target.value) return;
        if (peca.id === pecaAtual()?.id) await descarregar();
        await tentar(() => armazem.atualizarPeca(peca.id, { projeto: e.target.value, ordem: null, pasta: null }), 'Não moveu');
        desenharJanela();
      };
      li.querySelector('.proj-arquivar').onclick = async () => {
        if (peca.id === pecaAtual()?.id && !peca.arquivado) { aviso('Esta peça está aberta; abra outra antes de arquivar', true); return; }
        await tentar(() => armazem.atualizarPeca(peca.id, { arquivado: !peca.arquivado }), 'Não arquivou');
        desenharJanela();
      };
    });
  }

  $('#abrir-projetos').onclick = async () => { await descarregar(); await atualizarMiniatura(); janela.showModal(); await desenharJanela(); $('#proj-busca').focus(); };
  $('#proj-fechar').onclick = () => janela.close();
  janela.addEventListener('click', (e) => { if (e.target === janela) janela.close(); }); // clique fora fecha
  $('#proj-busca').oninput = (e) => { estado.busca = e.target.value; desenharJanela(); };
  $('#proj-arquivados').onchange = (e) => { estado.arquivados = e.target.checked; desenharJanela(); };
  $('#proj-novo').onclick = async () => {
    const nome = prompt('Nome do projeto (uma marca, uma campanha):');
    if (!nome?.trim()) return;
    const p = await tentar(() => armazem.criarProjeto(nome.trim()), 'Não criou o projeto');
    if (p) { estado.projeto = p.id; estado.busca = ''; desenharJanela(); }
  };
  $('#proj-renomear-projeto').onclick = async () => {
    const p = (await armazem.listarProjetos({ arquivados: true })).find((x) => x.id === estado.projeto);
    const nome = p && prompt('Novo nome do projeto:', p.nome);
    if (!nome?.trim()) return;
    await tentar(() => armazem.atualizarProjeto(p.id, { nome: nome.trim() }), 'Não renomeou');
    desenharJanela();
  };
  $('#proj-arquivar-projeto').onclick = async () => {
    const p = (await armazem.listarProjetos({ arquivados: true })).find((x) => x.id === estado.projeto);
    if (!p) return;
    await tentar(() => armazem.atualizarProjeto(p.id, { arquivado: !p.arquivado }), 'Não arquivou');
    desenharJanela();
  };
  // A peça aberta agora, como cópia dentro do projeto escolhido.
  $('#proj-copiar-aqui').onclick = async () => {
    const atual = pecaAtual();
    if (!atual || !estado.projeto) return;
    await descarregar();
    const nome = prompt('Nome da nova peça:', `${atual.rotulo ?? atual.nome} (cópia)`);
    if (!nome?.trim()) return;
    const copia = await tentar(async () => {
      const c = await armazem.duplicarPeca(atual.id, nome.trim());
      return armazem.atualizarPeca(c.id, { projeto: estado.projeto, ordem: null, pasta: estado.pasta || null });
    }, 'Não copiou');
    if (copia) { aviso(`"${copia.rotulo}" criada em ${$('#proj-titulo').textContent}`); desenharJanela(); }
  };

  // ---------- versões da peça aberta ----------

  async function desenharVersoes() {
    const peca = pecaAtual();
    const lista = $('#versoes-lista');
    if (!peca) { lista.innerHTML = ''; return; }
    const versoes = await armazem.listarVersoes(peca.id);
    lista.innerHTML = versoes.map((v) => `
      <li data-versao="${esc(v.id)}">
        <span><strong>${esc(v.nome ?? (v.automatica ? 'automática' : 'sem nome'))}</strong><small>${quando(v.criado)}</small></span>
        <button type="button" class="pequeno ver-restaurar" title="A peça volta a esta versão; a de agora fica guardada">Restaurar</button>
        <button type="button" class="pequeno ver-renomear" title="Dar nome (versões com nome nunca são apagadas sozinhas)">Nomear</button>
        <button type="button" class="pequeno ver-apagar" title="Apagar esta versão" aria-label="Apagar">✕</button>
      </li>`).join('') || '<li class="dica">Nenhuma versão ainda. As automáticas aparecem a cada 10 minutos de edição.</li>';
    lista.querySelectorAll('li[data-versao]').forEach((li) => {
      const v = versoes.find((x) => x.id === li.dataset.versao);
      li.querySelector('.ver-restaurar').onclick = async () => {
        await descarregar();
        const p = await tentar(() => armazem.restaurarVersao(v.id), 'Não restaurou');
        if (p) { await abrirPeca(p); aviso(`Voltou para "${v.nome ?? quando(v.criado)}"`); }
      };
      li.querySelector('.ver-renomear').onclick = async () => {
        const nome = prompt('Nome da versão:', v.nome ?? '');
        if (!nome?.trim()) return;
        await tentar(() => armazem.renomearVersao(v.id, nome.trim()), 'Não nomeou');
        desenharVersoes();
      };
      li.querySelector('.ver-apagar').onclick = async () => {
        if (!confirm(`Apagar a versão "${v.nome ?? quando(v.criado)}"?`)) return;
        await tentar(() => armazem.apagarVersao(v.id), 'Não apagou');
        desenharVersoes();
      };
    });
  }

  $('#versao-salvar').onclick = async () => {
    const peca = pecaAtual();
    if (!peca) return;
    const nome = prompt('Nome da versão (por exemplo "aprovada"):');
    if (!nome?.trim()) return;
    await descarregar();
    const v = await tentar(() => armazem.salvarVersao(peca.id, structuredClone(cenaAtual()), { nome: nome.trim() }), 'Não salvou a versão');
    if (v) { aviso(`Versão "${v.nome}" salva`); desenharVersoes(); }
  };
  $('#versoes').hidden = false;
  $('#abrir-projetos').hidden = false;

  let ultimaContagem = 0;
  return {
    aoAbrir: () => desenharVersoes(),
    // depois de gravar, só redesenha se pode ter surgido uma versão automática
    aoGuardar: (peca) => {
      if (peca.ultimaAutomatica && peca.ultimaAutomatica !== ultimaContagem) { ultimaContagem = peca.ultimaAutomatica; desenharVersoes(); }
    },
    atualizar: () => { if (janela.open) desenharJanela(); },
  };
}
