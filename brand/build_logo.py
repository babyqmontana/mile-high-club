#!/usr/bin/env python3
"""Логотип Mile High Club из brand/logo-source.webp: вектор и все квадратные версии.

Запуск из корня проекта:  python brand/build_logo.py
Нужны: pillow, numpy, scipy, vtracer.

Шаги: увеличить исходник → разложить на три цвета → убрать фон и дым → обвести
каждый слой в вектор → собрать полный логотип и эмблему (верблюд в бордовом круге).
Силуэт-подложка держит внутренние чёрные линии на любом фоне.
"""
import os
import re
import tempfile
from pathlib import Path

import numpy as np
import vtracer
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'brand' / 'logo-source.webp'
OUT = ROOT / 'brand'
IMG = ROOT / 'public' / 'img'
CREAM, WINE, INK = (0xF6, 0xE8, 0xD2), (0x7A, 0x1E, 0x26), (0x08, 0x04, 0x05)
hexc = lambda c: '#%02X%02X%02X' % c
UP = 6  # во сколько раз увеличиваем исходник
# Персоны в Discord: цвет круга эмблемы
PERSONAS = {'concierge': '7A1E26', 'reception': 'B8862B', 'ciel': '9C2F3C', 'hot': 'F0177A', 'pools': '2AA7A0',
            'cigar': '6B4226', 'journal': 'D9960A', 'security': '26385C', 'manager': '521827'}


def layers():
    im = Image.open(SRC).convert('RGB')
    big = im.resize((im.width * UP, im.height * UP), Image.LANCZOS)
    a = ndi.gaussian_filter(np.asarray(big, dtype=np.float32), (UP * .3, UP * .3, 0))
    pal = np.array([CREAM, WINE, INK], dtype=np.float32)
    idx = ((a[:, :, None, :] - pal) ** 2).sum(-1).argmin(-1)
    # дым: серый, поэтому отделяем кремовый по насыщенной яркости и размеру пятна
    cream = idx == 0
    wine = (idx == 1) & (a[..., 0] - a[..., 1] > 40)  # дым серый, у бордового красный заметно выше зелёного
    lab, n = ndi.label(cream)
    sizes = ndi.sum(cream, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.nonzero(sizes > 40 * UP * UP / 4)[0])
    bright = a.sum(-1) > 420  # настоящий кремовый заметно светлее дыма
    cream = keep & ndi.binary_dilation(bright, iterations=2)
    lab, n = ndi.label(wine)
    sizes = ndi.sum(wine, lab, range(1, n + 1))
    wine = np.isin(lab, 1 + np.nonzero(sizes > 60 * UP * UP)[0])  # верблюд делит круг на части
    # дым у трубки попадает в бордовый: тонкие хвосты срезаем открытием маски
    core = ndi.binary_opening(wine, iterations=UP * 4)
    wine &= ndi.binary_dilation(core, iterations=UP * 4 + 2)
    # подложка под круг: выпуклая оболочка бордового закрывает чёрный полумесяц под шеей
    ys, xs = np.nonzero(core)
    pts = np.c_[xs, ys][::37]
    hull = pts[ConvexHull(pts).vertices]
    canvas = Image.new('1', (wine.shape[1], wine.shape[0]))
    ImageDraw.Draw(canvas).polygon([tuple(map(int, p)) for p in hull], fill=1)
    ring = np.asarray(canvas, dtype=bool)
    return cream, wine, ring


def silhouette(cream, wine, ring, grow=UP * 2):
    """Всё, что не внешний фон, плюс тонкий контур: подложка под буквы и верблюда."""
    solid = ndi.binary_closing(cream | wine | ring, iterations=UP * 2)
    solid = ndi.binary_fill_holes(solid)
    return ndi.binary_dilation(solid, iterations=grow)


def trace(mask, fill):
    """Бинарная маска → пути SVG одного цвета."""
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, 'm.png'), os.path.join(d, 'm.svg')
        Image.fromarray(np.where(mask, 0, 255).astype('uint8')).save(src)
        vtracer.convert_image_to_svg_py(src, dst, colormode='binary', mode='spline', filter_speckle=8,
                                        corner_threshold=60, length_threshold=4.0, splice_threshold=45, path_precision=1)
        svg = Path(dst).read_text()
    paths = re.findall(r'<path d="([^"]+)"[^>]*?(?:transform="translate\(([-\d.]+),([-\d.]+)\)")?\s*/>', svg)
    return ''.join(f'<path fill="{fill}" d="{d}"' + (f' transform="translate({x},{y})"' if x else '') + '/>' for d, x, y in paths)


def svg(w, h, body, view=None):
    view = view or f'0 0 {w} {h}'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="{w}" height="{h}">{body}</svg>\n'


def rgba(mask_layers, size):
    """Слои-маски (снизу вверх) → RGBA."""
    out = np.zeros((*size, 4), dtype=np.uint8)
    for mask, col in mask_layers:
        out[mask] = (*col, 255)
    return Image.fromarray(out, 'RGBA')


