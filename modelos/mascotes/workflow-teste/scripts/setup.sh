set -x
cd /work
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv
python -c "import torch;print(torch.__version__, torch.cuda.is_available())"
pip install -q -U "huggingface_hub[hf_transfer]" 2>&1 | tail -2
export HF_HUB_ENABLE_HF_TRANSFER=1
# Modelos em paralelo com a instalação do código
( hf download Comfy-Org/z_image_turbo split_files/diffusion_models/z_image_turbo_bf16.safetensors split_files/text_encoders/qwen_3_4b.safetensors split_files/vae/ae.safetensors --local-dir /work/hf/comfy > /work/logs/dl-comfy.log 2>&1 ; echo FIM >> /work/logs/dl-comfy.log ) &
( hf download alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1 Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors --local-dir /work/hf/cn > /work/logs/dl-cn.log 2>&1 ; echo FIM >> /work/logs/dl-cn.log ) &
( hf download Tongyi-MAI/Z-Image-Turbo --exclude "assets/*" --local-dir /work/hf/zimage > /work/logs/dl-zimage.log 2>&1 ; hf download ostris/zimage_turbo_training_adapter zimage_turbo_training_adapter_v2.safetensors --local-dir /work/hf/adapter >> /work/logs/dl-zimage.log 2>&1 ; echo FIM >> /work/logs/dl-zimage.log ) &
git clone -q --depth 1 https://github.com/comfyanonymous/ComfyUI
pip install -q -r ComfyUI/requirements.txt 2>&1 | tail -3
git clone -q --depth 1 https://github.com/ostris/ai-toolkit
python -m venv --system-site-packages /work/venv-ait
/work/venv-ait/bin/pip install -q -r ai-toolkit/requirements.txt 2>&1 | tail -3
/work/venv-ait/bin/python -c "import torch;print('ait torch', torch.__version__)"
python -c "import torch;print('comfy torch', torch.__version__)"
wait
du -sh /work/hf/*
echo SETUP_OK
