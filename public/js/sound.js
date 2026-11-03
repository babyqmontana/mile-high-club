// Звуки отеля на Web Audio, без файлов. Каждый звук собран из нескольких слоёв:
// FM-колокольчики, деревянные «маримбы», шум бумаги и воздуха. Всё идёт через мягкий эквалайзер,
// компрессор и короткую реверберацию «лобби», поэтому звучит объёмно, но тихо и не режет слух.
// Нажатия кнопок звучат нотами одной гаммы и немного меняются, чтобы не надоедать.
import { pref } from './api.js';
let ctx = null, bus = null, rev = null, noiseBuf = null, unlocked = false;
const lastAt = {};
['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { unlocked = true; }, { capture: true, passive: true }));
export let soundOn = pref.get('mhc-sound') !== 'off';

// ре-мажорная пентатоника: любые сочетания звучат приятно
const SCALE = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98];
const pickNote = (lo = 0, hi = SCALE.length - 1) => SCALE[lo + Math.floor(Math.random() * (hi - lo + 1))];
const jit = (v, k = 0.015) => v * (1 + (Math.random() * 2 - 1) * k);

function impulse(sec = 1.8, decay = 3.2) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; lp += ((Math.random() * 2 - 1) - lp) * (0.35 - t * 0.25); d[i] = lp * Math.pow(1 - t, decay) * (i < 300 ? i / 300 : 1); } }
  return b;
}
function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  ctx = new AC({ latencyHint: 'interactive' });
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.18;
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180; low.gain.value = -3;
  const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 7000; air.gain.value = -6; // мягкий верх, без «звона в ушах»
  const out = ctx.createGain(); out.gain.value = 0.32;
  bus = ctx.createGain();
  rev = ctx.createConvolver(); rev.buffer = impulse();
  const wet = ctx.createGain(); wet.gain.value = 0.22; const revLp = ctx.createBiquadFilter(); revLp.type = 'lowpass'; revLp.frequency.value = 4200;
  bus.connect(low); rev.connect(revLp).connect(wet).connect(low);
  low.connect(air).connect(comp).connect(out).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}
// выход голоса: панорама + посыл в реверберацию
function voice(pan = 0, send = 0.3) {
  const g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(bus); } else g.connect(bus);
  if (send > 0) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(rev); }
  return g;
}
function env(g, now, vol, a, dur) { g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + a); g.gain.exponentialRampToValueAtTime(0.0001, now + dur); }

