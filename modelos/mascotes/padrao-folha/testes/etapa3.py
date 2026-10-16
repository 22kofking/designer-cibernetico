import sys; sys.path.insert(0, '.')
from concurrent.futures import ThreadPoolExecutor
from rp import rodar, data_uri
LORA = 'https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA/resolve/main/qwen-image-edit-2511-multiple-angles-lora.safetensors'
P = ("Vibrant 2D cartoon illustration in bold comic style, thick black outlines, rich saturated colors, stylish adult cartoon casino mascot, not cute, not for kids, not chibi. "
     "Full body character model sheet base: a charismatic anthropomorphic jaguar man with an athletic human body and broad shoulders, spotted golden fur, confident open-mouth grin, dark sunglasses, "
     "standing straight in a relaxed A-pose, arms slightly away from the body, feet apart, facing the camera, wearing only a plain fitted light grey tank top and plain dark grey shorts, barefoot, "
     "full body visible from head to feet, centered, isolated on a plain light grey studio background, flat even lighting, no text, no letters")
def ang(p):
    nome, a = p
    return rodar('qwen-image-edit-2511-lora', {'prompt': f'<sks> {a} eye-level shot wide shot', 'images': [data_uri('vest-capivara-farao.png')], 'loras': [{'path': LORA, 'scale': 0.9}], 'size': '1024*1280', 'seed': 7, 'output_format': 'png'}, f'{nome}.png')
tarefas = [lambda: ang(('farao-costas', 'back view')), lambda: ang(('farao-34dir', 'front-right quarter view')),
           lambda: rodar('z-image-turbo', {'prompt': P, 'size': '768*1024', 'seed': 11}, 'base-onca.png')]
with ThreadPoolExecutor(3) as ex: list(ex.map(lambda f: f(), tarefas))
