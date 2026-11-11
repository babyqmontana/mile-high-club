#!/usr/bin/env python3
"""Звук ролика v3: своя лёгкая музыка, эффекты по событиям анимации и голос за кадром.

Usage: python3 promo/ad3_audio.py <cues.json> <vo-dir> <out-dir>

- cues.json пишет render.cjs, в нём есть CUES и DUR.
- В <vo-dir> лежат vo.wav и timeline.json от promo/vo.py.
- В <out-dir> пишутся music.wav, sfx.wav, voice.wav и mix.wav (48 кГц, стерео).

Музыка: 104 BPM, фа мажор, аккорды Fmaj7 | Am7 | Dm9 | B♭maj9.
- Вступление: только пэд и редкие плаки.
- С «Номера. Ужин. Вечеринки»: лёгкий бит.
- На экранах сайта: полный грув.
- Перед финалом: брейкдаун с подъёмом.
- На логотипе: удар и тянущийся аккорд.
Под голосом музыка автоматически приглушается. Нужен только numpy.
"""
import json, os, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(3)


def ts(d): return np.arange(int(d * SR)) / SR
def midi(n): return 440 * 2 ** ((n - 69) / 12)


def fft_filter(x, lo=None, hi=None):
    n = len(x); F = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(F * g, n)


def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i < 0: sig = sig[-i:]; i = 0
    if i >= buf.shape[1]: return
    s = sig[:buf.shape[1] - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    buf[0, i:i + len(s)] += s * l; buf[1, i:i + len(s)] += s * r


def reverb(x, wet, length=1.8, hi=7000):
    n = int(length * SR); ir = fft_filter(rng.standard_normal(n), hi=hi) * np.exp(-np.arange(n) / (length / 6 * SR)); ir /= np.sqrt((ir ** 2).sum())
    m = len(x) + n; F = 1 << (m - 1).bit_length()
    return x + np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[:len(x)] * wet


# ---------- музыка ----------
def pad(freqs, dur):
    t = ts(dur); out = np.zeros_like(t)
    for f in freqs:
        for det in (-.08, 0, .08):
            ph = 2 * np.pi * f * 2 ** (det / 12) * t + rng.random() * 6
            for k in range(1, 7): out += np.sin(k * ph) / k ** 1.6 / 3
    return out * np.minimum(1, t / .6) * np.minimum(1, (dur - t) / .8) * .06


def pluck(f, dur=.6):
    t = ts(dur); out = np.zeros_like(t)
    for k, a in ((1, 1), (2, .4), (3, .18), (4, .08)): out += a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (6 + 4 * k))
    return out * np.minimum(1, t / .003) * .22


def sub(f, dur):
    t = ts(dur); return np.sin(2 * np.pi * f * t) * np.minimum(1, t / .01) * np.exp(-t * 1.2) * np.minimum(1, (dur - t) / .03) * .42


def kick():
    t = ts(.45); f = 48 + 100 * np.exp(-t * 32); return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * 1.6) * .75


def clap():
    t = ts(.3); n = fft_filter(rng.standard_normal(len(t)), lo=900, hi=6000)
    env = np.exp(-t * 22) + .6 * np.exp(-((t - .012) * 300) ** 2) + .5 * np.exp(-((t - .024) * 300) ** 2)
    return n * env * .28


def shaker():
    t = ts(.07); return fft_filter(rng.standard_normal(len(t)), lo=6500) * np.exp(-t * 60) * .12


