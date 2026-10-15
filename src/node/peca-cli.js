#!/usr/bin/env node
// Equipe de agentes (npm run peca -- ...).
//
//   produzir <grafo.json> [--marca marcas/capivara362.json] [--rodadas 3] [--saida pasta] [--referencias pasta]
//       diretor → especialistas → crítico (refaz só a parte que errou) → cena.json, prévia, relatorio.json, prancha.png
//   guardar <pasta da peça> --aprovado-por Nome
//       bibliotecário: guarda a peça aprovada no banco (criados)
//
// Nada gasta gateway: as opções vêm do banco e das montagens do mascote.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Banco } from '../banco/armazem.js';
import { lerGrafo } from '../desconstrucao/grafo.js';
import { guardarPeca } from '../agentes/bibliotecario.js';
import { lerMarca } from '../agentes/diretor.js';
import { produzir } from '../agentes/orquestrador.js';

const COM_VALOR = ['--marca', '--rodadas', '--saida', '--referencias', '--aprovado-por'];
function opcao(args, nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
}
const posicionais = (args) => args.filter((a, i) => !a.startsWith('--') && !COM_VALOR.includes(args[i - 1]));

async function principal(args) {
  const [comando, ...resto] = args;
  const banco = await Banco.abrir();

  if (comando === 'produzir') {
    const marca = await lerMarca(opcao(resto, 'marca', 'marcas/capivara362.json'));
    for (const arquivo of posicionais(resto)) {
      const grafo = await lerGrafo(arquivo);
      const pasta = path.resolve(opcao(resto, 'saida', path.join('/mnt/project-files/pecas', marca.nome)), grafo.peca);
      const r = await produzir(banco, grafo, marca, pasta, {
        referencias: [opcao(resto, 'referencias', '/mnt/project-files/gera-imagem/9pmbet/referencias')],
        rodadas: Number(opcao(resto, 'rodadas', 3)),
        aoProgredir: (m) => console.error(`[${grafo.peca}] ${m}`),
      });
      const { historico, ...resumo } = r;
      console.log(JSON.stringify({ pasta, ...resumo, partes: r.partes.map((p) => `${p.ok ? 'ok' : 'X '} ${p.no} ΔE ${p.delta} (${p.opcao})${p.problemas.length ? `: ${p.problemas.join('; ')}` : ''}`) }, null, 2));
    }
    return;
  }

  if (comando === 'guardar') {
    const [pasta] = posicionais(resto);
    console.log(JSON.stringify(await guardarPeca(banco, path.resolve(pasta), { aprovadoPor: opcao(resto, 'aprovado-por') }), null, 2));
    return;
  }

  console.error((await readFile(new URL(import.meta.url), 'utf8')).split('\n').slice(1, 10).join('\n'));
  process.exitCode = 2;
}

principal(process.argv.slice(2)).catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
