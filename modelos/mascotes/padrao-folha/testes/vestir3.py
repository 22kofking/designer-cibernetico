import sys; sys.path.insert(0, '.')
from concurrent.futures import ThreadPoolExecutor
from rp import rodar, data_uri
V = ("Image 1 is a jaguar man. Image 2 is a capybara man wearing a costume. Put the costume from image 2 on the jaguar from image 1: {roupa}. "
     "The jaguar keeps his own jaguar head, spotted golden fur, jaguar face, round ears, tail, sunglasses, A-pose and body from image 1. "
     "Never copy the capybara head, face, snout or brown fur from image 2: only the clothes and accessories. Same 2D comic art style with thick black outlines. Plain light grey studio background, no text.")
R = {'farao': 'striped blue and gold pharaoh nemes headdress with a gold cobra, wide gold and turquoise collar, gold arm bracers, gold belt and white kilt, replacing the tank top and shorts',
     'mago': 'long red wizard robe with gold trim and a hood, replacing the tank top and shorts'}
def um(r):
    return rodar('qwen-image-edit-2511', {'prompt': V.format(roupa=R[r]), 'images': [data_uri('base-onca.png'), data_uri(f'vest-capivara-{r}.png')], 'size': '1024*1280', 'seed': 9, 'output_format': 'png'}, f'vest3-onca-{r}.png')
with ThreadPoolExecutor(2) as ex: list(ex.map(um, ['farao', 'mago']))
