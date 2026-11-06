#!/usr/bin/env python3
"""Звук для ролика «Ностальгия» (promo/nostalgia.html): своя музыка и SFX, без чужих треков.

Usage: python3 promo/nostalgia_audio.py <cues.json> <out-dir>

cues.json пишет promo/render.cjs (BPM, склейки, финал). Темп 83.35 BPM, тональность ля минор.
Музыка: тёплый лоу-фай/синтвейв, 4 такта. Аккорды Am | F | Dm–E | Am (финал на логотипе).
Звучат пэд с «плавающей плёнкой», арпеджио-плак с эхо, бас, бочка/малый/хэты и треск винила.

Пишет в <out-dir>:
- music.wav — только музыка;
- sfx.wav — глитчи на склейках, удар и шиммер на логотипе, «печать» подписей;
- mix.wav — музыка и SFX вместе.
Все файлы 48 кГц, стерео. Нужен только numpy.
"""
import json, os, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(83)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= buf.shape[1]:
        return
    s = sig[:buf.shape[1] - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    buf[0, i:i + len(s)] += s * l
    buf[1, i:i + len(s)] += s * r


def fft_filter(x, lo=None, hi=None):
    """Статический фильтр в частотной области (мягкие скаты)."""
    n = len(x); F = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(F * g, n)


def ts(dur):
    return np.arange(int(dur * SR)) / SR


# ---------- инструменты ----------
def pluck(f, dur=.45, bright=1.0):
    t = ts(dur); out = np.zeros_like(t)
    for k in range(1, 18):
        if f * k > 9000: break
        amp = (1 / k) * (1 if k % 2 else .55)  # почти квадрат — «8-битный» тембр
        out += amp * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (7 + 3.2 * k / bright))
    return out * np.minimum(1, t / .002) * .5


def pad(freqs, dur, wob_seed=0):
    t = ts(dur); out = np.zeros_like(t)
    # «плёнка»: медленное плавание высоты + случайный дрейф
    wob = 1 + .0035 * np.sin(2 * np.pi * .45 * t + wob_seed) + .0015 * np.sin(2 * np.pi * 1.7 * t + 2 * wob_seed)
    for f in freqs:
        for det in (-.07, 0, .07):
            ph = 2 * np.pi * np.cumsum(f * 2 ** (det / 12) * wob) / SR
            for k in range(1, 9):
                out += np.sin(k * ph) / k ** 1.35 / 3
    env = np.minimum(1, t / .35) * np.minimum(1, (dur - t) / .4)
    return out * env * .13


def bass(f, dur):
    t = ts(dur)
    s = np.sin(2 * np.pi * f * t) + .25 * np.sin(4 * np.pi * f * t) + .12 * np.sin(6 * np.pi * f * t)
    return s * np.minimum(1, t / .004) * np.exp(-t * 2.2) * np.minimum(1, (dur - t) / .02) * .5


def kick():
    t = ts(.5); f = 44 + 90 * np.exp(-t * 28)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    return np.tanh(s * 1.8) * .9


def snare():
    t = ts(.35)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 28) * .5
    nz = fft_filter(rng.standard_normal(len(t)), lo=1200, hi=7000) * np.exp(-t * 14) * .7
    return np.round((tone + nz) * 24) / 24  # лёгкий биткраш — «старый сэмплер»


def hat(open_=False):
    t = ts(.25 if open_ else .06)
    return fft_filter(rng.standard_normal(len(t)), lo=7000) * np.exp(-t * (10 if open_ else 70)) * .55


def crash():
    t = ts(2.2)
    return fft_filter(rng.standard_normal(len(t)), lo=3500) * np.exp(-t * 1.8) * .28


def vinyl(n):
    v = fft_filter(rng.standard_normal(n), lo=800, hi=6000) * .006
    pops = rng.random(n) < 6 / SR
    v[pops] += rng.uniform(-.25, .25, pops.sum())
    return v


