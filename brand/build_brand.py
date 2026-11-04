#!/usr/bin/env python3
"""Логотип и аватарки Mile High Club из векторных слоёв.

Запуск из корня проекта:  python brand/build_brand.py
Вход: brand/masks/{disc,camel,word}.png (слои emblem.svg и mhc-wordmark.svg, белое на прозрачном).
Нужны: pillow, numpy, scipy.

Верблюд без чёрных контуров: внутренние линии это просветы, через которые видно диск.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
MASKS, BRAND, IMG = ROOT / 'brand' / 'masks', ROOT / 'brand', ROOT / 'public' / 'img'
GOLD = ['#FFF3CF', '#F3D28C', '#C8953F', '#FBE3A6', '#E2B765', '#A87A32']
CAMEL = ['#FFF8E7', '#F8E6C2', '#EBC98D']
# цвет диска: светлая часть и тёмный край
PERSONAS = {'concierge': ('#C98A1E', '#3A2404'), 'reception': ('#D3166C', '#3F0620'), 'manager': ('#D94E14', '#3E1404'), 'journal': ('#B9925A', '#30230F'),
            'ciel': ('#A32A3A', '#2E0A10'), 'hot': ('#F0177A', '#42062A'), 'pools': ('#1E9C96', '#062C2C'), 'cigar': ('#7A4D2A', '#22130A'), 'security': ('#31507F', '#0C1626')}
WINE = ('#9A2433', '#2A080D')


def rgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def mask(name, size):
    m = Image.open(MASKS / f'{name}.png').convert('RGBA').getchannel('A')
    return np.asarray(m.resize((size, size), Image.LANCZOS), dtype=np.float32) / 255


def ramp(t, stops):
    """Значение 0..1 в цвет по равномерным опорным точкам."""
    cols = np.stack([rgb(c) for c in stops]); x = np.clip(t, 0, 1) * (len(stops) - 1)
    i = np.minimum(x.astype(int), len(stops) - 2); f = (x - i)[..., None]
    return cols[i] * (1 - f) + cols[i + 1] * f


def grid(n):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32) / (n - 1)
    return x, y


def over(dst, color, alpha):
    a = alpha[..., None]
    out_a = a + dst[..., 3:] * (1 - a)
    rgb_ = (color * a + dst[..., :3] * dst[..., 3:] * (1 - a)) / np.maximum(out_a, 1e-4)
    return np.concatenate([rgb_, out_a], -1)


def relief(a, n):
    """Мягкий свет сверху слева по краям формы: убирает плоскость."""
    h = ndi.gaussian_filter(a, n / 260)
    gy, gx = np.gradient(h)
    return np.clip(-(gx + gy) * n / 16, -1, 1)


def metal(a, n, stops, angle=.35):
    x, y = grid(n)
    base = ramp((x * angle + y * (1 - angle)), stops)
    return np.clip(base + relief(a, n)[..., None] * 46, 0, 255)


def camel_on(canvas, n, camel):
    shadow = ndi.gaussian_filter(np.roll(camel, (n // 110, n // 170), (0, 1)), n / 90) * .55
    canvas = over(canvas, np.zeros(3, np.float32), shadow)
    return over(canvas, metal(camel, n, CAMEL, .2), camel)


def medallion(n, colors=WINE):
    """Диск с золотым кантом и верблюдом на прозрачном фоне."""
    disc, camel = mask('disc', n), mask('camel', n)
    ys, xs = np.nonzero(disc > .5); cx, cy, r = xs.mean(), ys.mean(), (xs.max() - xs.min()) / 2
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.hypot(x - (cx - r * .3), y - (cy - r * .35)) / (r * 1.75)
    canvas = np.zeros((n, n, 4), np.float32)
    canvas = over(canvas, ramp(d, [colors[0], colors[1]]), disc)
    edge = np.hypot(x - cx, y - cy)
    rim = np.clip((edge - (r - n / 190)) / 2, 0, 1) * np.clip((r + 1 - edge) / 2, 0, 1)
    canvas = over(canvas, metal(rim, n, GOLD), rim)
    return camel_on(canvas, n, camel)


def avatar(n, colors):
    """Круглая аватарка: фон во весь квадрат, Discord сам обрежет его кругом."""
    camel = fit(mask('camel', n), n, .74)
    x, y = grid(n)
    d = np.hypot(x - .38, y - .3) / .95
    canvas = np.concatenate([ramp(d, [colors[0], colors[1]]), np.ones((n, n, 1), np.float32)], -1)
    edge = np.hypot(x - .5, y - .5)
    ring = np.clip((edge - .463) * n / 2.5, 0, 1) * np.clip((.477 - edge) * n / 2.5, 0, 1)
    canvas = over(canvas, metal(ring, n, GOLD), ring)
    return camel_on(canvas, n, camel)


def fit(a, n, share):
    """Вписывает форму в центр кадра, занимая долю стороны."""
    ys, xs = np.nonzero(a > .05); box = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    k = n * share / max(box.shape)
    im = Image.fromarray((box * 255).astype('uint8')).resize((int(box.shape[1] * k), int(box.shape[0] * k)), Image.LANCZOS)
    out = Image.new('L', (n, n)); out.paste(im, ((n - im.width) // 2, (n - im.height) // 2))
    return np.asarray(out, dtype=np.float32) / 255


def to_img(a): return Image.fromarray(np.clip(np.dstack([a[..., :3], a[..., 3] * 255]), 0, 255).astype('uint8'), 'RGBA')


def crop_alpha(img):
    return img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())


def wordmark(n):
    a = mask('word', n)
    canvas = np.zeros((n, n, 4), np.float32)
    glow = ndi.gaussian_filter(a, n / 70) * .35
    canvas = over(canvas, rgb('#F7B50A') * np.ones((n, n, 1), np.float32), glow)
    return crop_alpha(to_img(over(canvas, metal(a, n, GOLD), a)))


def logo(side=1400):
    """Главный логотип: медальон и надпись одной композицией на прозрачном фоне."""
    med, word = crop_alpha(to_img(medallion(side))), wordmark(side * 2)
    med.thumbnail((int(side * .5), int(side * .5)), Image.LANCZOS)
    word.thumbnail((int(side * .92), int(side * .46)), Image.LANCZOS)
    out = Image.new('RGBA', (side, side))
    gap = int(side * .02); top = (side - med.height - word.height - gap) // 2
    out.alpha_composite(med, ((side - med.width) // 2, top))
    out.alpha_composite(word, ((side - word.width) // 2, top + med.height + gap))
    return out


def banner():
    w, h = 1360, 480
    x, y = np.meshgrid(np.linspace(0, 1, w), np.linspace(0, 1, h)); x, y = x.astype(np.float32), y.astype(np.float32)
    base = ramp(np.clip(np.hypot((x - .5) * 1.3, (y - .35)), 0, 1), ['#5A1420', '#2A080D', '#0D0809'])
    img = Image.fromarray(base.astype('uint8')).convert('RGBA')
    med = crop_alpha(to_img(medallion(900))); med.thumbnail((400, 400), Image.LANCZOS)
    word = wordmark(1400); word.thumbnail((640, 380), Image.LANCZOS)
    left = (w - med.width - word.width - 70) // 2
    img.alpha_composite(med, (left, (h - med.height) // 2))
    img.alpha_composite(word, (left + med.width + 70, (h - word.height) // 2))
    return img.convert('RGB')


def main():
    big = logo()
    big.resize((800, 800), Image.LANCZOS).save(IMG / 'logo.webp', quality=92, method=6)
    big.save(BRAND / 'logo-square.png', optimize=True)
    med = to_img(medallion(1024))
    med.save(BRAND / 'emblem.png', optimize=True)
    med.resize((256, 256), Image.LANCZOS).save(IMG / 'emblem.webp', quality=92, method=6)
    ava = to_img(avatar(1024, WINE)).convert('RGB')
    ava.save(BRAND / 'emblem-dark.png', optimize=True)
    ava.resize((180, 180), Image.LANCZOS).save(IMG / 'apple-touch-icon.png', optimize=True)
    med.resize((64, 64), Image.LANCZOS).save(IMG / 'favicon.png', optimize=True)
    (IMG / 'discord').mkdir(exist_ok=True)
    for key, colors in PERSONAS.items():
        to_img(avatar(512, colors)).convert('RGB').save(IMG / 'discord' / f'{key}.png', optimize=True)
    banner().save(BRAND / 'bot-banner.png', optimize=True)
    print('готово')


if __name__ == '__main__':
    main()
