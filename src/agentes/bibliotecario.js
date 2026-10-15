// Bibliotecário: depois que o dono aprova uma peça, guarda no banco como "criados"
// (a prévia e a cena que a refaz), para a próxima peça reusar. Nunca guarda sem
// a aprovação de quem pediu: o crítico aprovar não basta.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { importarArquivo, slug } from '../banco/importar.js';

export async function guardarPeca(banco, pasta, { aprovadoPor } = {}) {
  if (!aprovadoPor) throw new Error('o bibliotecário só guarda peça aprovada pelo dono (passe quem aprovou)');
  const relatorio = JSON.parse(await readFile(path.join(pasta, 'relatorio.json'), 'utf8'));
  const item = await importarArquivo(banco, path.join(pasta, 'previa.png'), {
    id: slug(`${relatorio.marca}-peca-${relatorio.peca}`),
    fonte: 'criados',
    titulo: `${relatorio.marca}: ${relatorio.peca}`,
    tags: ['peca', 'aprovada', relatorio.marca, relatorio.tema].filter(Boolean),
    papel: 'peca',
    licenca: 'nossa',
    origem: { como: 'equipe de agentes', cena: relatorio.cena, delta_peca: relatorio.delta_peca, aprovado_por: aprovadoPor, aprovado_em: new Date().toISOString() },
  });
  await banco.salvar();
  return { banco: `criados/${item.id}` };
}