# ---------- SFX ----------
def zap(big=False):
    t = ts(.12 if big else .07); out = np.zeros_like(t); seg = int(.012 * SR)
    for i in range(0, len(t), seg):
        f = rng.choice([220, 440, 880, 1760, 3520]) * rng.uniform(.97, 1.03)
        tt = t[i:i + seg] - t[i]
        out[i:i + seg] = np.sign(np.sin(2 * np.pi * f * tt)) * (rng.random() < .8)
    hold = 6
    out = np.repeat(out[::hold], hold)[:len(t)]
    return out * np.linspace(1, .2, len(t)) * (.16 if big else .09)


def tick():
    t = ts(.02)
    return np.sin(2 * np.pi * 3200 * t) * np.exp(-t * 300) * .14


def blip(p):
    t = ts(.03)
    return np.sign(np.sin(2 * np.pi * (1200 + 500 * p) * t)) * np.exp(-t * 120) * .035


def riser(dur):
    t = ts(dur); x = t / dur
    nz = fft_filter(rng.standard_normal(len(t)), lo=600, hi=9000)
    rev = nz * x ** 3
    tone = np.sin(2 * np.pi * np.cumsum(200 + 1400 * x ** 2) / SR) * x ** 2 * .15
    return (rev * .35 + tone)


def boom():
    t = ts(2.4); f = 30 + 70 * np.exp(-t * 14)
    s = np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.0) * 2.2) * .9
    nz = fft_filter(rng.standard_normal(len(t)), hi=1500) * np.exp(-t * 12) * .6
    return s + nz


def shimmer():
    t = ts(1.8); out = np.zeros_like(t)
    for f, a in ((1760, 1), (2637, .6), (3520, .45), (5274, .25)):
        out += np.sin(2 * np.pi * f * t + rng.random() * 6) * a * np.exp(-t * 2.2)
    return out * np.minimum(1, t / .01) * .05


def pop():
    t = ts(.12); f = 300 + 900 * np.exp(-t * 60)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 30) * .35


def reverb(x, wet, length=1.6, hi=6000):
    n = int(length * SR); ir = fft_filter(rng.standard_normal(n), hi=hi) * np.exp(-np.arange(n) / (length / 6 * SR))
    ir /= np.sqrt((ir ** 2).sum())
    m = len(x) + n; F = 1 << (m - 1).bit_length()
    return x + np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[:len(x)] * wet


