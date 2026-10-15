// Diretor de arte: lê o grafo da referência e a marca, consulta o banco parte por
// parte (o plano da fase 4), monta o molde e reparte o trabalho entre os
// especialistas. Cada tarefa leva as opções em ordem de preferência: quando o
// crítico reprova uma parte, o especialista passa para a próxima opção.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { grafoParaCena } from '../desconstrucao/molde.js';
import { planejar } from '../desconstrucao/plano.js';
import { PAPEL_DO_TIPO } from '../desconstrucao/grafo.js';
import { FORMATOS_VETORIAIS } from '../oficinas/elementos.js';

export async function lerMarca(arquivo) {
  const marca = JSON.parse(await readFile(arquivo, 'utf8'));
  const pasta = path.dirname(path.resolve(arquivo));
  const resolver = (p) => (p && !path.isAbsolute(p) ? path.resolve(pasta, p) : p);
  marca._arquivo = path.resolve(arquivo);
  marca.logo = resolver(marca.logo);
  marca.personagem = resolver(marca.personagem);
  marca.montagens = Object.fromEntries(Object.entries(marca.montagens ?? {}).map(([k, v]) => [k, resolver(v)]));
  return marca;
}

const ESPECIALISTA_DO_PAPEL = { fundo: 'cenarista', mascote: 'ilustrador_mascote', elemento: 'ilustrador_elementos', texto: 'tipografo', logo: 'tipografo' };

// Opções de cada parte, da preferida para a última.
function opcoesDaParte(banco, no, p, marca, tema, { vectorcraft }) {
  const papel = PAPEL_DO_TIPO[no.tipo] ?? 'elemento';
  const tags = (c) => banco.itens.find((x) => x.fonte === c.fonte && x.id === c.id)?.tags ?? [];
  // Pedaço de mascote (corpo sem a mão, só o orbe) não é mascote inteiro.
  const candidatos = (p?.candidatos ?? []).filter((c) => papel !== 'mascote' || !tags(c).includes('parte'));
  const itens = [];
  // Tema de um mascote do banco: pelas etiquetas e pelo título (camadas 9pmbet trazem "promo-telegram", montagens trazem o tema).
  const temaDe = (c) => {
    const texto = [...tags(c), c.titulo ?? ''].join(' ').toLowerCase();
    return Object.keys(marca.textos ?? {}).find((t) => texto.includes(t)) ?? null;
  };
  for (const c of candidatos) {
    itens.push({ tipo: 'item', fonte: c.fonte, id: c.id, titulo: c.titulo, nota: c.nota, ...(papel === 'mascote' ? { tema: temaDe(c) } : {}) });
    // Vetor pode ir para a oficina: cores tiradas da parte da referência (só o estilo).
    if (papel === 'elemento' && vectorcraft && FORMATOS_VETORIAIS.includes(c.formato)) itens.push({ tipo: 'adaptar', fonte: c.fonte, id: c.id, titulo: `${c.titulo}, nas cores da referência (VectorCraft)` });
  }
  if (papel === 'fundo') return [...itens, { tipo: 'gradiente', titulo: 'gradiente com a paleta medida' }];
  if (papel === 'mascote') {
    const montagem = marca.montagens?.[tema];
    const primeira = montagem && existsSync(montagem) ? [{ tipo: 'montagem', arquivo: montagem, tema, titulo: `mascote em partes (${path.basename(path.dirname(montagem))})` }] : [];
    // Do mesmo tema primeiro; de outro tema só como rascunho.
    return [...primeira, ...itens.filter((o) => o.tema === tema), ...itens.filter((o) => o.tema !== tema)];
  }
  return itens;
}

export async function dirigir(banco, grafo, marca, pasta, { referencias = [], escala = 2, vectorcraft = !!process.env.VECTORCRAFT_CLI } = {}) {
  const tema = grafo.tema;
  const plano = await planejar(banco, grafo, { referencias });
  const { cena, pendentes } = await grafoParaCena(banco, grafo, plano, pasta, { escala, referencias, logo: marca.logo });
  const porNo = new Map(plano.nos.map((p) => [p.no, p]));
  const tarefas = [];
  for (const no of grafo.nos) {
    const papel = PAPEL_DO_TIPO[no.tipo] ?? 'elemento';
    if (no.tipo === 'efeito' || no.tipo === 'texto' || no.tipo === 'logo') continue;
    // Objeto na mão do mascote vem com o mascote (montagem em partes).
    if (no.tipo === 'objeto_segurado' && no.camada_psd === 'mascote') continue;
    if (!Array.isArray(no.caixa) && no.tipo !== 'fundo') continue;
    const p = porNo.get(no.id);
    tarefas.push({
      no: no.id,
      papel,
      especialista: ESPECIALISTA_DO_PAPEL[papel],
      caixa: no.caixa ?? [0, 0, 1, 1],
      descricao: no.descricao ?? null,
      acao_do_plano: p?.acao ?? null,
      opcoes: opcoesDaParte(banco, no, p, marca, tema, { vectorcraft }),
    });
  }
  const linhas = grafo.nos.filter((n) => n.tipo === 'texto' && Array.isArray(n.caixa));
  if (linhas.length) {
    const textos = marca.textos?.[tema];
    tarefas.push({
      no: 'texto',
      papel: 'texto',
      especialista: 'tipografo',
      caixa: caixaQueCobre(linhas.map((n) => n.caixa)),
      // Altura da letra de cada linha na referência (px da referência), para conferir o tamanho.
      altura_ref: linhas.map((n) => n.estilo?.altura_px).filter(Boolean),
      opcoes: textos ? [{ tipo: 'texto', linhas: textos, titulo: `textos da marca (${tema})` }] : [],
    });
  }
  return { tema, plano, cena, pendentes, tarefas };
}

export function caixaQueCobre(caixas) {
  const x0 = Math.min(...caixas.map((c) => c[0])), y0 = Math.min(...caixas.map((c) => c[1]));
  const x1 = Math.max(...caixas.map((c) => c[0] + c[2])), y1 = Math.max(...caixas.map((c) => c[1] + c[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}
