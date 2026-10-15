// Banco de referências: onde ficam os itens e o índice de busca.
//
// No disco (BANCO_DIR, padrão /mnt/project-files/banco):
//   itens/<fonte>/<id>/original.<ext>   arquivo como veio (svg, png, webp, vectorcraft)
//   itens/<fonte>/<id>/miniatura.png    256 px, fundo transparente (o que a busca "vê")
//   indice.jsonl                        um item por linha (metadados, licença, origem)
//   vetores.f32                         embedding visual (CLIP) de cada item, na ordem do índice
//   forma.f32                           descritor de silhueta de cada item, na mesma ordem
//
// Sem banco de dados: o índice cabe na memória (10 mil itens ~ 30 MB) e a busca é
// força bruta, o que basta para este tamanho e funciona bem numa pasta de rede.
// O banco fica fora do git: tem recortes de concorrentes, que nunca entram no repositório.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const FONTES = ['criados', 'referencias', 'publicos'];
export const DIM_VISUAL = 512;
export const DIM_FORMA = 257;

export function raizDoBanco() {
  return process.env.BANCO_DIR ?? '/mnt/project-files/banco';
}

export function pastaDoItem(raiz, item) {
  return path.join(raiz, 'itens', item.fonte, item.id);
}

function lerF32(buffer, dim) {
  const f = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  const linhas = [];
  for (let i = 0; i < f.length; i += dim) linhas.push(f.slice(i, i + dim));
  return linhas;
}

function juntarF32(linhas, dim) {
  const f = new Float32Array(linhas.length * dim);
  linhas.forEach((v, i) => f.set(v, i * dim));
  return Buffer.from(f.buffer);
}

export class Banco {
  constructor(raiz = raizDoBanco()) {
    this.raiz = raiz;
    this.itens = [];
    this.visual = [];
    this.forma = [];
  }

  static async abrir(raiz = raizDoBanco()) {
    const b = new Banco(raiz);
    const indice = path.join(raiz, 'indice.jsonl');
    if (!existsSync(indice)) return b;
    const texto = await readFile(indice, 'utf8');
    b.itens = texto.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    b.visual = lerF32(await readFile(path.join(raiz, 'vetores.f32')), DIM_VISUAL);
    b.forma = lerF32(await readFile(path.join(raiz, 'forma.f32')), DIM_FORMA);
    if (b.visual.length !== b.itens.length || b.forma.length !== b.itens.length) {
      throw new Error(`banco corrompido em ${raiz}: ${b.itens.length} itens, ${b.visual.length} vetores, ${b.forma.length} formas`);
    }
    return b;
  }

  tem(fonte, id) {
    return this.itens.some((i) => i.fonte === fonte && i.id === id);
  }

  // Acrescenta ou substitui (mesma fonte + id).
  colocar(item, visual, forma) {
    if (!FONTES.includes(item.fonte)) throw new Error(`fonte desconhecida: ${item.fonte}`);
    if (!item.licenca) throw new Error(`item ${item.id} sem licença: não entra no banco`);
    const i = this.itens.findIndex((x) => x.fonte === item.fonte && x.id === item.id);
    if (i >= 0) {
      this.itens[i] = item;
      this.visual[i] = visual;
      this.forma[i] = forma;
    } else {
      this.itens.push(item);
      this.visual.push(visual);
      this.forma.push(forma);
    }
  }

  // Grava em arquivos temporários e troca de uma vez, para nunca deixar o índice pela metade.
  async salvar() {
    await mkdir(this.raiz, { recursive: true });
    const arquivos = {
      'indice.jsonl': this.itens.map((i) => JSON.stringify(i)).join('\n') + '\n',
      'vetores.f32': juntarF32(this.visual, DIM_VISUAL),
      'forma.f32': juntarF32(this.forma, DIM_FORMA),
    };
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      await writeFile(path.join(this.raiz, `${nome}.novo`), conteudo);
    }
    for (const nome of Object.keys(arquivos)) {
      await rename(path.join(this.raiz, `${nome}.novo`), path.join(this.raiz, nome));
    }
  }

  resumo() {
    const porFonte = {};
    for (const i of this.itens) porFonte[i.fonte] = (porFonte[i.fonte] ?? 0) + 1;
    return { total: this.itens.length, porFonte };
  }
}
