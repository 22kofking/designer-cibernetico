import sys; sys.path.insert(0, '.')
from rp import rodar, data_uri
LORA = 'https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA/resolve/main/qwen-image-edit-2511-multiple-angles-lora.safetensors'
entrada, saida, angulo = sys.argv[1], sys.argv[2], sys.argv[3]
rodar('qwen-image-edit-2511-lora', {
    'prompt': f'<sks> {angulo} eye-level shot wide shot',
    'images': [data_uri(entrada)], 'loras': [{'path': LORA, 'scale': 0.9}],
    'size': '1024*1280', 'seed': 7, 'output_format': 'png'}, saida)
