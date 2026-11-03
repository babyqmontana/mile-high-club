// Вертушка диджея Sky Pool: пластинка крутится, тонарм опускается, играет тихий лаунж,
// который синтезируется прямо в браузере. Пластинку можно схватить и поскрэтчить.
import { audio, scratch, play, soundOn } from './sound.js';
import { unlock } from './achievements.js';

const CHORDS = [ // ре-мажор: Dmaj9 · Bm9 · Gmaj9 · A6/9
  [146.83, 220, 277.18, 329.63, 369.99], [123.47, 185, 220, 293.66, 277.18],
  [98, 196, 246.94, 293.66, 369.99], [110, 220, 277.18, 329.63, 369.99]];
const BASS = [73.42, 61.74, 49, 55];
const MEL = [739.99, 659.25, 587.33, 554.37, 659.25, 739.99, 880, 739.99];

function engine() {
  const A = audio(); if (!A) return null;
  const { ctx, bus, rev } = A;
  const out = ctx.createGain(); out.gain.value = 0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.5;
  const wet = ctx.createGain(); wet.gain.value = 0.35; out.connect(lp).connect(bus); lp.connect(wet).connect(rev);
  const bpm = 92, beat = 60 / bpm; let step = 0, next = ctx.currentTime + 0.1, timer = 0, rate = 1;
  const env = (g, t, v, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); };
  function pad(f, t, d) { [-6, 6].forEach(det => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f * rate; o.detune.value = det; o.connect(g).connect(out); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + d); o.start(t); o.stop(t + d + 0.05); }); }
  function bass(f, t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * rate; o.connect(g).connect(out); env(g, t, 0.16, 0.01, beat * 1.6); o.start(t); o.stop(t + beat * 2); }
  function kick(t) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); o.connect(g).connect(out); env(g, t, 0.35, 0.003, 0.28); o.start(t); o.stop(t + 0.3); }
  function hat(t, v) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = A.noiseBuf; f.type = 'highpass'; f.frequency.value = 7000; s.connect(f).connect(g).connect(out); env(g, t, v, 0.002, 0.05); s.start(t, Math.random() * .3); s.stop(t + 0.07); }
  function keys(f, t) { const o = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(); o.frequency.value = f * rate; m.frequency.value = f * rate * 2; mg.gain.value = f * 0.6; m.connect(mg).connect(o.frequency); o.connect(g).connect(out); env(g, t, 0.035, 0.005, 1.1); o.start(t); m.start(t); o.stop(t + 1.2); m.stop(t + 1.2); }
  function tick() {
    while (next < ctx.currentTime + 0.25) {
      const bar = Math.floor(step / 16) % 4, s16 = step % 16;
      if (s16 === 0) { CHORDS[bar].forEach(f => pad(f, next, beat * 4)); }
      if (s16 === 0 || s16 === 10) bass(BASS[bar], next);
      if (s16 % 8 === 0) kick(next);
      if (s16 % 4 === 2) hat(next, 0.05); else if (s16 % 2 === 1) hat(next, 0.018);
      if ((step * 7) % 11 < 3 && s16 % 2 === 0) keys(MEL[(step >> 1) % MEL.length], next);
      next += beat / 4; step++;
    }
  }
  return {
    start() { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0.9, ctx.currentTime, 0.4); next = ctx.currentTime + 0.05; tick(); timer = setInterval(tick, 60); },
    stop() { out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25); clearInterval(timer); },
    duck(v) { out.gain.setTargetAtTime(v, ctx.currentTime, 0.03); lp.frequency.setTargetAtTime(v < .5 ? 700 : 2400, ctx.currentTime, 0.05); },
  };
}

export function mountDeck(host) {
  host.innerHTML = `<div class="deck"><div class="plat"><div class="rec" id="dkRec"><i class="lbl"><b>MHC</b><small>Sky Pool · Side A</small></i></div><div class="arm" id="dkArm"><i></i></div></div>
    <div class="dkc"><span class="eyebrow">Диджей Sky Pool</span><h3>Поставьте пластинку</h3><p class="note">Нажмите «Играть», чтобы послушать лаунж бассейна. Схватите пластинку и потяните, чтобы поскрэтчить.</p>
      <div class="row"><button class="btn sm" id="dkPlay" data-sfx="">Играть</button><span class="eqb" id="dkEq"><i></i><i></i><i></i><i></i><i></i></span></div>
      <label class="dkv">Громкость<input type="range" id="dkVol" min="0" max="100" value="60"></label></div></div>`;
  const rec = host.querySelector('#dkRec'), arm = host.querySelector('#dkArm'), btn = host.querySelector('#dkPlay'), deck = host.querySelector('.deck');
  let scr = 0, eng = null, playing = false, ang = 0, vel = 0, raf = 0, drag = null, last = 0, vol = .6;
  function loop(t) {
    raf = 0; const dt = Math.min(.05, last ? (t - last) / 1000 : .016); last = t;
    const target = playing && !drag ? 3.2 : 0; // 33⅓ об/мин ≈ 3.5 рад/с
    if (!drag) vel += (target - vel) * Math.min(1, dt * (playing ? 2.5 : 1.2));
    ang += vel * dt; rec.style.transform = `rotate(${ang}rad)`;
    if (playing || Math.abs(vel) > .01 || drag) raf = requestAnimationFrame(loop); else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  function set(on) {
    if (on && !soundOn) { btn.textContent = 'Включите звук'; setTimeout(() => btn.textContent = 'Играть', 1500); return; }
    playing = on; deck.classList.toggle('on', on); btn.textContent = on ? 'Стоп' : 'Играть';
    if (on) { play('needle'); eng = eng || engine(); setTimeout(() => { if (playing) { eng?.start(); eng?.duck(vol); } }, 500); }
    else eng?.stop();
    kick();
  }
  btn.onclick = () => set(!playing);
  host.querySelector('#dkVol').oninput = e => { vol = e.target.value / 100; if (playing) eng?.duck(vol); };
  const angleAt = e => { const r = rec.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  rec.addEventListener('pointerdown', e => { e.preventDefault(); rec.setPointerCapture(e.pointerId); drag = { a: angleAt(e), t: performance.now() }; vel = 0; if (playing) eng?.duck(vol * .25); kick(); });
  rec.addEventListener('pointermove', e => { if (!drag) return; const a = angleAt(e), now = performance.now(); let d = a - drag.a; d = Math.atan2(Math.sin(d), Math.cos(d)); const dt = Math.max(8, now - drag.t) / 1000; ang += d; vel = d / dt; drag.a = a; drag.t = now; if (Math.abs(d) > .02) scratch(vel / 25); scr += Math.abs(d); if (scr > 12) unlock('scratch'); });
  const up = () => { if (!drag) return; drag = null; if (playing) eng?.duck(vol); kick(); };
  rec.addEventListener('pointerup', up); rec.addEventListener('pointercancel', up);
  return { stop() { if (playing) set(false); } };
}
