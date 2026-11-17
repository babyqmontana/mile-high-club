// Вертушка раздела «Отдых»: свои треки отеля (аудиофайлы из панели), а если их нет — музыка с YouTube из настроек сайта. Каждый заход начинается со случайного места,
// громкость плавно растёт при входе в раздел и плавно падает при уходе. Пластинку можно схватить и поскрэтчить.
import { scratch, play, soundOn } from './sound.js';
import { pref } from './api.js';
import { unlock } from './achievements.js';

const FADE_IN = 900, FADE_OUT = 900, IDLE = 120000, PLAYING = 1, ENDED = 0;
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

// Свои треки: обычный <audio>. Каждый раз — случайный трек, по окончании — следующий случайный.
function audioPlayer(tracks, events) {
  const a = new Audio(); a.preload = 'auto'; a.crossOrigin = 'anonymous';
  let list = tracks.slice(), cur = -1, state = -1;
  const pick = () => { if (!list.length) return; let i = Math.floor(Math.random() * list.length); if (list.length > 1 && i === cur) i = (i + 1) % list.length; cur = i; a.src = list[i].url; };
  a.addEventListener('playing', () => { state = PLAYING; events.onStateChange({ data: PLAYING }); });
  a.addEventListener('pause', () => { state = 2; });
  a.addEventListener('ended', () => { state = ENDED; pick(); a.play().catch(() => {}); events.onTitle?.(list[cur]?.title); });
  a.addEventListener('error', () => events.onError?.());
  pick(); a.addEventListener('loadedmetadata', () => events.onReady(), { once: true });
  return {
    getDuration: () => (isFinite(a.duration) ? a.duration : 0), getCurrentTime: () => a.currentTime,
    setVolume: v => { a.volume = Math.max(0, Math.min(1, v / 100)); }, seekTo: s => { try { a.currentTime = s; } catch { } },
    playVideo: () => { a.play().catch(() => {}); }, pauseVideo: () => a.pause(), getPlayerState: () => (a.paused ? 2 : state),
    getVideoData: () => ({ title: list[cur]?.title || '' }),
    setTracks(next) { list = next.slice(); const was = !a.paused; pick(); if (was) a.play().catch(() => {}); events.onTitle?.(list[cur]?.title); }
  };
}
export function mountDeck(host, url, tracks = []) {
  host.innerHTML = `<div class="deck"><div class="plat"><div class="pltr"><div class="rec" id="dkRec"><svg class="lbl" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="dkG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0177a"/><stop offset=".55" stop-color="#ef5617"/><stop offset="1" stop-color="#f7b50a"/></linearGradient><path id="dkP" d="M50 50m-34 0a34 34 0 1 1 68 0a34 34 0 1 1 -68 0"/></defs><circle cx="50" cy="50" r="49" fill="url(#dkG)"/><text><textPath href="#dkP">MILE HIGH CLUB · SKY POOL · SIDE A ·</textPath></text><circle cx="50" cy="50" r="34" fill="none" stroke="#1a0b05" stroke-opacity=".25" stroke-width=".6"/><circle cx="50" cy="50" r="5" fill="#0b0708"/></svg></div><i class="sheen"></i><i class="spdl"></i></div>
    <svg class="tarm" viewBox="0 0 118 100" aria-hidden="true"><defs><linearGradient id="dkB" x1="0" x2="1"><stop offset="0" stop-color="#8a6228"/><stop offset=".5" stop-color="#f9e2a8"/><stop offset="1" stop-color="#8a6228"/></linearGradient><radialGradient id="dkK" cx=".35" cy=".3"><stop offset="0" stop-color="#fbe7b0"/><stop offset="1" stop-color="#8a6228"/></radialGradient></defs>
      <circle cx="104" cy="18" r="8.5" fill="#21151a" stroke="#f7b50a" stroke-opacity=".28" stroke-width=".6"/><circle cx="107" cy="71" r="1.8" fill="#21151a" stroke="#f7b50a" stroke-opacity=".35" stroke-width=".5"/>
      <g class="arm" id="dkArm"><rect x="99.5" y="3.5" width="9" height="7.5" rx="2" fill="url(#dkK)"/><path d="M104 11V70L100.6 77" fill="none" stroke="url(#dkB)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M98.2 75.2L103.6 77.4L101.9 83.4L96.6 81.3Z" fill="#c99a3a"/><circle cx="99.3" cy="82.3" r=".7" fill="#f9e2a8"/><circle cx="104" cy="18" r="3.8" fill="url(#dkK)"/></g></svg>
    <span class="rpm">33<small>⅓</small></span><i class="led"></i></div>
    <div class="dkc"><span class="eyebrow">Радио Sky Pool</span><h3 id="dkT">Лаунж у бассейна</h3><p class="note" id="dkN">Играет тихо на фоне, пока вы в этом разделе. Пластинку можно схватить и поскрэтчить.</p>
      <div class="row"><button class="btn sm" id="dkPlay" data-sfx="">Играть</button><span class="eqb"><i></i><i></i><i></i><i></i><i></i></span></div>
      <label class="dkv">Громкость<input type="range" id="dkVol" min="0" max="100"></label></div><div class="dkyt"><div id="dkYt"></div></div></div>`;
  const $ = s => host.querySelector(s), rec = $('#dkRec'), arm = $('#dkArm'), btn = $('#dkPlay'), deck = $('.deck'), note = $('#dkN');
  let id = idOf(url), own = (tracks || []).filter(t => t?.url), player = null, ready = false, loading = false, playing = false, shown = false, level = 0, fadeT = 0, want = pref.get('mhc-deck') !== 'off';
  let primed = false, idleT = 0, vol = Number(pref.get('mhc-deck-vol')) || 30, ang = 0, vel = 0, raf = 0, drag = null, last = 0, scr = 0, blockT = 0;
  $('#dkVol').value = vol; deck.classList.toggle('none', !own.length && !id);

  function loop(t) {
    raf = 0; const dt = Math.min(.05, last ? (t - last) / 1000 : .016); last = t;
    const target = playing && !drag ? 3.49 : 0; // 33⅓ об/мин = 3.49 рад/с
    if (!drag) vel += (target - vel) * Math.min(1, dt * (playing ? 2.5 : 1.2));
    ang += vel * dt; rec.style.transform = `rotate(${ang}rad)`;
    if (playing || Math.abs(vel) > .01 || drag) raf = requestAnimationFrame(loop); else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  // игла: в покое на стойке, при игре — на внешней дорожке и по ходу трека медленно идёт к этикетке
  let armT = 0; const armAt = deg => arm.style.setProperty('--arm', deg + 'deg');
  const track = () => { const d = player?.getDuration?.() || 0, c = player?.getCurrentTime?.() || 0; armAt(20 + 12 * (d > 0 ? Math.min(1, c / d) : 0)); };
  const ui = on => { playing = on; deck.classList.toggle('on', on); btn.textContent = on ? 'Стоп' : 'Играть'; clearInterval(armT); if (on) { track(); armT = setInterval(track, 1500); } else armAt(-2); kick(); };
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
    if (!own.length && !id) return; if (!soundOn) { note.textContent = 'Включите звук сайта, чтобы слушать.'; return; }
    if (!player) return create();
    if (!ready) { note.textContent = 'Музыка загружается…'; return; }
    clearTimeout(idleT);
    if (primed && player.getPlayerState() === PLAYING) { primed = false; ui(true); fade(vol, FADE_IN); return; } // уже играет без звука с нового места
    clearInterval(fadeT); level = 0; player.setVolume(0); if (!primed) jump(); primed = false; player.playVideo();
    clearTimeout(blockT); blockT = setTimeout(() => { if (!playing) note.textContent = 'Браузер ждёт вашего нажатия: включите музыку кнопкой.'; }, 2000);
  }
  // После затухания переходим на новое случайное место и ещё немного играем без звука: возврат звучит сразу, без подгрузки
  function halt() { clearTimeout(blockT); if (!playing) return; ui(false); fade(0, FADE_OUT, () => { jump(); primed = true; idleT = setTimeout(() => player?.pauseVideo?.(), IDLE); }); }
  async function create() {
    if (loading) return; loading = true;
    if (own.length) {
      const say = t => { if (t) $('#dkT').textContent = t; };
      player = audioPlayer(own, {
        onReady() { ready = true; loading = false; say(player.getVideoData().title); if (shown && want) start(); },
        onStateChange(e) { if (e.data === PLAYING && !playing && shown && want) { ui(true); clearTimeout(blockT); note.textContent = 'Играет тихо на фоне, пока вы в этом разделе. Пластинку можно схватить и поскрэтчить.'; fade(vol, FADE_IN); } },
        onTitle: say, onError() { loading = false; note.textContent = 'Трек не загрузился. Проверьте файлы в настройках сайта.'; }
      });
      return;
    }
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
    want = !playing; if (!want) { clearTimeout(idleT); } pref.set('mhc-deck', want ? 'on' : 'off'); play('needle');
    if (want) start(); else { halt(); idleT = 0; }
  };
  $('#dkVol').oninput = e => { vol = +e.target.value; pref.set('mhc-deck-vol', String(vol)); if (playing && !drag) { clearInterval(fadeT); level = vol; player?.setVolume?.(vol); } };

  const angleAt = e => { const r = rec.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  rec.addEventListener('pointerdown', e => { e.preventDefault(); rec.setPointerCapture(e.pointerId); drag = { a: angleAt(e), t: performance.now() }; vel = 0; if (playing) fade(vol * .25, 200); kick(); });
  rec.addEventListener('pointermove', e => {
    if (!drag) return; const a = angleAt(e), now = performance.now(); let d = a - drag.a; d = Math.atan2(Math.sin(d), Math.cos(d));
    const dt = Math.max(8, now - drag.t) / 1000; ang += d; vel = d / dt; drag.a = a; drag.t = now; rec.style.transform = `rotate(${ang}rad)`;
    if (Math.abs(vel) > 2) { scratch(Math.min(1, Math.abs(vel) / 30)); if (++scr > 40) unlock('scratch'); }
  });
  const up = () => { if (!drag) return; drag = null; if (playing) fade(vol, 400); kick(); };
  rec.addEventListener('pointerup', up); rec.addEventListener('pointercancel', up);

  if (own.length || id) create(); // плеер готовится заранее: к заходу в раздел музыка стартует сразу
  return {
    active(on) { shown = on; if (on && want) start(); else if (!on) halt(); },
    sound() { if (!soundOn) halt(); else if (shown && want) start(); },
    tracks(next) {
      const n = (next || []).filter(t => t?.url); if (JSON.stringify(n) === JSON.stringify(own)) return;
      const hadOwn = own.length; own = n; deck.classList.toggle('none', !own.length && !id);
      if (own.length && hadOwn && player?.setTracks) { player.setTracks(own); return; }
      halt(); player = null; ready = false; loading = false; if (own.length || id) create();
    },
    url(next) {
      if (own.length) { id = idOf(next); return; }
      const n = idOf(next); if (n === id) return; id = n; deck.classList.toggle('none', !id);
      if (!id) { halt(); return; }
      if (player && ready) { halt(); player.cueVideoById(id); setTimeout(() => { const t = player.getVideoData?.().title; if (t) $('#dkT').textContent = t; if (shown && want) start(); }, FADE_OUT + 300); }
    }
  };
}