def music(dur, L):
    P = 60 / 104; bar = 4 * P; N = int(dur * SR); m = np.zeros((2, N)); d = np.zeros((2, N))
    chords = [[53, 57, 60, 64], [57, 60, 64, 67], [50, 53, 57, 64], [46, 50, 53, 57, 60]]
    roots = [41, 45, 38, 46]
    t_beat, t_full, t_brk, t_logo = L['three']['start'] - .05, L['rooms']['start'] - .5, L['roof']['start'] - .9, L['logo']['start'] - .2
    nb = int(dur / bar) + 1
    for b in range(nb):
        t0 = b * bar; ch = chords[b % 4]
        if t0 >= t_logo: break
        place(m, pad([midi(n) for n in ch], bar + .6), t0, 1.0)
        dens = 1 if t0 < t_beat else 2 if t0 < t_full else 4
        for s in range(16):
            ts_ = t0 + s * P / 4
            if ts_ >= min(t_logo, dur): break
            if t_brk <= ts_ < t_logo: continue
            if s % (8 // dens if dens < 4 else 2) == 0:
                n = ch[(s // 2 + b) % len(ch)] + 12 * (1 + (s % 4 == 2))
                place(m, pluck(midi(n)), ts_ + (.012 if s % 2 else 0), .9 if s % 4 == 0 else .6, pan=(-.3 if s % 4 else .3))
        if t0 >= t_beat and not (t_brk <= t0 < t_logo):
            for q in range(4):
                tb = t0 + q * P
                if tb >= t_brk: break
                if q in (0, 2) or t0 >= t_full: place(d, kick(), tb, .9 if q in (0, 2) else .45)
                if q in (1, 3): place(d, clap(), tb, .8 if t0 >= t_full else .5)
                if t0 >= t_full:
                    for h in range(4): place(d, shaker(), tb + h * P / 4 + (.01 if h % 2 else 0), .9 if h % 2 else .5, pan=.3)
            if t0 >= t_full: place(m, sub(midi(roots[b % 4]), bar * .95), t0, 1.0)
    # подъём в брейкдауне и финальный аккорд на логотипе
    rt = ts(t_logo - t_brk); x = rt / rt[-1]
    place(m, fft_filter(rng.standard_normal(len(rt)), lo=500, hi=9000) * x ** 3 * .16, t_brk)
    place(m, np.sin(2 * np.pi * np.cumsum(220 + 660 * x ** 2) / SR) * x ** 2 * .05, t_brk)
    place(d, kick() * 1.2, t_logo); place(m, sub(midi(41), 3.5) * 1.2, t_logo)
    place(m, pad([midi(n) for n in [53, 57, 60, 64, 69, 72]], dur - t_logo + .5) * 1.4, t_logo)
    m = np.stack([reverb(c, .3) for c in m]) + d
    # вступление: срез верха раскрывается к появлению бита
    k = np.clip((np.arange(N) / SR) / max(t_beat, .1), 0, 1)
    lo = np.stack([fft_filter(c, hi=900) for c in m]); m = lo * (1 - k) + m * k
    return m


# ---------- эффекты ----------
def whoosh(dur=.5, up=False, **_):
    t = ts(dur); x = t / dur; n = rng.standard_normal(len(t))
    lo = fft_filter(n, lo=300, hi=2500); hi_ = fft_filter(n, lo=2500, hi=9000)
    mix_ = lo * (1 - x) + hi_ * x if up else lo * x + hi_ * (1 - x)
    return mix_ * np.sin(np.pi * x) ** 1.5 * .5


def swish(**_):
    t = ts(.18); return fft_filter(rng.standard_normal(len(t)), lo=3000, hi=9000) * np.sin(np.pi * t / .18) ** 2 * .3


def tick(gain=.25, **_):
    t = ts(.025); return np.sin(2 * np.pi * 2600 * t) * np.exp(-t * 260) * gain * .5


def pop(gain=1.0, **_):
    t = ts(.14); f = 220 + 900 * np.exp(-t * 55); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26) * .4 * gain


def bubble(pitch=1.0, **_):
    t = ts(.09); f = (500 + 900 * t / .09) * pitch; return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / .09) * .22


def click(**_):
    t = ts(.03); return (np.sin(2 * np.pi * 1800 * t) * .6 + fft_filter(rng.standard_normal(len(t)), lo=4000)) * np.exp(-t * 300) * .4


def boom(**_):
    t = ts(1.2); f = 40 + 60 * np.exp(-t * 18); return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.5) * 1.8) * .55


