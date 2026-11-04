// Вертушка раздела «Отдых»: музыка с YouTube из настроек сайта. Каждый заход начинается со случайного места,
// громкость плавно растёт при входе в раздел и плавно падает при уходе. Пластинку можно схватить и поскрэтчить.
import { scratch, play, soundOn } from './sound.js';
import { pref } from './api.js';
import { unlock } from './achievements.js';

const FADE_IN = 2600, FADE_OUT = 1500, PLAYING = 1, ENDED = 0;
const idOf = url => (String(url || '').match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/) || [])[1] || '';

let api = null;
const loadApi = () => api ||= new Promise(done => {
  if (window.YT?.Player) return done(window.YT);
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { prev?.(); done(window.YT); };
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => { api = null; done(null); };
  document.head.append(s);
});

export function mountDeck(host, url) {
  host.innerHTML = `<div class="deck"><div class="plat"><div class="rec" id="dkRec"><svg class="lbl" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="dkG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0177a"/><stop offset=".55" stop-color="#ef5617"/><stop offset="1" stop-color="#f7b50a"/></linearGradient><path id="dkP" d="M50 50m-34 0a34 34 0 1 1 68 0a34 34 0 1 1 -68 0"/></defs><circle cx="50" cy="50" r="49" fill="url(#dkG)"/><text><textPath href="#dkP">MILE HIGH CLUB · SKY POOL · SIDE A ·</textPath></text><circle cx="50" cy="50" r="7" fill="#0b0708"/></svg></div><div class="arm" id="dkArm"><i></i></div></div>
    <div class="dkc"><span class="eyebrow">Радио Sky Pool</span><h3 id="dkT">Лаунж у бассейна</h3><p class="note" id="dkN">Играет тихо на фоне, пока вы в этом разделе. Пластинку можно схватить и поскрэтчить.</p>
      <div class="row"><button class="btn sm" id="dkPlay" data-sfx="">Играть</button><span class="eqb"><i></i><i></i><i></i><i></i><i></i></span></div>
      <label class="dkv">Громкость<input type="range" id="dkVol" min="0" max="100"></label></div><div class="dkyt"><div id="dkYt"></div></div></div>`;
  const $ = s => host.querySelector(s), rec = $('#dkRec'), btn = $('#dkPlay'), deck = $('.deck'), note = $('#dkN');
  let id = idOf(url), player = null, ready = false, loading = false, playing = false, shown = false, level = 0, fadeT = 0, want = pref.get('mhc-deck') !== 'off';
  let vol = Number(pref.get('mhc-deck-vol')) || 30, ang = 0, vel = 0, raf = 0, drag = null, last = 0, scr = 0, blockT = 0;
  $('#dkVol').value = vol; deck.classList.toggle('none', !id);

  function loop(t) {
    raf = 0; const dt = Math.min(.05, last ? (t - last) / 1000 : .016); last = t;
    const target = playing && !drag ? 3.2 : 0; // 33⅓ об/мин ≈ 3.5 рад/с
    if (!drag) vel += (target - vel) * Math.min(1, dt * (playing ? 2.5 : 1.2));
    ang += vel * dt; rec.style.transform = `rotate(${ang}rad)`;
    if (playing || Math.abs(vel) > .01 || drag) raf = requestAnimationFrame(loop); else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const ui = on => { playing = on; deck.classList.toggle('on', on); btn.textContent = on ? 'Стоп' : 'Играть'; kick(); };
  const fade = (to, ms, done) => {
    clearInterval(fadeT); const from = level, t0 = performance.now();
    fadeT = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms); level = from + (to - from) * k * k * (3 - 2 * k);
      player?.setVolume?.(Math.round(level));
      if (k === 1) { clearInterval(fadeT); done?.(); }
    }, 50);
  };
  // случайное место: не первые и не последние секунды
  function jump() { const d = player.getDuration?.() || 0; if (d > 90) player.seekTo(d * .04 + Math.random() * d * .86, true); }
  function start() {
    if (!id) return; if (!soundOn) { note.textContent = 'Включите звук сайта, чтобы слушать.'; return; }
    if (!player) return create();
    if (!ready) return;
    clearInterval(fadeT); level = 0; player.setVolume(0); jump(); player.playVideo();
    clearTimeout(blockT); blockT = setTimeout(() => { if (!playing) note.textContent = 'Браузер ждёт вашего нажатия: включите музыку кнопкой.'; }, 2000);
  }
  function halt() { clearTimeout(blockT); if (!playing) return; ui(false); fade(0, FADE_OUT, () => player?.pauseVideo?.()); }
  async function create() {
    if (loading) return; loading = true;
    const YT = await loadApi(); if (!YT) { loading = false; note.textContent = 'Музыка сейчас недоступна.'; return; }
    player = new YT.Player($('#dkYt'), {
      width: '100%', height: '100%', videoId: id, host: 'https://www.youtube-nocookie.com',
      playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, origin: location.origin },
      events: {
        onReady() { ready = true; loading = false; const t = player.getVideoData?.().title; if (t) $('#dkT').textContent = t; if (shown && want) start(); },
        onStateChange(e) {
          if (e.data === PLAYING && !playing && shown && want) { ui(true); clearTimeout(blockT); note.textContent = 'Играет тихо на фоне, пока вы в этом разделе. Пластинку можно схватить и поскрэтчить.'; fade(vol, FADE_IN); }
          if (e.data === ENDED) { jump(); player.playVideo(); }
        },
        onError() { loading = false; note.textContent = 'Это видео нельзя воспроизвести. Замените ссылку в настройках сайта.'; }
      }
    });
  }
  btn.onclick = () => {
    want = !playing; pref.set('mhc-deck', want ? 'on' : 'off'); play('needle');
    if (want) start(); else halt();
  };
  $('#dkVol').oninput = e => { vol = +e.target.value; pref.set('mhc-deck-vol', String(vol)); if (playing && !drag) { clearInterval(fadeT); level = vol; player?.setVolume?.(vol); } };

  const angleAt = e => { const r = rec.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  rec.addEventListener('pointerdown', e => { e.preventDefault(); rec.setPointerCapture(e.pointerId); drag = { a: angleAt(e), t: performance.now() }; vel = 0; if (playing) fade(vol * .25, 200); kick(); });
  rec.addEventListener('pointermove', e => {
    if (!drag) return; const a = angleAt(e), now = performance.now(); let d = a - drag.a; d = Math.atan2(Math.sin(d), Math.cos(d));
    const dt = Math.max(8, now - drag.t) / 1000; ang += d; vel = d / dt; drag.a = a; drag.t = now; rec.style.transform = `rotate(${ang}rad)`;
    if (Math.abs(vel) > 2) { scratch(Math.min(1, Math.abs(vel) / 30)); if (++scr > 40) unlock('dj'); }
  });
  const up = () => { if (!drag) return; drag = null; if (playing) fade(vol, 400); kick(); };
  rec.addEventListener('pointerup', up); rec.addEventListener('pointercancel', up);

  return {
    active(on) { shown = on; if (on && want) start(); else if (!on) halt(); },
    sound() { if (!soundOn) halt(); else if (shown && want) start(); },
    url(next) {
      const n = idOf(next); if (n === id) return; id = n; deck.classList.toggle('none', !id);
      if (!id) { halt(); return; }
      if (player && ready) { halt(); player.cueVideoById(id); setTimeout(() => { const t = player.getVideoData?.().title; if (t) $('#dkT').textContent = t; if (shown && want) start(); }, FADE_OUT + 300); }
    }
  };
}
