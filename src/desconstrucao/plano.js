// Consulta por nó: para cada parte desconstruída de uma referência, o que no banco
// serve de ponto de partida (nosso ou público) e o que a oficina faria com ele.
// É o "não criar do vazio" aplicado à peça inteira, parte por parte.
import path from 'node:path';
import { buscar } from '../banco/buscar.js';
import { descritorForma, sobreFundoNeutro } from '../banco/imagem.js';
import { embeddingDeImagem } from '../banco/visual.js';
import { decidir, reordenarPorNome } from '../oficinas/elementos.js';
import { acharReferencia, noRecortavel, PAPEL_DO_TIPO, recortarNoDoGrafo, separarPartes } from './grafo.js';

// Concorrente contra o nosso material nunca é "quase igual" (outro bicho, outra
// marca): o corte de reusar fica baixo, porque aqui reusar quer dizer "o nosso
// equivalente desta parte", não "a mesma imagem".
export const LIMIARES_PLANO = { reusar: 0.8, adaptar: 0.72 };

// Os títulos das bibliotecas públicas estão em inglês e as descrições dos grafos em
// português. Glossário curto dos objetos que aparecem em banner de aposta (sem
// cores: "red" casaria com qualquer seta vermelha).
export const GLOSSARIO = {
  moeda: 'coin', moedas: 'coin', medalhao: 'medallion coin', medalha: 'medal',
  envelope: 'envelope', envelopes: 'envelope', telegram: 'telegram paper plane',
  aviao: 'paper plane', orbe: 'orb sphere magic', bola: 'ball',
  raio: 'lightning bolt', raios: 'lightning bolt', coroa: 'crown', bau: 'treasure chest', ficha: 'casino chip poker',
  dado: 'dice', dados: 'dice', trofeu: 'trophy cup', presente: 'gift box present', fogo: 'fire flame',
  estrela: 'star', estrelas: 'star', diamante: 'diamond gem', joia: 'gem jewel', cartas: 'playing cards', carta: 'playing card',
  sino: 'bell', relogio: 'clock', foguete: 'rocket', celular: 'phone mobile', escudo: 'shield', chave: 'key',
  coracao: 'heart', trevo: 'clover', ferradura: 'horseshoe', saco: 'money bag', dinheiro: 'money cash', nota: 'banknote money',
};

export function termosDoNo(no) {
  const texto = `${no.id} ${no.descricao ?? ''} ${no.tema ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const termos = new Set();
  for (const palavra of texto.split(/[^a-z0-9]+/)) for (const t of (GLOSSARIO[palavra] ?? '').split(' ').filter(Boolean)) termos.add(t);
  return [...termos].join(' ');
}

// Itens com nome que descreve o objeto: os públicos e os que a oficina já fez
// (guardados com as palavras da descrição). Camadas exportadas só têm nome de arquivo.
const temNome = (item) => item.fonte === 'publicos' || (item.tags ?? []).includes('oficina-elementos');

async function consultaDe(png) {
  return { visual: await embeddingDeImagem(await sobreFundoNeutro(png)), forma: await descritorForma(png) };
}

export async function planejar(banco, grafo, { referencias = [], k = 4, limiares = LIMIARES_PLANO } = {}) {
  const arquivoReferencia = acharReferencia(grafo, referencias);
  const nos = [];
  for (const no of grafo.nos) {
    if (!noRecortavel(no) || no.tipo === 'efeito') continue;
    const papel = PAPEL_DO_TIPO[no.tipo] ?? 'elemento';
    let recorte = await recortarNoDoGrafo(grafo, no, arquivoReferencia);
    // Grupo: busca pelo maior pedaço (uma moeda acha moeda; o grupo inteiro é ruído).
    let porPedaco = false;
    if (no.tipo === 'objeto_grupo') {
      const partes = await separarPartes(recorte);
      if (partes.length > 1) { recorte = partes[0].png; porPedaco = true; }
    }
    // Mascote e fundo só têm equivalente no que é nosso; elementos também nos públicos.
    const fontes = papel === 'elemento' ? ['criados', 'publicos'] : ['criados'];
    let resultados = buscar(banco, await consultaDe(recorte), { k: papel === 'elemento' ? 400 : 12, fontes, papel: papel === 'elemento' ? undefined : papel });
    // Elementos: vetor público só vale se o nome concorda com o que a parte é (o CLIP
    // pequeno confunde envelope com bandeira em recorte pequeno). O nosso material
    // (sem nome descritivo) vale pela imagem.
    const termos = papel === 'elemento' ? termosDoNo(no) : '';
    if (termos) {
      resultados = reordenarPorNome(resultados, termos, { peso: 0.03 })
        .filter((r) => !temNome(r.item) || r.acertos > 0);
    }
    // Nosso fundo ou mascote não serve de elemento.
    if (papel === 'elemento') resultados = resultados.filter((r) => r.item.fonte !== 'criados' || r.item.papel === 'elemento');
    resultados = resultados.slice(0, 12);
    const decisao = decidir(resultados, { tipo: 'imagem', limiares });
    nos.push({
      no: no.id,
      tipo: no.tipo,
      papel,
      caixa: no.caixa ?? null,
      z: no.z ?? 0,
      descricao: no.descricao ?? null,
      quantidade: no.quantidade ?? null,
      consulta: porPedaco ? 'maior pedaço do grupo' : 'recorte do nó',
      termos: termos || null,
      acao: decisao.acao,
      motivo: decisao.motivo,
      base: decisao.base ? resumo(decisao.base) : null,
      candidatos: resultados.slice(0, k).map(resumo),
      _recorte: recorte,
      _resultados: resultados.slice(0, k),
    });
  }
  return { peca: grafo.peca, referencia: path.basename(arquivoReferencia), formato: grafo.formato_peca, tamanho_px: grafo.tamanho_px, nos };
}

function resumo(r) {
  return { id: r.item.id, fonte: r.item.fonte, titulo: r.item.titulo, formato: r.item.formato, licenca: r.item.licenca, nota: +r.nota.toFixed(4) };
}

// Versão para gravar em JSON (sem os buffers).
export function planoParaJson(plano) {
  return { ...plano, nos: plano.nos.map(({ _recorte, _resultados, ...resto }) => resto) };
}
