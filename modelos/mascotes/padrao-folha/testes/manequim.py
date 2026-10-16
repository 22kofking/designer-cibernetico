import sys; sys.path.insert(0, '.')
from rp import rodar, data_uri
M = ("2D cartoon costume design sheet in bold comic style, thick black outlines, rich saturated colors: a complete pharaoh costume displayed on a plain white headless tailor mannequin with arms, front view, full length: "
     "striped blue and gold pharaoh nemes headdress with a gold cobra placed on a mannequin head stand above the neck, wide gold and turquoise collar, gold arm bracers on the mannequin arms, gold belt with turquoise gem and white pleated kilt. "
     "Centered, plain light grey studio background, no character, no animal, no text")
rodar('z-image-turbo', {'prompt': M, 'size': '768*1024', 'seed': 3}, 'manequim-farao.png')
V = ("Image 1 is a jaguar man. Image 2 is a pharaoh costume on a white mannequin. Dress the jaguar from image 1 in the complete costume from image 2 (headdress, collar, bracers, belt and kilt), replacing his tank top and shorts. "
     "Keep the jaguar exactly as in image 1: jaguar head and face, spotted golden fur, tail, sunglasses, A-pose, full body framing, 2D comic art style with thick black outlines. Plain light grey studio background, no text.")
rodar('qwen-image-edit-2511', {'prompt': V, 'images': [data_uri('base-onca.png'), data_uri('manequim-farao.png')], 'size': '1024*1280', 'seed': 9, 'output_format': 'png'}, 'vest4-onca-farao.png')