// FM-колокольчик: стекло, латунь, «дзынь» лифта
function bell(freq, { t = 0, dur = 0.9, vol = 0.12, ratio = 3.5, index = 1.4, pan = 0, send = 0.35, attack = 0.004 } = {}) {
  const now = ctx.currentTime + t, c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), out = voice(pan, send);
  c.frequency.value = freq; m.frequency.value = freq * ratio;
  mg.gain.setValueAtTime(freq * index, now); mg.gain.exponentialRampToValueAtTime(freq * 0.02, now + dur * 0.6);
  m.connect(mg).connect(c.frequency); c.connect(out); env(out, now, vol, attack, dur);
  c.start(now); m.start(now); c.stop(now + dur + 0.05); m.stop(now + dur + 0.05);
}
// мягкий синус с обертоном (кнопки, интерфейс)
function pluck(freq, { t = 0, dur = 0.22, vol = 0.12, type = 'triangle', pan = 0, send = 0.2, to = null, cutoff = 2600 } = {}) {
  const now = ctx.currentTime + t, o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), out = voice(pan, send), g2 = ctx.createGain();
  o.type = type; o2.type = 'sine'; o.frequency.setValueAtTime(freq, now); o2.frequency.setValueAtTime(freq * 2.002, now);
  if (to) { o.frequency.exponentialRampToValueAtTime(to, now + dur); o2.frequency.exponentialRampToValueAtTime(to * 2, now + dur); }
  f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, now); f.frequency.exponentialRampToValueAtTime(cutoff * 0.25, now + dur); f.Q.value = 0.7;
  g2.gain.value = 0.25; o.connect(f); o2.connect(g2).connect(f); f.connect(out); env(out, now, vol, 0.005, dur);
  o.start(now); o2.start(now); o.stop(now + dur + 0.05); o2.stop(now + dur + 0.05);
}
// дерево: маримба / стук по шкатулке
function wood(freq, { t = 0, dur = 0.28, vol = 0.18, pan = 0, send = 0.18 } = {}) {
  const now = ctx.currentTime + t, out = voice(pan, send);
  [[1, 1], [3.93, 0.35], [9.6, 0.12]].forEach(([k, v], i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq * k; g.connect(out); o.connect(g); env(g, now, v, 0.002, dur / (1 + i * 1.8)); o.start(now); o.stop(now + dur + 0.05); });
  out.gain.value = vol;
  noise({ t, dur: 0.03, vol: vol * 0.35, f1: 2500, f2: 1500, q: 1.2, pan, send: 0.05 });
}
function noise({ t = 0, dur = 0.2, vol = 0.2, f1 = 800, f2 = 3000, q = 0.8, type = 'bandpass', pan = 0, send = 0.15, attack = null, rate = 1 } = {}) {
  const now = ctx.currentTime + t, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), out = voice(pan, send);
  s.buffer = noiseBuf; s.playbackRate.value = rate; s.loop = dur > 0.9; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f1, now); f.frequency.exponentialRampToValueAtTime(f2, now + dur);
  s.connect(f).connect(out); env(out, now, vol, attack ?? Math.min(0.05, dur * 0.25), dur);
  s.start(now, Math.random() * 0.15); s.stop(now + dur + 0.05);
}
// шорох бумаги: серия мелких «хрустов»
function paper(t0, dur, vol, pan) { const n = 7 + Math.floor(Math.random() * 5); for (let i = 0; i < n; i++) noise({ t: t0 + (i / n) * dur + Math.random() * 0.02, dur: 0.03 + Math.random() * 0.05, vol: vol * (0.4 + Math.random() * 0.6), f1: 2500 + Math.random() * 3500, f2: 1800 + Math.random() * 2000, q: 1.5, pan: pan + (i / n - 0.5) * 0.6, send: 0.08 }); }

