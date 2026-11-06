#!/usr/bin/env python3
"""Логотип для шапки главной из оригинала brand/logo-original.png: та же композиция, но на прозрачном фоне.

Запуск из корня проекта:  python brand/build_site_logo.py
Нужны: pillow, numpy, scipy.

Чёрный фон убирается целиком. Края считаются по яркости, а не вырезаются, поэтому тёмной каймы нет.
Чёрные линии внутри верблюда становятся тёмно-винными, иначе на фото они читались бы как контур.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
UP = 3
CREAM, DEEP = np.array([246, 232, 210.]), np.array([43, 10, 16.])


def main():
    im = Image.open(ROOT / 'brand' / 'logo-original.png').convert('RGB')
    src = np.asarray(im.resize((im.width * UP, im.height * UP), Image.LANCZOS), dtype=np.float32)
    h, w, _ = src.shape
    r, g = src[..., 0], src[..., 1]
    cream_a = np.clip((g - 24) / (CREAM[1] - 24 - 12), 0, 1)
    wine_a = np.clip((r - g - 24) / 50, 0, 1) * (1 - cream_a)
    fg = (cream_a > .5) | (wine_a > .5)

    # верблюд и диск отделяем от букв: у них центр правее середины
    lab, n = ndi.label(fg)
    idx = np.arange(1, n + 1)
    sizes = ndi.sum(fg, lab, idx)
    centers = ndi.center_of_mass(fg, lab, idx)
    camel_ids = [i for i, s, c in zip(idx, sizes, centers) if s > 200 and c[1] > w * .47]
    camel = np.isin(lab, camel_ids)
    ball = np.hypot(*np.mgrid[-11 * UP:11 * UP + 1, -11 * UP:11 * UP + 1]) <= 11 * UP
    body = ndi.binary_fill_holes(ndi.binary_closing(np.pad(camel, 40 * UP), ball))[40 * UP:-40 * UP, 40 * UP:-40 * UP]
    body_a = np.clip(ndi.gaussian_filter(body.astype(np.float32), UP * .7) * 1.6 - .3, 0, 1)

    text_a = cream_a * (1 - body)
    alpha = np.maximum(text_a, body_a)
    alpha = np.maximum(alpha, cream_a * (ndi.binary_dilation(camel, iterations=2 * UP)))
    color = DEEP[None, None] * (1 - cream_a - wine_a)[..., None] + CREAM[None, None] * cream_a[..., None] + src * wine_a[..., None]
    color = np.where(text_a[..., None] > 0, CREAM[None, None] * (text_a[..., None] > 0) * (1 - body[..., None]) + color * body[..., None], color)

    out = Image.fromarray(np.clip(np.dstack([color, alpha * 255]), 0, 255).astype('uint8'), 'RGBA')
    out = out.crop(out.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
    out.thumbnail((1400, 1400), Image.LANCZOS)
    out.save(ROOT / 'public' / 'img' / 'logo.webp', quality=92, method=6)
    out.save(ROOT / 'brand' / 'logo-site.png', optimize=True)
    print(out.size)


if __name__ == '__main__':
    main()
