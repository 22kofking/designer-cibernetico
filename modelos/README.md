# Modelos: bases de dados e processos

Este repositório guarda o que define os mascotes e as pegadas: fichas (JSON), scripts, documentos de processo.
As imagens pesadas (PNG, PSD, ZIP, LoRA) não entram no git; ficam em /mnt/project-files e estão listadas em INVENTARIO-BINARIOS.md.

## Estrutura
- `mascotes/boneco/`: boneco padrão (B1 a B3). Esqueleto, poses, bichos, figurinos, pegadas de mão e de corpo, scripts de corte, montagem, composição por IA, tratamento e edição.
  - `modelo/poses/` e `modelo/esqueleto.json`: 7 poses e o esqueleto padrão.
  - `modelo/maos/`: padrão de mão (21 pontos), 13 pegadas, objetos e 14 poses de pegada em relação ao corpo (`pegadas-corpo.json`). Regras e fontes em `PADRAO-MAOS.md`.
  - `bichos/` e `figurinos/`: kit de cada bicho e manequim do faraó.
  - `scripts/`: cortar, montar, compor_ia (RunPod, precisa de RUNPOD_API_KEY por variável), tratar, editar_photocraft.sh.
- `mascotes/workflow-teste/`: teste de ComfyUI com LoRA do tucano (scripts de pod, dataset, geração; workflows JSON).
- `mascotes/padrao-folha/testes/`: testes da folha de ângulos e de vestir o manequim.
- `processos/`: documentos de arquitetura e de processo (estrutura, camadas, decomposição, model sheet, pesquisa de GPU).

## Regras
- Nenhuma chave de API nos arquivos. Chaves ficam em variáveis de ambiente.
- Gasto de IA sempre com teto. Os scripts que gastam exigem `--teto`.
- Paths apontam para /mnt/project-files; os scripts não rodam fora dele sem ajuste.
