import sys; sys.path.insert(0, '.')
from rp import rodar
P = ("Vibrant 2D cartoon illustration in bold comic style, thick black outlines, rich saturated colors, stylish adult cartoon casino mascot, not cute, not for kids, not chibi. "
     "Full body character model sheet base: a charismatic anthropomorphic capybara man with an athletic human body and broad shoulders, long blunt capybara muzzle, confident open-mouth grin, dark sunglasses, "
     "standing straight in a relaxed A-pose, arms slightly away from the body, feet apart, facing the camera, wearing only a plain fitted light grey tank top and plain dark grey shorts, barefoot, "
     "full body visible from head to feet, centered, isolated on a plain light grey studio background, flat even lighting, no text, no letters")
for s in (11, 12):
    rodar('z-image-turbo', {'prompt': P, 'size': '768*1024', 'seed': s}, f'base-{s}.png')
