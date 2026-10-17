#!/usr/bin/env node
// Equipe de agentes (npm run peca -- ...).
//
//   produzir <grafo.json> [--marca marcas/capivara362.json] [--rodadas 3] [--saida pasta] [--referencias pasta] [--gerar --teto 0.05]
//       diretor → especialistas → crítico (refaz só a parte que errou) → cena.json, prévia, PSD, relatorio.json, prancha.png
//       --gerar: fundo, mascote e objeto na mão nascem separados pelo gateway (precisa de GATEWAY_URL, GATEWAY_CHAVE e --teto)
//   componentes <grafo.json> [--marca ...]
//       mostra o que a geração por componentes pediria ao gateway e quanto custaria (não gasta nada)
//   guardar <pasta da peça> --aprovado-por Nome
//       bibliotecário: guarda a peça aprovada no banco (criados)
//
// Sem --gerar nada gasta gateway: as opções vêm do banco, do desenho por código e das montagens.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Banco } from '../banco/armazem.js';
import { lerGrafo } from '../desconstrucao/grafo.js';
import { guardarPeca } from '../agentes/bibliotecario.js';
import { lerMarca } from '../agentes/diretor.js';
import { custoDosPedidos, pedidosDaPeca } from '../geracao/componentes.js';
import { configDoGateway } from '../oficinas/gateway.js';
import { lerPersonagem } from '../mascote/personagem.js';
import { exportarPsd } from './psd.js';
import { produzir } from '../agentes/orquestrador.js';

const COM_VALOR = ['--marca', '--rodadas', '--saida', '--referencias', '--aprovado-por', '--teto'];
function opcao(args, nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
}
const posicionais = (args) => args.filter((a, i) => !a.startsWith('--') && !COM_VALOR.includes(args[i - 1]));

async function principal(args) {
  const [comando, ...resto] = args;
  const banco = await Banco.abrir();

  if (comando === 'produzir') {
    if (resto.includes('--gerar')) {
      if (!configDoGateway()) throw new Error('--gerar precisa de GATEWAY_URL e GATEWAY_CHAVE no ambiente (veja o plano com: npm run peca -- componentes <grafo>)');
      if (!(Number(opcao(resto, 'teto', 0)) > 0)) throw new Error('--gerar precisa de --teto (US$), por exemplo --teto 0.05');
    }
    const marca = await lerMarca(opcao(resto, 'marca', 'marcas/capivara362.json'));
    for (const arquivo of posicionais(resto)) {
      const grafo = await lerGrafo(arquivo);
      const pasta = path.resolve(opcao(resto, 'saida', path.join('/mnt/project-files/pecas', marca.nome)), grafo.peca);
      const r = await produzir(banco, grafo, marca, pasta, {
        referencias: [opcao(resto, 'referencias', '/mnt/project-files/gera-imagem/9pmbet/referencias')],
        rodadas: Number(opcao(resto, 'rodadas', 3)),
        aoProgredir: (m) => console.error(`[${grafo.peca}] ${m}`),
        gerar: resto.includes('--gerar'),
        teto: Number(opcao(resto, 'teto', 0)),
      });
      const cena = JSON.parse(await readFile(path.join(pasta, 'cena.json'), 'utf8'));
      r.psd = await exportarPsd(cena, pasta, path.join(pasta, `${cena.nome}.psd`));
      const { historico, ...resumo } = r;
      console.log(JSON.stringify({ pasta, ...resumo, partes: r.partes.map((p) => `${p.ok ? 'ok' : 'X '} ${p.no} ΔE ${p.delta} (${p.opcao})${p.problemas.length ? `: ${p.problemas.join('; ')}` : ''}`) }, null, 2));
    }
    return;
  }

  if (comando === 'componentes') {
    const marca = await lerMarca(opcao(resto, 'marca', 'marcas/capivara362.json'));
    const personagem = marca.personagem ? await lerPersonagem(marca.personagem) : null;
    for (const arquivo of posicionais(resto)) {
      const grafo = await lerGrafo(arquivo);
      const formato = { largura: grafo.tamanho_px[0] * 2, altura: grafo.tamanho_px[1] * 2 };
      const pedidos = pedidosDaPeca(grafo, marca, personagem, { formato });
      console.log(JSON.stringify({ peca: grafo.peca, tema: grafo.tema, custo_usd: custoDosPedidos(pedidos), pedidos }, null, 2));
    }
    return;
  }

  if (comando === 'guardar') {
    const [pasta] = posicionais(resto);
    console.log(JSON.stringify(await guardarPeca(banco, path.resolve(pasta), { aprovadoPor: opcao(resto, 'aprovado-por') }), null, 2));
    return;
  }

  console.error((await readFile(new URL(import.meta.url), 'utf8')).split('\n').slice(1, 14).join('\n'));
  process.exitCode = 2;
}

principal(process.argv.slice(2)).catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