def smooth(img, size):
    return img.resize((size, size), Image.LANCZOS)


def square(img, side=None, pad=.06, bg=None):
    """Вписать картинку в квадрат с полями."""
    box = img.getbbox()
    img = img.crop(box)
    side = side or int(max(img.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (*bg, 255) if bg else (0, 0, 0, 0))
    canvas.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def camel_only(cream, wine):
    """Верблюд отдельно от букв: пятна кремового правее границы надписи."""
    h, w = cream.shape
    lab, n = ndi.label(cream)
    objs = ndi.find_objects(lab)
    border = int(w * .445)  # левая граница верблюда в исходнике
    keep = np.zeros_like(cream)
    for i, sl in enumerate(objs, 1):
        cx = (sl[1].start + sl[1].stop) / 2
        if cx > border and sl[1].start > w * .42:
            keep |= lab == i
    return keep


def disc(size, cx, cy, r):
    y, x = np.ogrid[:size[0], :size[1]]
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def fit_circle(wine):
    """Круг по внешней дуге бордового пятна (метод наименьших квадратов)."""
    edge = wine & ~ndi.binary_erosion(wine, iterations=2)
    ys, xs = np.nonzero(edge)
    right = xs > np.percentile(xs, 55)  # левая часть круга закрыта верблюдом
    xs, ys = xs[right].astype(float), ys[right].astype(float)
    A = np.c_[2 * xs, 2 * ys, np.ones_like(xs)]
    c, *_ = np.linalg.lstsq(A, xs ** 2 + ys ** 2, rcond=None)
    return c[0], c[1], float(np.sqrt(c[2] + c[0] ** 2 + c[1] ** 2))


def main():
    cream, wine, ring = layers()
    h, w = cream.shape
    base = silhouette(cream, wine, ring)

    # полный логотип
    body = trace(base, hexc(INK)) + trace(wine, hexc(WINE)) + trace(cream, hexc(CREAM))
    (OUT / 'logo.svg').write_text(svg(w, h, body), encoding='utf-8')
    full = rgba([(base, INK), (wine, WINE), (cream, CREAM)], (h, w))
    sq = square(full)
    smooth(sq, 640).save(IMG / 'logo.webp', quality=92, method=6)
    smooth(square(full, bg=INK, pad=.1), 1024).save(OUT / 'logo-square-dark.png', optimize=True)
    smooth(sq, 1024).save(OUT / 'logo-square.png', optimize=True)

    # эмблема: верблюд в полном бордовом круге
    camel = camel_only(cream, wine)
    camel_base = ndi.binary_dilation(ndi.binary_fill_holes(ndi.binary_closing(camel, iterations=UP * 2)), iterations=UP * 2)
    ys, xs = np.nonzero(camel_base)
    cx, cy, r = fit_circle(wine)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    r = max(r, (x1 - x0) / 2 * 1.04, (y1 - y0) / 2 * 1.04)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = int(r * 2 * 1.06)
    ox, oy = int(side / 2 - cx), int(side / 2 - cy)

    def shifted(m):
        out = np.zeros((side, side), dtype=bool)
        ys0, xs0 = max(0, -oy), max(0, -ox)
        ys1, xs1 = min(h, side - oy), min(w, side - ox)
        out[ys0 + oy:ys1 + oy, xs0 + ox:xs1 + ox] = m[ys0:ys1, xs0:xs1]
        return out

    circle = disc((side, side), side / 2, side / 2, r)
    cb, cc = shifted(camel_base), shifted(camel)
    ebody = trace(circle, hexc(WINE)) + trace(cb, hexc(INK)) + trace(cc, hexc(CREAM))
    (OUT / 'emblem.svg').write_text(svg(side, side, ebody), encoding='utf-8')
    emblem = rgba([(circle, WINE), (cb, INK), (cc, CREAM)], (side, side))
    smooth(emblem, 256).save(IMG / 'emblem.webp', quality=92, method=6)
    smooth(emblem, 1024).save(OUT / 'emblem.png', optimize=True)
    icon = Image.new('RGBA', (side, side), (*INK, 255))
    icon.alpha_composite(emblem)
    smooth(icon, 1024).save(OUT / 'emblem-dark.png', optimize=True)  # аватар бота и иконка сервера

    # аватарки персон: эмблема на цвете отдела
    (IMG / 'discord').mkdir(exist_ok=True)
    for key, col in PERSONAS.items():
        rgb = tuple(int(col[i:i + 2], 16) for i in (0, 2, 4))
        tinted = rgba([(circle, rgb), (cb, INK), (cc, CREAM)], (side, side))
        plate = Image.new('RGBA', (side, side), (*INK, 255))
        plate.alpha_composite(tinted)
        smooth(plate, 256).save(IMG / 'discord' / f'{key}.png', optimize=True)

    # favicon
    smooth(emblem, 64).save(IMG / 'favicon.png', optimize=True)
    smooth(emblem, 180).save(IMG / 'apple-touch-icon.png', optimize=True)
    print('logo ok:', w, 'x', h, '| emblem', side)


if __name__ == '__main__':
    main()