const SFX = {
  // нажатие: случайная нота гаммы, очень коротко
  tap: () => pluck(pickNote(0, 4), { dur: 0.11, vol: 0.09, pan: (Math.random() - 0.5) * 0.3, cutoff: 3200 }),
  soft: () => pluck(pickNote(4, 7), { dur: 0.06, vol: 0.045, type: 'sine', send: 0.1 }),
  open: () => { pluck(587.33, { dur: 0.25, vol: 0.09, pan: -0.15 }); bell(880, { t: 0.05, dur: 0.6, vol: 0.06, pan: 0.15, index: 0.8 }); noise({ dur: 0.25, vol: 0.03, f1: 600, f2: 3200, q: 0.6 }); },
  close: () => { pluck(880, { dur: 0.18, vol: 0.08, to: 740, pan: 0.15 }); pluck(587.33, { t: 0.06, dur: 0.26, vol: 0.07, pan: -0.15 }); noise({ dur: 0.2, vol: 0.025, f1: 3000, f2: 500, q: 0.6 }); },
  success: () => { [587.33, 739.99, 880, 1108.73, 1318.51].forEach((f, i) => bell(f, { t: i * 0.065, dur: 1.2, vol: 0.07 - i * 0.008, pan: -0.4 + i * 0.2, index: 1, ratio: 2.01 })); pluck(293.66, { dur: 0.5, vol: 0.08, type: 'sine', send: 0.3 }); },
  error: () => { wood(220, { vol: 0.16 }); wood(207.65, { t: 0.11, vol: 0.13 }); },
  add: () => { const n = pickNote(3, 6); bell(n, { dur: 0.45, vol: 0.08, ratio: 2.76, index: 1.2 }); bell(n * 1.5, { t: 0.06, dur: 0.6, vol: 0.05, pan: 0.3 }); noise({ t: 0.02, dur: 0.12, vol: 0.02, f1: 7000, f2: 9000, q: 3 }); },
  page: () => { const p = (Math.random() - 0.5) * 0.4; noise({ dur: 0.38, vol: 0.06, f1: 500, f2: 2600, q: 0.5, pan: p }); paper(0.02, 0.32, 0.06, p); noise({ t: 0.28, dur: 0.12, vol: 0.05, f1: 300, f2: 180, type: 'lowpass', send: 0.05 }); },
  lid: () => { wood(98, { vol: 0.22, dur: 0.5, send: 0.3 }); noise({ dur: 0.35, vol: 0.05, f1: 400, f2: 120, type: 'lowpass' }); pluck(1760, { t: 0.09, dur: 0.05, vol: 0.03, type: 'square', cutoff: 5000, send: 0.05 }); },
  wood: () => wood(jit(392, 0.04), { vol: 0.14, pan: (Math.random() - 0.5) * 0.4 }),
  ding: () => { bell(1318.51, { dur: 1.6, vol: 0.07, ratio: 1.4, index: 0.6 }); bell(1046.5, { t: 0.32, dur: 2, vol: 0.06, ratio: 1.4, index: 0.6 }); },
  whoosh: () => { const p = Math.random() < 0.5 ? -0.3 : 0.3; noise({ dur: 0.45, vol: 0.05, f1: 250, f2: 2200, q: 0.7, pan: p, send: 0.3, attack: 0.15 }); },
  toggle: () => { pluck(739.99, { dur: 0.08, vol: 0.07 }); pluck(1108.73, { t: 0.05, dur: 0.14, vol: 0.06 }); },
  day: () => { [587.33, 739.99, 880, 1174.66].forEach((f, i) => bell(f, { t: i * 0.05, dur: 0.9, vol: 0.05, pan: -0.3 + i * 0.2, index: 0.7, ratio: 2 })); noise({ dur: 0.8, vol: 0.025, f1: 2000, f2: 8000, q: 0.6, send: 0.5, attack: 0.3 }); },
  night: () => { [880, 739.99, 587.33, 440].forEach((f, i) => bell(f, { t: i * 0.07, dur: 1.2, vol: 0.05, pan: 0.3 - i * 0.2, index: 0.5, ratio: 1.5 })); pluck(146.83, { t: 0.2, dur: 0.9, vol: 0.07, type: 'sine', send: 0.5 }); },
  // ачивка: «пуф» + аккорд + искры, как всплывашка в Steam
  achievement: () => { noise({ dur: 0.18, vol: 0.06, f1: 300, f2: 1600, q: 0.6, send: 0.2 }); pluck(293.66, { t: 0.02, dur: 0.6, vol: 0.09, type: 'sine', send: 0.4 }); [739.99, 1108.73, 1479.98].forEach((f, i) => bell(f, { t: 0.08 + i * 0.03, dur: 1.4, vol: 0.06, pan: -0.3 + i * 0.3, ratio: 2.01, index: 0.9 })); [2349.32, 2959.96, 3520].forEach((f, i) => bell(f, { t: 0.28 + i * 0.07, dur: 0.6, vol: 0.022, pan: 0.5 - i * 0.4, ratio: 3.5, index: 0.4 })); },
  // стойка ресепшена: латунный звонок, долгий звон с биениями
  bell: () => { const p = (Math.random() - .5) * .2; bell(2093, { dur: 2.2, vol: 0.075, ratio: 2.76, index: 1.1, pan: p, send: 0.45 }); bell(2101, { dur: 2.0, vol: 0.05, ratio: 5.4, index: 0.5, pan: p, send: 0.45 }); bell(4186, { dur: 0.5, vol: 0.02, ratio: 1.5, index: 0.4, pan: p }); noise({ dur: 0.04, vol: 0.03, f1: 6000, f2: 4000, q: 2 }); },
  // ключ-карта: шорох по считывателю и двойной «пик»
  swipe: () => { noise({ dur: 0.22, vol: 0.05, f1: 1800, f2: 5200, q: 1.4, attack: 0.02 }); pluck(1760, { t: 0.24, dur: 0.07, vol: 0.05, type: 'sine', send: 0.1 }); pluck(2349.32, { t: 0.33, dur: 0.12, vol: 0.05, type: 'sine', send: 0.15 }); },
  flip: () => { noise({ dur: 0.14, vol: 0.04, f1: 900, f2: 2600, q: 0.8 }); pluck(1174.66, { t: 0.06, dur: 0.08, vol: 0.035, type: 'sine' }); },
  // серебряный клош: металлический звон и пар
  cloche: () => { [1567.98, 2219, 3134, 4120].forEach((f, i) => bell(f, { t: i * 0.004, dur: 1.4 - i * 0.2, vol: 0.035 - i * 0.006, ratio: 1.41 + i * 0.3, index: 0.6, pan: -0.2 + i * 0.13, send: 0.4 })); noise({ t: 0.08, dur: 0.9, vol: 0.035, f1: 900, f2: 5000, q: 0.4, attack: 0.25, send: 0.35 }); },
  clocheDown: () => { wood(330, { vol: 0.08 }); bell(1318.51, { dur: 0.6, vol: 0.03, ratio: 1.41, index: 0.5 }); },
  splash: () => { noise({ dur: 0.35, vol: 0.06, f1: 1200, f2: 400, type: 'lowpass', send: 0.3 }); [0, .05, .11, .19].forEach((t, i) => pluck(600 + Math.random() * 500, { t: 0.04 + t, dur: 0.07, vol: 0.03 - i * 0.005, type: 'sine', to: 1100 + Math.random() * 600, send: 0.35 })); },
  needle: () => { noise({ dur: 0.08, vol: 0.06, f1: 500, f2: 200, type: 'lowpass' }); for (let i = 0; i < 6; i++) noise({ t: 0.05 + i * 0.07 + Math.random() * 0.03, dur: 0.012, vol: 0.03, f1: 3000, f2: 2500, q: 2 }); },
  secret: () => { bell(1174.66, { dur: 0.5, vol: 0.05, ratio: 3.5 }); bell(1479.98, { t: 0.08, dur: 0.7, vol: 0.04, ratio: 3.5, pan: 0.3 }); }
};
const GAP = { splash: 120, bell: 90, swipe: 300, tap: 45, soft: 70, wood: 60, page: 200, whoosh: 150, add: 60 };
export function play(name) {
  if (!soundOn || !unlocked) return; const now = performance.now();
  if (now - (lastAt[name] || 0) < (GAP[name] ?? 40)) return; lastAt[name] = now;
  if (!init()) return; try { SFX[name]?.(); } catch { }
}
export function setSound(on) { soundOn = on; pref.set('mhc-sound', on ? 'on' : 'off'); if (on) play('toggle'); }
// клик по любой кнопке или ссылке — короткий тап; data-sfx="…" задаёт свой звук, data-sfx="" отключает
document.addEventListener('click', e => {
  const el = e.target.closest('button,a,[role=button],summary'); if (!el) return;
  const s = el.dataset.sfx; if (s === '') return; play(s || 'tap');
}, true);

// общий аудио-движок для интерактивных объектов (вертушка диджея и т.п.)
export function audio() { if (!soundOn || !unlocked || !init()) return null; return { ctx, bus, rev, noiseBuf }; }
export function scratch(speed) { if (!soundOn || !unlocked || !init()) return; const v = Math.min(1, Math.abs(speed)); noise({ dur: 0.06 + v * 0.05, vol: 0.02 + v * 0.06, f1: 400 + v * 2200, f2: 300 + v * 900, q: 3, send: 0.05, rate: 0.5 + v }); }
