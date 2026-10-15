#!/usr/bin/env node
// Mascote em partes e personagem travado (npm run mascote -- ...).
//
//   partes <receita.json> [--nao-guardar]            separa o mascote em camadas (corpo + partes) e guarda no banco
//   conferir <imagem.png>                            parece o personagem? saiu infantil?
//   prompt --tema telegram [--figurino mago] [--segura "..."]   prompt travado de uma pose
//   pose --tema telegram --teto 0.02 [--quantas 2] [--fundo ia]
//                                                    gera pose pelo gateway, confere e guarda as aprovadas
//   fundo <imagem.png> [--saida recorte.png]         tira o fundo com o BiRefNet (personagem inteiro)
//   trocar <cena.json> --no mascote --montagem montagem.json [--parte orbe --por desenho.png]
//                                                    põe o mascote em camadas na cena (grava cena-mascote.json)
//
// --personagem escolhe a ficha (padrão personagens/capivara362-a/personagem.json).
import path from 'node:path';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { Banco } from '../banco/armazem.js';
import { importarArquivo, slug } from '../banco/importar.js';
import { celula, montarPrancha } from '../banco/prancha.js';
import { lerMontagem, mascoteNaCena, montar, raizDosMascotes } from '../mascote/montagem.js';
import { tirarFundoIA } from '../mascote/fundo.js';
import { conferirPersonagem, gerarPose, lerPersonagem, promptDaPose } from '../mascote/personagem.js';
import { carregarCena } from './render-node.js';

const COM_VALOR = ['--personagem', '--tema', '--figurino', '--segura', '--teto', '--quantas', '--no', '--montagem', '--parte', '--por', '--saida', '--semente', '--fundo'];
function opcao(args, nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
}
const posicionais = (args) => args.filter((a, i) => !a.startsWith('--') && !COM_VALOR.includes(args[i - 1]));

