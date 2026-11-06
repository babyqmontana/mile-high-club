#!/usr/bin/env python3
"""Синтез звукового сопровождения ролика (только SFX, без музыки).

Usage: python3 promo/sfx.py <cues.json> <out.wav>

cues.json пишет promo/render.cjs. В нём лежит список событий CUES из promo/ad.html,
поэтому звук совпадает с анимацией кадр в кадр. Нужен только numpy.
Выход: WAV, 48 кГц, стерео, 16 бит, пик −1 dBFS.
"""
import json, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def svf_band(x, f0, f1, q=0.7):
    """Полосовой фильтр (state-variable) с центром, плавно идущим от f0 к f1."""
    n = len(x); f = np.geomspace(f0, f1, n)
    g = 2 * np.sin(np.pi * np.minimum(f, SR / 6) / SR); d = 1 / q
    lp = bp = 0.0; out = np.empty(n)
    for i in range(n):
        hp = x[i] - lp - d * bp
        bp += g[i] * hp; lp += g[i] * bp
        out[i] = bp
    return out


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a) * x[i] + a * s; y[i] = s
    return y


def tone(freqs, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freqs, float), (n,))
    return np.sin(phase0 + 2 * np.pi * np.cumsum(f) / SR)


def noise(n):
    return rng.standard_normal(n)


# ---------- звуки ----------
def whoosh(dur=.5, gain=.7, up=False, **_):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    f0, f1 = (300, 4200) if up else (2600, 260)
    e = np.sin(np.pi * t) ** 1.6 if not up else t ** 2.2 * (1 - t ** 8)
    return svf_band(noise(n), f0, f1, .9) * e * gain * 1.4


def swish(gain=.5, **_):
    n = int(.16 * SR); t = np.linspace(0, 1, n)
    return svf_band(noise(n), 5500, 1800, 1.2) * np.sin(np.pi * t) ** 2 * gain * 1.2


def click(pitch=1.0, gain=1.0, **_):
    n = int(.03 * SR)
    body = tone(2400 * pitch, n) * env_exp(n, .004)
    tr = svf_band(noise(n), 6000, 6000, 2) * env_exp(n, .0015)
    return (body * .6 + tr * .9) * .55 * gain


def tick(pitch=1.0, **_):
    n = int(.02 * SR)
    return (tone(4200 * pitch, n) * .5 + svf_band(noise(n), 8000, 8000, 3)) * env_exp(n, .0018) * .35


def pop(pitch=1.0, gain=1.0, **_):
    n = int(.12 * SR); f = 260 * pitch + 900 * pitch * env_exp(n, .012)
    body = tone(f, n) * env_exp(n, .035)
    c = click(1.6 * pitch, .4); body[:len(c)] += c
    return body * .55 * gain


def riser(dur=.6, gain=.5, **_):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    nz = svf_band(noise(n), 400, 7000, 1.4)
    tn = tone(np.geomspace(180, 1400, n), n) * .25 + tone(np.geomspace(181.5, 1412, n), n) * .2
    return (nz + tn) * t ** 2.5 * gain * 1.1


def expand(dur=.4, **_):
    n = int(dur * SR); t = np.linspace(0, 1, n)
    nz = svf_band(noise(n), 500, 2400, 1.0) * np.sin(np.pi * t) * .5
    tn = tone(np.geomspace(140, 220, n), n) * np.sin(np.pi * t) ** .7 * .35
    return nz + tn


def impact(gain=1.0, big=False, **_):
    L = 2.2 if big else 1.1; n = int(L * SR)
    f = 32 + (70 if big else 85) * env_exp(n, .06)
    sub = tone(f, n) * env_exp(n, .55 if big else .28)
    sub = np.tanh(sub * (2.4 if big else 1.6)) * .8
    nz = lowpass(noise(n), 1800) * env_exp(n, .05) * 1.4
    crack = svf_band(noise(n), 3000, 900, .8) * env_exp(n, .02) * .6
    return (sub + nz + crack) * gain


def hit(gain=.8, **_):
    n = int(.45 * SR)
    sub = np.tanh(tone(45 + 90 * env_exp(n, .03), n) * env_exp(n, .12) * 1.5) * .7
    snap = svf_band(noise(n), 2200, 1200, 1.0) * env_exp(n, .025) * .7
    return (sub + snap) * gain


def flaps(dur=.5, **_):
    n = int((dur + .05) * SR); out = np.zeros(n); t = 0.0
    while t < dur:
        c = click(rng.uniform(.75, 1.15), rng.uniform(.4, .8)); i = int(t * SR)
        out[i:i + len(c)] += c[:n - i]; t += rng.uniform(.028, .045)
    return out * .8


