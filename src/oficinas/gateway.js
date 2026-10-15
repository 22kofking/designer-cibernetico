// Cliente do gateway-imagem (POST /v1/images, GET /v1/jobs/{id}).
// A IA só entrega matéria-prima; quem acaba a peça é o VectorCraft.
// Endereço e chave vêm do ambiente (GATEWAY_URL, GATEWAY_CHAVE), nunca de arquivo.

export const CUSTO_POR_IMAGEM = { rapido: 0.005, texto: 0.02 };

export function configDoGateway() {
  const url = process.env.GATEWAY_URL;
  const chave = process.env.GATEWAY_CHAVE;
  if (!url || !chave) return null;
  return { url: url.replace(/\/$/, ''), chave };
}

// Prompt de matéria-prima: forma chapada, contorno grosso, fundo liso para recortar.
export function promptDeElemento(descricao) {
  return `${descricao}, flat 2D vector illustration, bold simple shapes, thick black outlines, centered, isolated on plain light grey background, no text, no shadow on background`;
}

function urlDaImagem(job) {
  const img = job.images?.[0] ?? job.output?.images?.[0];
  return typeof img === 'string' ? img : img?.url;
}

export async function gerarImagem({ descricao, prompt, modelo = 'rapido', tamanho = '1024x1024', semente, quantas = 1, teto }) {
  const cfg = configDoGateway();
  if (!cfg) throw new Error('gerar precisa de GATEWAY_URL e GATEWAY_CHAVE no ambiente');
  if (!(teto > 0)) throw new Error('gerar precisa de um teto de gasto (--teto em US$)');
  const custo = (CUSTO_POR_IMAGEM[modelo] ?? 0.02) * quantas;
  if (custo > teto) throw new Error(`gerar ${quantas} imagem(ns) custa ~US$ ${custo.toFixed(3)}, acima do teto de US$ ${teto}`);
  const cabecalho = { authorization: `Bearer ${cfg.chave}`, 'content-type': 'application/json' };
  const saida = [];
  let gasto = 0;
  for (let i = 0; i < quantas; i++) {
    const corpo = { prompt: prompt ?? promptDeElemento(descricao), model: modelo, size: tamanho, wait: true };
    if (semente != null) corpo.seed = semente + i;
    let r = await fetch(`${cfg.url}/v1/images`, { method: 'POST', headers: cabecalho, body: JSON.stringify(corpo) });
    if (!r.ok) throw new Error(`gateway respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
    let job = await r.json();
    for (let tentativa = 0; !urlDaImagem(job) && tentativa < 60; tentativa++) {
      if (job.status === 'failed' || job.error) throw new Error(`geração falhou: ${job.error ?? job.status}`);
      await new Promise((ok) => setTimeout(ok, 2000));
      r = await fetch(`${cfg.url}/v1/jobs/${job.id}`, { headers: cabecalho });
      job = await r.json();
    }
    const url = urlDaImagem(job);
    if (!url) throw new Error('o gateway não devolveu imagem a tempo');
    const img = await fetch(url);
    if (!img.ok) throw new Error(`não consegui baixar a imagem gerada (${img.status})`);
    gasto += job.cost_usd ?? CUSTO_POR_IMAGEM[modelo] ?? 0;
    saida.push({ png: Buffer.from(await img.arrayBuffer()), job: job.id, prompt: corpo.prompt, semente: corpo.seed ?? null });
  }
  return { imagens: saida, gasto };
}
