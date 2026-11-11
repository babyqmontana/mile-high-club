#!/usr/bin/env python3
"""Звуковые эффекты ролика v4 (promo/ad4.html), без музыки.

Usage: python3 promo/ad4_sfx.py <cues.json> <out.wav>

cues.json пишет render.cjs. В нём лежат события CUES, синхронные с анимацией.
Звучат: воздух и ветер облёта, стеклянные касания интерфейса, щелчки кнопок, гул лифта с тиками этажей,
двухтоновый «дзинь» прибытия, выбор номера, подтверждение, уведомление, удары на переходах, финальный аккорд-колокольчик.
Выход: WAV 48 кГц, стерео. Нужен только numpy.
"""
import json, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(11)


def ts(d): return np.arange(int(d * SR)) / SR


def fft_filter(x, lo=None, hi=None):
    n = len(x); F = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(F * g, n)


def noise(n): return rng.standard_normal(n)


def sweep_noise(dur, f0, f1, q=1.0):
    """Шум с плавно сдвигающейся полосой: режем на куски и фильтруем каждый."""
    n = int(dur * SR); out = np.zeros(n); seg = int(.04 * SR); x = noise(n + seg)
    for i in range(0, n, seg):
        k = i / max(1, n - 1); fc = f0 * (f1 / f0) ** k
        s = fft_filter(x[i:i + seg * 2], lo=fc / (1 + q), hi=fc * (1 + q))[:seg]
        out[i:i + seg] += s[:n - i] if i + seg > n else s
    return out


def env(n, a, r): t = np.arange(n) / SR; return np.minimum(1, t / max(a, 1e-4)) * np.minimum(1, (n / SR - t) / max(r, 1e-4))


# ---------- звуки ----------
def whoosh(dur=.6, up=False, **_):
    x = sweep_noise(dur, 400, 3800) if up else sweep_noise(dur, 3200, 300)
    t = np.linspace(0, 1, len(x)); return x * np.sin(np.pi * t) ** 1.4 * .55


def air(dur=1.0, **_):
    x = sweep_noise(dur, 900, 2600, .6); t = np.linspace(0, 1, len(x)); return x * np.sin(np.pi * t) * .25


def wind(dur=6.0, **_):
    n = int(dur * SR); x = fft_filter(noise(n), lo=120, hi=900); t = np.arange(n) / SR
    mod = .6 + .4 * np.sin(2 * np.pi * .23 * t) * np.sin(2 * np.pi * .11 * t + 1)
    return x * mod * env(n, 1.0, 1.5) * .42


def glass(pitch=1.0, **_):
    t = ts(.6); f = 2200 * pitch; out = np.zeros_like(t)
    for k, a, d in ((1, 1, 9), (2.76, .5, 14), (5.4, .25, 22)): out += np.sin(2 * np.pi * f * k * t) * a * np.exp(-t * d)
    return (out + fft_filter(noise(len(t)), lo=5000) * np.exp(-t * 80) * .5) * .12


def click(**_):
    t = ts(.04); return (np.sin(2 * np.pi * 1700 * t) * .6 + fft_filter(noise(len(t)), lo=3500)) * np.exp(-t * 260) * .32


def button(**_):
    t = ts(.12); f = 180 + 300 * np.exp(-t * 60); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 30) * .35


def tick(pitch=1.0, **_):
    t = ts(.03); return np.sin(2 * np.pi * 3000 * pitch * t) * np.exp(-t * 220) * .14


def hum(dur=1.5, **_):
    n = int(dur * SR); t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * (70 + 18 * t / dur) * t) * .6 + np.sin(2 * np.pi * (140 + 36 * t / dur) * t) * .25
    rumble = fft_filter(noise(n), lo=60, hi=400) * .5
    return (tone + rumble) * env(n, .25, .35) * .18


def ding(**_):
    out = np.zeros(int(1.6 * SR))
    for st, f in ((0, 1318.5), (.18, 1046.5)):
        t = ts(1.4); s = (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t * 3) * .16
        i = int(st * SR); out[i:i + len(s)] += s[:len(out) - i]
    return out


def hover(**_):
    t = ts(.05); return np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 120) * .05


def select(**_):
    t = ts(.35); return (np.sin(2 * np.pi * 880 * t) + .6 * np.sin(2 * np.pi * 1320 * t)) * np.exp(-t * 10) * .14