async function principal(args) {
  const [comando, ...resto] = args;
  const personagem = await lerPersonagem(opcao(resto, 'personagem', 'personagens/capivara362-a/personagem.json'));

  if (comando === 'prompt') {
    console.log(JSON.stringify(promptDaPose(personagem, { tema: opcao(resto, 'tema'), figurino: opcao(resto, 'figurino'), segura: opcao(resto, 'segura') }), null, 2));
    return;
  }

  const banco = await Banco.abrir();

  if (comando === 'partes') {
    const [arquivo] = posicionais(resto);
    const receita = JSON.parse(await readFile(arquivo, 'utf8'));
    const { montagem, pasta } = await montar(banco, personagem, receita, { guardar: !resto.includes('--nao-guardar') });
    const celulas = [];
    const legenda = (c) => c.qa ? `QA ${c.qa.aprovado ? 'ok' : 'reprovou'} · separador ${c.nota_separador}` : c.remendado ? `com remendo (nitidez ${c.nitidez_remendo})` : '';
    for (const c of montagem.camadas) celulas.push(await celula(path.join(pasta, c.arquivo), [`${c.id} (${c.papel})`, legenda(c), c.banco ?? 'não guardado'], c.papel !== 'corpo'));
    await montarPrancha(celulas, path.join(pasta, 'prancha.png'));
    console.log(JSON.stringify({ pasta, camadas: montagem.camadas.map(({ id, papel, caixa, banco: b, qa, nitidez_remendo }) => ({ id, papel, caixa, banco: b, qa, nitidez_remendo })) }, null, 2));
    return;
  }

  if (comando === 'fundo') {
    const [arquivo] = posicionais(resto);
    const destino = path.resolve(opcao(resto, 'saida', arquivo.replace(/\.\w+$/, '-sem-fundo.png')));
    await writeFile(destino, await tirarFundoIA(await readFile(arquivo)));
    console.log(JSON.stringify({ arquivo: destino }, null, 2));
    return;
  }

  if (comando === 'conferir') {
    const [arquivo] = posicionais(resto);
    console.log(JSON.stringify(await conferirPersonagem(banco, personagem, await readFile(arquivo)), null, 2));
    return;
  }

  if (comando === 'pose') {
    const tema = opcao(resto, 'tema');
    const r = await gerarPose(banco, personagem, {
      tema, figurino: opcao(resto, 'figurino'), segura: opcao(resto, 'segura'),
      quantas: Number(opcao(resto, 'quantas', 2)), teto: Number(opcao(resto, 'teto', 0)), semente: opcao(resto, 'semente') && Number(opcao(resto, 'semente')), fundo: opcao(resto, 'fundo', 'cor'),
    });
    const pasta = path.resolve(opcao(resto, 'saida', path.join(raizDosMascotes(), personagem.nome, 'poses')));
    await mkdir(pasta, { recursive: true });
    const saida = [];
    for (const [i, t] of r.tentativas.entries()) {
      const nome = `${tema ?? r.figurino}-${Date.now()}-${i + 1}.png`;
      await writeFile(path.join(pasta, nome), t.png);
      let guardado = null;
      if (t.conferencia.aprovado) {
        const item = await importarArquivo(banco, path.join(pasta, nome), {
          id: slug(`${personagem.nome}-pose-${nome}`), fonte: 'criados', titulo: `${personagem.nome} ${r.figurino} (${tema ?? 'livre'})`,
          tags: ['mascote', 'pose', r.figurino, tema, personagem.nome].filter(Boolean), papel: 'mascote', licenca: 'nossa (gerado pelo gateway, Z-Image Turbo Apache 2.0)',
          origem: { como: 'pose pelo gateway com personagem travado', prompt: r.prompt, job: t.job, semente: t.semente, conferencia: t.conferencia },
        });
        guardado = `criados/${item.id}`;
      }
      saida.push({ arquivo: path.join(pasta, nome), aprovado: t.conferencia.aprovado, problemas: t.conferencia.problemas, parecido: t.conferencia.parecido, infantil: t.conferencia.infantil, guardado });
    }
    await banco.salvar();
    console.log(JSON.stringify({ figurino: r.figurino, gasto_usd: r.gasto, tentativas: saida }, null, 2));
    return;
  }

  if (comando === 'trocar') {
    const [arquivoCena] = posicionais(resto);
    const cena = await carregarCena(arquivoCena);
    const pastaCena = path.dirname(path.resolve(arquivoCena));
    const idNo = opcao(resto, 'no', 'mascote');
    const no = cena.nos.find((n) => n.id === idNo);
    if (!no) throw new Error(`a cena não tem o nó "${idNo}"`);
    const arqMontagem = path.resolve(opcao(resto, 'montagem'));
    const montagem = await lerMontagem(arqMontagem);
    await mkdir(path.join(pastaCena, 'assets'), { recursive: true });
    const assets = {};
    for (const c of montagem.camadas) {
      const destino = `assets/${montagem.nome}-${c.arquivo}`;
      await copyFile(path.join(path.dirname(arqMontagem), c.arquivo), path.join(pastaCena, destino));
      assets[c.id] = destino;
    }
    const trocas = {};
    if (opcao(resto, 'parte') && opcao(resto, 'por')) {
      const por = path.resolve(opcao(resto, 'por'));
      const destino = `assets/${path.basename(por)}`;
      await copyFile(por, path.join(pastaCena, destino));
      trocas[opcao(resto, 'parte')] = { asset: destino, origem: { fonte: 'criados', como: `troca da parte ${opcao(resto, 'parte')}`, licenca: 'nossa' } };
    }
    const camadas = mascoteNaCena(montagem, { id: idNo, caixa: no.caixa, formato: cena.formato, ancora: no.ancora ?? 'base', trocas, assetDe: (c) => assets[c.id] });
    const i = cena.nos.indexOf(no);
    cena.nos.splice(i, 1, ...camadas);
    const destino = path.join(pastaCena, opcao(resto, 'saida', 'cena-mascote.json'));
    await writeFile(destino, JSON.stringify(cena, null, 2));
    console.log(JSON.stringify({ cena: destino, camadas: camadas.map((c) => c.id) }, null, 2));
    return;
  }

  console.error((await readFile(new URL(import.meta.url), 'utf8')).split('\n').slice(1, 14).join('\n'));
  process.exitCode = 2;
}

principal(process.argv.slice(2)).catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
