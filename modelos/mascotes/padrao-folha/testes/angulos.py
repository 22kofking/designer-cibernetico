import sys; sys.path.insert(0, '.')
from concurrent.futures import ThreadPoolExecutor
from rp import rodar, data_uri
LORA = 'https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA/resolve/main/qwen-image-edit-2511-multiple-angles-lora.safetensors'
img = data_uri('base-11.png')
pedidos = [('ang-34dir', 'front-right quarter view eye-level shot wide shot'), ('ang-direita', 'right side view eye-level shot wide shot'),
           ('ang-esquerda', 'left side view eye-level shot wide shot'), ('ang-34esq', 'front-left quarter view eye-level shot wide shot'),
           ('ang-cima', 'front view high-angle shot wide shot'), ('ang-baixo', 'front view low-angle shot wide shot')]
def um(p):
    nome, ang = p
    return rodar('qwen-image-edit-2511-lora', {'prompt': f'<sks> {ang}', 'images': [img], 'loras': [{'path': LORA, 'scale': 0.9}], 'size': '1024*1280', 'seed': 7, 'output_format': 'png'}, f'{nome}.png')
with ThreadPoolExecutor(3) as ex: list(ex.map(um, pedidos))
