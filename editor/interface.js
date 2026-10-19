// Trilho e gaveta da Mesa: um botão por painel; clicar no painel aberto fecha a gaveta e dá mais espaço à peça.
// A escolha fica guardada no navegador (por pessoa, não na peça).

const CHAVE = 'mesa:gaveta';

export function iniciarInterface({ ler, guardar, aoMudar = () => {} }) {
  const trabalho = document.querySelector('.trabalho');
  const gaveta = document.getElementById('gaveta');
  const botoes = [...document.querySelectorAll('.trilho button[data-gaveta]')];
  if (!trabalho || !gaveta) return { abrir() {}, fechar() {}, atual: () => null };

  const validos = () => botoes.filter((b) => !b.hidden).map((b) => b.dataset.gaveta);
  let atual = ler(CHAVE) ?? 'biblioteca';

  function mostrar(nome) {
    // sem painel válido (ou fechada de propósito), a gaveta some
    if (nome && nome !== 'fechada' && !validos().includes(nome)) nome = validos()[0] ?? 'fechada';
    atual = nome || 'fechada';
    trabalho.dataset.gaveta = atual === 'fechada' ? 'fechada' : 'aberta';
    gaveta.dataset.ativo = atual;
    for (const b of botoes) b.setAttribute('aria-pressed', String(b.dataset.gaveta === atual));
    guardar(CHAVE, atual);
    aoMudar(atual);
  }

  for (const b of botoes) b.onclick = () => mostrar(atual === b.dataset.gaveta ? 'fechada' : b.dataset.gaveta);
  // o botão Versões aparece depois (quando há armazém); se a gaveta estava nele, volta a valer
  new MutationObserver(() => { if (atual !== 'fechada' && !validos().includes(atual)) mostrar('biblioteca'); else mostrar(atual); })
    .observe(document.querySelector('.trilho'), { attributes: true, subtree: true, attributeFilter: ['hidden'] });
  mostrar(atual);

  return { abrir: mostrar, fechar: () => mostrar('fechada'), atual: () => atual };
}
