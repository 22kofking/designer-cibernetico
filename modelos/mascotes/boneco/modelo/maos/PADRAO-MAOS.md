# Padrão de mão: esqueleto e pegadas (16/10/2026, só especificação, nada gerado, custo zero)

Arquivos: `esqueleto-mao.json`, `pegadas.json`, `objetos.json`, `previa-pegadas.png` (desenho esquemático por código).
Gerados por `scripts/gerar_padrao_maos.py`; para mudar um ângulo, edite o script e rode de novo.

## 1. Esqueleto da mão (igual para todo bicho)
- 21 pontos, na ordem do OpenPose Hand e do MediaPipe (servem direto de entrada para ControlNet): pulso; polegar (cmc, mcp, ip, ponta); e para cada dedo (indicador, médio, anelar, mínimo) mcp, pip, dip e ponta.
- Medidas em fração do comprimento da mão (pulso até a ponta do médio = 1,0); o kit do bicho escala.
- Limites: dedos mcp -20 a 90, pip 0 a 110, dip 0 a 80 graus; polegar cmc 0 a 70, mcp 0 a 60, ip -10 a 80.
- Pulso: 4 orientações (palma para a câmera, dorso para a câmera, lado do polegar, lado do mindinho) e giro de -70 a 80 graus de flexão em relação ao antebraço.
- O esqueleto é sempre de 5 dedos; o bicho desenha 5, 4 (quadrinho) ou 3 (ave, garra).

## 2. Os 13 estilos de pegada
| Tipo | Pegada | Usos |
|---|---|---|
| Contato | aberta, palma plana, aponta, joinha | apresentar, parar, mostrar, aprovar |
| Força | punho, cilíndrica, empunhadura, esférica, gancho | taça, troféu, cajado, orbe, baú |
| Precisão | pinça, tripé, lateral, celular | moeda, ficha, envelope, cartão VIP, chave, celular |

Cada pegada traz: ângulos de cada dedo, abertura entre dedos, orientação do pulso, onde o objeto toca a mão
(contato), o que fica na frente do objeto (`ordem_das_camadas`, de baixo para cima) e os objetos que usa.

## 3. Camadas da mão e do objeto
`palma_dorso` > `polegar` > `dedos_atras` > OBJETO > `dedos_frente`. A pegada diz a ordem real: na esférica os dedos
ficam na frente do orbe; no celular os dedos ficam atrás e só o polegar aparece; na mão aberta o objeto repousa em cima da palma.

## 4. Objetos
`objetos.json` dá a cada objeto só um ponto de pega, um eixo e a pegada que usa (envelope e moeda pela pinça, orbe pela
esférica, celular pelo celular, taça e troféu pela cilíndrica, baú pelo gancho, cajado pela empunhadura, cartão VIP pelo tripé).

## 5. Ligação com as 7 poses
aponta = aponta; punho = punho; ergue = punho ou aberta; abertos = aberta; segura = esférica (duas mãos, centro do orbe no meio);
celular = celular; frente = aberta relaxada ou punho solto.

## 6. Pegada em relação ao corpo (`pegadas-corpo.json`, `previa-pegadas-corpo.png`, `scripts/gerar_pegadas_corpo.py`)
A mão não segura sozinha: cada pose diz **onde** a mão fica em relação ao corpo, **como o corpo compensa** o peso e a **ordem das camadas**.
- **Zonas** (14), medidas a partir de marcos do esqueleto, então valem para qualquer bicho: C = altura da cabeça, O = meia largura dos ombros,
  lado = -1 (mão direita do personagem) ou +1. Ex.: `mostrar` = centro ± 1,05·O na altura do rosto; `lateral_baixo` = ombro ± 0,25·O, quadril + 0,35·C;
  `acima_cabeca`, `rosto`, `peito_frente`, `cintura_frente`, `mao_no_quadril`, `selfie`, `ombro`, `frente_estendido`, `alca_peito`, `lateral_aberto`, `solto`.
- **Peso** muda o corpo: leve = mão livre, pose como está; médio = objeto perto do corpo, +5° contra a carga, joelhos levemente dobrados;
  pesado = objeto colado no tronco, 10 a 15° contra a carga, base larga, joelhos dobrados, ombro da carga desce, o outro braço abre de contrapeso.
- **14 poses de pegada**: mostrar, mostrar o celular, selfie, erguer com uma mão, erguer com as duas, segurar com as duas, abraçar a carga,
  carregar ao lado, carga no ombro, oferecer, cajado apoiado, examinar perto do rosto, jogar para o alto, carga nas costas. Cada uma traz zona e
  pegada de cada mão (ligada a `pegadas.json`), orientação do pulso, inclinação do tronco (frente/trás e lado), base, joelhos, perna de apoio,
  olhar, ordem das camadas com o objeto, temas e os ângulos dos braços (cinemática inversa no kit da capivara, mesma convenção de `modelo/poses`).
- Ligação com as 7 poses: frente = solto; ergue = erguer com uma mão; abertos = jogar para o alto; segura = segurar com as duas; celular = mostrar o celular.

### Regras tiradas das referências
1. Primeiro a postura do corpo, depois a mão (Posemy). 2. O centro de gravidade fica sobre os pés: carga à frente, tronco vai para trás;
carga de um lado, tronco inclina para o outro (mecânica corporal de animação). 3. Carga pesada fica colada ao corpo, base larga e joelhos
dobrados. 4. Uma mão só é a carga mais difícil e instável; o braço livre abre de contrapeso e o ombro da carga desce (ergonomia de carregar).
5. O peso fica numa perna e os ombros contrabalançam o quadril, pose assimétrica (Posemy, armas). 6. A silhueta precisa mostrar se é leve ou
pesado (Univ. de Washington). 7. O contato com o objeto não é só a mão: pode ser palma, braço, ombro, costas (taxonomia de corpo inteiro e GRAB).

### Fontes
- Taxonomia de poses de corpo inteiro com apoio: https://arxiv.org/abs/1503.06839
- GRAB, pegadas de corpo inteiro com objetos: https://is.mpg.de/ps/code/grab-a-dataset-of-whole-body-human-grasping-of-objects
- Taxonomia GRASP de Feix (33 pegadas): https://www.eng.yale.edu/grablab/pubs/Feix_THMS2016.pdf
- COCO-WholeBody (133 pontos, 21 por mão): https://arxiv.org/abs/2007.11858
- Posemy, mão segurando objeto: https://posemy.art/blog/drawing-hand-holding-object-guide/
- Posemy, poses segurando armas: https://posemy.art/blog/drawing-weapon-holding-poses-guide/
- Física na animação, peso e equilíbrio: https://www.animatorisland.com/principles-of-animation-physics-part-4/
- Mecânica corporal: https://3danimationyu.myblog.arts.ac.uk/2020/12/08/week7-body-mechanics/
- Univ. de Washington, poses de carga leve e pesada: https://courses.cs.washington.edu/courses/cse458/10au/content/projects_458/project6a/index.html
- Ergonomia dos modos de carregar: https://www.ncbi.nlm.nih.gov/pubmed/26212410

## Limites
A prévia do corpo é um boneco de palito, de frente, sem profundidade (o braço que vem para frente aparece encurtado só na descrição).
Os ângulos são uma primeira calibração e a prévia é esquemática (perfil, sem a profundidade dos dedos). Falta validar cada pegada
desenhada em um bicho (kit de mão) e, se for usar como controle de IA, converter os pontos em esqueleto de OpenPose Hand.
