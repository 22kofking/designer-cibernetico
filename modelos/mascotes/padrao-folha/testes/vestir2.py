import sys; sys.path.insert(0, '.')
from concurrent.futures import ThreadPoolExecutor
from rp import rodar, data_uri
V = ("Dress the character in image 1 in the exact same outfit and accessories worn by the character in image 2. "
     "Keep everything else from image 1 unchanged: the same jaguar character, body proportions, face, sunglasses, A-pose, full body framing and 2D comic art style with thick black outlines. "
     "Only the clothes come from image 2. Plain light grey studio background, no text.")
pares = [('vest-capivara-farao.png', 'vest-onca-farao.png'), ('vest-capivara-mago.png', 'vest-onca-mago.png')]
def um(p):
    roupa, saida = p
    return rodar('qwen-image-edit-2511', {'prompt': V, 'images': [data_uri('base-onca.png'), data_uri(roupa)], 'size': '1024*1280', 'seed': 5, 'output_format': 'png'}, saida)
with ThreadPoolExecutor(2) as ex: list(ex.map(um, pares))
