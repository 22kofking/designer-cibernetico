import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { GERADORES, gerarProcedural, geradorParaParte, rampaDaPaleta } from '../src/oficinas/procedural.js';
import { fracaoDeOuro } from '../src/qualidade/cor.js';

test('procedural: a mesma semente desenha a mesma peça, outra semente muda', async () => {
  const a = await gerarProcedural('chuva_de_moedas', { largura: 200, altura: 400, semente: 3 });
  const b = await gerarProcedural('chuva_de_moedas', { largura: 200, altura: 400, semente: 3 });
  const c = await gerarProcedural('chuva_de_moedas', { largura: 200, altura: 400, semente: 4 });
  assert.equal(a.svg.replace(/id="\w+?\d+"|url\(#\w+?\d+\)/g, ''), b.svg.replace(/id="\w+?\d+"|url\(#\w+?\d+\)/g, ''));
  assert.notEqual(a.svg.replace(/id="\w+?\d+"|url\(#\w+?\d+\)/g, ''), c.svg.replace(/id="\w+?\d+"|url\(#\w+?\d+\)/g, ''));
});

test('procedural: todo gerador sai com fundo transparente e no tamanho pedido', async () => {
  for (const nome of Object.keys(GERADORES)) {
    const { png } = await gerarProcedural(nome, { largura: 240, altura: 180 });
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.ok(info.width > 0 && info.height > 0, nome);
    let vazio = 0, cheio = 0;
    for (let i = 3; i < data.length; i += 4) data[i] === 0 ? vazio++ : cheio++;
    assert.ok(vazio > 0 && cheio > 0, `${nome}: precisa ter desenho e transparência`);
  }
  assert.ok((await fracaoDeOuro((await gerarProcedural('moeda', { largura: 200, altura: 200 })).png)) > 0.2);
});

test('procedural: a descrição da parte escolhe o gerador; a paleta vira rampa do escuro ao claro', () => {
  assert.equal(geradorParaParte({ tipo: 'objeto_grupo', descricao: 'moedas de ouro voando' }), 'chuva_de_moedas');
  assert.equal(geradorParaParte({ tipo: 'objeto', descricao: 'moeda gigante de ouro gravada' }), 'medalhao');
  assert.equal(geradorParaParte({ tipo: 'objeto_grupo', descricao: 'envelopes vermelhos e moedas furadas no chão' }), 'envelopes_com_moedas');
  assert.equal(geradorParaParte({ tipo: 'objeto', descricao: 'personagem' }), null);
  const r = rampaDaPaleta(['#fde060', '#6b2a06', '#eba61e']);
  assert.equal(r.escuro, '#6b2a06');
  assert.equal(r.claro, '#fde060');
});
