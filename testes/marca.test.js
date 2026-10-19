import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarHex, coresDaCena, fontesDaCena, logosDaCena, mesclarKit, estiloDeDestaque, aplicarCorNo } from '../editor/marca.js';
import { adaptadorMemoria, criarArmazem } from '../editor/armazem.js';

const cena = () => ({
  formato: { largura: 100, altura: 50, fundo: '#050203' },
  fontes: [{ familia: 'Montserrat', peso: 900, arquivo: '../../assets/fontes/Montserrat-Black.ttf' }, { familia: 'Montserrat', peso: 900, arquivo: 'x.ttf' }],
  nos: [
    { id: 'faixa', tipo: 'retangulo', cor: '#F5C400' },
    { id: 'texto', tipo: 'bloco_texto', papel: 'texto', linhas: [{ texto: 'Área de', estilo: 'branco', peso: 1 }, { texto: 'VIP', estilo: 'amarelo', peso: 4 }],
      estilos: { branco: { rampa: [[0, '#fff'], [1, '#f7f5f0']] }, amarelo: { rampa: [[0, '#fef80c'], [1, '#fde804']] } }, sombra: { cor: '#000000' } },
    { id: 'logo', tipo: 'imagem', papel: 'logo', asset: 'assets/logo.png' },
    { id: 'grupo', tipo: 'grupo', filhos: [{ id: 'g1', tipo: 'retangulo', cor: '#f5c400' }] },
  ],
});

test('normalizarHex aceita 3 e 6 dígitos e recusa o resto', () => {
  assert.equal(normalizarHex('#FFF'), '#ffffff');
  assert.equal(normalizarHex(' #A1b2C3 '), '#a1b2c3');
  assert.equal(normalizarHex('red'), null);
  assert.equal(normalizarHex(undefined), null);
});

test('coresDaCena junta as cores da peça, sem repetir, das mais usadas para as menos', () => {
  const cores = coresDaCena(cena()).map((c) => c.hex);
  assert.equal(cores[0], '#f5c400', 'a mais usada (retângulo e grupo, mesmo em maiúscula) vem primeiro');
  assert.ok(cores.includes('#fef80c') && cores.includes('#ffffff') && cores.includes('#050203') && cores.includes('#000000'));
  assert.equal(new Set(cores).size, cores.length);
  assert.equal(coresDaCena(cena(), 3).length, 3);
});

test('fontes e logos saem com o endereço completo', () => {
  const base = 'https://mesa/exemplos/x/cena.json';
  const fontes = fontesDaCena(cena(), base);
  assert.equal(fontes.length, 1);
  assert.equal(fontes[0].arquivo, 'https://mesa/assets/fontes/Montserrat-Black.ttf');
  assert.deepEqual(logosDaCena(cena(), base), [{ nome: 'logo', asset: 'https://mesa/exemplos/x/assets/logo.png' }]);
});

test('mesclarKit acrescenta só o que falta', () => {
  const kit = { cores: [{ hex: '#111111' }], fontes: [], logos: [] };
  const novo = mesclarKit(kit, { cores: [{ hex: '#111111' }, { hex: '#222222' }], fontes: [{ familia: 'A', peso: 400 }], logos: [] });
  assert.deepEqual(novo.cores.map((c) => c.hex), ['#111111', '#222222']);
  assert.equal(novo.fontes.length, 1);
  assert.equal(mesclarKit(novo, novo).cores.length, 2);
});

test('aplicarCorNo: retângulo muda a cor; texto muda a linha de destaque, ou todas com Shift', () => {
  const c = cena();
  assert.match(aplicarCorNo(c.nos[0], '#123456'), /faixa/);
  assert.equal(c.nos[0].cor, '#123456');
  const t = c.nos[1];
  assert.equal(estiloDeDestaque(t), 'amarelo');
  aplicarCorNo(t, '#00ff00');
  assert.equal(t.estilos.amarelo.cor, '#00ff00');
  assert.equal(t.estilos.amarelo.rampa, undefined);
  assert.ok(t.estilos.branco.rampa, 'o estilo das outras linhas fica como estava');
  aplicarCorNo(t, '#0000ff', { todas: true });
  assert.equal(t.estilos.branco.cor, '#0000ff');
  assert.equal(aplicarCorNo(c.nos[2], '#000000'), null, 'imagem não tem cor');
  assert.equal(aplicarCorNo(c.nos[0], 'azul'), null);
});

test('armazém: modelos viram peças novas e marcas guardam o kit', async () => {
  const a = criarArmazem(adaptadorMemoria());
  const m = await a.salvarModelo({ nome: 'Banner home', categoria: 'ARARA519', cena: cena(), base: 'https://mesa/x/', miniatura: 'data:image/jpeg;base64,AA' });
  const original = (await a.lerModelo(m.id)).cena;
  const p = await a.criarPecaDeModelo(m.id, { projeto: 'campanha', nome: 'Home de Natal' });
  assert.equal(p.origem, null);
  assert.equal(p.base, 'https://mesa/x/');
  assert.equal(p.projeto, 'campanha');
  assert.deepEqual(p.cena, original);
  p.cena.nos.length = 0;
  assert.equal((await a.lerModelo(m.id)).cena.nos.length, 4, 'editar a peça não mexe no modelo');
  assert.deepEqual((await a.listarModelos()).map((x) => x.nome), ['Banner home']);
  await a.apagarModelo(m.id);
  assert.equal((await a.listarModelos()).length, 0);
  const marca = await a.criarMarca('ARARA519', { cores: [{ hex: '#f5c400' }] });
  await a.atualizarMarca(marca.id, { cores: [{ hex: '#f5c400' }, { hex: '#000000' }] });
  assert.equal((await a.listarMarcas())[0].cores.length, 2);
  assert.deepEqual((await a.listarMarcas())[0].fontes, []);
});

test('caminhoRelativo e mapearEnderecos: kits e fontes sem a versão da página', async () => {
  const { caminhoRelativo, paraRelativo } = await import('../editor/util.js');
  assert.equal(caminhoRelativo('https://x/p/mascotes/tatu/cena.json', 'https://x/p/arara/fontes/A.ttf'), '../../arara/fontes/A.ttf');
  assert.equal(caminhoRelativo('https://x/p/cena.json', 'https://x/p/assets/a.png'), 'assets/a.png');
  assert.equal(caminhoRelativo('https://x/p/a/cena.json', 'https://y/b.png'), 'https://y/b.png');
  globalThis.location = { href: 'https://x/_f/777-aa/' };
  assert.equal(paraRelativo('https://x/_f/123-zz/arara/img/logo.webp'), 'arara/img/logo.webp', 'versão antiga da página sai do endereço');
  assert.equal(paraRelativo('https://x/_f/777-aa/a.png'), 'a.png');
  assert.equal(paraRelativo('/_blob/abc'), '/_blob/abc');
  const { mapearEnderecos } = await import('../editor/marca.js');
  const kit = mapearEnderecos({ cores: [{ hex: '#000000' }], fontes: [{ familia: 'A', arquivo: 'https://x/_f/1-a/f.ttf' }, { familia: 'B' }], logos: [{ nome: 'l', asset: 'https://x/_f/1-a/l.png' }] }, paraRelativo);
  assert.deepEqual(kit.fontes, [{ familia: 'A', arquivo: 'f.ttf' }, { familia: 'B' }]);
  assert.equal(kit.logos[0].asset, 'l.png');
  assert.equal(kit.cores.length, 1);
});
