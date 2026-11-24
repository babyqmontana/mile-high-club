# Текстуры окон и витрин для сцены Вайс-Сити: python brand/vice/make_windows.py
# windows-<night|day>.png — атлас 4×3 (стекло с отражением неба, переплёт, шторы, жалюзи, комнаты), store-*.png — 4×1 (витрины).
import os, random, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tex'); os.makedirs(HERE, exist_ok=True)
N = 512

def rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def vgrad(stops, w=N, h=N):
    im = Image.new('RGB', (1, h)); px = im.load()
    for y in range(h):
        t = y / (h - 1)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                k = (t - p0) / max(1e-6, p1 - p0); px[0, y] = tuple(round(a + (b - a) * k) for a, b in zip(rgb(c0), rgb(c1))); break
    return im.resize((w, h))
def glow(im, x, y, r, col, k=1.):
    g = Image.new('RGB', im.size); ImageDraw.Draw(g).ellipse((x - r, y - r, x + r, y + r), fill=tuple(int(c * k) for c in rgb(col)))
    return ImageChops.screen(im, g.filter(ImageFilter.GaussianBlur(r * .75)))
def reflect(day, rnd):
    im = vgrad([(0, '#3f4f7a'), (.45, '#8d6aa0'), (.75, '#e58b94'), (1, '#f0b184')] if day else [(0, '#0b1030'), (.5, '#1c1440'), (.8, '#42205c'), (1, '#6a2a62')])
    d = ImageDraw.Draw(im, 'RGBA')
    x = rnd.randint(60, 380)                                   # отражение пальмы
    d.line([(x, N), (x + 22, 250)], fill=(8, 6, 20, 120), width=13)
    for k in range(9):
        a = k / 9 * math.tau; d.line([(x + 22, 250), (x + 22 + math.cos(a) * 95, 250 + math.sin(a) * 55 + 25)], fill=(8, 6, 20, 105), width=15)
    im = im.filter(ImageFilter.GaussianBlur(3)); s = Image.new('RGBA', (N, N)); sd = ImageDraw.Draw(s)
    for off, wd, a in ((70, 60, 26), (170, 22, 18), (330, 90, 14)): sd.polygon([(off, 0), (off + wd, 0), (off + wd - 170, N), (off - 170, N)], fill=(255, 240, 250, a))
    im.paste(s, (0, 0), s); return im
def curtains(im, col, op, spread):
    d = Image.new('RGBA', (N, N)); p = ImageDraw.Draw(d); c = rgb(col)
    for side in (0, 1):
        for k in range(0, spread, 4):
            sh = .72 + .28 * math.sin(k * .32); x = k if side == 0 else N - k - 4
            p.rectangle((x, 0, x + 4, N), fill=tuple(int(v * sh) for v in c) + (op,))
    d = d.filter(ImageFilter.GaussianBlur(1.5)); im.paste(d, (0, 0), d); return im
def room(wall, lampc, rnd, dim=1.):
    im = vgrad([(0, '#22141c'), (.12, wall), (.72, wall), (.73, '#2a1a1c'), (1, '#1a1014')])
    im = Image.blend(Image.new('RGB', (N, N), rgb('#140c18')), im, .55 * dim)
    d = ImageDraw.Draw(im, 'RGBA'); x = rnd.randint(130, 370)
    d.rectangle((N - x - 60, 120, N - x + 60, 205), fill=(40, 26, 40, 170), outline=(150, 110, 90, 150), width=5)     # картина
    d.rectangle((70, 370, 430, 430), fill=(30, 18, 28, 235)); d.rectangle((90, 330, 410, 380), fill=(58, 32, 46, 235))   # диван
    im = im.filter(ImageFilter.GaussianBlur(2.5)); im = glow(im, x, 250, 105, lampc, .62 * dim); im = glow(im, x, 250, 34, lampc, .7 * dim)
    d = ImageDraw.Draw(im, 'RGBA'); d.polygon([(x - 26, 262), (x + 26, 262), (x + 16, 222), (x - 16, 222)], fill=rgb(lampc) + (235,)); d.line([(x, 262), (x, 345)], fill=(40, 24, 24, 255), width=5)
    return im
def finish(im, day, style=0):
    v = Image.new('L', (N, N), 0); ImageDraw.Draw(v).rectangle((26, 26, N - 26, N - 26), fill=255); v = v.filter(ImageFilter.GaussianBlur(34))
    im = Image.composite(im, im.point(lambda p: int(p * .45)), v)                                    # глубина откоса
    d = ImageDraw.Draw(im); fr = rgb('#e9d8cf') if day else rgb('#5c4658'); dk = rgb('#a98f90') if day else rgb('#30222f')
    def bar(a):
        d.rectangle(a, fill=fr); d.line((a[0], a[3], a[2], a[3]), fill=dk, width=3); d.line((a[2], a[1], a[2], a[3]), fill=dk, width=3)
    for a in ((0, 0, N, 14), (0, N - 15, N, N), (0, 0, 13, N), (N - 14, 0, N, N)): bar(a)
    if style == 0: bar((250, 0, 262, N)); bar((0, 150, N, 160))
    elif style == 1: bar((165, 0, 175, N)); bar((337, 0, 347, N))
    else:
        for y in (128, 256, 384): bar((0, y - 4, N, y + 4))
        bar((251, 0, 261, N))
    return im