def confirm(**_):
    out = np.zeros(int(.9 * SR))
    for st, f in ((0, 880), (.09, 1174.7), (.18, 1760)):
        t = ts(.6); s = np.sin(2 * np.pi * f * t) * np.exp(-t * 7) * .13; i = int(st * SR); out[i:i + len(s)] += s[:len(out) - i]
    return out


def notify(**_):
    out = np.zeros(int(1.0 * SR))
    for st, f in ((0, 1046.5), (.13, 1567.98)):
        t = ts(.7); s = (np.sin(2 * np.pi * f * t) + .25 * np.sin(2 * np.pi * f * 3 * t)) * np.exp(-t * 6) * .15; i = int(st * SR); out[i:i + len(s)] += s[:len(out) - i]
    return out


def process(dur=.7, **_):
    n = int(dur * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * (400 + 900 * t / dur) * t) * env(n, .05, .1) * .04 + fft_filter(noise(n), lo=2000, hi=6000) * (t / dur) * .05


def riser(dur=.8, **_):
    n = int(dur * SR); x = np.linspace(0, 1, n)
    return (sweep_noise(dur, 500, 6000, .8) * x ** 2.2 * .4 + np.sin(2 * np.pi * np.cumsum(200 + 1200 * x ** 2) / SR) * x ** 2 * .08)


def boom(**_):
    t = ts(1.6); f = 34 + 70 * np.exp(-t * 16)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6) * 2.0) * .5 + fft_filter(noise(len(t)), hi=1200) * np.exp(-t * 14) * .3


def shimmer(**_):
    t = ts(1.6); out = np.zeros_like(t)
    for i in range(16):
        st = int(rng.uniform(0, .9) * SR); m = int(.5 * SR); tt = np.arange(m) / SR
        out[st:st + m] += (np.sin(2 * np.pi * rng.uniform(2000, 5000) * tt) * np.exp(-tt * 8))[:len(out) - st] * .045
    return out


def swish(**_):
    t = ts(.22); return fft_filter(noise(len(t)), lo=2500, hi=9000) * np.sin(np.pi * t / .22) ** 2 * .3


def chime(**_):
    t = ts(3.0); out = np.zeros_like(t)
    for f, a in ((523.25, 1), (659.25, .7), (783.99, .6), (1046.5, .4), (1567.98, .2)): out += np.sin(2 * np.pi * f * t) * a * np.exp(-t * 1.3)
    return out * np.minimum(1, t / .005) * .1


SFX = dict(whoosh=whoosh, air=air, wind=wind, glass=glass, click=click, button=button, tick=tick, hum=hum, ding=ding, hover=hover,
           select=select, confirm=confirm, notify=notify, process=process, riser=riser, boom=boom, shimmer=shimmer, swish=swish, chime=chime)
WIDE = {'wind', 'boom', 'riser', 'hum', 'chime', 'air'}


def reverb(x, wet, length=1.4):
    n = int(length * SR); ir = fft_filter(noise(n), hi=7000) * np.exp(-np.arange(n) / (length / 6 * SR)); ir /= np.sqrt((ir ** 2).sum())
    m = len(x) + n; F = 1 << (m - 1).bit_length()
    return x + np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[:len(x)] * wet


def main(cues_path, out_path):
    meta = json.load(open(cues_path, encoding='utf-8')); N = int(meta['DUR'] * SR); mix = np.zeros((2, N))
    for c in meta['CUES']:
        s = SFX[c['type']](**{k: v for k, v in c.items() if k not in ('t', 'type')})
        i = int(c['t'] * SR); s = s[:N - i]
        pan = 0 if c['type'] in WIDE else rng.uniform(-.3, .3); l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
        mix[0, i:i + len(s)] += s * l; mix[1, i:i + len(s)] += s * r
    mix = np.stack([reverb(ch, .16) for ch in mix])
    fl = int(.5 * SR); mix[:, -fl:] *= np.linspace(1, 0, fl)
    mix = np.tanh(mix / np.abs(mix).max() * 1.2) / np.tanh(1.2) * 10 ** (-1 / 20)
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix.T * 32767).astype('<i2').tobytes())
    print(out_path, f"{meta['DUR']}s, {len(meta['CUES'])} cues")


if __name__ == '__main__':
    main(*sys.argv[1:3])