def ding(pitch=1.0, gain=.5, **_):
    n = int(1.4 * SR); f = 1320 * pitch; out = np.zeros(n)
    for k, a, tau in ((1, 1, .5), (2.76, .45, .22), (5.4, .2, .09), (8.93, .08, .05)):
        out += tone(f * k, n) * a * env_exp(n, tau)
    att = np.minimum(1, np.arange(n) / (.002 * SR))
    return out * att * gain * .35


def stutter(dur=.5, **_):
    n = int(dur * SR); out = np.zeros(n); t = 0.0; step = .09
    while t < dur:
        m = int(.03 * SR); i = int(t * SR)
        b = (svf_band(noise(m), 1800, 1800, 1.5) + tone(620, m) * .4) * np.hanning(m)
        out[i:i + m] += b[:n - i] * .45; t += step; step = max(.025, step * .78)
    return out


def glitch(dur=.7, **_):
    n = int(dur * SR); out = np.zeros(n); i = 0
    while i < n:
        m = int(rng.uniform(.015, .06) * SR)
        if rng.random() < .72:
            f = rng.choice([180, 360, 720, 1450, 2900, 90]) * rng.uniform(.95, 1.05)
            sq = np.sign(tone(f, m))
            hold = int(rng.choice([1, 4, 8, 16]))  # сэмпл-энд-холд = «битый» цифровой звук
            seg = (np.repeat((sq * .5 + noise(m) * .25)[::hold], hold)[:m]) * .35
            out[i:i + m] = seg[:n - i]
        i += m
    return out * np.linspace(.6, 1.0, n)


def reverse(dur=.25, **_):
    n = int(dur * SR)
    return (svf_band(noise(n), 900, 5000, .9) * np.linspace(0, 1, n) ** 3) * .7


def sting(gain=.9, **_):
    # тональный «логотип»: мягкий аккорд с колокольной атакой, затухает за ~1.6 с
    n = int(1.8 * SR); out = np.zeros(n)
    for f, a in ((440, 1), (554.37, .6), (659.25, .7), (880, .45), (1318.5, .18)):
        out += (tone(f, n) + .3 * tone(f * 2.001, n)) * a
    e = np.minimum(1, np.arange(n) / (.006 * SR)) * env_exp(n, .6)
    shimmer = 1 + .08 * np.sin(2 * np.pi * 5.5 * np.arange(n) / SR)
    return out * e * shimmer * gain * .12


def sparkle(gain=.5, **_):
    n = int(.9 * SR); out = np.zeros(n)
    for _ in range(14):
        i = int(rng.uniform(0, .6) * SR); m = int(.18 * SR)
        p = tone(rng.uniform(2600, 5200), m) * env_exp(m, .04)
        out[i:i + m] += p[:n - i] * rng.uniform(.3, .7)
    return out * gain * .4


SYN = dict(whoosh=whoosh, swish=swish, click=click, tick=tick, pop=pop, riser=riser, expand=expand,
           impact=impact, hit=hit, flaps=flaps, ding=ding, stutter=stutter, glitch=glitch,
           reverse=reverse, sting=sting, sparkle=sparkle)
# панорама: широкие звуки по центру, мелкие клики слегка гуляют по стерео
WIDE = {'impact', 'hit', 'sting', 'riser', 'reverse'}


def reverb(x, wet=.16, length=.9):
    n = int(length * SR)
    ir = noise(n) * env_exp(n, length / 5)
    ir = lowpass(ir, 5000); ir /= np.sqrt((ir ** 2).sum())
    m = len(x) + n; F = 1 << (m - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[:len(x)]
    return x + y * wet


def main(cues_path, out_path):
    meta = json.load(open(cues_path, encoding='utf-8'))
    total = int((meta['DUR'] + .5) * SR)
    mix = np.zeros((2, total))
    for c in meta['CUES']:
        s = SYN[c['type']](**{k: v for k, v in c.items() if k not in ('t', 'type')})
        i = int(c['t'] * SR)
        pan = 0.0 if c['type'] in WIDE else rng.uniform(-.35, .35)
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        seg = s[:total - i]
        mix[0, i:i + len(seg)] += seg * gl * 1.41; mix[1, i:i + len(seg)] += seg * gr * 1.41
    mix = np.stack([reverb(ch) for ch in mix])
    mix = mix[:, :int(meta['DUR'] * SR)]
    fade = int(.25 * SR); mix[:, -fade:] *= np.linspace(1, 0, fade)
    mix = np.tanh(mix / np.abs(mix).max() * 1.3) / np.tanh(1.3)  # мягкий лимитер
    mix *= 10 ** (-1 / 20)
    pcm = (mix.T * 32767).astype('<i2')
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(f'{out_path}: {mix.shape[1] / SR:.2f}s, {len(meta["CUES"])} cues')


if __name__ == '__main__':
    main(*sys.argv[1:3])
