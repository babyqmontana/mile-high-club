# Сборка кадров Blender в картинки сайта для темы «Горячие туры».
#   python brand/vice/build_vice.py
# Из brand/vice/out/<day|night>-{full,far,mn,n}.png делает public/img/vice/<v>.webp, <v>-far.webp, <v>-mask.webp:
#   свечение неона (bloom) поверх кадра; маска: R — средний+ближний планы, G — ближний (как у атриума, в 2 раза меньше).
import os
from PIL import Image, ImageChops, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC, DST = os.path.join(ROOT, 'brand', 'vice', 'out'), os.path.join(ROOT, 'public', 'img', 'vice')
os.makedirs(DST, exist_ok=True)
W, H = 2880, 1608

def bloom(im, thr, k):
    rgb = im.convert('RGB').resize((W, H), Image.LANCZOS)
    hi = ImageChops.subtract(rgb, Image.new('RGB', rgb.size, (thr,) * 3)).point(lambda v: min(255, v * 3))
    small = hi.resize((W // 4, H // 4), Image.BILINEAR)
    glow = ImageChops.add(small.filter(ImageFilter.GaussianBlur(6)), small.filter(ImageFilter.GaussianBlur(22))).resize((W, H), Image.BILINEAR)
    return ImageChops.screen(rgb, glow.point(lambda v: int(v * k)))

for v, thr, k in (('night', 150, .75), ('day', 215, .35)):
    full, far = (Image.open(os.path.join(SRC, f'{v}-{p}.png')) for p in ('full', 'far'))
    bloom(full, thr, k).save(os.path.join(DST, f'{v}.webp'), 'WEBP', quality=86, method=6)
    bloom(far, thr, k).save(os.path.join(DST, f'{v}-far.webp'), 'WEBP', quality=84, method=6)
    mn = Image.open(os.path.join(SRC, f'{v}-mn.png')).getchannel('A')
    n = Image.open(os.path.join(SRC, f'{v}-n.png')).getchannel('A')
    mask = Image.merge('RGB', (mn, n, Image.new('L', mn.size, 0))).resize((W // 2, H // 2), Image.LANCZOS)
    mask.save(os.path.join(DST, f'{v}-mask.webp'), 'WEBP', quality=90, method=6)
    print(v, 'ok')