def select(**_):
    t = ts(.32); return (np.sin(2 * np.pi * 880 * t) + .5 * np.sin(2 * np.pi * 1320 * t)) * np.exp(-t * 14) * .18 + whoosh(.32, up=True) * .4


def shimmer(dur=1.2, **_):
    t = ts(dur); out = np.zeros_like(t)
    for i in range(18):
        st = int(rng.uniform(0, dur * .8) * SR); m = int(.4 * SR); tt = np.arange(m) / SR
        p = np.sin(2 * np.pi * rng.uniform(1800, 4200) * tt) * np.exp(-tt * 9)
        out[st:st + m] += p[:len(out) - st] * .05
    return out * np.minimum(1, t / .2)


def chime(**_):
    t = ts(2.6); out = np.zeros_like(t)
    for f, a in ((698.5, 1), (880, .7), (1046.5, .6), (1396.9, .35), (2093, .15)): out += np.sin(2 * np.pi * f * t) * a * np.exp(-t * 1.6)
    return out * np.minimum(1, t / .004) * .13


SFX = dict(whoosh=whoosh, swish=swish, tick=tick, pop=pop, bubble=bubble, click=click, boom=boom, select=select, shimmer=shimmer, chime=chime)


def read_mono(path):
    w = wave.open(path); a = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float) / 32768
    if w.getnchannels() == 2: a = a.reshape(-1, 2).mean(1)
    assert w.getframerate() == SR
    return a


def write(path, x):
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x, -1, 1).T * 32767).astype('<i2').tobytes())


def main(cues_path, vo_dir, out):
    meta = json.load(open(cues_path, encoding='utf-8')); tl = json.load(open(os.path.join(vo_dir, 'timeline.json'), encoding='utf-8'))
    L = {l['key']: l for l in tl['lines']}; dur = meta['DUR']; N = int(dur * SR)
    vo = read_mono(os.path.join(vo_dir, 'vo.wav'))[:N]; vo = np.pad(vo, (0, N - len(vo)))
    # голос: лёгкая «полировка» — срез гула, мягкая компрессия, немного комнаты
    vo = fft_filter(vo, lo=90, hi=11000); vo = np.tanh(vo * 1.6) / np.tanh(1.6)
    voice = np.stack([reverb(vo, .06, .6), reverb(vo, .06, .6)])
    mus = music(dur, L)
    # приглушение музыки под голос
    env = np.abs(vo); win = int(.03 * SR); env = np.convolve(env, np.ones(win) / win, 'same')
    speak = np.clip(env / .05, 0, 1); rel = int(.3 * SR); sm = np.convolve(speak, np.ones(rel) / rel, 'same'); sm = np.maximum(speak, sm)
    mus *= 1 - .55 * np.clip(sm, 0, 1)
    sfx = np.zeros((2, N))
    for c in meta['CUES']:
        place(sfx, SFX[c['type']](**{k: v for k, v in c.items() if k not in ('t', 'type')}), c['t'], c.get('gain', 1) if c['type'] not in ('tick', 'pop') else 1.0, pan=rng.uniform(-.25, .25))
    sfx = np.stack([reverb(c, .12, .9) for c in sfx])
    fl = int(.5 * SR); fade = np.ones(N); fade[-fl:] = np.linspace(1, 0, fl)
    mus *= fade * .8; sfx *= fade * .7; voice *= 1.0
    mix = mus + sfx + voice
    k = .93 / np.abs(mix).max()
    os.makedirs(out, exist_ok=True)
    for name, x in (('mix', mix), ('music', mus), ('sfx', sfx), ('voice', voice)): write(os.path.join(out, name + '.wav'), x * k)
    print(out, f'{dur:.2f}s')


if __name__ == '__main__':
    main(*sys.argv[1:4])
