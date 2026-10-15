// Montagem do mascote: a receita (personagens/<nome>/montagens/<x>.json, com os
// pontos de cada parte) vira arquivos de partes + montagem resolvida com as caixas,
// guardados no banco como "criados". Na cena, o mascote entra como camadas (corpo
// atrás, partes na frente) e qualquer parte pode ser trocada por outro desenho.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pastaDoItem } from '../banco/armazem.js';
import { importarArquivo, slug } from '../banco/importar.js';
import { encaixar } from '../nucleo/cena.js';
import { separarEmPartes } from './partes.js';

export function raizDosMascotes() {
  return process.env.MASCOTES_DIR ?? '/mnt/project-files/mascotes';
}

export function arquivoDaFonte(banco, fonte) {
  const [f, id] = fonte.split('/');
  const item = banco.itens.find((x) => x.fonte === f && x.id === id);
  if (!item) throw new Error(`a montagem aponta para ${fonte}, que não está no banco`);
  return { item, arquivo: path.join(pastaDoItem(banco.raiz, item), item.arquivos.original) };
}

// Separa, grava as partes, guarda no banco e devolve a montagem resolvida.
export async function montar(banco, personagem, receita, { pasta = path.join(raizDosMascotes(), personagem.nome, receita.nome), guardar = true, segmentador } = {}) {
  const { item, arquivo } = arquivoDaFonte(banco, receita.fonte);
  const png = await readFile(arquivo);
  const r = await separarEmPartes(png, receita.partes, segmentador ? { segmentador } : {});
  await mkdir(pasta, { recursive: true });
  const camadas = [];
  for (const parte of [r.corpo, ...r.partes]) {
    const nome = `${parte.id}.png`;
    await writeFile(path.join(pasta, nome), parte.png);
    const camada = { id: parte.id, papel: parte.papel, z: parte.z, caixa: parte.caixa, arquivo: nome };
    if (parte.nota != null) camada.nota_separador = parte.nota;
    if (parte.remendado) camada.remendado = true;
    if (parte.nitidez_remendo != null) camada.nitidez_remendo = parte.nitidez_remendo;
    if (parte.alerta) camada.alerta = parte.alerta;
    if (parte.qa) camada.qa = { aprovado: parte.qa.aprovado, problemas: parte.qa.problemas, alerta: parte.qa.alerta, escolha: parte.qa.escolha, medidas: parte.qa.medidas };
    if (guardar) {
      const salvo = await importarArquivo(banco, path.join(pasta, nome), {
        id: slug(`${personagem.nome}-${receita.nome}-${parte.id}`),
        fonte: 'criados',
        titulo: `${personagem.nome} ${receita.nome}: ${parte.id}`,
        tags: ['mascote', 'parte', parte.papel, receita.figurino, receita.tema, personagem.nome].filter(Boolean),
        papel: 'mascote',
        licenca: item.licenca,
        origem: { como: 'mascote em partes (SAM + QA do recorte + remendo)', base: receita.fonte, montagem: receita.nome, parte: parte.id },
      });
      camada.banco = `criados/${salvo.id}`;
    }
    camadas.push(camada);
  }
  if (guardar) await banco.salvar();
  const montagem = {
    personagem: personagem.nome,
    nome: receita.nome,
    figurino: receita.figurino ?? null,
    tema: receita.tema ?? null,
    fonte: receita.fonte,
    tamanho: r.tamanho,
    camadas: camadas.sort((a, b) => a.z - b.z),
  };
  await writeFile(path.join(pasta, 'montagem.json'), JSON.stringify(montagem, null, 2));
  return { montagem, pasta };
}

// Nós de cena do mascote em camadas. caixa: frações da peça (onde o mascote
// inteiro entra); formato: { largura, altura }; trocas: { idDaParte: { asset, origem } }.
// assetDe(camada) diz o caminho do asset de cada camada (relativo à cena).
export function mascoteNaCena(montagem, { id = 'mascote', caixa, formato, ancora = 'base', trocas = {}, assetDe }) {
  const px = { x: caixa.x * formato.largura, y: caixa.y * formato.altura, w: caixa.w * formato.largura, h: caixa.h * formato.altura };
  const [mw, mh] = montagem.tamanho;
  const lugar = encaixar(mw, mh, px, 'conter', ancora);
  const nos = [];
  for (const c of montagem.camadas) {
    const [cx, cy, cw, ch] = c.caixa;
    const fr = {
      x: +((lugar.x + cx * mw * lugar.escalaX) / formato.largura).toFixed(4),
      y: +((lugar.y + cy * mh * lugar.escalaY) / formato.altura).toFixed(4),
      w: +((cw * mw * lugar.escalaX) / formato.largura).toFixed(4),
      h: +((ch * mh * lugar.escalaY) / formato.altura).toFixed(4),
    };
    const troca = trocas[c.id];
    nos.push({
      id: `${id}-${c.id}`,
      papel: 'mascote',
      tipo: 'imagem',
      asset: troca?.asset ?? assetDe(c),
      caixa: fr,
      encaixe: troca ? 'conter' : 'esticar',
      origem: troca?.origem ?? { fonte: 'criados', como: `mascote em partes: ${montagem.nome}/${c.id}`, licenca: 'nossa' },
    });
  }
  return nos;
}

export async function lerMontagem(arquivo) {
  return JSON.parse(await readFile(arquivo, 'utf8'));
}
