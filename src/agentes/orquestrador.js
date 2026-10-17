// A equipe trabalhando junta: o diretor planeja, cada especialista faz a sua
// parte, o crítico mede e devolve só o que errou, e o especialista daquela parte
// tenta a próxima opção. No fim fica, em cada parte, a opção que mediu melhor.
// Sem --gerar nada aqui gasta gateway: as opções vêm do banco, do desenho por
// código e das montagens prontas. Com --gerar e --teto, fundo, mascote e objeto
// na mão podem nascer como componentes separados (ver src/geracao/componentes.js).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { celula, montarPrancha } from '../banco/prancha.js';
import { acharReferencia } from '../desconstrucao/grafo.js';
import { exportar, renderizar } from '../node/render-node.js';
import { criticar } from './critico.js';
import { dirigir } from './diretor.js';
import { aplicarOpcao } from './especialistas.js';
import { criarOrcamento } from '../geracao/componentes.js';

const copia = (x) => JSON.parse(JSON.stringify(x));

export async function produzir(banco, grafo, marca, pasta, { referencias = [], rodadas = 3, escala = 2, aoProgredir = () => {}, gerar = false, teto, gerarImagem, recortar } = {}) {
  await mkdir(path.join(pasta, 'assets'), { recursive: true });
  const referencia = acharReferencia(grafo, referencias);
  const orcamento = gerar ? criarOrcamento(teto) : null;
  const direcao = await dirigir(banco, grafo, marca, pasta, { referencias, escala, gerar });
  const { tarefas } = direcao;
  aoProgredir(`diretor: ${tarefas.length} partes para ${new Set(tarefas.map((t) => t.especialista)).size} especialistas`);

  let cena = copia(direcao.cena);
  const ctx = { banco, pasta, grafo, marca, referencias, orcamento, personagem: direcao.personagem, gerarImagem, recortar };
  if (gerar) aoProgredir(`geração por componentes: ${direcao.pedidos.map((p) => p.tipo).join(', ') || 'nada a gerar'} (teto US$ ${teto})`);
  const escolha = new Map();
  const montagens = {};
  const notas = [];
  // Cada especialista entra com a opção preferida.
  for (const t of tarefas) {
    for (let i = 0; i < t.opcoes.length; i++) {
      try {
        const r = await aplicarOpcao(cena, t, i, ctx);
        if (r.montagem) montagens[t.no] = r.montagem;
        escolha.set(t.no, i);
        break;
      } catch (e) {
        notas.push(`início: ${t.especialista} não conseguiu a opção ${i + 1} de ${t.no} (${t.opcoes[i].titulo ?? t.opcoes[i].id}): ${e.message}`);
      }
    }
  }

  const melhor = new Map(); // parte → { indice, delta }
  const historico = [];
  let critica = null;
  for (let rodada = 1; rodada <= rodadas; rodada++) {
    critica = await criticar(cena, pasta, { grafo, referencia, marca, tarefas, montagens, escolhas: Object.fromEntries(escolha) });
    historico.push({ rodada, escolha: Object.fromEntries(escolha), delta_peca: critica.delta_peca, partes: critica.partes.map(({ no, delta, ok, problemas }) => ({ no, delta, ok, problemas })), regras: critica.regras });
    if (rodada === 1) await writeFile(path.join(pasta, 'rodada-1.png'), critica.png);
    aoProgredir(`crítico, rodada ${rodada}: ΔE da peça ${critica.delta_peca}, ${critica.partes.filter((p) => !p.ok).length} parte(s) com problema`);
    for (const p of critica.partes) {
      const i = escolha.get(p.no);
      if (i == null) continue;
      const m = melhor.get(p.no);
      // Passar vale mais que medir um pouco menos. Se nenhuma opção passa, fica a
      // preferida do diretor (a régua de cor não sabe o que o objeto é: um envelope
      // amarelo mede mais perto de envelopes vermelhos com moedas de ouro).
      const pontos = p.ok ? p.delta : 1000 + i;
      if (!m || pontos < m.pontos) melhor.set(p.no, { indice: i, pontos, delta: p.delta });
    }
    // Só volta para o especialista a parte que errou e ainda tem opção para tentar.
    const refazer = critica.partes.filter((p) => !p.ok && escolha.has(p.no) && escolha.get(p.no) + 1 < tarefas.find((t) => t.no === p.no).opcoes.length);
    if (!refazer.length || rodada === rodadas) break;
    for (const p of refazer) {
      const t = tarefas.find((x) => x.no === p.no);
      const proxima = escolha.get(p.no) + 1;
      try {
        const r = await aplicarOpcao(cena, t, proxima, ctx);
        if (r.montagem) montagens[t.no] = r.montagem; else delete montagens[t.no];
        escolha.set(p.no, proxima);
        notas.push(`rodada ${rodada + 1}: ${t.especialista} trocou ${t.no} pela opção ${proxima + 1} (${t.opcoes[proxima].titulo ?? t.opcoes[proxima].id})`);
      } catch (e) {
        notas.push(`rodada ${rodada + 1}: ${t.especialista} não conseguiu a opção ${proxima + 1} de ${t.no}: ${e.message}`);
        escolha.set(p.no, proxima);
      }
    }
  }

  // Fica a opção que mediu melhor em cada parte.
  let mudou = false;
  for (const [no, m] of melhor) {
    if (escolha.get(no) === m.indice) continue;
    const t = tarefas.find((x) => x.no === no);
    const r = await aplicarOpcao(cena, t, m.indice, ctx);
    if (r.montagem) montagens[no] = r.montagem; else delete montagens[no];
    escolha.set(no, m.indice);
    notas.push(m.pontos < 1000 ? `final: ${no} voltou para a opção ${m.indice + 1}, que passou (ΔE ${m.delta})` : `final: nenhuma opção de ${no} passou; fica a preferida do diretor (opção ${m.indice + 1})`);
    mudou = true;
  }
  if (mudou) critica = await criticar(cena, pasta, { grafo, referencia, marca, tarefas, montagens, escolhas: Object.fromEntries(escolha) });

  // O que segue pendente: objeto na mão sem mascote em partes, lugares vazios, partes sem opção.
  const temObjetoNaMao = Object.values(montagens).some((m) => m.camadas.some((c) => c.papel === 'objeto_na_mao'));
  const pendentes = direcao.pendentes
    .filter((p) => !(temObjetoNaMao && /segurado pelo mascote/.test(p.motivo)))
    .filter((p) => !(p.no === 'logo' && marca.logo))
    .filter((p) => !/passar pela oficina/.test(p.motivo))
    // Parte que ganhou material numa rodada não está mais pendente.
    .filter((p) => !cena.nos.some((n) => (n.id === p.no || n.id.startsWith(`${p.no}-`)) && n.tipo === 'imagem'));
  for (const t of tarefas) if (!t.opcoes.length) pendentes.push({ no: t.no, motivo: `${t.especialista} sem opção no banco` });

  cena.nome = `${marca.nome}-${grafo.peca}`;
  cena.descricao = `${marca.nome} no layout de ${grafo.peca} (tema ${grafo.tema}), feita pela equipe de agentes: material do banco e das montagens, medida contra a referência.`;
  await writeFile(path.join(pasta, 'cena.json'), JSON.stringify(cena, null, 2));
  const previas = await exportar(await renderizar(cena, pasta), path.join(pasta, 'previa'), ['png', 'webp']);
  const relatorio = {
    marca: marca.nome,
    peca: grafo.peca,
    tema: grafo.tema,
    aprovado_pelo_critico: critica.aprovado,
    delta_peca: critica.delta_peca,
    rodadas: historico.length,
    gasto_gateway: orcamento ? orcamento.gasto : 0,
    partes: critica.partes.map((p) => {
      const t = tarefas.find((x) => x.no === p.no);
      const o = t.opcoes[escolha.get(p.no)];
      return { ...p, opcao: escolha.has(p.no) ? `${escolha.get(p.no) + 1} de ${t.opcoes.length}: ${o?.titulo ?? o?.id}` : 'sem opção' };
    }),
    regras: critica.regras,
    problemas: critica.problemas,
    pendentes,
    notas,
    historico,
    cena: path.join(pasta, 'cena.json'),
    previa: previas,
  };
  await writeFile(path.join(pasta, 'relatorio.json'), JSON.stringify(relatorio, null, 2));
  await pranchaDaPeca(referencia, path.join(pasta, 'rodada-1.png'), previas[0], historico[0], relatorio, path.join(pasta, 'prancha.png'));
  return relatorio;
}

async function pranchaDaPeca(referencia, rodada1, final, primeira, relatorio, destino) {
  const piores = (partes) => partes.filter((p) => !p.ok).map((p) => `${p.no} ΔE ${p.delta}`).slice(0, 2).join(', ') || 'todas as partes ok';
  const celulas = [
    await celula(await sharp(referencia).png().toBuffer(), ['referência (só régua)', relatorio.peca]),
    await celula(rodada1, [`rodada 1: ΔE ${primeira.delta_peca}`, piores(primeira.partes)]),
    await celula(final, [`final: ΔE ${relatorio.delta_peca}`, relatorio.aprovado_pelo_critico ? 'crítico aprovou' : `${relatorio.problemas.length} problema(s)`, piores(relatorio.partes)], true),
  ];
  await montarPrancha(celulas, destino);
}
