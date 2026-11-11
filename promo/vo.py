#!/usr/bin/env python3
"""Женский голос за кадром для ролика v3 (promo/ad3.html): синтез Piper, голос ru_RU-irina-medium.

Usage: python3 promo/vo.py <voice.onnx> <out-dir>

Каждая реплика синтезируется отдельно. Реплики раскладываются по таймлайну с паузами, и в <out-dir>
пишутся два файла:
- vo.wav (48 кГц, моно);
- timeline.json со временем начала и конца каждой реплики.
Анимация читает timeline.json, поэтому текст на экране совпадает с голосом.

Голос: pip install piper-tts; модель ru_RU-irina-medium (.onnx и .onnx.json) из rhasspy/piper-voices.
"""
import json, os, subprocess, sys, wave
import numpy as np

# ключ сцены, текст для синтеза (латиницу пишем как слышится), пауза ПЕРЕД репликой, темп (больше — медленнее)
LINES = [
    ('chaos',   'Вечер в Лос-Сантосе. Сплошной хаос.',              0.55, 1.08),
    ('what',    'А что, если всё может быть проще?',                0.45, 1.08),
    ('three',   'Номера. Ужин. Вечеринки.',                         0.40, 1.15),
    ('once',    'Всё — в одном месте.',                             0.35, 1.08),
    ('rooms',   'Номера, которые светятся прямо на башне.',          0.95, 1.05),
    ('dinner',  'Ужин из ресторана Ле Сьель — сразу в номер.',      0.30, 1.05),
    ('first',   'И вечеринки, о которых узнаёшь первым.',            0.30, 1.05),
    ('fromto',  'От быстрой брони — до целой ночи над городом.',     0.55, 1.08),
    ('roof',    'Всё под одной крышей.',                             0.45, 1.08),
    ('logo',    'Майл Хай Клаб. Отель над Лос-Сантосом. Ночь только начинается.', 0.60, 1.1),
]
SR = 48000


def synth(model, text, scale, path):
    subprocess.run([sys.executable, '-m', 'piper', '-m', model, '-f', path, '--length-scale', str(scale), '--sentence-silence', '0.25'],
                   input=text.encode('utf-8'), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    w = wave.open(path); sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32768
    # обрезаем тишину по краям
    nz = np.nonzero(np.abs(a) > 0.012)[0]; a = a[max(0, nz[0] - int(.02 * sr)): nz[-1] + int(.06 * sr)]
    # пересэмплирование 22.05 → 48 кГц (линейная интерполяция достаточна для речи после ФНЧ)
    n = int(len(a) * SR / sr); x = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a)
    return x


def words(text, x, t0):
    """Примерное время начала каждого слова: делим речь на фразы по паузам, внутри фразы — по числу букв."""
    h = int(.02 * SR); env = np.array([np.sqrt((x[i:i + h] ** 2).mean()) for i in range(0, len(x) - h, h)])
    voiced = env > .02
    segs, s0, quiet = [], None, 0
    for i, v in enumerate(voiced):
        if v:
            if s0 is None: s0 = i
            quiet = 0
        elif s0 is not None:
            quiet += 1
            if quiet >= 9: segs.append((s0, i - quiet + 1)); s0, quiet = None, 0   # пауза ≥ 0.18 с
    if s0 is not None: segs.append((s0, len(voiced)))
    ws = text.replace('—', ' ').split()
    # фразы текста: по знакам препинания
    groups, cur = [], []
    for w in ws:
        cur.append(w)
        if w[-1] in '.,?!:': groups.append(cur); cur = []
    if cur: groups.append(cur)
    if len(groups) != len(segs):  # не совпало — считаем всё одной фразой
        groups, segs = [ws], [(segs[0][0], segs[-1][1])] if segs else [(0, len(voiced))]
    out = []
    for g, (a, b) in zip(groups, segs):
        n = sum(len(w) for w in g); acc = 0
        for w in g:
            out.append({'w': w, 't': round(t0 + (a + (b - a) * acc / n) * h / SR, 3)}); acc += len(w)
    return out


def main(model, out):
    os.makedirs(out, exist_ok=True)
    parts, tl, t = [], [], 0.0
    for i, (key, text, gap, scale) in enumerate(LINES):
        x = synth(model, text, scale, os.path.join(out, f'line{i:02d}.wav'))
        t += gap; tl.append({'key': key, 'text': text, 'start': round(t, 3), 'end': round(t + len(x) / SR, 3), 'words': words(text, x, t)})
        parts.append((t, x)); t += len(x) / SR
    total = t + 1.6
    buf = np.zeros(int(total * SR))
    for st, x in parts: i = int(st * SR); buf[i:i + len(x)] += x
    buf *= 0.89 / np.abs(buf).max()
    with wave.open(os.path.join(out, 'vo.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((buf * 32767).astype('<i2').tobytes())
    json.dump({'duration': round(total, 2), 'lines': tl}, open(os.path.join(out, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for l in tl: print(f"{l['start']:6.2f}–{l['end']:6.2f}  {l['key']:7s} {l['text']}")
    print('total', round(total, 2))


if __name__ == '__main__':
    main(*sys.argv[1:3])