def write(path, x):
    pcm = (np.clip(x, -1, 1).T * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def main(cues_path, out_dir):
    meta = json.load(open(cues_path, encoding='utf-8'))
    P = 60 / meta['BPM']; DUR = meta['DUR']; N = int(DUR * SR)
    logo_t = next(c['t'] for c in meta['CUES'] if c['type'] == 'logo')
    music = np.zeros((2, N)); drums = np.zeros((2, N)); sfx = np.zeros((2, N))

    # гармония по долям: Am | F | Dm Dm E E | Am (финал)
    A, F_, D, E = 57, 53, 50, 52
    chords = {A: [57, 60, 64, 71], F_: [53, 57, 60, 64], D: [50, 53, 57, 64], E: [52, 56, 59, 62]}
    plan = [A] * 4 + [F_] * 4 + [D, D, E, E] + [A] * 6

    # пэд: по аккорду на такт / полутакт
    i = 0
    while i < len(plan):
        j = i
        while j < len(plan) and plan[j] == plan[i]: j += 1
        dur = (j - i) * P + .5
        place(music, pad([midi(n) for n in chords[plan[i]]], min(dur, DUR - i * P + .5), wob_seed=i), i * P, 1.0)
        i = j

    # арпеджио 16-ми: вверх-вниз по нотам аккорда, через октаву; эхо на пунктирную восьмую
    arp = np.zeros((2, N)); step = P / 4
    for s in range(int(16 * 4)):
        t = s * step
        if t >= DUR - .3: break
        b = int(s // 4)
        if b >= len(plan): break
        notes = chords[plan[b]]; seq = notes + [n + 12 for n in notes] + [notes[2] + 12, notes[1] + 12]
        n = seq[(s * 3 + (s // 8)) % len(seq)] + 12
        swing = step * .12 if s % 2 else 0
        acc = 1.0 if s % 4 == 0 else .7
        if b >= 12 and s % 2: continue  # на логотипе — реже, «выдох»
        place(arp, pluck(midi(n), .5, 1.3 if s % 4 == 0 else 1.0), t + swing, .8 * acc, pan=(-.35 if s % 2 else .35))
    d = int(P * .75 * SR)
    echo = np.zeros_like(arp); echo[0, d:] = arp[1, :-d] * .38; echo[1, d:] = arp[0, :-d] * .38
    echo2 = np.zeros_like(arp); echo2[:, 2 * d:] = arp[:, :-2 * d] * .14
    music += arp + echo + echo2

    # бас: корень на сильных, синкопа на «и»
    for b in range(len(plan)):
        if b * P >= DUR: break
        root = midi(chords[plan[b]][0] - 12)
        place(music, bass(root, P * .7), b * P, .9)
        if b < 12 and b % 2 == 1: place(music, bass(root, P * .3), b * P + P * .75, .6)

    # ударные (до логотипа — полный бит, на логотипе — удар и разреженный бит)
    K, Sn = kick(), snare()
    for b in range(len(plan)):
        t = b * P
        if t >= DUR - .2: break
        logo_bar = b >= 12
        if b % 4 == 0 or (b % 4 == 2 and not logo_bar): place(drums, K, t, .7)
        if not logo_bar and b % 4 == 2: place(drums, K, t + P * .5, .4)
        if b % 2 == 1: place(drums, Sn, t, .75 if not logo_bar else .5)
        for h in range(4):
            if logo_bar and h % 2: continue
            place(drums, hat(open_=(h == 2 and b % 4 == 3)), t + h * P / 4 + (P / 4 * .12 if h % 2 else 0), .9 if h % 2 == 0 else .6, pan=.25)
    place(drums, crash(), logo_t, 1.0, pan=-.2)

    # сайдчейн от бочки — «качает» как в лоу-фай
    duck = np.ones(N)
    for b in range(len(plan)):
        if b % 2 == 0:
            i0 = int(b * P * SR); L = int(.28 * SR); seg = duck[i0:i0 + L]
            duck[i0:i0 + L] = np.minimum(seg, 1 - .45 * np.exp(-np.arange(len(seg)) / (.07 * SR)))
    music *= duck

    music = np.stack([reverb(ch, .22) for ch in music]) + drums
    music[0] += vinyl(N); music[1] += vinyl(N)
    # «тёплая плёнка»: срез верха, лёгкая сатурация
    music = np.stack([fft_filter(ch, lo=28, hi=14000) for ch in music])
    music = np.tanh(music * 1.1) / 1.1

    # ---------- SFX по монтажу ----------
    for c in meta['CUES']:
        if c['type'] == 'cut':
            place(sfx, zap(c.get('big')), c['t'] - .01, 1.0, pan=rng.uniform(-.3, .3)); place(sfx, tick(), c['t'], 1.0)
    # «печать» подписи: короткие пиксельные блипы на появлении текста каждого кадра
    for s in meta['SHOTS'][:-1]:
        for k in range(5): place(sfx, blip(k / 5), s['t'] + 2 / 30 + k * .05, 1.0, pan=.1)
    r = riser(P * 1.0); place(sfx, r, logo_t - len(r) / SR, 1.0)
    place(sfx, boom(), logo_t, .6); place(sfx, shimmer(), logo_t + .05, 1.0)
    for c in meta['CUES']:
        if c['type'] in ('type', 'type2'):
            for k in range(8): place(sfx, blip(k / 8), c['t'] + k * .04, .9)
        if c['type'] == 'cta': place(sfx, pop(), c['t'], 1.0)
    sfx = np.stack([reverb(ch, .12, .9) for ch in sfx])

    # общий фейд в конце, как у картинки
    fade = np.ones(N); fl = int(.45 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 1.5
    music *= fade; sfx *= fade
    mix = music * .82 + sfx * .9
    peak = np.abs(mix).max(); norm = 10 ** (-1 / 20) / peak
    os.makedirs(out_dir, exist_ok=True)
    write(os.path.join(out_dir, 'mix.wav'), mix * norm)
    write(os.path.join(out_dir, 'music.wav'), music * .82 * norm)
    write(os.path.join(out_dir, 'sfx.wav'), sfx * .9 * norm)
    print(f'{out_dir}: {N / SR:.2f}s, BPM {meta["BPM"]}, logo {logo_t:.2f}s')


if __name__ == '__main__':
    main(*sys.argv[1:3])