for name, day in (('night', False), ('day', True)):
    rnd = random.Random(11); A = Image.new('RGB', (N * 4, N * 3))
    for i in range(12):
        ref = reflect(day, rnd)
        if i < 6:                                              # темные стёкла: отражение, часть со шторами или жалюзи
            im = ref
            if i in (1, 4): im = curtains(im, '#c9a6b4' if day else '#3b2a44', 150, 120 + i * 18)
            if i == 2:
                d = ImageDraw.Draw(im, 'RGBA')
                for y in range(0, 300, 14): d.rectangle((0, y, N, y + 8), fill=(225, 205, 205, 120) if day else (70, 52, 78, 140))
        else:
            wall, lampc, dim = [('#8a5a48', '#ffcf94', 1), ('#7a4c58', '#ffb98a', .85), ('#6a5a74', '#ffd9b0', .7), ('#805040', '#ffc080', .95), ('#5a4668', '#f7a8c0', .7), ('#74604c', '#ffd49a', .55)][i - 6]
            im = room(wall, lampc, rnd, dim * (.5 if day else 1)); im = curtains(im, '#d8b49a' if i % 2 else '#b98aa0', 205, 85 + (i % 3) * 30)
            if i == 9:
                d = ImageDraw.Draw(im, 'RGBA')
                for y in range(0, 230, 13): d.rectangle((0, y, N, y + 7), fill=(60, 38, 44, 190))
            im = Image.blend(im, ImageChops.screen(im, ref), .45 if not day else .9)
        A.paste(finish(im, day, i % 3), ((i % 4) * N, (i // 4) * N))
    A.save(os.path.join(HERE, f'windows-{name}.png'))
    S = Image.new('RGB', (N * 4, N))
    for i in range(4):
        im = vgrad([(0, '#2a1520'), (.2, '#6a3a34'), (.62, '#7a4638'), (.78, '#3a2024'), (1, '#1c1018')]); d = ImageDraw.Draw(im, 'RGBA')
        if i == 0:                                             # бар: полки с бутылками
            for y in (150, 215, 280):
                d.rectangle((40, y, 472, y + 6), fill=(30, 16, 18, 255))
                for x in range(52, 462, 17): hh = rnd.randint(24, 46); d.rectangle((x, y - hh, x + 8, y), fill=rnd.choice([(150, 70, 70), (70, 110, 110), (190, 140, 70), (110, 60, 110)]) + (220,))
            d.rectangle((20, 345, 492, 440), fill=(44, 22, 28, 255))
        elif i == 1:                                           # лобби с растениями
            for x in (110, 400):
                for k in range(8): a = -math.pi * (k + .5) / 8; d.line([(x, 360), (x + math.cos(a) * 85, 360 + math.sin(a) * 120)], fill=(24, 44, 36, 255), width=9)
                d.polygon([(x - 26, 360), (x + 26, 360), (x + 18, 440), (x - 18, 440)], fill=(70, 34, 34, 255))
        elif i == 2:                                           # столики
            for x in (90, 250, 410): d.ellipse((x - 48, 350, x + 48, 372), fill=(36, 18, 24, 255)); d.line([(x, 362), (x, 450)], fill=(26, 14, 18, 255), width=8); d.ellipse((x - 8, 328, x + 8, 350), fill=(255, 190, 120, 230))
        else: d.rectangle((150, 120, 362, N), fill=(50, 28, 32, 255)); d.rectangle((168, 140, 250, 490), fill=(112, 70, 56, 255)); d.rectangle((262, 140, 344, 490), fill=(112, 70, 56, 255)); d.line([(242, 300), (242, 360)], fill=(230, 190, 130, 255), width=7); d.line([(270, 300), (270, 360)], fill=(230, 190, 130, 255), width=7)
        im = im.filter(ImageFilter.GaussianBlur(1.6))
        for x in (120, 256, 392): im = glow(im, x, 96, 60, '#ffc890', .5); im = glow(im, x, 96, 15, '#ffe2b8', .9)
        if day: im = Image.blend(im.point(lambda p: int(p * .6)), reflect(True, rnd), .45)
        else: im = Image.blend(im, ImageChops.screen(im, reflect(False, rnd)), .4)
        d = ImageDraw.Draw(im); fr = rgb('#d8c4bb') if day else rgb('#4c3848')
        for a in ((0, 0, N, 12), (0, 0, 10, N), (N - 11, 0, N, N), (0, N - 46, N, N), (0, 70, N, 78)): d.rectangle(a, fill=fr)
        if i != 3: d.rectangle((252, 70, 260, N), fill=fr)
        S.paste(im, (i * N, 0))
    S.save(os.path.join(HERE, f'store-{name}.png'))
print('ok')
