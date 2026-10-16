import sys; sys.path.insert(0, '.')
from concurrent.futures import ThreadPoolExecutor
from rp import rodar, data_uri
VESTIR = ("Dress the character in image 1 in the exact same outfit and accessories worn by the character in image 2: {roupa}. "
          "Keep everything else from image 1 unchanged: the same character, species, body proportions, face, sunglasses, A-pose, full body framing and 2D comic art style with thick black outlines. "
          "Do not copy the pose or the body of image 2, only the clothes. Plain light grey studio background, no text.")
ROUPAS = {'farao': 'striped blue and gold pharaoh nemes headdress with a gold cobra, wide gold and turquoise collar, gold arm bracers and a gold belt with a white kilt',
          'mago': 'long red wizard robe with gold trim and a hood'}
def um(p):
    base, roupa, saida = p
    return rodar('qwen-image-edit-2511', {'prompt': VESTIR.format(roupa=ROUPAS[roupa]), 'images': [data_uri(base), data_uri(f'roupa-{roupa}-fundo.png')], 'size': '1024*1280', 'seed': 5, 'output_format': 'png'}, saida)
pedidos = [tuple(a.split(':')) for a in sys.argv[1:]]
with ThreadPoolExecutor(3) as ex: list(ex.map(um, pedidos))
