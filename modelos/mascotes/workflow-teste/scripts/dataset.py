# Gera o material de treino do LoRA de estilo A no Z-Image Turbo (Public Endpoint, US$ 0,005 cada).
import json, os, sys, time, urllib.request, concurrent.futures as cf
K = os.environ['RUNPOD_API_KEY']
H = {'Authorization': f'Bearer {K}', 'Content-Type': 'application/json'}
def post(url, corpo):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(corpo).encode(), headers=H), timeout=600))
def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=120))
ESTILO = ("Vibrant 2D cartoon illustration in bold comic style, thick black outlines, rich saturated colors, dramatic golden rim lighting, "
          "stylish adult cartoon casino mascot, not cute, not for kids, not chibi. ")
FIM = ", centered, isolated on a plain light grey studio background, no text, no letters"
BICHOS = {
 'capybara': 'a charismatic anthropomorphic capybara man with an athletic human body and broad shoulders, long blunt capybara muzzle',
 'jaguar': 'a charismatic anthropomorphic jaguar man with an athletic human body and broad shoulders, spotted golden fur, feline muzzle',
 'wolf': 'a charismatic anthropomorphic grey wolf man with an athletic human body and broad shoulders, long wolf snout',
 'lion': 'a charismatic anthropomorphic lion man with an athletic human body and broad shoulders, big golden mane',
 'bear': 'a charismatic anthropomorphic brown bear man with a big strong human body, broad bear snout',
 'fox': 'a charismatic anthropomorphic red fox man with an athletic human body, pointy fox snout and big ears',
 'monkey': 'a charismatic anthropomorphic monkey man with an athletic human body, expressive monkey face',
 'alligator': 'a charismatic anthropomorphic alligator man with an athletic human body, long green alligator snout',
}
ROUPA = {
 'sorte': 'wearing a red Chinese silk tang jacket with gold frog buttons and a red cap with a gold rim',
 'mago': 'wearing a flowing red and gold sorcerer robe with a high collar',
 'farao': 'wearing a golden pharaoh headdress with blue stripes, a wide gold collar with turquoise gems and gold armor bracers',
 'rua': 'wearing a red baseball cap backwards, a green varsity jacket with white sleeves and a thick gold chain',
 'pirata': 'wearing a brown pirate tricorn hat and a red captain coat with gold trim',
 'base': 'wearing a plain fitted light grey tank top and plain dark grey shorts',
}
POSE = {
 'aponta': ('waist-up portrait cropped at the waist of {b}, leaning towards the viewer, huge hyped open-mouth grin showing teeth, eyebrows raised, dark sunglasses, pointing at the viewer as if saying come play, {r}', 'waist-up, pointing at the viewer'),
 'corpo': ('full body view from head to feet of {b}, confident open-mouth grin, dark sunglasses, standing in a relaxed A-pose facing the camera, arms slightly away from the body, {r}', 'full body, standing in a relaxed A-pose'),
 'ergue': ('full body view from head to feet of {b}, huge open-mouth grin, dark sunglasses, one arm raised high holding a red envelope, the other hand on the hip, {r}', 'full body, one arm raised holding a red envelope'),
 'punho': ('waist-up portrait cropped at the waist of {b}, huge hyped grin, dark sunglasses, raising a fist in victory, {r}', 'waist-up, raising a fist'),
}
# 24 combinações: cada bicho em 3 poses/figurinos diferentes (sem tucano nem arara, que ficam para o teste).
COMBOS = [
 ('capybara','aponta','sorte'),('capybara','corpo','base'),('capybara','punho','farao'),
 ('jaguar','aponta','rua'),('jaguar','corpo','base'),('jaguar','ergue','sorte'),
 ('wolf','aponta','mago'),('wolf','corpo','pirata'),('wolf','punho','rua'),
 ('lion','aponta','farao'),('lion','corpo','base'),('lion','ergue','pirata'),
 ('bear','aponta','pirata'),('bear','corpo','sorte'),('bear','punho','mago'),
 ('fox','aponta','sorte'),('fox','corpo','rua'),('fox','ergue','mago'),
 ('monkey','aponta','farao'),('monkey','corpo','base'),('monkey','punho','sorte'),
 ('alligator','aponta','rua'),('alligator','corpo','farao'),('alligator','ergue','base'),
]
def um(i, c):
    bicho, pose, roupa = c
    nome = f'dataset/{i:02d}-{bicho}-{pose}-{roupa}'
    if os.path.exists(nome + '.png'): return nome, 0.0
    longo, curto = POSE[pose]
    prompt = ESTILO + longo.format(b=BICHOS[bicho], r=ROUPA[roupa]) + FIM
    r = post('https://api.runpod.ai/v2/z-image-turbo/runsync', {'input': {'prompt': prompt, 'size': '768*1024', 'seed': 100 + i}})
    while r.get('status') in ('IN_QUEUE', 'IN_PROGRESS'):
        time.sleep(3); r = get(f"https://api.runpod.ai/v2/z-image-turbo/status/{r['id']}")
    if r.get('status') != 'COMPLETED': return nome, f"falhou {json.dumps(r)[:300]}"
    out = r['output']; urllib.request.urlretrieve(out.get('image_url') or out.get('result'), nome + '.png')
    animal = BICHOS[bicho].split(' with ')[0].replace('a charismatic ', '')
    open(nome + '.txt', 'w').write(f"estiloA, {animal}, {ROUPA[roupa]}, {curto}, light grey background")
    return nome, float(out.get('cost', 0))
total = 0.0
with cf.ThreadPoolExecutor(4) as ex:
    for nome, custo in ex.map(lambda a: um(*a), enumerate(COMBOS)):
        if isinstance(custo, str): print(nome, custo, flush=True)
        else: total += custo; print(nome, 'US$', custo, flush=True)
print('TOTAL US$', round(total, 4))
