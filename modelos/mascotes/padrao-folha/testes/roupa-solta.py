import sys; sys.path.insert(0, '.')
from concurrent.futures import ThreadPoolExecutor
from rp import rodar, data_uri
R = ("Remove the character completely and keep only the outfit and accessories, displayed on an invisible ghost mannequin in the same front view and the same size and position: "
     "no head, no face, no fur, no skin, no hands, no feet, no body visible, only the clothes and accessories floating as a costume reference sheet. "
     "Same 2D comic art style with thick black outlines. Plain light grey studio background, no text.")
pares = [('vest-capivara-farao.png', 'roupa-solta-farao.png'), ('vest-capivara-mago.png', 'roupa-solta-mago.png')]
def um(p):
    a, s = p
    return rodar('qwen-image-edit-2511', {'prompt': R, 'images': [data_uri(a)], 'size': '1024*1280', 'seed': 5, 'output_format': 'png'}, s)
with ThreadPoolExecutor(2) as ex: list(ex.map(um, pares))
