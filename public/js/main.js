import { S, $, $$, esc, money, when, hhmm, plural, I, bg, toast, fail, modal, confirmBox, sheet, openSheet, closeSheet, reveal, pushLayer, popLayer, hasWebGL, magnet } from './ui.js';
import { api, subscribe, authConfig, login, logout, DEMO, pref } from './api.js';
import { play, setSound, soundOn } from './sound.js';
import { mountWeather } from './wx.js';
import { unlock, burst, openCabinet, count as achCount, LIST as ACH, onChange as onAch, ids as achIds, merge as achMerge } from './achievements.js';
import { venueState, mskMinutes, weatherNow, ROOM_STATUS, BOOKING_STATUS, ORDER_STATUS, TICKET_STATUS, CIGAR_SHAPES, minutesOf, inSpan, roomGameFloor } from './core.js';

document.documentElement.classList.add('js');
// авторство сайта: IC — создатель в игре (Louis Cruze), OOC — реальный автор (babymontana)
const COPY_YEARS = (y => (y > 2026 ? `2026–${y}` : '2026'))(new Date().getFullYear());
const ROUTES = [['home', 'Главная'], ['stay', 'Номера'], ['leisure', 'Отдых'], ['dining', 'Le Ciel'], ['cigars', 'Сигары'], ['journal', 'Журнал'], ['staff', 'Персонал'], ['contact', 'Заявка']];
const STATE_CHIP = { live: ['Live', 'p live'], open: ['Открыто', 'ok'], calm: ['Тихо', 'warn'], closed: ['Закрыто', 'm'], event: ['Событие', 'v live'], soon: ['Скоро', 't'] };
const KIND_LABEL = { pool: 'Бассейн', bar: 'Бар', restaurant: 'Ресторан', club: 'Клуб', spa: 'Спа' };
let authCfg = { oauth: false, demo: false }, current = 'home', mods = {};

/* ---------------- оболочка ---------------- */
function shell() {
  $('#app').innerHTML = `
  <canvas class="wxbg" id="wxBg" aria-hidden="true"></canvas>
  <header class="nav"><div class="wrap">
    <a class="brand" href="#home" aria-label="На главную"><img src="img/emblem.webp?v=2" alt="" width="42" height="42"><b>MILE HIGH<br>CLUB</b></a>
    <nav class="links" aria-label="Разделы">${ROUTES.map(([id, n]) => `<a href="#${id}" data-r="${id}"><span class="rl"><span data-t="${n}">${n}</span></span></a>`).join('')}</nav>
    <div class="navr">
      <span class="pill wxp" id="wxChip" title="Погода и время над отелем"></span>
      <a class="pill" href="#stay" title="Свободные номера сейчас"><span class="d"></span><span class="t">Свободно</span><b class="num" id="navFree">—</b></a>
      <button class="ibtn" id="sndBtn" aria-label="Звук" data-sfx=""></button>
      <span id="navUser"></span>
      <button class="ibtn burger" id="burger" aria-label="Меню" data-sfx="open">${I.menu}</button>
    </div>
  </div></header>
  <nav class="drawer" id="drawer" aria-label="Меню"><button class="ibtn x" id="drawerX" aria-label="Закрыть" data-sfx="close">${I.x}</button>${ROUTES.map(([id, n], i) => `<a href="#${id}" data-r="${id}"><i>${String(i + 1).padStart(2, '0')}</i>${n}</a>`).join('')}<a href="#me" data-r="me"><i>${I.user}</i>Мои брони и заявки</a><div class="dtools"><button type="button" class="btn ghost" id="dSnd" data-sfx=""></button></div></nav>
  <main id="main">${ROUTES.concat([['me'], ['admin'], ['issue'], ['privacy'], ['lost']]).map(([id]) => `<section class="view" data-view="${id}"></section>`).join('')}</main>
  <footer><div class="wrap"><span id="foot"></span><span class="row"><a href="#me">Мои брони</a><span>·</span><button class="secrets" id="achBtn" data-sfx="secret">Секреты отеля <b class="num" id="achN"></b></button><span>·</span><a href="#admin">Вход для персонала</a><span>·</span><a href="#privacy">Конфиденциальность</a></span></div><div class="wrap credits"><span>© ${COPY_YEARS} Mile High Club · Создатель сайта Louis Cruze</span><span class="ooc"><b>OOC</b>Сайт: babymontana</span></div><div class="wrap kon" aria-hidden="true">↑ ↑ ↓ ↓ ← → ← → B A</div></footer>
  <button class="fab" id="fab" aria-label="Заказ в номер" data-sfx="open"><span class="n" id="fabN">0</span>${I.cart}<span id="fabT">$0</span></button>`;
  const drawer = $('#drawer'), closeDrawer = () => { if (!drawer.classList.contains('on')) return; drawer.classList.remove('on'); popLayer(drawer); $('#burger').setAttribute('aria-expanded', 'false'); };
  $('#burger').setAttribute('aria-controls', 'drawer'); $('#burger').setAttribute('aria-expanded', 'false');
  $('#burger').onclick = () => { drawer.classList.add('on'); pushLayer(drawer, closeDrawer); $('#burger').setAttribute('aria-expanded', 'true'); $('#drawerX').focus(); };
  $('#drawerX').onclick = closeDrawer;
  $$('#drawer a').forEach(a => a.addEventListener('click', closeDrawer));
  // звук и день/ночь: в шапке, а на узких экранах — в меню (те же действия)
  $('#sndBtn').onclick = $('#dSnd').onclick = () => { setSound(!soundOn); paintNav(); mods.deck?.sound(); burst('dj', 8, 20000); };
  // логотип: с каждым кликом подрагивает сильнее — намёк, что что-то будет
  { let n = 0, tmr = 0; $('.brand').addEventListener('click', () => { clearTimeout(tmr); tmr = setTimeout(() => { n = 0; $('.brand').style.removeProperty('--wob'); }, 2500); n++; const b = $('.brand'); b.style.setProperty('--wob', Math.min(n, 7)); b.classList.remove('wob'); void b.offsetWidth; b.classList.add('wob'); if (n >= 7) { n = 0; unlock('logo'); } }); }
  $('#achBtn').onclick = () => openCabinet();
  const paintAch = () => { $('#achN').textContent = `${achCount()}/${ACH.length}`; }; paintAch(); onAch(paintAch);
  $('#fab').onclick = openCart; magnet($('#fab'));
  addEventListener('scroll', onScroll, { passive: true });
}
function paintNav() {
  $('#sndBtn').innerHTML = soundOn ? I.sound : I.mute; $('#sndBtn').setAttribute('aria-label', soundOn ? 'Выключить звук' : 'Включить звук');
  $('#dSnd').innerHTML = `${soundOn ? I.sound : I.mute}${soundOn ? 'Звук включён' : 'Звук выключен'}`; $('#dSnd').setAttribute('aria-pressed', soundOn);
  const u = S.me;
  $('#navUser').innerHTML = u ? `<button class="ibtn" id="userBtn" aria-label="Профиль" style="overflow:hidden;padding:0">${u.avatar ? `<img class="avatar" src="${esc(u.avatar)}" alt="">` : `<span class="avatar">${esc((u.username || '?')[0])}</span>`}</button>` : `<button class="ibtn" id="userBtn" aria-label="Мои брони и вход">${I.user}</button>`;
  $('#userBtn').onclick = () => location.hash = u && u.role !== 'guest' ? '#admin' : '#me';
  if (S.pub) { const f = S.pub.rooms.filter(r => r.status === 'free').length; { const nf = $('#navFree'), val = `${f}/${S.pub.rooms.length}`; if (nf.textContent !== val) { const had = nf.textContent !== '—'; nf.textContent = val; if (had) { nf.classList.remove('tick'); void nf.offsetWidth; nf.classList.add('tick'); } } } $('#foot').textContent = S.pub.settings.footer || ''; }
}
// сайт всегда в ночной теме: тёмный интерфейс, ночной отель и ночное небо
function mode() { return 'night'; }
// погода: фон страницы, главный экран, 3D-башня и значок в шапке
const WXI = { clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  night: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 15a4.5 4.5 0 1 1 1.5-8.7A6 6 0 0 1 19 9a3.5 3.5 0 0 1-1 6.9H7z"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/></svg>',
  fog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h13M3 13h18M6 17h13M8 5h8"/></svg>',
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M4 6.5l16 11M4 17.5l16-11M9 3.5l3 2 3-2M9 20.5l3-2 3 2"/></svg>' };
let wxBg = null, wxNow = null, garland = null;
function applyWeather() {
  if (!S.pub) return; const w = weatherNow(S.pub.settings), m = mode(), root = document.documentElement;
  wxNow = w; root.dataset.wx = w.kind; if (w.kind === 'snow') unlock('snow'); root.dataset.theme = w.newyear ? 'newyear' : '';
  if (w.newyear && !garland) { garland = 'loading'; import('./garland.js').then(m => { garland = m.mountGarland($('.nav')); }); }
  if (!w.newyear && garland?.destroy) { garland.destroy(); garland = null; }
  if (!wxBg && $('#wxBg')) wxBg = mountWeather($('#wxBg'), { strength: .55 });
  wxBg?.set(w.kind, m === 'day'); mods.heroWx?.set(w.kind, m === 'day'); mods.hero?.setWeather?.(w.kind); mods.tower?.setWeather?.(w);
  const c = $('#wxChip'); if (c) c.innerHTML = `${w.kind === 'clear' && m === 'night' ? WXI.night : WXI[w.kind]}<b class="num">${w.temp > 0 ? '+' : w.temp < 0 ? '−' : ''}${Math.abs(w.temp)}°</b><span class="t">${hhmm(Date.now())}</span>`;
  const wt = $('#wxTile'); if (wt) wt.textContent = `${w.label}, ${w.temp > 0 ? '+' : w.temp < 0 ? '−' : ''}${Math.abs(w.temp)}° · ${m === 'day' ? 'день' : 'ночь'}`;
}
function applyMode() { const m = mode(); if (document.documentElement.dataset.mode !== m) { document.documentElement.dataset.mode = m; mods.tower?.relight?.(); mods.staff?.relight?.(); mods.hum?.relight?.(); if (current === 'home') renderHome(); } paintNav(); applyWeather(); }
function onScroll() { }

/* ---------------- маршруты ---------------- */
// «Этажи» разделов: по ним выбирается направление перехода-лифта (вверх или вниз)
const FLOOR = { admin: -1, home: 0, staff: 1, me: 2, journal: 3, issue: 3, lost: 4, privacy: 5, contact: 20, stay: 23, dining: 30, cigars: 31, leisure: 39 };
const VT = typeof document.startViewTransition === 'function';
if (VT) document.documentElement.classList.add('vt');
let booted = false, vtRunning = null;
function viewOf(hash) {
  let h = (hash || '#home').slice(1);
  if (h === 'login-error') return 'admin';
  if (h.startsWith('issue-')) return 'issue';
  return $(`.view[data-view="${h}"]`) && h !== 'lost' ? h : (h && h !== 'home' && h !== 'lost' ? 'lost' : 'home');
}
function route() {
  const next = viewOf(location.hash);
  if (itemsDirty && (next === 'contact' || next === 'me')) loadItems();
  if (next === 'contact' && current !== 'contact' && ticketStep === 3) { ticketStep = 1; curTicket = null; } // вернулись после отправки: снова чистая форма
  const animate = VT && booted && next !== current && document.visibilityState === 'visible' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate) return doRoute();
  vtRunning?.skipTransition();
  const root = document.documentElement;
  root.dataset.dir = (FLOOR[next] ?? 0) >= (FLOOR[current] ?? 0) ? 'up' : 'down';
  root.classList.add('vt-route');
  // обложка журнала «перетекает» между списком и шапкой выпуска (в обе стороны)
  const prevIssue = S.param;
  let from = null;
  if (current === 'journal' && next === 'issue') from = S.coverFrom?.isConnected ? S.coverFrom : null;
  if (current === 'issue' && next === 'journal') from = $('.view.on .ihead .cv');
  if (from) from.style.viewTransitionName = 'issue-cover';
  let to = null;
  const vt = vtRunning = document.startViewTransition(() => {
    doRoute();
    if (!from) return;
    from.style.viewTransitionName = '';
    to = next === 'issue' ? $('.view.on .ihead .cv') : $(`.view.on .issue[href="#issue-${CSS.escape(prevIssue || '')}"] .cv`);
    if (to) to.style.viewTransitionName = 'issue-cover';
  });
  // прерванный переход (новый клик во время анимации) отклоняет ready — это штатно, раздел уже переключён
  vt.ready.catch(() => {}); vt.updateCallbackDone.catch(e => console.error(e));
  vt.finished.finally(() => { if (to) to.style.viewTransitionName = ''; if (from) from.style.viewTransitionName = ''; S.coverFrom = null; if (vtRunning === vt) { vtRunning = null; root.classList.remove('vt-route'); } });
}
function doRoute() {
  let h = (location.hash || '#home').slice(1), param = null;
  if (h === 'login-error') { toast('Вход через Discord не удался. Попробуйте ещё раз.', 'err'); h = 'admin'; history.replaceState(null, '', '#admin'); }
  if (h.startsWith('issue-')) { param = h.slice(6); h = 'issue'; }
  if (!$(`.view[data-view="${h}"]`) || h === 'lost') { if (h && h !== 'home' && h !== 'lost') { S.lostPath = h; h = 'lost'; } else h = 'home'; }
  const changed = h !== current; current = h; S.view = h; S.param = param;
  $$('.view').forEach(v => v.classList.toggle('on', v.dataset.view === h));
  $$('[data-r]').forEach(a => a.dataset.r === (h === 'issue' ? 'journal' : h) ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  document.querySelector('footer').classList.toggle('hide', h === 'admin');
  if (h !== 'issue' && mods.book) { mods.book.destroy(); mods.book = null; delete view('issue').dataset.id; }
  Object.entries(mods).forEach(([k, m]) => m?.active?.(k === viewMod(h)));
  render(h);
  if (changed) { scrollTo({ top: 0 }); play('whoosh'); }
  updFab();
}
const viewMod = h => ({ stay: 'tower', cigars: 'hum', staff: 'staff', issue: 'book', leisure: 'deck' }[h]);
function render(h = current) {
  if (!S.pub) return;
  try { ({ home: renderHome, stay: renderStay, leisure: renderLeisure, dining: renderDining, cigars: renderCigars, journal: renderJournal, issue: renderIssue, staff: renderStaff, contact: renderContact, me: renderMe, admin: renderAdmin, privacy: renderPrivacy, lost: renderLost }[h] || renderHome)(); }
  catch (e) { console.error(e); }
  prefill();
  reveal($(`.view[data-view="${h}"]`));
}
const view = h => $(`.view[data-view="${h}"]`);
const focusedIn = el => el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);

/* ---------------- главная ---------------- */
function stateChip(st) { const c = STATE_CHIP[st.state] || STATE_CHIP.open; return `<span class="chip ${c[1]}"><span class="d"></span>${c[0]}</span>`; }
function nextChange(v) {
  const m = mskMinutes(); const span = (v.schedule || []).find(s => inSpan(m, minutesOf(s.from), minutesOf(s.to)));
  return span ? `до ${span.to}` : '';
}
const RANK = { event: 0, live: 1, open: 2, calm: 3, soon: 4, closed: 5 };
// Табло отеля: значения на перекидных ячейках. Меняющийся символ перещёлкивается — при обновлении по SSE
// или смене минуты. Ширина значения — 7 ячеек, как на настоящем табло; пустые ячейки остаются видны.
const FLAP_WORD = { live: 'LIVE', open: 'ОТКРЫТО', calm: 'ТИХО', closed: 'ЗАКРЫТО', event: 'СОБЫТИЕ', soon: 'СКОРО' };
const flapPrev = new Map();
function flap(key, text) {
  const t = String(text).slice(0, 7).padStart(7, ' '), prev = flapPrev.get(key); flapPrev.set(key, t);
  return `<span class="sr">${esc(String(text))}</span><span class="fls" aria-hidden="true">${[...t].map((c, i) => `<span class="fl${c === ' ' ? ' e' : ''}${prev && prev[i] !== c ? ' flip' : ''}" style="--i:${i}">${c === ' ' ? '' : esc(c)}</span>`).join('')}</span>`;
}
// площадки для 3D-башни: этаж из подписи («30 этаж»), без номера — атриум у входа
const towerVenues = () => (S.pub.venues || []).map(v => { const n = parseInt((String(v.floor || '').match(/\d+/) || [])[0], 10); return { id: v.id, name: v.name, kind: v.kind, accent: v.accent || '#f7b50a', floor: Number.isFinite(n) ? n : 1, label: venueState(v, S.pub.events).label || '' }; });
const venueRoute = v => ({ restaurant: 'dining', club: 'cigars' }[v.kind] || 'leisure');
// Шахта лифта: реальные этажи площадок (venue.floor) и номеров, сверху вниз, с живыми статусами
function shaftHtml(p, latest) {
  const rows = p.venues.map(v => { const n = parseInt((String(v.floor || '').match(/\d+/) || [])[0], 10), ok = Number.isFinite(n); return { n: ok ? n : 0.5, label: ok ? String(n) : 'A', name: v.name, sub: [v.gameFloor, v.desc].filter(Boolean).join(' · '), href: '#' + venueRoute(v), venue: v.id, chip: stateChip(venueState(v, p.events)) }; });
  const fl = [...new Set(p.rooms.map(r => r.floor))].sort((a, b) => a - b);
  if (fl.length) { const free = p.rooms.filter(r => r.status === 'free').length; rows.push({ n: fl.at(-1), label: fl.length > 1 ? `${fl[0]}–${fl.at(-1)}` : String(fl[0]), name: 'Номера и сюиты', sub: `Rooms Floor 1–6 · ${p.rooms.length} ${plural(p.rooms.length, 'номер', 'номера', 'номеров')} на ${fl.length} ${plural(fl.length, 'этаже', 'этажах', 'этажах')}`, href: '#stay', chip: `<span class="chip ${free ? 'ok' : 'bad'}"><span class="d"></span>Свободно ${free}</span>` }); }
  rows.push({ n: 0, label: 'Л', name: 'Лобби · Mile High Journal', sub: latest ? `Свежий выпуск: ${latest.number || ''} ${latest.title}` : 'Журнал отеля', href: latest ? '#issue-' + latest.id : '#journal', chip: '' });
  rows.sort((a, b) => b.n - a.n);
  return `<section class="shaft reveal" aria-labelledby="shaftH"><div class="head"><span class="eyebrow">Этажи отеля</span><h2 id="shaftH">Куда поднимемся?</h2></div>
    <ol class="shaft-floors" id="floors"><i class="car" aria-hidden="true"></i>${rows.map(r => `<li><a class="shaft-floor" href="${r.href}"${r.venue ? ` data-venue="${esc(r.venue)}"` : ''}><span class="fn num${r.label.includes('–') ? ' rng' : ''}">${esc(r.label)}</span><span class="ft"><b>${esc(r.name)}</b><small>${esc(r.sub || '')}</small></span><span class="fs">${r.chip}</span><span class="fa">${I.arrow}</span></a></li>`).join('')}</ol></section>`;
}
function wireHome() {
  const fl = $('#floors');
  if (fl) {
    const car = fl.querySelector('.car');
    const go = a => { const r = a.getBoundingClientRect(), b = fl.getBoundingClientRect(); car.style.transform = `translateY(${r.top - b.top}px)`; car.style.height = r.height + 'px'; fl.classList.add('moving'); };
    $$('.shaft-floor', fl).forEach(a => { a.addEventListener('pointerenter', () => go(a)); a.addEventListener('focus', () => go(a)); });
    fl.addEventListener('pointerleave', () => { if (!fl.contains(document.activeElement)) fl.classList.remove('moving'); });
    fl.addEventListener('focusout', e => { if (!fl.contains(e.relatedTarget)) fl.classList.remove('moving'); });
  }
  // площадка с табло или из шахты → в «Отдыхе» прокручиваемся прямо к её карточке
  $$('#homeRest a[data-venue][href="#leisure"]').forEach(a => a.addEventListener('click', () => { S.focusVenue = a.dataset.venue; }));
}
function renderHome() {
  const p = S.pub, s = p.settings, m = mode(), free = p.rooms.filter(r => r.status === 'free').length;
  const evs = p.events.filter(e => (e.end || e.start + 3 * 3600e3) > Date.now()).slice(0, 12);
  const latest = p.issues[0];
  const heroHtml = `
  <section class="dive" id="dive"><div class="stick">
    <div class="bg" style="background-image:url('${esc(m === 'day' ? s.heroDay : s.heroNight)}')"></div><canvas id="heroGl" aria-hidden="true"></canvas><canvas class="wxc" id="heroWx" aria-hidden="true"></canvas>
    <div class="wrap dv dv1" id="dv1"><img class="logo" id="heroLogo" src="img/logo.webp?v=3" alt="${esc(s.hotelName)}" width="500" height="300">
      <h1>${nowrapHyphens(esc(s.tagline || 'Отель над Лос-Сантосом'))}. <span class="serif">${m === 'day' ? 'Бассейн, диджей и обед на высоте.' : 'Ночь только начинается.'}</span></h1>
      <div class="row"><a class="btn" href="#stay">Забронировать номер</a><a class="btn ghost" href="#leisure">Что сейчас открыто</a></div></div>
    <div class="wrap dv dv2" id="dv2"><span class="eyebrow">Вы в атриуме</span><h2>Сорок этажей стекла, латуни и неона</h2><p>Лифт поднимет в номера с 20 этажа, бассейны ждут на 38 и 40, Le Ciel на 30.</p><div class="row"><a class="btn" href="#stay">Выбрать номер</a><a class="btn ghost" href="#cigars">Сигарный клуб</a></div></div>
    <span class="hint" id="dvHint">Листайте, чтобы войти</span>
  </div></section>
`;
  const restHtml = `
  <div class="wrap">
    <section class="fboard" aria-label="Табло отеля">
      <div class="fb-head"><span class="eyebrow">Табло отеля</span><span class="fb-live"><span class="d"></span>Обновляется вживую</span></div>
      <div class="fb-rows">
      <a class="fb-row" href="#stay" data-st="${free ? 'open' : 'closed'}"><span class="fb-k">Номера</span><span class="fb-v">${flap('rooms', `${free}/${p.rooms.length}`)}</span><span class="fb-s">${free ? 'свободно прямо сейчас' : 'все номера заняты'}</span></a>
      ${p.venues.map(v => ({ v, st: venueState(v, p.events) })).sort((a, b) => (RANK[a.st.state] ?? 9) - (RANK[b.st.state] ?? 9)).map(({ v, st }) => `<a class="fb-row" href="#${venueRoute(v)}" data-venue="${esc(v.id)}" data-st="${st.state}"><span class="fb-k">${esc(v.name)}</span><span class="fb-v">${flap('v-' + v.id, FLAP_WORD[st.state] || FLAP_WORD.open)}</span><span class="fb-s">${esc(st.label || '')}${st.state !== 'event' && st.state !== 'soon' && st.state !== 'closed' ? ' · ' + nextChange(v) : ''}</span></a>`).join('')}
      <div class="fb-row" data-st="clock"><span class="fb-k">Время в отеле</span><span class="fb-v" id="clock">${flap('clock', hhmm(Date.now()))}</span><span class="fb-s" id="wxTile">${wxNow ? '' : (m === 'day' ? 'День' : 'Ночь')}</span></div>
      </div>
    </section>
  </div>
  <div class="wrap sec">
    <div class="row reveal" style="justify-content:space-between;margin-bottom:1.2rem"><div class="head" style="margin:0"><span class="eyebrow">Афиша</span><h2>События отеля</h2></div>${s.discordInvite ? `<a class="btn ghost sm" href="${esc(s.discordInvite)}" target="_blank" rel="noopener">${I.discord} События в Discord</a>` : ''}</div>
    ${evs.length ? `<div class="events reveal">${evs.map(evCard).join('')}</div>` : '<div class="empty reveal">Событий пока нет. Следите за анонсами на сервере.</div>'}
  </div>
  ${(p.offers || []).length ? `<div class="wrap sec" style="padding-top:0">
    <div class="head reveal"><span class="eyebrow">Предложения</span><h2>Пакеты отеля</h2></div>
    <div class="offers">${p.offers.map(o => `<a class="offer reveal" href="${esc(o.link || '#stay')}"><div ${bg(o.image, '', '#F0177A', '#F7B50A', 'img')}></div><div class="ob"><span class="tag">${esc(o.tag || '')}</span><h3>${esc(o.title)}</h3><p>${esc(o.desc || '')}</p><div class="row" style="justify-content:space-between;margin-top:auto"><b class="num">${esc(o.price || '')}</b><span class="lnk">${esc(o.cta || 'Подробнее')} ${I.arrow}</span></div></div></a>`).join('')}</div>
  </div>` : ''}
  <div class="wrap sec" style="padding-top:0">${shaftHtml(p, latest)}</div>
  <div class="wrap" style="padding-bottom:4rem"><div class="dc reveal">
    <div class="stack"><span class="eyebrow">Discord</span><h3 style="font-size:clamp(1.4rem,3vw,2.2rem)">Всё главное на сайте. В Discord общаемся.</h3><p class="mut">Бронь, заявки, меню и журнал живут здесь. На сервере — анонсы, события и бот, который показывает свободные номера.</p>
      <div class="row">${s.discordInvite ? `<a class="btn discord" href="${esc(s.discordInvite)}" target="_blank" rel="noopener">${I.discord} Зайти на сервер</a>` : ''}<a class="btn ghost" href="#contact">Оставить заявку</a></div></div>
  </div></div>`;
  const key = m + '|' + (m === 'day' ? s.heroDay : s.heroNight) + '|' + s.tagline;
  const v = view('home');
  if (v.dataset.key === key && $('#homeRest')) { $('#homeRest').innerHTML = restHtml; wireHome(); reveal(v); applyWeather(); return; }
  // старый атриум и его погода отдают GPU и обработчики до того, как появится новый
  mods.hero?.destroy?.(); mods.hero = null; mods.heroWx?.destroy?.(); mods.heroWx = null;
  v.dataset.key = key; v.innerHTML = heroHtml + '<div id="homeRest">' + restHtml + '</div>'; wireHome();
  mods.heroWx = mountWeather($('#heroWx'), { strength: 1.5 }); if (wxNow) mods.heroWx.set(wxNow.kind, m === 'day');
  const logo = $('#heroLogo'), hero = $('#dive');
  hero.onpointermove = e => { const r = hero.getBoundingClientRect(); logo.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 16 + 'deg'); logo.style.setProperty('--rx', -((e.clientY - r.top) / innerHeight - .5) * 12 + 'deg'); };
  hero.onpointerleave = () => { logo.style.setProperty('--ry', '0deg'); logo.style.setProperty('--rx', '0deg'); };
  const dv1 = $('#dv1'), dv2 = $('#dv2'), hint = $('#dvHint');
  const setP = p => { dv1.style.opacity = Math.max(0, 1 - p * 2.6); dv1.style.transform = `translateY(${-p * 80}px)`; dv1.style.pointerEvents = p > .3 ? 'none' : ''; const q = Math.min(1, Math.max(0, (p - .55) / .3)); dv2.style.opacity = q; dv2.style.transform = `translateY(${(1 - q) * 30}px)`; dv2.style.pointerEvents = q > .5 ? '' : 'none'; hint.style.opacity = Math.max(0, 1 - p * 5); };
  setP(0);
  magnet($('#dv1 .btn:not(.ghost)'));
  const heroCanvas = $('#heroGl');
  // Без 3D (меньше анимации, нет WebGL, сцена не создалась) атриум статичен и оба его экрана видны сразу.
  // Раньше второй экран показывал только 3D-модуль, и без него текст с кнопками оставался невидимым.
  const goStatic = () => { if (!hero.isConnected) return; hero.classList.add('static'); [dv1, dv2, hint].forEach(d => d.removeAttribute('style')); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !hasWebGL()) goStatic();
  else import('./hero3d.js').then(mod => {
    if (!heroCanvas.isConnected || mods.hero) return; // пока модуль грузился, главную уже пересобрали
    const h = mod.mountHero(heroCanvas, hero); if (!h) return goStatic(); mods.hero = h; const url = m === 'day' ? s.heroDay : s.heroNight; h.setImage(url, m === 'day'); h.onProgress(setP); h.setWeather?.(wxNow?.kind); }).catch(e => { console.warn('hero', e); goStatic(); });
  applyWeather();
}
// предзагрузка слоёв главной картинки (те же правила, что в hero3d.layersFor)
function heroLayers(url) { const m = /img\/(atrium-night|atrium-day)\.webp$/.exec(url || ''); return m ? Promise.all(['-far.webp', '-mask.webp'].map(x => preload('img/layers/' + m[1] + x))) : null; }
// слова через дефис («Лос-Сантос») не разрываются переносом; на вход — уже экранированный текст
const nowrapHyphens = html => html.replace(/[^\s<>]+-[^\s<>]+/g, w => `<span class="nw">${w}</span>`);
function evCard(e) {
  // билет: корешок с датой (по времени отеля, как и часы), перфорация, тело с площадкой
  const live = e.start <= Date.now() && (e.end || e.start + 3 * 3600e3) > Date.now(), v = S.pub.venues.find(x => x.id === e.venueId);
  const day = new Date(e.start).toLocaleDateString('ru-RU', { day: 'numeric', timeZone: 'Europe/Moscow' }), mon = new Date(e.start).toLocaleDateString('ru-RU', { month: 'short', timeZone: 'Europe/Moscow' }).replace('.', '');
  return `<${e.url ? `a href="${esc(e.url)}" target="_blank" rel="noopener"` : 'div'} class="ev${live ? ' live' : ''}" style="--a:${esc(v?.accent || '#F0177A')}"><div class="stub"${e.image ? ` style="background-image:linear-gradient(rgba(13,8,9,.5),rgba(13,8,9,.88)),url('${esc(e.image)}')"` : ''}><b class="num">${day}</b><span>${esc(mon)}</span><small class="num">${hhmm(e.start)}</small></div>
    <div class="body"><div class="row">${live ? '<span class="chip p live"><span class="d"></span>Идёт сейчас</span>' : `<span class="chip m">${hhmm(e.start)}${e.end ? '–' + hhmm(e.end) : ''}</span>`}${e.source === 'discord' ? '<span class="chip v">Discord</span>' : ''}</div><h4>${esc(e.name)}</h4><span class="note">${esc(e.location || v?.name || '')}</span>${e.desc ? `<p class="note" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(e.desc)}</p>` : ''}</div></${e.url ? 'a' : 'div'}>`;
}

/* ---------------- номера ---------------- */
let selFloor = null, selRoom = null;
const FLOOR_ANG = (fl, f) => { const a = [...fl].sort((x, y) => x - y), i = a.indexOf(f); return a.length < 2 ? 0 : -70 + (i / (a.length - 1)) * 140; };
async function renderStay() {
  const p = S.pub, floors = [...new Set(p.rooms.map(r => r.floor))].sort((a, b) => b - a);
  if (selFloor === null || !floors.includes(selFloor)) selFloor = floors[0] ?? null;
  const v = view('stay');
  if (!v.querySelector('.tower')) {
    v.innerHTML = `<div class="wrap sec">
      <div class="head"><span class="eyebrow">Номера</span><h2>Выберите этаж и номер</h2><p>Вызовите лифт кнопкой или нажмите на этаж башни. Окна горят цветом статуса, выбранный номер подсвечивается прямо на фасаде.</p></div>
      <div class="rfilt" id="rFilt" role="group" aria-label="Фильтр номеров"></div>
      <div class="stay3">
        <div class="tower" id="tower"><span class="hint">Тяните, чтобы облететь башню</span><span class="tip" id="ttip"></span>
          <div class="hud" aria-hidden="true"><svg viewBox="-6 -10 212 122"><defs><linearGradient id="hbr" x1="0" x2="1"><stop offset="0" stop-color="#8a6228"/><stop offset=".5" stop-color="#f9edc7"/><stop offset="1" stop-color="#8a6228"/></linearGradient></defs>
            <path d="M14 104 A86 86 0 0 1 186 104" fill="none" stroke="url(#hbr)" stroke-width="2.4"/><g id="hTicks"></g>
            <g id="hNeedle" class="needle"><path d="M100 104 L98 34 L100 22 L102 34 Z" fill="url(#hbr)"/><circle cx="100" cy="104" r="7" fill="url(#hbr)"/><circle cx="100" cy="104" r="2.5" fill="#0d0809"/></g></svg>
            <div><b class="num" id="hNum">—</b><small id="hSub"></small></div></div>
          <div class="legend tl"><span><i style="background:var(--gold)"></i>Свободен</span><span><i style="background:var(--pink)"></i>Забронирован</span><span><i style="background:var(--violet)"></i>Заселён</span><span><i style="background:var(--mut)"></i>Уборка</span></div></div>
        <aside class="liftp"><div class="lhead"><span class="eyebrow">Лифт</span><span class="note" id="lfState">на месте</span></div>
          <div class="lbtns" id="lfBtns" role="group" aria-label="Этаж"></div>
          <div class="ldoors open" id="lfDoors"><div class="linner" id="lfInner"></div><i class="door l"></i><i class="door r"></i></div>
          <div id="roomBox"></div></aside>
      </div>
      <div class="head" style="margin-top:3rem"><span class="eyebrow">Категории</span><h2>Типы номеров</h2></div><div class="types" id="types"></div><div id="cmpBox" aria-live="polite"></div></div>`;
    const opts = { onPickVenue: id => { const v = S.pub.venues.find(x => x.id === id); if (v) location.hash = '#' + venueRoute(v); }, onPick: f => goFloor(f), onSpin: () => unlock('dizzy'), onHoverFloor: f => $$('#lfBtns button').forEach(b => b.classList.toggle('hv', +b.dataset.f === f)) };
    const ready = t => { mods.tower = t; t.active(current === 'stay'); t.setVenues?.(towerVenues()); t.update(S.pub.rooms, selFloor, S.pub.types); t.setFilter?.(roomFilterIds()); if (selRoom) t.focusRoom(selRoom); if (wxNow) t.setWeather(wxNow); };
    // 3D-башня, а если WebGL нет или сцена не создалась — фасад из DOM с тем же интерфейсом
    (hasWebGL() ? import('./skyline3d.js').then(m => ready(m.mountTower($('#tower'), opts))) : Promise.reject(null))
      .catch(e => { if (e) console.error(e); return import('./facade.js').then(f => ready(f.mountFacade($('#tower'), opts))); })
      .catch(e => { console.error(e); $('#tower').innerHTML = '<div class="empty" style="margin:2rem">Вид башни не загрузился. Этаж можно выбрать кнопками лифта.</div>'; });
    // подсказка «тяните» нужна, пока гость не попробовал; после первого жеста больше не показываем
    const tw = $('#tower'); if (pref.get('mhc-hint-tower')) tw.classList.add('used');
    tw.addEventListener('pointerdown', () => { tw.classList.add('used'); pref.set('mhc-hint-tower', '1'); }, { once: true });
  }
  paintStay();
}
// Фильтр номеров: тип, сколько гостей, только свободные. Неподходящие номера гаснут на башне и в плане этажа,
// этажи лифта без совпадений приглушаются, лифт сам едет на ближайший подходящий этаж. Данные — реальные rooms/types.
const RF = { type: '', guests: 0, free: false };
const rfOn = () => !!(RF.type || RF.guests || RF.free);
function matchRoom(r) { const t = S.pub.types.find(x => x.id === r.type); return (!RF.type || r.type === RF.type) && (!RF.guests || (t?.capacity || 0) >= RF.guests) && (!RF.free || r.status === 'free'); }
const roomFilterIds = () => rfOn() ? new Set(S.pub.rooms.filter(matchRoom).map(r => r.id)) : null;
function paintRoomFilter() {
  const p = S.pub, caps = [...new Set(p.types.map(t => t.capacity).filter(Boolean))].sort((a, b) => a - b), hit = p.rooms.filter(matchRoom), floors = new Set(hit.map(r => r.floor)).size;
  $('#rFilt').innerHTML = `<div class="seg" role="group" aria-label="Тип номера"><button type="button" data-rt="" aria-pressed="${!RF.type}">Все типы</button>${p.types.map(t => `<button type="button" data-rt="${esc(t.id)}" aria-pressed="${RF.type === t.id}">${esc(t.name)}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Гостей"><button type="button" data-rg="0" aria-pressed="${!RF.guests}">Гостей: любое</button>${caps.filter(c => c > 1).map(c => `<button type="button" data-rg="${c}" aria-pressed="${RF.guests === c}">${c}+</button>`).join('')}</div>
    <button type="button" class="btn sm ${RF.free ? '' : 'ghost'}" id="rfFree" aria-pressed="${RF.free}">Только свободные</button>
    <span class="note" aria-live="polite">${rfOn() ? (hit.length ? `Подходит ${hit.length} ${plural(hit.length, 'номер', 'номера', 'номеров')} на ${floors} ${plural(floors, 'этаже', 'этажах', 'этажах')}` : 'Ничего не подходит') + ' · <button type="button" class="lnk" id="rfReset">сбросить</button>' : ''}</span>`;
  $$('#rFilt [data-rt]').forEach(b => b.onclick = () => setRoomFilter({ type: b.dataset.rt }));
  $$('#rFilt [data-rg]').forEach(b => b.onclick = () => setRoomFilter({ guests: +b.dataset.rg }));
  $('#rfFree').onclick = () => setRoomFilter({ free: !RF.free });
  $('#rfReset') && ($('#rfReset').onclick = () => setRoomFilter({ type: '', guests: 0, free: false }));
}
function setRoomFilter(patch) {
  Object.assign(RF, patch);
  const hit = S.pub.rooms.filter(matchRoom);
  if (selRoom && !hit.some(r => r.id === selRoom)) { selRoom = null; mods.tower?.focusRoom(null); }
  mods.tower?.setFilter?.(roomFilterIds());
  const floorsHit = [...new Set(hit.map(r => r.floor))].sort((a, b) => b - a);
  if (rfOn() && floorsHit.length && !floorsHit.includes(selFloor)) { paintRoomFilter(); return goFloor(floorsHit.reduce((a, f) => Math.abs(f - selFloor) < Math.abs(a - selFloor) ? f : a, floorsHit[0])); }
  paintRoomFilter(); paintLift(); paintFloorPlan(); paintRoom();
}
// из кабинета: открыть «Номера» на этаже брони и подсветить номер на фасаде
function showOnTower(id) {
  const r = S.pub.rooms.find(x => x.id === id); if (!r) return;
  selFloor = r.floor; selRoom = r.id; location.hash = '#stay';
  setTimeout(() => { if (current !== 'stay') return; mods.tower?.update(S.pub.rooms, selFloor, S.pub.types); mods.tower?.focusRoom(selRoom); paintLift(); paintFloorPlan(); paintRoom(); }, 450);
}
let liftTimer = 0;
function goFloor(f) {
  if (f === selFloor || f == null) return;
  const from = selFloor; selFloor = f; selRoom = null;
  mods.tower?.setVenues?.(towerVenues()); mods.tower?.update(S.pub.rooms, selFloor, S.pub.types); mods.tower?.focusRoom(null);
  paintLift(); $('#roomBox').innerHTML = '';
  const d = $('#lfDoors'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  clearTimeout(liftTimer);
  if (reduce) { paintFloorPlan(); return; }
  d.classList.remove('open'); play('whoosh');
  $('#lfState').textContent = f > from ? 'едет вверх ▲' : 'едет вниз ▼';
  liftTimer = setTimeout(() => { paintFloorPlan(); d.classList.add('open'); play('ding'); $('#lfState').textContent = 'на месте'; }, 720);
}
function paintLift() {
  const p = S.pub, fl = [...new Set(p.rooms.map(r => r.floor))].sort((a, b) => b - a);
  $('#lfBtns').innerHTML = fl.map(f => { const fr = p.rooms.filter(r => r.floor === f), free = fr.filter(r => r.status === 'free').length;
    return `<button data-f="${f}" aria-pressed="${f === selFloor}" class="${free ? 'has' : ''}${rfOn() && !fr.some(matchRoom) ? ' nomatch' : ''}" data-sfx="wood" aria-label="${f} этаж, свободно ${free} из ${fr.length}${rfOn() ? `, подходит ${fr.filter(matchRoom).length}` : ''}"><b class="num">${f}</b><small>${free}/${fr.length}</small></button>`; }).join('');
  $$('#lfBtns button').forEach(b => { b.onclick = () => goFloor(+b.dataset.f); b.onmouseenter = () => mods.tower?.hoverFloor(+b.dataset.f); b.onmouseleave = () => mods.tower?.hoverFloor(null); });
  const asc = [...fl].sort((a, b) => a - b), n = asc.length, every = n > 12 ? Math.ceil(n / 10) : 1;
  $('#hTicks').innerHTML = asc.map((f, i) => { const a = (FLOOR_ANG(fl, f) - 90) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return `<line x1="${100 + c * 80}" y1="${104 + s * 80}" x2="${100 + c * 71}" y2="${104 + s * 71}" stroke="rgba(249,237,199,.55)" stroke-width="1.4"/>${i % every === 0 || i === n - 1 ? `<text x="${100 + c * 97}" y="${104 + s * 97 + 3}" text-anchor="middle" class="${f === selFloor ? 'on' : ''}">${f}</text>` : ''}`; }).join('');
  $('#hNeedle').style.transform = `rotate(${FLOOR_ANG(fl, selFloor)}deg)`;
  const fr = p.rooms.filter(r => r.floor === selFloor);
  $('#hNum').textContent = selFloor ?? '—'; $('#hSub').textContent = `свободно ${fr.filter(r => r.status === 'free').length} из ${fr.length}`;
}
function paintFloorPlan() {
  const p = S.pub, T = Object.fromEntries(p.types.map(t => [t.id, t])), rooms = p.rooms.filter(r => r.floor === selFloor);
  $('#lfInner').innerHTML = `<div class="row" style="justify-content:space-between"><h3 style="font-size:1.15rem">${selFloor ?? '—'} этаж</h3><span class="note">${rooms.filter(r => r.status === 'free').length} из ${rooms.length} свободно</span></div>
    <div class="plan">${rooms.map(r => `<button class="room ${r.status}${rfOn() && !matchRoom(r) ? ' dim' : ''}" data-room="${esc(r.id)}" aria-pressed="${r.id === selRoom}" data-sfx="soft" aria-label="Номер ${esc(r.id)}, ${esc(T[r.type]?.name || '')}, ${ROOM_STATUS[r.status]}"><b class="num">${esc(r.id)}</b><small>${esc(T[r.type]?.name || r.type)}<br>${ROOM_STATUS[r.status]}</small></button>`).join('') || '<div class="empty">На этом этаже нет номеров.</div>'}</div>
    ${selRoom ? '' : '<p class="note">Наведите на номер — он подсветится на фасаде. Нажмите, чтобы увидеть цену.</p>'}`;
  $$('#lfInner [data-room]').forEach(b => {
    b.onclick = () => { selRoom = b.dataset.room; mods.tower?.focusRoom(selRoom); paintFloorPlan(); paintRoom(); };
    b.onmouseenter = () => mods.tower?.hoverRoom(b.dataset.room); b.onmouseleave = () => mods.tower?.hoverRoom(null);
  });
}
function paintRoom() {
  const p = S.pub, T = Object.fromEntries(p.types.map(t => [t.id, t])), room = selRoom && p.rooms.find(r => r.id === selRoom);
  $('#roomBox').innerHTML = room ? roomPanel(room, T[room.type]) : ''; wireKeyCard();
  $('#bookRoom')?.addEventListener('click', () => insertKey(() => openBooking(room.type, room.id)));
  const rp = $('#roomBox .rpanel'); if (rp) { rp.classList.remove('in'); void rp.offsetWidth; rp.classList.add('in'); }
}
function paintStay() {
  const p = S.pub;
  paintLift(); if (!liftTimer || $('#lfDoors').classList.contains('open')) paintFloorPlan(); paintRoom();
  $('#types').innerHTML = p.types.map(t => { const fr = p.rooms.filter(r => r.type === t.id), f = fr.filter(r => r.status === 'free').length;
    const on = cmpSel.includes(t.id);
    return `<div class="typew reveal${on ? ' cmp-on' : ''}"><button class="type" data-t="${esc(t.id)}"><div ${bg(t.image, t.name, '#F7B50A', '#F0177A')}></div><div class="body"><div class="row" style="justify-content:space-between"><h4>${esc(t.name)}</h4><span class="pr">${money(t.price)}<small class="mut" style="font:600 .7rem var(--body)"> / ночь</small></span></div><p class="note">${esc(t.desc)}</p><div class="feat">${(t.features || []).map(x => `<span>${esc(x)}</span>`).join('')}${t.capacity ? `<span>до ${t.capacity} гостей</span>` : ''}</div><span class="chip ${f ? 'ok' : 'bad'}">${f ? `Свободно ${f} из ${fr.length}` : 'Всё занято'}</span></div></button><button type="button" class="cmpb" data-cmp="${esc(t.id)}" aria-pressed="${on}" aria-label="Сравнить: ${esc(t.name)}">${on ? I.check : I.plus}<span>Сравнить</span></button></div>`; }).join('');
  $$('#types [data-t]').forEach(b => b.onclick = () => openBooking(b.dataset.t));
  $$('#types [data-cmp]').forEach(b => b.onclick = () => { const id = b.dataset.cmp; cmpSel = cmpSel.includes(id) ? cmpSel.filter(x => x !== id) : [...cmpSel, id].slice(-3); paintStay(); if (cmpSel.length >= 2 && cmpSel.includes(id)) $('#cmpBox')?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
  paintCompare();
  paintRoomFilter();
  reveal(view('stay'));
  mods.tower?.update(p.rooms, selFloor, p.types); mods.tower?.setFilter?.(roomFilterIds());
}
// сравнение 2–3 типов номеров: цена, вместимость, особенности, свободно сейчас — из реальных types/rooms
let cmpSel = [];
function paintCompare() {
  const p = S.pub; cmpSel = cmpSel.filter(id => p.types.some(t => t.id === id));
  const box = $('#cmpBox'); if (!box) return;
  if (cmpSel.length < 2) { box.innerHTML = cmpSel.length ? '<p class="note cmp-hint">Выберите ещё один тип, чтобы сравнить.</p>' : ''; return; }
  const ts = cmpSel.map(id => p.types.find(t => t.id === id)), feats = [...new Set(ts.flatMap(t => t.features || []))];
  const free = t => p.rooms.filter(r => r.type === t.id && r.status === 'free').length, min = Math.min(...ts.map(t => t.price));
  box.innerHTML = `<section class="cmp" aria-labelledby="cmpH"><div class="row" style="justify-content:space-between"><h3 id="cmpH">Сравнение</h3><button type="button" class="btn ghost sm" id="cmpClear">Очистить</button></div>
    <div class="cmp-scroll"><table><thead><tr><th scope="col"><span class="sr">Параметр</span></th>${ts.map(t => `<th scope="col">${esc(t.name)}</th>`).join('')}</tr></thead><tbody>
      <tr><th scope="row">Цена за ночь</th>${ts.map(t => `<td class="num${t.price === min ? ' best' : ''}">${money(t.price)}</td>`).join('')}</tr>
      <tr><th scope="row">Гостей</th>${ts.map(t => `<td class="num">${t.capacity ? 'до ' + t.capacity : '—'}</td>`).join('')}</tr>
      ${feats.map(fe => `<tr><th scope="row">${esc(fe)}</th>${ts.map(t => (t.features || []).includes(fe) ? `<td class="yes">${I.check}<span class="sr">есть</span></td>` : '<td class="no">—<span class="sr">нет</span></td>').join('')}</tr>`).join('')}
      <tr><th scope="row">Свободно сейчас</th>${ts.map(t => `<td class="num">${free(t)}</td>`).join('')}</tr>
      <tr><th scope="row"><span class="sr">Действие</span></th>${ts.map(t => `<td>${free(t) ? `<button type="button" class="btn sm" data-cb="${esc(t.id)}">Забронировать</button>` : '<span class="chip bad">Всё занято</span>'}</td>`).join('')}</tr>
    </tbody></table></div></section>`;
  $('#cmpClear').onclick = () => { cmpSel = []; paintStay(); };
  $$('#cmpBox [data-cb]').forEach(b => b.onclick = () => openBooking(b.dataset.cb));
}
function keyCard(r, t) {
  return `<div class="kc" id="keyCard" tabindex="0" role="button" aria-label="Ключ-карта номера ${esc(r.id)}, нажмите, чтобы перевернуть"><div class="kci">
    <div class="kf"><img src="img/emblem.webp?v=2" alt=""><span class="kn num">${esc(r.id)}</span><span class="kt">${esc(t?.name || 'Номер')} · ${r.floor} этаж</span><span class="kl">MILE HIGH CLUB · ROOM KEY</span><i class="chip2"></i></div>
    <div class="kb"><i class="stripe"></i><span>Заезд с 14:00 · Выезд до 12:00</span><span>Приложите к замку двери ${esc(r.id)}</span><small>При потере обратитесь на ресепшен, 20 этаж</small></div></div></div>`;
}
function wireKeyCard() {
  const c = $('#keyCard'); if (!c) return; const inner = c.firstElementChild; let flip = false;
  const fine = matchMedia('(pointer:fine)').matches;
  c.onpointermove = e => { if (!fine) return; const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; c.style.setProperty('--rx', (-y * 18) + 'deg'); c.style.setProperty('--ry', (x * 22 + (flip ? 180 : 0)) + 'deg'); c.style.setProperty('--gx', (x + .5) * 100 + '%'); c.style.setProperty('--gy', (y + .5) * 100 + '%'); };
  c.onpointerleave = () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', flip ? '180deg' : '0deg'); };
  const toggle = () => { flip = !flip; c.style.setProperty('--ry', flip ? '180deg' : '0deg'); play('flip'); };
  c.onclick = toggle; c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
}
// «Забронировать»: ключ-карта вставляется в замок (уезжает вниз и гаснет), затем открывается бронь
function insertKey(then) {
  const k = $('#keyCard');
  if (!k || matchMedia('(prefers-reduced-motion: reduce)').matches) return then();
  k.style.setProperty('--ry', '0deg'); k.style.setProperty('--rx', '0deg');
  const a = k.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-6%) rotateX(8deg)', offset: .3 }, { transform: 'translateY(38%) scaleY(.6)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.5,0,.75,0)' });
  let done = false; play('soft');
  a.onfinish = a.oncancel = () => { if (done) return; done = true; then(); a.cancel(); };
}
function roomPanel(r, t) {
  return `<div class="card pad rpanel">${keyCard(r, t)}${t?.image ? `<div class="img cover" style="background-image:url('${esc(t.image)}')"></div>` : ''}<div class="stack" style="gap:.5rem"><div class="row" style="justify-content:space-between"><h3 style="font-size:1.3rem">Номер ${esc(r.id)}</h3><span class="chip ${r.status === 'free' ? 'ok' : 'm'}">${ROOM_STATUS[r.status]}</span></div>
    <span class="mut">${esc(t?.name || '')} · ${r.floor} этаж · ${roomGameFloor(S.pub.rooms, r.floor)} · <b class="num" style="color:var(--fg)">${money(t?.price)}</b> за ночь</span><p class="note">${esc(t?.desc || '')}</p>
    ${r.status === 'free' ? `<div><button class="btn" id="bookRoom" data-sfx="open">Забронировать ${esc(r.id)}</button></div>` : `<div><button class="btn ghost" onclick="location.hash='#contact'">Номер занят, оставить заявку</button></div>`}</div></div>`;
}

function openBooking(type, room) {
  const p = S.pub, T = p.types, el = sheet('bookSheet'); let t = T.find(x => x.id === type) || T[0];
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  el.innerHTML = `<div class="top"><h3>Бронь</h3><button class="ibtn x" data-sfx="close" aria-label="Закрыть">${I.x}</button></div>
    <form id="bForm" class="stack" novalidate>
      <label class="field"><span>Тип номера</span><select id="bType">${T.map(x => `<option value="${esc(x.id)}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)} · ${money(x.price)}</option>`).join('')}</select></label>
      <label class="field"><span>Номер</span><select id="bRoom"></select></label>
      <div class="g2"><label class="field"><span>Имя персонажа</span><input id="bName" required autocomplete="off" placeholder="Как вас записать"></label><label class="field"><span>Discord</span><input id="bDiscord" required autocomplete="off" placeholder="nickname" value="${esc(S.me?.username || '')}"></label></div>
      <div class="g3"><label class="field"><span>Заезд</span><input id="bDate" type="date" required value="${today.toISOString().slice(0, 10)}"></label><label class="field"><span>Ночей</span><input id="bNights" type="number" min="1" max="30" value="1"></label><label class="field"><span>Гостей</span><input id="bGuests" type="number" min="1" max="12" value="2"></label></div>
      <label class="field"><span>Телефон в игре</span><input id="bPhone" autocomplete="off" placeholder="Необязательно"></label>
      <label class="field"><span>Пожелания</span><textarea id="bNote" placeholder="Вид на Вайнвуд, шампанское к заезду, поздний выезд"></textarea></label>
      <div class="tot"><span>Итого</span><span class="num" id="bTot"></span></div>
      <button class="btn" type="submit" data-sfx="">Отправить бронь</button><p class="note">Управляющий подтвердит бронь и назначит номер. Бот напишет вам в Discord.</p><p class="note">Указывайте игровые данные. Что мы храним — в <a href="#privacy">политике конфиденциальности</a>.</p></form>`;
  el.querySelector('.x').onclick = () => closeSheet('bookSheet');
  const upd = () => { t = T.find(x => x.id === $('#bType').value); const free = p.rooms.filter(r => r.type === t.id && r.status === 'free'); $('#bRoom').innerHTML = `<option value="">Любой свободный (${free.length})</option>` + free.map(r => `<option ${r.id === room ? 'selected' : ''}>${esc(r.id)}</option>`).join(''); $('#bTot').textContent = money(t.price * Math.max(1, +$('#bNights').value || 1)); };
  $('#bType').onchange = () => { room = null; upd(); }; $('#bNights').oninput = upd; upd();
  prefill();
  $('#bForm').onsubmit = async e => {
    e.preventDefault(); const btn = e.submitter || $('#bForm button[type=submit]'); btn.disabled = true;
    try {
      const { booking: b } = await api('POST', '/bookings', { type: $('#bType').value, room: $('#bRoom').value, name: $('#bName').value, discord: $('#bDiscord').value, date: $('#bDate').value, nights: $('#bNights').value, guests: $('#bGuests').value, phone: $('#bPhone').value, note: $('#bNote').value });
      play('swipe'); setTimeout(() => play('success'), 420);
      el.innerHTML = `<div class="top"><h3>Бронь отправлена</h3><button class="ibtn x" aria-label="Закрыть">${I.x}</button></div><div class="success"><span class="mark">${I.check}</span><span class="code">${esc(b.code)}</span><p class="mut">${esc(b.typeName)}, заезд ${esc(b.date)}, ${b.nights} ${plural(b.nights, 'ночь', 'ночи', 'ночей')}. Сохраните код брони.</p><a class="btn ghost" href="#me">Мои брони</a></div>`;
      el.querySelector('.x').onclick = () => closeSheet('bookSheet'); el.querySelector('a').onclick = () => closeSheet('bookSheet'); loadItems();
    } catch (err) { fail(err); btn.disabled = false; }
  };
  openSheet('bookSheet');
}

/* ---------------- отдых ---------------- */
function timeline(v) {
  const segs = (v.schedule || []).flatMap(s => { const a = minutesOf(s.from), b = minutesOf(s.to); return a < b ? [[a, b, s.state]] : [[a, 1440, s.state], [0, b, s.state]]; });
  return `<div><div class="timeline">${segs.map(([a, b, st]) => `<i class="${st}" style="left:${a / 14.4}%;width:${(b - a) / 14.4}%"></i>`).join('')}<span class="now" style="left:var(--now,0%)"></span></div><div class="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>`;
}
// «Сутки отеля»: все площадки на одной оси 00–24 и ползунок «что будет открыто в 23:00?».
// Статус на выбранное время считает та же venueState(), что и сервер, — с учётом событий из Discord.
let dayAt = null; // минуты, выбранные ползунком; null — «сейчас»
function dayTime() { // ближайший момент в будущем (в пределах суток) с выбранными минутами
  const now = Date.now(), m = mskMinutes(now); if (dayAt === null) return now;
  return now + ((dayAt - m + 1440) % 1440) * 60e3;
}
function paintDay() {
  const host = $('#hday'); if (!host) return;
  const p = S.pub, venues = p.venues.filter(v => !v.comingSoon), t = dayTime(), m = mskMinutes(t);
  if (!host.querySelector('.hd-range')) {
    host.innerHTML = `<div class="hd-head"><div class="stack" style="gap:.4rem"><span class="eyebrow">Сутки отеля</span><h3 id="hdH">Что открыто <output id="hdT" for="hdRange"></output></h3></div><button class="btn ghost sm" id="hdNow" type="button">Сейчас</button></div>
      <div class="hd-grid"><div class="hd-lw"><div id="hdLanes"></div><i class="hd-cursor" aria-hidden="true"></i></div><div class="hd-scale"><span></span><div class="hd-axis"><input type="range" class="hd-range" id="hdRange" min="0" max="1425" step="15" aria-labelledby="hdH"><div class="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div><span></span></div></div>
      <p class="note">Тяните ползунок или нажимайте ← → — статусы пересчитаются по расписанию и событиям. Нажмите на площадку, чтобы перейти к её карточке.</p>`;
    const r = $('#hdRange');
    r.addEventListener('input', () => { dayAt = +r.value; paintDay(); });
    $('#hdNow').onclick = () => { dayAt = null; paintDay(); };
  }
  // полосы перерисовываем, только если поменялись расписание или события
  const lanes = venues.map(v => {
    const segs = (v.schedule || []).flatMap(s => { const a = minutesOf(s.from), b = minutesOf(s.to); return a < b ? [[a, b, s.state]] : [[a, 1440, s.state], [0, b, s.state]]; });
    const evs = p.events.filter(e => e.venueId === v.id && e.status !== 'cancelled' && (e.end || e.start + 3 * 3600e3) > Date.now() && e.start < Date.now() + 864e5)
      .flatMap(e => { const a = mskMinutes(e.start), d = Math.max(15, Math.round(((e.end || e.start + 3 * 3600e3) - e.start) / 6e4)), b = a + Math.min(d, 1440); return b <= 1440 ? [[a, b, e.name]] : [[a, 1440, e.name], [0, b - 1440, e.name]]; });
    return `<button class="hd-lane" type="button" data-venue="${esc(v.id)}" aria-label="${esc(v.name)}: перейти к карточке"><span class="hd-n">${esc(v.name)}</span><span class="timeline hd-bar">${segs.map(([a, b, st]) => `<i class="${st}" style="left:${a / 14.4}%;width:${(b - a) / 14.4}%"></i>`).join('')}${evs.map(([a, b, n]) => `<b class="hd-ev" title="${esc(n)}" style="left:${a / 14.4}%;width:${(b - a) / 14.4}%"></b>`).join('')}</span><span class="hd-st"></span></button>`;
  }).join('');
  const box = $('#hdLanes');
  if (box._html !== lanes) { box.innerHTML = lanes; box._html = lanes; $$('.hd-lane', box).forEach(b => b.onclick = () => focusVenueCard(b.dataset.venue)); }
  $$('.hd-lane', box).forEach(b => { const v = venues.find(x => x.id === b.dataset.venue); if (v) b.querySelector('.hd-st').innerHTML = stateChip(venueState(v, p.events, t)); });
  const r = $('#hdRange'), hh = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  if (document.activeElement !== r || dayAt === null) r.value = dayAt ?? Math.floor(m / 15) * 15;
  r.setAttribute('aria-valuetext', dayAt === null ? `сейчас, ${hh}` : `${hh}`);
  $('#hdT').textContent = dayAt === null ? `сейчас · ${hh}` : `в ${hh}${t - Date.now() > 12 * 3600e3 ? ' (завтра)' : ''}`;
  host.querySelector('.hd-grid').style.setProperty('--x', m / 1440);
  host.classList.toggle('at', dayAt !== null); $('#hdNow').disabled = dayAt === null;
}
function focusVenueCard(id) {
  const el = [...($('#venuesList')?.children || [])].find(x => x.dataset.venue === id); if (!el) return;
  el.classList.add('in', 'hl'); el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setTimeout(() => el.classList.remove('hl'), 2200);
}
function renderLeisure() {
  const p = S.pub, m = mskMinutes();
  const lv = view('leisure');
  if (!lv.querySelector('#venuesList')) {
    lv.innerHTML = `<div class="wrap sec"><div class="head"><span class="eyebrow">Отдых</span><h2>Что сейчас открыто</h2><p>Статусы обновляются по расписанию и по событиям из Discord. Днём работает Sky Pool, ночью Night Pool и The Hot Times.</p></div>
      <div id="deckHost" class="reveal"></div><section class="hday reveal" id="hday" aria-label="Сутки отеля"></section><div class="venues" id="venuesList"></div></div>`;
    import('./deck.js').then(d => { mods.deck = d.mountDeck($('#deckHost'), S.pub.settings.deckUrl); mods.deck.active(current === 'leisure'); });
  }
  mods.deck?.url(p.settings.deckUrl);
  const cards = p.venues.map(v => { const st = venueState(v, p.events), evs = p.events.filter(e => e.venueId === v.id && (e.end || e.start + 3 * 3600e3) > Date.now()).slice(0, 3);
    const visual = v.image ? `<div class="img cover" style="background-image:url('${esc(v.image)}')">` : v.kind === 'pool' ? `<div class="img"><div class="water ${v.id === 'night' || /night|ноч/i.test(v.name) ? 'n' : ''} ${st.state === 'live' || st.state === 'event' ? 'live' : ''}"><div class="sky"></div><div class="pl"></div></div>` : `<div ${bg('', v.name, v.accent || '#F0177A', '#F7B50A', 'img')}>`;
    return `<article class="venue reveal" data-venue="${esc(v.id)}">${visual}${stateChip(st)}</div><div class="body"><div class="row" style="justify-content:space-between"><h3>${esc(v.name)}</h3><span class="note">${esc(KIND_LABEL[v.kind] || '')}${v.floor ? ' · ' + esc(v.floor) : ''}</span></div>
      <p class="note">${esc(v.desc || '')}</p>
      ${st.state === 'event' ? `<div class="card pad" style="padding:.8rem 1rem;border-color:var(--violet)"><span class="eyebrow" style="color:var(--violet)">Сейчас событие</span><b>${esc(st.label)}</b></div>` : ''}
      ${v.comingSoon ? '<span class="chip t">Скоро открытие</span>' : timeline(v) + `<div class="sched">${(v.schedule || []).map(s => `<div class="${inSpan(m, minutesOf(s.from), minutesOf(s.to)) ? 'now' : ''}"><span class="num">${esc(s.from)}–${esc(s.to)}</span><span>${s.state === 'live' && inSpan(m, minutesOf(s.from), minutesOf(s.to)) ? '<span class="eq"><i></i><i></i><i></i></span> ' : ''}${esc(s.label)}</span></div>`).join('')}</div>`}
      ${evs.length ? `<div class="stack" style="gap:.4rem"><span class="lbl">Ближайшие события</span>${evs.map(e => `<div class="row" style="justify-content:space-between"><span>${esc(e.name)}</span><span class="note">${when(e.start)}</span></div>`).join('')}</div>` : ''}
    </div></article>`; });
  // Карточка перерисовывается, только когда меняется её содержимое (статус, расписание, события).
  // Раз в 20 секунд двигается лишь линия «сейчас» — hover, фокус и круги на воде не сбрасываются.
  const list = $('#venuesList');
  if (list.children.length !== cards.length) list.innerHTML = cards.join('');
  else cards.forEach((html, i) => { const el = list.children[i]; if (el._html === html) return; const t = document.createElement('div'); t.innerHTML = html; const n = t.firstElementChild; n.classList.add('in'); el.replaceWith(n); });
  [...list.children].forEach((el, i) => { el._html = cards[i]; });
  list.style.setProperty('--now', m / 14.4 + '%');
  reveal(lv);
  paintDay();
  if (S.focusVenue) { const id = S.focusVenue; S.focusVenue = null; setTimeout(() => focusVenueCard(id), 80); } // пришли с табло или из шахты лифта
  $$('#venuesList .water').forEach(w => w.onpointerdown = e => { const r = w.getBoundingClientRect(); for (let i = 0; i < 2; i++) { const d = document.createElement('i'); d.className = 'rip'; d.style.left = (e.clientX - r.left) + 'px'; d.style.top = (e.clientY - r.top) + 'px'; w.append(d); setTimeout(() => d.remove(), 1700); } play('splash'); });
}

/* ---------------- Le Ciel ---------------- */
let menuCat = null;
function renderDining() {
  const p = S.pub, cats = [...new Set(p.menu.map(i => i.cat))]; if (!cats.includes(menuCat)) menuCat = cats[0];
  view('dining').innerHTML = `<div class="wrap sec"><div class="head"><span class="eyebrow">Ресторан · 30 этаж</span><h2>Le Ciel <span class="serif glow-text">кухня Франции</span></h2><p>Выберите блюда и закажите в номер. Заказ сразу уходит на кухню и управляющим.</p></div>
    ${clocheHtml()}
    <div class="seg" role="group" aria-label="Раздел меню" style="margin-bottom:1rem">${cats.map(c => `<button aria-pressed="${c === menuCat}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="menu" id="dishes"></div></div>`;
  $$('#main [data-c]').forEach(b => b.onclick = () => { menuCat = b.dataset.c; renderDining(); });
  paintDishes(); wireCloche();
}
// блюдо дня под серебряным клошем: меняется каждый день по времени отеля
let clocheOpen = false;
function dishOfDay() { const m = S.pub.menu; if (!m.length) return null; const day = Math.floor((Date.now() + 3 * 3600e3) / 864e5); const main = m.filter(i => /основ|горяч|main/i.test(i.cat)); const pool = main.length ? main : m; return pool[day % pool.length]; }
function clocheHtml() {
  const d = dishOfDay(); if (!d) return '';
  return `<div class="cloche ${clocheOpen ? 'open' : ''}" id="cloche"><button class="cstage" id="clocheBtn" data-sfx="" aria-label="${clocheOpen ? 'Накрыть блюдо' : 'Поднять клош и узнать блюдо дня'}">
    <span class="steam"><i></i><i></i><i></i></span><span class="plate"><span class="dish"><b>${esc(d.name)}</b><small>${esc(d.desc || '')}</small></span></span>
    <svg class="lid" viewBox="0 0 200 110" aria-hidden="true"><defs><linearGradient id="cG" x1="0" x2="1"><stop offset="0" stop-color="#6a6560"/><stop offset=".3" stop-color="#f4efe6"/><stop offset=".55" stop-color="#a8a39b"/><stop offset=".8" stop-color="#e9e4da"/><stop offset="1" stop-color="#5a5550"/></linearGradient></defs><path d="M10 100 Q12 18 100 14 Q188 18 190 100 Z" fill="url(#cG)"/><path d="M30 80 Q40 35 92 26" stroke="#fff" stroke-opacity=".55" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="88" y="2" width="24" height="14" rx="7" fill="url(#cG)"/><rect x="4" y="98" width="192" height="8" rx="4" fill="#8f8a83"/></svg></button>
    <div class="ctext"><span class="eyebrow">Блюдо дня от шефа</span><h3>${clocheOpen ? esc(d.name) : 'Что сегодня под клошем?'}</h3><p class="note">${clocheOpen ? esc(d.desc || '') : 'Каждый день шеф Le Ciel готовит одно блюдо вне меню. Поднимите крышку.'}</p>
    ${clocheOpen ? `<div class="row"><b class="num">${money(d.price)}</b><button class="btn sm" id="clocheAdd" data-sfx="">В заказ</button></div>` : ''}</div></div>`;
}
function wireCloche() {
  const b = $('#clocheBtn'); if (!b) return;
  b.onclick = () => { clocheOpen = !clocheOpen; play(clocheOpen ? 'cloche' : 'clocheDown'); if (clocheOpen) unlock('chef'); const el = $('#cloche'), tmp = document.createElement('div'); tmp.innerHTML = clocheHtml(); el.querySelector('.ctext').replaceWith(tmp.querySelector('.ctext')); el.classList.toggle('open', clocheOpen); b.setAttribute('aria-label', clocheOpen ? 'Накрыть блюдо' : 'Поднять клош и узнать блюдо дня'); $('#clocheAdd')?.addEventListener('click', e => { const d = dishOfDay(); if (d) addCart(d.id, e.currentTarget); }); };
  $('#clocheAdd')?.addEventListener('click', e => { const d = dishOfDay(); if (d) addCart(d.id, e.currentTarget); });
}
// политика конфиденциальности: текст в отдельном модуле, грузится только при открытии страницы
function renderPrivacy() {
  const v = view('privacy'); if (v.dataset.ready) return;
  v.innerHTML = '<div class="wrap sec legal"><p class="mut">Загружаем…</p></div>';
  import('./privacy.js').then(m => { v.innerHTML = `<article class="wrap sec legal">${m.privacyHtml()}</article>`; v.dataset.ready = '1'; })
    .catch(() => { v.innerHTML = '<div class="wrap sec legal"><p class="mut">Страница не загрузилась. Обновите страницу.</p></div>'; });
}
function renderLost() {
  const p = String(S.lostPath || '').replace(/[^\wа-яё-]/gi, '').slice(0, 30), room = (p.match(/\d{3,4}/) || ['404'])[0];
  view('lost').innerHTML = `<div class="wrap sec lost"><span class="eyebrow">Коридор ${esc(room.slice(0, -2) || '4')} этажа</span><h2>Номер ${esc(room)} не найден</h2><p class="mut">Вы дошли до конца коридора. Здесь только пальма в кадке и запасной выход. Горничная говорит, что такого номера в отеле никогда не было.</p><div class="row"><a class="btn" href="#stay">К настоящим номерам</a><a class="btn ghost" href="#home">В лобби</a></div></div>`;
  unlock('lost');
}
function paintDishes() {
  const items = S.pub.menu.filter(i => i.cat === menuCat);
  $('#dishes').innerHTML = items.map(i => { const q = S.cart.get(i.id) || 0; return `<div class="dish"><h4>${esc(i.name)}</h4><span class="pr num">${money(i.price)}</span><span class="add">${q ? `<span class="qty"><button data-m="${esc(i.id)}" aria-label="Меньше" data-sfx="soft">−</button><span class="num">${q}</span><button data-p="${esc(i.id)}" aria-label="Больше" data-sfx="">+</button></span>` : `<button class="btn sm ghost icon" data-p="${esc(i.id)}" aria-label="Добавить ${esc(i.name)}" data-sfx="">${I.plus}</button>`}</span><p>${esc(i.desc)}</p></div>`; }).join('');
  $$('#dishes [data-p]').forEach(b => b.onclick = () => addCart(b.dataset.p, b));
  $$('#dishes [data-m]').forEach(b => b.onclick = () => subCart(b.dataset.m));
}
const itemById = id => S.pub.menu.find(i => i.id === id) || (() => { const c = S.pub.cigars.find(x => x.id === id); return c && { ...c, name: 'Сигара ' + c.name }; })();
// добавленная позиция «летит» по дуге от кнопки к счётчику корзины — видно, куда ушёл заказ
function flyToCart(from) {
  const fab = $('#fab'); if (!fab || !from?.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect(); if (!a.width) return;
  const f = fab.getBoundingClientRect(), dy = new DOMMatrix(getComputedStyle(fab).transform).m42; // FAB может ещё выезжать
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, tx = f.left + 22 - x0, ty = f.top - dy + f.height / 2 - y0;
  const dot = document.createElement('i'); dot.className = 'fly'; dot.style.left = x0 + 'px'; dot.style.top = y0 + 'px'; document.body.append(dot);
  const anim = dot.animate([
    { transform: 'translate(-50%,-50%) scale(1)' },
    { transform: `translate(calc(-50% + ${tx * .5}px), calc(-50% + ${ty * .5 - Math.min(140, Math.abs(tx) * .3 + 40)}px)) scale(1.15)`, offset: .45 },
    { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(.35)`, opacity: .3 }
  ], { duration: 640, easing: 'cubic-bezier(.45,0,.55,1)' });
  anim.onfinish = anim.oncancel = () => dot.remove();
}
export function addCart(id, from) { if (!itemById(id)) return; flyToCart(from); S.cart.set(id, (S.cart.get(id) || 0) + 1); play('add'); if ([...S.cart.values()].reduce((a, b) => a + b, 0) >= 15) unlock('glutton'); updFab(true); if (current === 'dining') paintDishes(); if ($('#cartSheet.on')) paintCart(); }
function subCart(id) { const q = (S.cart.get(id) || 0) - 1; q > 0 ? S.cart.set(id, q) : S.cart.delete(id); updFab(); if (current === 'dining') paintDishes(); if ($('#cartSheet.on')) paintCart(); }
function updFab(bump) {
  const n = [...S.cart.values()].reduce((a, b) => a + b, 0), fab = $('#fab'); if (!fab) return;
  fab.classList.toggle('on', n > 0 && current !== 'admin'); $('#fabN').textContent = n; $('#fabT').textContent = money([...S.cart].reduce((s, [id, q]) => s + (itemById(id)?.price || 0) * q, 0));
  if (bump) { fab.classList.remove('bump'); void fab.offsetWidth; fab.classList.add('bump'); }
}
function openCart() { sheet('cartSheet'); paintCart(); prefill(); openSheet('cartSheet'); }
function paintCart() {
  const el = sheet('cartSheet'), rows = [...S.cart].filter(([id]) => itemById(id)), total = rows.reduce((s, [id, q]) => s + itemById(id).price * q, 0);
  const keep = id => el.querySelector('#' + id)?.value;
  const vals = { room: keep('oRoom'), name: keep('oName'), discord: keep('oDiscord') ?? S.me?.username ?? '' };
  el.innerHTML = `<div class="top"><h3>Заказ в номер</h3><button class="ibtn x" aria-label="Закрыть">${I.x}</button></div>
    ${rows.length ? `<div class="cl">${rows.map(([id, q]) => `<div><span>${esc(itemById(id).name)}<br><small class="note num">${money(itemById(id).price)}</small></span><span class="qty"><button data-m="${esc(id)}" data-sfx="soft">−</button><span class="num">${q}</span><button data-p="${esc(id)}" data-sfx="">+</button></span></div>`).join('')}</div><div class="tot"><span>Итого</span><span class="num">${money(total)}</span></div>
    <form id="oForm" class="stack" novalidate><label class="field"><span>Номер комнаты</span><select id="oRoom"><option value="">Выберите номер</option>${S.pub.rooms.map(r => `<option ${r.id === vals.room ? 'selected' : ''}>${esc(r.id)}</option>`).join('')}</select></label>
    <div class="g2"><label class="field"><span>Имя</span><input id="oName" value="${esc(vals.name || '')}" placeholder="Имя персонажа"></label><label class="field"><span>Discord</span><input id="oDiscord" value="${esc(vals.discord || '')}" placeholder="nickname"></label></div>
    <button class="btn" type="submit" data-sfx="">Заказать в номер</button></form>` : '<div class="empty">Заказ пуст. Добавьте блюда из меню Le Ciel или сигары из хьюмидора.</div><a class="btn ghost" href="#dining">Открыть меню</a>'}`;
  el.querySelector('.x').onclick = () => closeSheet('cartSheet'); el.querySelector('a.btn')?.addEventListener('click', () => closeSheet('cartSheet'));
  $$('#cartSheet [data-p]').forEach(b => b.onclick = () => addCart(b.dataset.p)); $$('#cartSheet [data-m]').forEach(b => b.onclick = () => subCart(b.dataset.m));
  $('#oForm') && ($('#oForm').onsubmit = async e => {
    e.preventDefault(); const btn = $('#oForm button'); btn.disabled = true;
    try { await api('POST', '/orders', { room: $('#oRoom').value, name: $('#oName').value, discord: $('#oDiscord').value, items: rows.map(([id, qty]) => ({ id, qty })) });
      S.cart.clear(); updFab(); if (current === 'dining') paintDishes(); play('success');
      el.innerHTML = `<div class="top"><h3>Заказ принят</h3><button class="ibtn x" aria-label="Закрыть">${I.x}</button></div><div class="success"><span class="mark">${I.check}</span><p class="mut">Кухня Le Ciel уже получила заказ. Статус видно в разделе «Мои брони и заявки».</p></div>`; el.querySelector('.x').onclick = () => closeSheet('cartSheet'); loadItems();
    } catch (err) { fail(err); btn.disabled = false; } });
}

/* ---------------- сигары ---------------- */
let cigIdx = 0;
function renderCigars() {
  const p = S.pub, v = view('cigars');
  if (cigIdx >= p.cigars.length) cigIdx = 0;
  if (!v.querySelector('.hum')) {
    v.innerHTML = `<div class="wrap sec"><div class="head"><span class="eyebrow">Сигарный клуб · 31 этаж</span><h2>Хьюмидор</h2><p>Откройте крышку, листайте сигары стрелками и крутите каждую мышью или пальцем.</p></div>
      <div class="cig"><div class="hum" id="hum"><div class="loading" id="humLoad">Открываем хьюмидор…</div><div class="ctrl"><button class="btn sm gold" id="lidBtn" data-sfx="">Открыть</button><div class="glass"><button class="ibtn" id="cPrev" aria-label="Предыдущая сигара" data-sfx="wood">${I.left}</button><span class="lbl2 num" id="cNum"></span><button class="ibtn" id="cNext" aria-label="Следующая сигара" data-sfx="wood">${I.right}</button></div></div></div>
      <div class="cinfo card pad" id="cInfo"></div></div><div class="cfilt" id="cFilt"></div><div class="strip" id="cStrip"></div></div>`;
    $('#cPrev').onclick = () => stepCigar(-1); $('#cNext').onclick = () => stepCigar(1);
    $('#lidBtn').onclick = () => { const open = mods.hum?.toggleLid(); play(open ? 'lid' : 'wood'); burst('lid', 6, 12000); $('#lidBtn').textContent = open ? 'Закрыть' : 'Открыть'; };
    v.addEventListener('keydown', e => { if (e.target.closest('input,textarea,select')) return; if (e.key === 'ArrowLeft') stepCigar(-1); if (e.key === 'ArrowRight') stepCigar(1); });
    const humFallback = () => { $('#hum').classList.add('flat'); $('#lidBtn').hidden = true; $('#humLoad').textContent = '3D-хьюмидор недоступен в этом браузере. Выбирайте сигары стрелками или в ленте ниже — заказ работает как обычно.'; };
    if (!hasWebGL()) humFallback();
    else import('./humidor3d.js').then(m => { mods.hum = m.mountHumidor($('#hum'), { onPick: i => pickCigar(i, true), onLid: o => { play('lid'); burst('lid', 6, 12000); $('#lidBtn').textContent = o ? 'Закрыть' : 'Открыть'; } }); $('#humLoad')?.remove(); mods.hum.active(current === 'cigars'); mods.hum.setCigars(S.pub.cigars, cigIdx); }).catch(e => { console.error(e); humFallback(); });
  } else mods.hum?.setCigars(p.cigars, cigIdx);
  paintCigar();
}
function pickCigar(i, fromScene) { const n = S.pub.cigars.length; if (!n) return; cigIdx = (i + n) % n; if (!fromScene) mods.hum?.select(cigIdx); else play('wood'); paintCigar(); }
// фильтр хьюмидора по крепости и стране: стрелки и клавиатура ходят только по подходящим сигарам
const CIG_STR = [[0, 'Любая', 1, 5], [1, 'Лёгкие', 1, 2], [3, 'Средние', 3, 3], [4, 'Крепкие', 4, 5]];
let cigStr = 0, cigOrigin = '';
const cigOk = c => { const [, , a, b] = CIG_STR.find(x => x[0] === cigStr); return c.strength >= a && c.strength <= b && (!cigOrigin || c.origin === cigOrigin); };
function stepCigar(dir) { const L = S.pub.cigars, n = L.length; for (let k = 1; k <= n; k++) { const i = ((cigIdx + dir * k) % n + n) % n; if (cigOk(L[i])) return pickCigar(i); } }
function setCigarFilter(str, origin) {
  cigStr = str; cigOrigin = origin;
  const L = S.pub.cigars, first = L.findIndex(cigOk);
  if (first >= 0 && !cigOk(L[cigIdx])) pickCigar(first); else paintCigar();
}
function paintCigar() {
  const c = S.pub.cigars[cigIdx], L = S.pub.cigars, ok = L.map(cigOk), cnt = ok.filter(Boolean).length, filtered = cigStr !== 0 || !!cigOrigin;
  $('#cNum').textContent = !L.length ? '0' : ok[cigIdx] ? `${ok.slice(0, cigIdx + 1).filter(Boolean).length} / ${cnt}` : `— / ${cnt}`;
  const origins = [...new Set(L.map(x => x.origin).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  $('#cFilt').innerHTML = L.length ? `<div class="seg" role="group" aria-label="Крепость">${CIG_STR.map(([k, n]) => `<button type="button" aria-pressed="${cigStr === k}" data-cs="${k}">${n}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Страна"><button type="button" aria-pressed="${!cigOrigin}" data-co="">Все страны</button>${origins.map(o => `<button type="button" aria-pressed="${cigOrigin === o}" data-co="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    <span class="note" aria-live="polite">${filtered ? `Подходит ${cnt} из ${L.length}` : `${L.length} ${plural(L.length, 'сигара', 'сигары', 'сигар')} в хьюмидоре`}</span>` : '';
  $$('#cFilt [data-cs]').forEach(b => b.onclick = () => setCigarFilter(+b.dataset.cs, cigOrigin));
  $$('#cFilt [data-co]').forEach(b => b.onclick = () => setCigarFilter(cigStr, b.dataset.co));
  $$('#cFilt [aria-pressed="true"]').forEach(b => { const s = b.parentElement; if (s.scrollWidth > s.clientWidth) s.scrollLeft = b.offsetLeft - (s.clientWidth - b.offsetWidth) / 2; }); // выбранное видно в прокручиваемой ленте
  $('#cInfo').innerHTML = c ? `<span class="eyebrow">${esc(c.origin)}</span><h3>${esc(c.name)}</h3>
    <dl class="kv"><dt>Формат</dt><dd>${esc(CIGAR_SHAPES[c.shape] || c.shape)}</dd><dt>Калибр</dt><dd class="num" title="Ring gauge: диаметр в 1/64 дюйма">${esc(c.ring)} <small class="mut">RG</small></dd><dt>Длина</dt><dd class="num">${esc(c.length)} мм</dd><dt>Крепость</dt><dd><span class="str">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= c.strength ? 'on' : ''}"></i>`).join('')}</span></dd><dt>Цена</dt><dd class="num"><b>${money(c.price)}</b></dd></dl>
    <div class="notes">${(c.notes || []).map(n => `<span>${esc(n)}</span>`).join('')}</div>${c.desc ? `<p class="mut">${esc(c.desc)}</p>` : ''}
    <div class="row"><button class="btn" id="cAdd" data-sfx="">В заказ в номер</button><button class="btn ghost" id="cCart" data-sfx="open">Открыть заказ</button></div>` : '<div class="empty">Хьюмидор пуст. Сигары добавляют в панели персонала.</div>';
  $('#cAdd') && ($('#cAdd').onclick = () => { addCart(c.id, $('#cAdd')); toast(`${c.name}: в заказе`); });
  $('#cCart') && ($('#cCart').onclick = openCart);
  $('#cStrip').innerHTML = cnt || !L.length ? L.map((x, i) => ok[i] ? `<button aria-pressed="${i === cigIdx}" data-i="${i}" data-sfx="wood"><i style="background:${esc(x.band)}"></i>${esc(x.name)}</button>` : '').join('') : '<div class="empty" style="padding:.8rem 1rem">Под фильтр ничего не подходит. <button class="btn ghost sm" id="cReset" type="button">Сбросить фильтр</button></div>';
  $('#cReset') && ($('#cReset').onclick = () => setCigarFilter(0, ''));
  $$('#cStrip button').forEach(b => b.onclick = () => pickCigar(+b.dataset.i));
  $('#cStrip [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

/* ---------------- журнал ---------------- */
let jq = '';
function renderJournal() {
  const list = S.pub.issues.filter(i => !jq || (i.title + ' ' + (i.number || '') + ' ' + (i.desc || '')).toLowerCase().includes(jq.toLowerCase()));
  const v = view('journal');
  if (!v.querySelector('#jSearch')) {
    v.innerHTML = `<div class="wrap sec"><div class="row" style="justify-content:space-between;align-items:end;margin-bottom:1.4rem"><div class="head" style="margin:0"><span class="eyebrow">Mile High Journal</span><h2>Выпуски журнала</h2></div>
      <label class="field" style="width:min(100%,320px)"><span class="sr">Поиск выпусков</span><input id="jSearch" type="search" placeholder="Поиск выпусков…"></label></div><div class="issues" id="issues"></div></div>`;
    $('#jSearch').oninput = e => { jq = e.target.value; renderJournal(); };
  }
  $('#issues').innerHTML = list.length ? list.map(i => `<a class="issue reveal" href="#issue-${esc(i.id)}" data-sfx="page"><div class="cv" style="background-image:url('${esc(i.cover || i.pages?.[0]?.image || '')}')"></div><b>${esc(i.title)}</b><small>${esc(i.number || '')} · ${new Date(i.date || Date.now()).toLocaleDateString('ru-RU')}</small></a>`).join('') : `<div class="empty" style="grid-column:1/-1">${S.pub.issues.length ? 'Ничего не нашлось.' : 'Выпусков пока нет. Их добавляют в панели персонала.'}</div>`;
  $$('#issues .issue').forEach(a => a.addEventListener('click', () => { S.coverFrom = a.querySelector('.cv'); }));
  reveal(v);
}
function renderIssue() {
  const i = S.pub.issues.find(x => x.id === S.param); const v = view('issue');
  if (!i) { v.innerHTML = '<div class="wrap sec"><div class="empty">Выпуск не найден. <a href="#journal">Все выпуски</a></div></div>'; return; }
  if (v.dataset.id === i.id && v.dataset.ver === String(i.updatedAt || i.date)) return;
  v.dataset.id = i.id; v.dataset.ver = String(i.updatedAt || i.date);
  v.innerHTML = `<div class="wrap sec"><div class="ihead"><div class="cv" style="background-image:url('${esc(i.cover || i.pages?.[0]?.image || '')}')"></div><div class="stack" style="gap:.6rem"><span class="eyebrow">${esc(i.number || 'Выпуск')}</span><h2>${esc(i.title)}</h2><p class="mut">${esc(i.desc || '')}</p></div>
    <div class="stack meta-col"><div class="meta"><div><span>Издатель</span><b>${esc(i.publisher || 'Mile High Media')}</b></div><div><span>Опубликовано</span><b class="num">${new Date(i.date || Date.now()).toLocaleDateString('ru-RU')}</b></div><div><span>Страниц</span><b class="num">${(i.pages || []).length}</b></div></div><button class="btn ghost" id="copyLink">${I.copy} Скопировать ссылку</button></div></div>
    <div class="bookbar"><button class="btn ghost sm" id="pPrev" data-sfx="" aria-label="Назад">${I.left}<span class="bl">Назад</span></button><span class="row"><span class="pgnum num" id="pNum"></span><button class="btn ghost sm" id="pFs" aria-label="Во весь экран">${I.fs}<span class="bl">Во весь экран</span></button></span><button class="btn ghost sm" id="pNext" data-sfx="" aria-label="Вперёд"><span class="bl">Вперёд</span>${I.right}</button></div>
    <div class="bookwrap" id="bookWrap"><button class="btn sm fsx" id="fsX">${I.x} Закрыть</button><div class="fsnav"><button class="btn soft icon" id="fsPrev" aria-label="Назад" data-sfx="">${I.left}</button><button class="btn soft icon" id="fsNext" aria-label="Вперёд" data-sfx="">${I.right}</button></div><div class="bookbox" style="max-width:100%;margin:0 auto"><div class="book" id="book"></div></div></div><p class="note" style="text-align:center">Тяните за угол страницы или листайте стрелками на клавиатуре.</p></div>`;
  $('#copyLink').onclick = async () => { const url = location.href; try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch { toast(url); } };
  import('./journal.js').then(m => { mods.book?.destroy?.(); mods.book = m.mountBook($('#bookWrap'), $('#book'), i, { prev: $('#pPrev'), next: $('#pNext'), num: $('#pNum'), fs: $('#pFs'), fsx: $('#fsX'), fsPrev: $('#fsPrev'), fsNext: $('#fsNext') }); }).catch(e => { console.error(e); $('#book').innerHTML = '<div class="empty">Не удалось открыть журнал.</div>'; });
}

/* ---------------- персонал ---------------- */
let deptIdx = 0, gender = null, staffMode = 'team', teamDept = '';
function renderStaff() {
  const d = S.pub.depts, v = view('staff'); if (deptIdx >= d.length) deptIdx = 0;
  if (!v.querySelector('.stage')) {
    v.innerHTML = `<div class="wrap sec"><div class="row staffhead"><div class="head" style="margin:0"><span class="eyebrow">Персонал</span><h2 id="stH">Команда отеля</h2><p id="stP"></p></div>
      <div class="seg" role="group" aria-label="Вид"><button data-sm="team">Команда</button><button data-sm="outfit">Униформа 360°</button><button data-sm="model">3D-манекен</button></div></div>
      <div id="teamV"></div>
      <div class="staff" id="uniV"><div class="deps" id="deps" role="group" aria-label="Отдел"></div><div><div class="outfit" id="outfit"></div><div class="stage" id="stage"><div class="loading" id="stLoad">Загружаем манекен…</div><div class="info"><div class="ucard" id="ucard"></div><div class="seg" role="group" aria-label="Манекен"><button data-g="male">Мужской</button><button data-g="female">Женский</button></div></div></div></div></div></div>`;
    $$('#main [data-sm]').forEach(b => b.onclick = () => { staffMode = b.dataset.sm; if (staffMode === 'model') loadStaff3d(); paintStaff(); });
    $$('#stage [data-g]').forEach(b => b.onclick = () => { gender = b.dataset.g; paintStaff(); });
    if (staffMode === 'model') loadStaff3d();
  }
  paintStaff();
}
const initials = n => String(n || '?').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
function paintTeam() {
  const all = S.pub.team || [], ds = S.pub.depts, dn = id => ds.find(x => x.id === id);
  const used = ds.filter(x => all.some(t => t.dept === x.id));
  if (teamDept && !used.some(x => x.id === teamDept)) teamDept = '';
  const list = all.filter(t => !teamDept || t.dept === teamDept);
  $('#teamV').innerHTML = (used.length > 1 ? `<div class="chips tf" role="group" aria-label="Отдел"><button data-td="" aria-pressed="${!teamDept}">Все</button>${used.map(x => `<button data-td="${esc(x.id)}" aria-pressed="${teamDept === x.id}" style="--ac:${esc(x.accent)}">${esc(x.name)}</button>`).join('')}</div>` : '') +
    (list.length ? `<div class="team">${list.map(t => { const d = dn(t.dept); return `<button class="tcard reveal in" data-t="${esc(t.id)}" style="--ac:${esc(d?.accent || '#F7B50A')}" data-sfx="soft">
      <span class="tph ${t.photo ? '' : 'none'}" ${t.photo ? `style="background-image:url('${esc(t.photo)}')"` : ''}>${t.photo ? '' : `<b>${esc(initials(t.name))}</b>`}${t.example ? '<i class="tbadge">Пример</i>' : ''}</span>
      <span class="tx"><small>${esc(d?.name || 'Mile High Club')}</small><b>${esc(t.name)}</b><span>${esc(t.position || '')}</span></span></button>`; }).join('')}</div>` : '<div class="empty">Анкеты появятся здесь, когда управляющие их заполнят.</div>');
  $$('#teamV [data-td]').forEach(b => b.onclick = () => { teamDept = b.dataset.td; paintTeam(); });
  $$('#teamV [data-t]').forEach(b => b.onclick = () => openMember(all.find(t => t.id === b.dataset.t)));
}
const seenTeam = new Set();
// Анкета открывается сразу. View Transition здесь держал снимок страницы поверх окна на всё время анимации.
function openMember(t) {
  if (!t) return; seenTeam.add(t.id); if ((S.pub.team || []).length > 1 && S.pub.team.every(x => seenTeam.has(x.id))) setTimeout(() => unlock('team'), 600); const d = S.pub.depts.find(x => x.id === t.dept);
  modal(`<div class="member" style="--ac:${esc(d?.accent || '#F7B50A')}"><div class="tph ${t.photo ? '' : 'none'}" ${t.photo ? `style="background-image:url('${esc(t.photo)}')"` : ''}>${t.photo ? '' : `<b>${esc(initials(t.name))}</b>`}</div>
    <div class="stack"><div><span class="eyebrow">${esc(d?.name || 'Mile High Club')}</span><h3>${esc(t.name)}</h3><p class="mut">${esc(t.position || '')}</p></div>
    ${t.quote ? `<blockquote>«${esc(t.quote)}»</blockquote>` : ''}${t.bio ? `<p>${esc(t.bio)}</p>` : ''}
    <dl>${t.since ? `<div><dt>В отеле</dt><dd>${esc(t.since)}</dd></div>` : ''}${t.discord ? `<div><dt>Discord</dt><dd>${esc(t.discord)}</dd></div>` : ''}${d ? `<div><dt>Форма</dt><dd><span class="sw"><i style="background:${esc(d.color)}"></i><i style="background:${esc(d.accent)}"></i></span></dd></div>` : ''}</dl>
    ${t.example ? '<p class="note">Это пример анкеты. Настоящие данные добавят управляющие.</p>' : ''}
    <div class="row"><a class="btn sm" href="#contact" data-close="">Написать управляющим</a>${d ? `<button class="btn sm ghost" data-uni="${esc(d.id)}" data-close="">Форма отдела</button>` : ''}</div></div></div>`,
    { wide: true, onMount: box => { const u = $('[data-uni]', box); if (u) u.addEventListener('click', () => { deptIdx = Math.max(0, S.pub.depts.findIndex(x => x.id === u.dataset.uni)); staffMode = 'outfit'; paintStaff(); }); } });
}
function loadStaff3d() {
  if (mods.staff || loadStaff3d.busy) return; loadStaff3d.busy = true;
  if (!hasWebGL()) { $('#stLoad').textContent = '3D-манекен недоступен в этом браузере. Форму отдела можно посмотреть во вкладке «Униформа 360°».'; return; }
  import('./staff3d.js').then(m => { mods.staff = m.mountStaff($('#stage'), () => $('#stLoad')?.remove(), () => { const l = $('#stLoad'); if (l) l.textContent = '3D-манекен не загрузился. Форму отдела можно посмотреть во вкладке «Униформа 360°».'; }); mods.staff.active(current === 'staff' && staffMode === 'model'); paintStaff(); }).catch(e => { console.error(e); $('#stLoad').textContent = '3D-просмотр не загрузился.'; });
}
function paintStaff() {
  const extras = S.pub.settings.staffExtras !== false; if (!extras) staffMode = 'team'; // в настройках можно оставить только команду
  $('.staffhead .seg').style.display = extras ? '' : 'none';
  const T = { team: ['Команда отеля', 'Люди, которые держат Mile High Club на высоте. Нажмите на карточку, чтобы узнать о сотруднике.'], outfit: ['Униформа по отделам', 'Каждая вещь формы крутится на 360°. Пока это заглушки в цветах отдела, фото подставим, когда будут готовы.'], model: ['Форма на манекене', 'Покрутите манекен мышью или пальцем. Цвета берутся из формы отдела.'] }[staffMode];
  $('#stH').textContent = T[0]; $('#stP').textContent = T[1];
  $$('#main [data-sm]').forEach(b => b.setAttribute('aria-pressed', b.dataset.sm === staffMode));
  $('#teamV').classList.toggle('hide', staffMode !== 'team'); $('#uniV').classList.toggle('hide', staffMode === 'team');
  if (staffMode === 'team') { mods.staff?.active(false); paintTeam(); return; }
  const ds = S.pub.depts, d = ds[deptIdx]; if (!d) { $('#deps').innerHTML = '<div class="empty">Отделы не заданы.</div>'; return; }
  const g = gender || d.gender || 'male';
  $('#deps').innerHTML = ds.map((x, i) => `<button aria-pressed="${i === deptIdx}" data-i="${i}" style="--ac:${esc(x.accent)}" data-sfx="soft"><i style="background:${esc(x.color)}"></i>${esc(x.name)}</button>`).join('');
  $$('#deps button').forEach(b => b.onclick = () => { deptIdx = +b.dataset.i; gender = null; paintStaff(); });
  $$('#stage [data-g]').forEach(b => b.setAttribute('aria-pressed', b.dataset.g === g));
  $('#ucard').innerHTML = `<h3>${esc(d.name)}</h3><p>${esc(d.desc || '')}</p><span class="sw">${[d.color, d.accent].map(c => `<i style="background:${esc(c)}"></i>`).join('')}</span>`;
  $$('#main [data-sm]').forEach(b => b.setAttribute('aria-pressed', b.dataset.sm === staffMode));
  $('#stage').classList.toggle('hide', staffMode !== 'model'); $('#outfit').classList.toggle('hide', staffMode !== 'outfit');
  mods.staff?.active(current === 'staff' && staffMode === 'model'); mods.staff?.show(d, g);
  if (staffMode === 'outfit') import('./outfit.js').then(o => {
    const items = (d.items?.length ? d.items : o.defaultItems(d)).map(it => ({ ...it, color: it.color || d.color, accent: it.accent || d.accent }));
    $('#outfit').innerHTML = items.map((it, i) => `<article class="ocard"><canvas data-i="${i}" aria-label="${esc(it.name)}, вращается на 360 градусов"></canvas><div class="row" style="justify-content:space-between"><b>${esc(it.name)}</b><span class="chip ${it.frames?.length ? 'ok' : 'm'}">${it.frames?.length ? '360° фото' : 'заглушка'}</span></div><span class="sw"><i style="background:${esc(it.color)}"></i>${it.kind === 'jacket' || it.kind === 'vest' ? `<i style="background:${esc(it.accent)}"></i>` : ''}</span></article>`).join('') + `<div class="ucard card pad" style="grid-column:1/-1"><h3 style="font-size:1.1rem">${esc(d.name)}</h3><p class="mut">${esc(d.desc || '')}</p></div>`;
    $$('#outfit canvas').forEach(cv => o.turntable(cv, items[+cv.dataset.i]));
  });
}

/* ---------------- заявка ---------------- */
let curTicket = null, ticketStep = 1, ticketMember = null, ticketMode = 'site';
function renderContact() {
  const v = view('contact'); if (focusedIn(v)) { paintChat(); return; }
  const s = S.pub.settings;
  v.innerHTML = `<div class="wrap sec"><div class="chead"><button class="dbell" id="dBell" data-sfx="" aria-label="Позвонить в звонок на стойке ресепшена" title="Звонок на стойке"><svg viewBox="0 0 120 90" aria-hidden="true"><defs><linearGradient id="bG" x1="0" x2="1"><stop offset="0" stop-color="#6b4a1c"/><stop offset=".35" stop-color="#f9e2a8"/><stop offset=".6" stop-color="#c99a3a"/><stop offset="1" stop-color="#5a3c14"/></linearGradient><radialGradient id="bH" cx=".35" cy=".25" r=".6"><stop offset="0" stop-color="#fff6dc" stop-opacity=".9"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient></defs><g class="pl"><rect x="56" y="4" width="8" height="12" rx="3" fill="url(#bG)"/><ellipse cx="60" cy="5" rx="8" ry="3.2" fill="#e8c77a"/></g><path class="dome" d="M14 70 Q14 18 60 16 Q106 18 106 70 Z" fill="url(#bG)"/><path d="M14 70 Q14 18 60 16 Q106 18 106 70 Z" fill="url(#bH)"/><rect x="8" y="68" width="104" height="9" rx="4.5" fill="#2a1a10"/><rect x="4" y="76" width="112" height="9" rx="4" fill="#160d0b"/></svg><span>Позвонить</span></button><div class="head" style="margin:0"><span class="eyebrow">Заявка</span><h2>Напишите управляющим</h2><p>Укажите Discord. Если вы на нашем сервере, бот откроет тикет и добавит вас. Если нет, ответим в чате прямо здесь.</p></div></div>
    <div class="contact"><div class="card pad stack" id="tBox"></div><div class="stack" id="tChatCol"></div></div>
    ${(S.pub.faq || []).length ? `<div class="faq"><div class="head"><span class="eyebrow">Вопросы</span><h2>Частые вопросы</h2></div>${S.pub.faq.map(q => `<details><summary data-sfx="soft">${esc(q.q)}<i>${I.plus}</i></summary><p>${esc(q.a)}</p></details>`).join('')}</div>` : ''}</div>`;
  paintTicketStep(); paintChat();
  $('#dBell').onclick = () => { const b = $('#dBell'); b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); play('bell'); if (burst('bell', 6, 5000)) setTimeout(() => toast('Портье уже бежит. Пока он в пути, оставьте заявку ниже.'), 2400); };
}
function paintTicketStep() {
  const box = $('#tBox'); if (!box) return; const s = S.pub.settings;
  const bar = `<div class="steps">${[1, 2, 3].map(n => `<i class="${n <= ticketStep ? 'on' : ''}"></i>`).join('')}</div>`;
  if (ticketStep === 1) {
    box.innerHTML = `${bar}<h3 style="font-size:1.2rem">1. Заявка</h3><form id="tForm" class="stack" novalidate><div class="g2"><label class="field"><span>Discord</span><input id="tDiscord" required autocomplete="off" placeholder="nickname" value="${esc(S.me?.username || '')}"></label><label class="field"><span>Имя персонажа</span><input id="tName" autocomplete="off" placeholder="Как к вам обращаться"></label></div>
      <label class="field"><span>Тема</span><select id="tTopic"><option>Бронь и проживание</option><option>Мероприятие в отеле</option><option>Работа в отеле</option><option>Спа</option><option>Жалоба</option><option>Другое</option></select></label>
      <label class="field"><span>Сообщение</span><textarea id="tText" required placeholder="Опишите, что нужно"></textarea></label><button class="btn" type="submit" data-sfx="">Отправить</button><p class="note">Указывайте игровые данные. Что мы храним — в <a href="#privacy">политике конфиденциальности</a>.</p></form>`;
    $('#tForm').onsubmit = async e => { e.preventDefault(); const b = $('#tForm button'); b.disabled = true;
      try { const r = await api('POST', '/tickets', { discord: $('#tDiscord').value, name: $('#tName').value, topic: $('#tTopic').value, text: $('#tText').value }); curTicket = r.ticket; ticketStep = 2; play('open'); paintCheck(r.member); loadItems(); } catch (err) { fail(err); b.disabled = false; } };
  } else if (ticketStep === 2) paintCheck(ticketMember);
  else paintDone();
}
function paintCheck(member) {
  ticketMember = member;
  const box = $('#tBox'), s = S.pub.settings, bar = `<div class="steps"><i class="on"></i><i class="on"></i><i></i></div>`;
  if (member === true) { box.innerHTML = `${bar}<h3 style="font-size:1.2rem">2. Вы на сервере</h3><p class="mut">Нашли <b>${esc(curTicket.discord)}</b> на сервере Mile High Club. Открыть тикет в Discord?</p><div class="row"><button class="btn" id="tDc">Открыть тикет в Discord</button><button class="btn ghost" id="tSite">Лучше чат на сайте</button></div>`; }
  else if (member === false) { box.innerHTML = `${bar}<h3 style="font-size:1.2rem">2. Вас нет на сервере</h3><p class="mut">Не нашли <b>${esc(curTicket.discord)}</b> на нашем Discord-сервере. Зайдите на сервер, и бот откроет тикет. Или продолжим здесь, в чате.</p><div class="row">${s.discordInvite ? `<a class="btn discord" href="${esc(s.discordInvite)}" target="_blank" rel="noopener">${I.discord} Зайти на сервер</a>` : ''}<button class="btn ghost" id="tRe">Я зашёл, проверить</button><button class="btn ghost" id="tSite">Продолжить на сайте</button></div>`; }
  else { box.innerHTML = `${bar}<h3 style="font-size:1.2rem">2. Где продолжим?</h3><p class="mut">${DEMO ? 'В демо-версии бот не подключён, поэтому выберите сами.' : 'Бот сейчас не может проверить сервер. Выберите сами.'} Вы уже на нашем Discord-сервере?</p><div class="row"><button class="btn" id="tDc">Да, открыть тикет в Discord</button>${s.discordInvite ? `<a class="btn ghost" href="${esc(s.discordInvite)}" target="_blank" rel="noopener">Зайти на сервер</a>` : ''}<button class="btn ghost" id="tSite">Чат на сайте</button></div>`; }
  $('#tDc') && ($('#tDc').onclick = () => setMode('discord'));
  $('#tSite') && ($('#tSite').onclick = () => setMode('site'));
  $('#tRe') && ($('#tRe').onclick = async () => { try { const r = await api('POST', `/tickets/${curTicket.id}/recheck`); paintCheck(r.member); if (r.member === false) toast('Пока не видим вас на сервере'); } catch (e) { fail(e); } });
}
// Шаг 3 рисуется и при повторной отрисовке страницы, иначе блок заявки остаётся пустым
function paintDone() {
  const m = ticketMode;
  $('#tBox').innerHTML = `<div class="steps"><i class="on"></i><i class="on"></i><i class="on"></i></div><div class="success"><span class="mark">${I.check}</span><h3>${m === 'discord' ? 'Тикет открыт' : 'Чат открыт'}</h3><p class="mut">${m === 'discord' ? 'Бот создал канал тикета и добавил вас. Загляните в Discord.' : 'Управляющие получили уведомление и ответят в чате справа.'}</p><button class="btn ghost" id="tNew">Новая заявка</button></div>`;
  $('#tNew').onclick = () => { ticketStep = 1; curTicket = null; paintTicketStep(); paintChat(); };
}
async function setMode(m) {
  try { const r = await api('POST', `/tickets/${curTicket.id}/mode`, { mode: m }); curTicket = r.ticket; ticketStep = 3; play('success'); if (r.fallback) { m = 'site'; toast('Тикет в Discord сейчас недоступен. Обращение открыто в чате на сайте.'); }
    ticketMode = m; paintDone();
    await loadItems(); if (m === 'site') { openTicketId = curTicket.id; paintChat(); }
  } catch (e) { fail(e); }
}
let openTicketId = null;
function paintChat() {
  const col = $('#tChatCol'); if (!col) return;
  const mine = S.items.tickets; const t = mine.find(x => x.id === openTicketId && x.mode === 'site') || null;
  const focused = col.contains(document.activeElement); const draft = $('#chatIn')?.value || '';
  col.innerHTML = `${t ? `<div class="chat"><header><div><b>${esc(t.topic)}</b><div class="note">Чат с управляющими</div></div><span class="chip ${t.status === 'closed' ? 'm' : 'ok'}">${TICKET_STATUS[t.status]}</span></header><div class="msgs" id="msgs"><div class="msg sys">Обращение открыто ${when(t.createdAt)}</div>${(t.messages || []).map(m => `<div class="msg ${m.from === 'guest' ? 'me' : ''}">${esc(m.text)}<small>${m.from === 'staff' ? 'Управляющий' + (m.by ? ' · ' + esc(m.by) : '') : 'Вы'} · ${when(m.at)}</small></div>`).join('')}</div>${t.status === 'closed' ? '<div class="compose note">Обращение закрыто.</div>' : `<form class="compose" id="chatF"><input id="chatIn" placeholder="Сообщение" autocomplete="off" aria-label="Сообщение"><button class="btn sm" data-sfx="">Отправить</button></form>`}</div>` : ''}
    <div class="card pad stack"><h3 style="font-size:1.05rem">Мои обращения</h3>${mine.length ? `<div class="list">${mine.map(x => `<div class="item"><div class="top"><b>${esc(x.topic)}</b><span class="chip ${x.status === 'open' ? 'ok' : x.status === 'checking' ? 'warn' : 'm'}">${TICKET_STATUS[x.status]}</span></div><span class="note">${x.mode === 'discord' ? 'Ведётся в Discord' : x.mode === 'site' ? 'Чат на сайте' : 'Ожидает выбора'} · ${when(x.createdAt)}${x.lastFrom === 'staff' && x.mode === 'site' ? ' · <b style="color:var(--pink)">новый ответ</b>' : ''}</span>${x.mode === 'site' ? `<div><button class="btn sm ghost" data-open="${esc(x.id)}">Открыть чат</button></div>` : ''}</div>`).join('')}</div>` : '<p class="note">Пока пусто.</p>'}</div>`;
  if ($('#chatIn')) { $('#chatIn').value = draft; if (focused) $('#chatIn').focus(); }
  const ms = $('#msgs'); if (ms) ms.scrollTop = ms.scrollHeight;
  markRead(t);
  $$('#tChatCol [data-open]').forEach(b => b.onclick = () => { openTicketId = b.dataset.open; paintChat(); });
  $('#chatF') && ($('#chatF').onsubmit = async e => { e.preventDefault(); const inp = $('#chatIn'), text = inp.value.trim(); if (!text) return; inp.value = '';
    try { await api('POST', `/tickets/${t.id}/messages`, { text }); play('soft'); await loadItems(); } catch (err) { fail(err); inp.value = text; } });
}

/* ---------------- кабинет ---------------- */
const STEPS = [['new', 'Заявка'], ['confirmed', 'Подтверждена'], ['checkedin', 'Заселён'], ['done', 'Завершена']];
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const ruDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
function bookingCard(b) {
  const room = b.room && S.pub.rooms.find(r => r.id === b.room), at = STEPS.findIndex(([k]) => k === b.status);
  const steps = b.status === 'cancelled' ? `<div class="bk-steps off"><span class="chip bad">Отменена${b.cancelledBy === 'guest' ? ' вами' : ''}</span></div>`
    : `<ol class="bk-steps" aria-label="Статус брони">${STEPS.map(([k, n], i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}"${i === at ? ' aria-current="step"' : ''}>${n}</li>`).join('')}</ol>`;
  return `<article class="bk"><div class="bk-top"><div><span class="lbl">Код брони</span><b class="bk-code num">${esc(b.code)}</b></div><span class="bk-type">${esc(b.typeName)}</span></div>${steps}
    <dl class="bk-facts"><div><dt>Заезд</dt><dd>${ruDate(b.date)}</dd></div><div><dt>Выезд</dt><dd>${ruDate(addDays(b.date, b.nights))}</dd></div><div><dt>Номер</dt><dd>${room ? `${esc(room.id)} · ${room.floor} этаж` : 'назначат при подтверждении'}</dd></div><div><dt>Сумма</dt><dd class="num">${money(b.total)}${b.discount ? ` <small>скидка ${b.discount}%${b.tier ? ' · ' + esc(b.tier) : ''}</small>` : ''}</dd></div></dl>
    <div class="row bk-act">${room ? `<button class="btn sm ghost" data-tower="${esc(room.id)}">Показать на башне</button>` : ''}${b.status === 'new' ? `<button class="btn sm ghost" data-move="${esc(b.id)}">Перенести</button>` : ''}${['new', 'confirmed'].includes(b.status) ? `<button class="btn sm ghost danger-t" data-cancel="${esc(b.id)}">Отменить</button>` : ''}</div></article>`;
}
function tierBlock(st) {
  const T = S.pub.settings.tiers || [], cur = st.tier, nx = st.next;
  const from = cur ? cur.nights : 0, pct = nx ? Math.min(100, Math.round((st.nights - from) / (nx.nights - from) * 100)) : 100;
  return `<div class="card pad stack tierc"><div class="row" style="justify-content:space-between"><h3 style="font-size:1.05rem">Статус гостя</h3><span class="chip ${cur ? 'p' : 'm'}">${cur ? esc(cur.name) : 'Гость'}</span></div>
    <div class="tier-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="До следующего статуса"><i style="width:${pct}%"></i></div>
    <p class="note">${nx ? `Прожито ночей: <b>${st.nights}</b>. До статуса «${esc(nx.name)}» — ${nx.nights - st.nights} ${plural(nx.nights - st.nights, 'ночь', 'ночи', 'ночей')}.` : `Прожито ночей: <b>${st.nights}</b>. Это высший статус отеля.`}</p>
    <dl class="bk-facts"><div><dt>Проживаний</dt><dd>${st.stays}</dd></div><div><dt>Любимый номер</dt><dd>${st.favRoom ? esc(st.favRoom) : '—'}</dd></div><div><dt>Любимый тип</dt><dd>${st.favType ? esc(st.favType) : '—'}</dd></div></dl>
    ${T.length ? `<ul class="tier-list">${T.map(t => `<li class="${cur?.name === t.name ? 'on' : ''}"><b>${esc(t.name)}</b><span>от ${t.nights} ${plural(t.nights, 'ночи', 'ночей', 'ночей')}${t.discount ? ` · скидка ${t.discount}%` : ''}${t.perk ? ' · ' + esc(t.perk) : ''}</span></li>`).join('')}</ul>` : ''}</div>`;
}
function meChat(t) {
  return `<div class="chat mechat"><header><div><b>${esc(t.topic)}</b><div class="note">Чат с управляющими</div></div><span class="chip ${t.status === 'closed' ? 'm' : 'ok'}">${TICKET_STATUS[t.status]}</span></header><div class="msgs" id="meMsgs">${(t.messages || []).map(m => `<div class="msg ${m.from === 'guest' ? 'me' : ''}">${esc(m.text)}<small>${m.from === 'staff' ? 'Управляющий' + (m.by ? ' · ' + esc(m.by) : '') : 'Вы'} · ${when(m.at)}</small></div>`).join('')}</div>${t.status === 'closed' ? '<div class="compose note">Обращение закрыто.</div>' : `<form class="compose" id="meChatF"><input id="meChatIn" placeholder="Сообщение" autocomplete="off" aria-label="Сообщение управляющим"><button class="btn sm" data-sfx="">Отправить</button></form>`}</div>`;
}
let meTicket = null;
function renderMe() {
  const it = S.items, u = S.me, p = it.profile || {}, st = it.stats || { nights: 0, stays: 0 };
  const chatT = it.tickets.find(t => t.id === meTicket && t.mode === 'site') || null;
  const draft = $('#meChatIn')?.value || '', focused = $('#meChatIn') === document.activeElement;
  view('me').innerHTML = `<div class="wrap sec"><div class="head"><span class="eyebrow">Кабинет</span><h2>Мои брони и заявки</h2><p>${u ? `Вы вошли как <b>${esc(u.username)}</b>.` : 'Брони и заявки с этого устройства видны здесь. Войдите через Discord, чтобы видеть их на любом устройстве: всё, что вы оформили здесь, перейдёт в аккаунт.'}</p></div>
    <div class="row" style="margin-bottom:1.5rem">${u ? `<button class="btn ghost sm" id="meOut">${I.out} Выйти</button>${u.role !== 'guest' ? '<a class="btn sm" href="#admin">Панель персонала</a>' : ''}` : `<button class="btn discord sm" id="meIn">${I.discord} Войти через Discord</button>`}</div>
    <div class="me-grid">
      <div class="stack" style="gap:1rem;min-width:0"><h3 style="font-size:1.1rem">Брони</h3>${it.bookings.length ? it.bookings.map(bookingCard).join('') : '<div class="empty">Броней пока нет. <a href="#stay">Выбрать номер</a></div>'}
        <h3 style="font-size:1.1rem;margin-top:.5rem">Заказы в номер</h3>${it.orders.length ? `<div class="list">${it.orders.map(o => `<div class="item"><div class="top"><b>Номер ${esc(o.room)} · ${money(o.total)}</b><span class="chip ${o.status === 'done' ? 'ok' : o.status === 'cancelled' ? 'bad' : 'warn'}">${ORDER_STATUS[o.status]}</span></div><span class="note">${o.items.map(i => esc(i.name) + ' ×' + i.qty).join(', ')} · ${when(o.createdAt)}</span>${o.items.some(i => itemById(i.id)) ? `<div><button class="btn sm ghost" data-again="${esc(o.id)}">Заказать снова</button></div>` : ''}</div>`).join('')}</div>` : '<div class="empty">Заказов нет. <a href="#dining">Меню Le Ciel</a></div>'}
        <h3 style="font-size:1.1rem;margin-top:.5rem">Заявки</h3>${it.tickets.length ? `<div class="list">${it.tickets.map(t => `<div class="item${unreadOf(t) ? ' unread' : ''}"><div class="top"><b>${esc(t.topic)}${unreadOf(t) ? ' <span class="chip p">Новый ответ</span>' : ''}</b><span class="chip ${t.status === 'open' ? 'ok' : 'm'}">${TICKET_STATUS[t.status]}</span></div><span class="note">${t.mode === 'site' ? 'Чат на сайте' : t.mode === 'discord' ? 'В Discord' : ''} · ${when(t.createdAt)}</span>${t.mode === 'site' ? `<div><button class="btn sm ghost" data-chat="${esc(t.id)}" aria-expanded="${t.id === meTicket}">${t.id === meTicket ? 'Свернуть чат' : 'Открыть чат'}</button></div>` : ''}${t.id === meTicket && chatT ? meChat(chatT) : ''}</div>`).join('')}</div>` : '<div class="empty">Заявок нет. <a href="#contact">Написать управляющим</a></div>'}
      </div>
      <aside class="stack" style="gap:1rem;min-width:0">${tierBlock(st)}
        <form class="card pad stack" id="meProf"><h3 style="font-size:1.05rem">Профиль гостя</h3><p class="note">Игровые данные. Подставляются в формы брони, заказа и заявки.</p>
          <label class="field"><span>Имя персонажа</span><input id="pfName" value="${esc(p.name || '')}" maxlength="60" autocomplete="off"></label>
          <label class="field"><span>Игровой телефон</span><input id="pfPhone" value="${esc(p.phone || '')}" maxlength="20" autocomplete="off"></label>
          <label class="field"><span>Пожелания к номеру</span><textarea id="pfNote" maxlength="300">${esc(p.note || '')}</textarea></label>
          <label class="check"><input type="checkbox" id="pfDm" ${p.dm === false ? '' : 'checked'}><span>Присылать статусы брони, заказов и ответы в личные сообщения Discord</span></label>
          <div><button class="btn sm">Сохранить профиль</button></div></form>
        <div class="card pad stack"><div class="row" style="justify-content:space-between"><h3 style="font-size:1.05rem">Секреты отеля</h3><b class="num" style="color:var(--gold)">${achCount()}/${ACH.length}</b></div><p class="note">${u ? 'Найденные секреты сохраняются в аккаунте и видны на любом устройстве.' : 'Секреты хранятся в этом браузере. Войдите, чтобы не потерять их.'}</p><div><button class="btn sm ghost" id="meAch">Открыть коллекцию</button></div></div>
        <div class="card pad stack"><h3 style="font-size:1.05rem">Мои данные</h3><p class="note">Удалить брони, заказы, заявки и профиль${u ? ' из аккаунта и с этого устройства' : ' с этого устройства'}. Действующие брони отменятся. Подробнее — в <a href="#privacy">политике конфиденциальности</a>.</p><div><button class="btn sm ghost danger-t" id="meDel">Удалить мои данные</button></div></div>
      </aside></div></div>`;
  $('#meOut') && ($('#meOut').onclick = () => logout()); $('#meIn') && ($('#meIn').onclick = () => openLogin('me'));
  const reload = async msg => { await loadItems(); if (msg) toast(msg); };
  $$('#main [data-tower]').forEach(b => b.onclick = () => showOnTower(b.dataset.tower));
  $$('#main [data-cancel]').forEach(b => b.onclick = async () => {
    const bk = it.bookings.find(x => x.id === b.dataset.cancel); if (!bk) return;
    if (!await confirmBox('Отменить бронь?', `Бронь ${bk.code} будет отменена${bk.room ? ', номер освободится' : ''}. Это нельзя вернуть.`, 'Отменить бронь', true)) return;
    try { await api('POST', `/me/bookings/${bk.id}/cancel`); play('soft'); reload('Бронь отменена'); } catch (e) { fail(e); }
  });
  $$('#main [data-move]').forEach(b => b.onclick = async () => {
    const bk = it.bookings.find(x => x.id === b.dataset.move); if (!bk) return;
    const r = await modal(`<h3>Перенести бронь ${esc(bk.code)}</h3><div class="g2"><label class="field"><span>Дата заезда</span><input type="date" id="mvDate" value="${esc(bk.date)}"></label><label class="field"><span>Ночей</span><input type="number" id="mvN" min="1" max="30" value="${bk.nights}"></label></div><p class="note">Сумма пересчитается. Управляющий увидит новую дату.</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Отмена</button><button class="btn" data-close="ok">Перенести</button></div>`, { onMount: (box, close) => { box.querySelector('[data-close="ok"]').onclick = e => { e.stopPropagation(); close({ date: box.querySelector('#mvDate').value, nights: +box.querySelector('#mvN').value }); }; } });
    if (!r || typeof r !== 'object') return;
    try { await api('POST', `/me/bookings/${bk.id}/reschedule`, r); play('soft'); reload('Бронь перенесена'); } catch (e) { fail(e); }
  });
  $$('#main [data-again]').forEach(b => b.onclick = () => {
    const o = it.orders.find(x => x.id === b.dataset.again); if (!o) return;
    let n = 0; o.items.forEach(i => { if (itemById(i.id)) { S.cart.set(i.id, (S.cart.get(i.id) || 0) + i.qty); n++; } });
    if (!n) return toast('Этих позиций больше нет в меню', 'err');
    updFab(true); play('add'); openCart(); const room = document.getElementById('oRoom'); if (room && !room.value) room.value = o.room;
  });
  $$('#main [data-chat]').forEach(b => b.onclick = () => { meTicket = meTicket === b.dataset.chat ? null : b.dataset.chat; renderMe(); });
  if (chatT) {
    const ms = $('#meMsgs'); if (ms) ms.scrollTop = ms.scrollHeight; markRead(chatT);
    if ($('#meChatIn')) { $('#meChatIn').value = draft; if (focused) $('#meChatIn').focus(); }
    $('#meChatF') && ($('#meChatF').onsubmit = async e => { e.preventDefault(); const inp = $('#meChatIn'), text = inp.value.trim(); if (!text) return; inp.value = '';
      try { await api('POST', `/tickets/${chatT.id}/messages`, { text }); play('soft'); await loadItems(); $('#meChatIn')?.focus(); } catch (err) { fail(err); inp.value = text; } });
  }
  $('#meProf').onsubmit = async e => { e.preventDefault();
    try { await api('PUT', '/me/profile', { name: $('#pfName').value, phone: $('#pfPhone').value, note: $('#pfNote').value, dm: $('#pfDm').checked }); play('soft'); reload('Профиль сохранён'); } catch (err) { fail(err); } };
  $('#meAch').onclick = () => openCabinet();
  $('#meDel').onclick = async () => {
    const ok = await modal(`<h3>Удалить мои данные?</h3><p class="mut">Удалятся брони, заказы в номер, заявки с перепиской и профиль. Действующие брони будут отменены, тикет-каналы в Discord закроются без сохранения. Вернуть данные нельзя.</p><label class="field"><span>Для подтверждения введите УДАЛИТЬ</span><input id="delIn" autocomplete="off" placeholder="УДАЛИТЬ"></label><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Отмена</button><button class="btn danger" id="delGo" disabled>Удалить</button></div>`, { onMount: (box, close) => { const inp = box.querySelector('#delIn'), go = box.querySelector('#delGo'); inp.oninput = () => go.disabled = inp.value.trim() !== 'УДАЛИТЬ'; go.onclick = () => close(inp.value.trim()); } });
    if (ok !== 'УДАЛИТЬ') return;
    try { const r = await api('POST', '/me/delete', { confirm: 'УДАЛИТЬ' }); meTicket = null; reload(`Удалено: броней ${r.deleted.bookings}, заказов ${r.deleted.orders}, заявок ${r.deleted.tickets}`); } catch (err) { fail(err); }
  };
}
export async function openLogin(next = 'admin') {
  authCfg = await authConfig();
  modal(`<div class="stack" style="justify-items:center;text-align:center"><img src="img/logo.webp?v=3" alt="" width="150" height="90"><h3>Вход</h3><p class="mut">Персонал входит через Discord. Если у вас роль администратора или модератора на нашем сервере, откроется панель.</p>
    ${authCfg.oauth ? `<button class="btn discord" data-close="discord">${I.discord} Войти через Discord</button>` : ''}
    ${authCfg.demo ? `<div class="stack" style="width:100%"><span class="lbl">${authCfg.oauth ? 'Или демо-вход' : 'Демо-вход'}</span><div class="row" style="justify-content:center"><button class="btn sm" data-close="admin">Администратор</button><button class="btn sm ghost" data-close="mod">Модератор</button><button class="btn sm ghost" data-close="guest">Гость</button></div>${!authCfg.oauth ? '<p class="note">Вход через Discord включится, когда на сервере будут указаны ключи Discord-приложения.</p>' : ''}</div>` : ''}
    ${!authCfg.oauth && !authCfg.demo ? '<p class="note">Вход через Discord ещё не настроен на сервере.</p>' : ''}<button class="btn ghost sm" data-close="">Отмена</button></div>`).then(r => { if (!r) return; login(r === 'discord' ? 'admin' : r, next); });
}

/* ---------------- панель ---------------- */
function renderAdmin() {
  const v = view('admin');
  if (!S.me || S.me.role === 'guest') {
    v.innerHTML = `<div class="gate"><img src="img/logo.webp?v=3" alt="" width="183" height="110"><h2 style="font-size:1.8rem">Вход для персонала</h2><p class="mut">${S.me ? `Вы вошли как ${esc(S.me.username)}, но у вас нет роли администратора или модератора на Discord-сервере отеля.` : 'Войдите через Discord. Доступ дают роли администратора и модератора на нашем сервере.'}</p><div class="row" style="justify-content:center">${S.me ? `<button class="btn ghost" id="gOut">${I.out} Выйти</button>` : ''}<button class="btn discord" id="gIn">${I.discord} Войти через Discord</button></div></div>`;
    $('#gIn').onclick = () => openLogin('admin'); $('#gOut') && ($('#gOut').onclick = () => logout()); return;
  }
  import('./admin.js').then(m => { mods.admin = m; m.mountAdmin(v, { reloadPublic: loadPublic, logout, openLogin }); }).catch(e => { console.error(e); v.innerHTML = '<div class="gate">Панель не загрузилась. Обновите страницу.</div>'; });
}

/* ---------------- данные ---------------- */
async function loadPublic() { S.pub = await api('GET', '/public'); paintNav(); }
async function loadMe() { try { S.me = (await api('GET', '/me')).user; } catch { S.me = null; } paintNav(); if (S.me) syncAccount(); }
// после входа: брони и заявки с этого устройства переходят в аккаунт, «Секреты отеля» объединяются
let synced = null;
async function syncAccount() {
  if (DEMO || synced === S.me.id) return; synced = S.me.id;
  try { const r = await api('POST', '/me/claim'); if (r.moved) { itemsDirty = true; if (['me', 'contact'].includes(current)) loadItems(); } } catch { }
  try { achMerge((await api('POST', '/me/achievements', { ids: achIds() })).achievements); } catch { }
}
let achT = 0;
onAch(() => { if (!S.me || DEMO) return; clearTimeout(achT); achT = setTimeout(() => api('POST', '/me/achievements', { ids: achIds() }).catch(() => {}), 1500); });
let itemsDirty = true;
async function loadItems() { itemsDirty = false; try { S.items = await api('GET', '/me/items'); } catch { } paintUnread(); prefill(); if (current === 'contact') paintChat(); if (current === 'me') renderMe(); }
// прочитанные ответы персонала помним в браузере: id обращения → время последнего просмотра
const seenT = () => { try { return JSON.parse(pref.get('mhc-read') || '{}') || {}; } catch { return {}; } };
const unreadOf = t => t.mode === 'site' && t.lastFrom === 'staff' && t.lastAt > (seenT()[t.id] || 0);
function markRead(t) { if (!t || !unreadOf(t)) return; const s = seenT(); s[t.id] = t.lastAt; pref.set('mhc-read', JSON.stringify(s)); paintUnread(); }
function paintUnread() { const n = (S.items?.tickets || []).filter(unreadOf).length; $('#navUser')?.classList.toggle('unread', n > 0); $('#navUser')?.setAttribute('title', n ? `Новые ответы управляющих: ${n}` : ''); }
// профиль гостя подставляется в пустые поля форм брони, заказа и заявки
function prefill() {
  const p = S.items?.profile; if (!p) return;
  for (const [id, v] of [['bName', p.name], ['bPhone', p.phone], ['bNote', p.note], ['oName', p.name], ['tName', p.name]]) { const el = document.getElementById(id); if (el && !el.value && v) el.value = v; }
}
let refT = null, refCols = new Set();
// Изменение на сервере видят все открытые вкладки сразу. Чтобы они не пришли за данными в одну и ту же
// миллисекунду, каждая ждёт случайные 0,25–1,75 с. Ответ /api/public кэширован на сервере и приходит 304, если не менялся.
function onChange(cols) {
  cols.forEach(c => refCols.add(c)); clearTimeout(refT);
  refT = setTimeout(async () => {
    const c = [...refCols]; refCols = new Set();
    try {
      if (c.includes('me')) { await loadMe(); if (current === 'admin') { mods.admin?.unmount?.(); renderAdmin(); } if (current === 'me') renderMe(); }
      if (c.some(x => ['settings', 'types', 'rooms', 'venues', 'menu', 'cigars', 'depts', 'issues', 'events', 'media', 'team', 'offers', 'faq'].includes(x))) { await loadPublic(); applyWeather(); if (!['contact', 'admin', 'me'].includes(current)) render(); updFab(); }
      // свои брони и заявки нужны только на страницах «Заявка» и «Мои брони»: на остальных просто помечаем устаревшими
      if (c.some(x => ['bookings', 'tickets', 'orders'].includes(x))) { const it = S.items, live = it && (it.tickets.some(t => t.status !== 'closed') || it.bookings.some(b => ['new', 'confirmed', 'checkedin'].includes(b.status)) || it.orders.some(o => !['done', 'cancelled'].includes(o.status))); if (['contact', 'me'].includes(current) || live) await loadItems(); else itemsDirty = true; }
      if (current === 'admin') mods.admin?.refresh?.(c);
    } catch (e) { console.error(e); }
  }, DEMO ? 250 : 250 + Math.random() * 1500);
}

// загрузчик: логотип заполняется по мере загрузки, затем «раскрывается» дырой в форме логотипа
function preload(url) { return new Promise(r => { if (!url) return r(); const i = new Image(); i.onload = i.onerror = () => r(); i.src = url; }); }
async function withLoader(work) {
  const L = $('#loader'); if (!L) return work();
  // заставка-лифт — только при первом визите за сессию; при повторных сайт открывается сразу
  let seen = false; try { seen = sessionStorage.getItem('mhc-seen') === '1'; sessionStorage.setItem('mhc-seen', '1'); } catch { }
  if (seen) { try { await work(() => {}); } finally { L.classList.add('out', 'gone'); } return; }
  let lp = 0; const pct = $('#ldPct'); const set = v => { lp = Math.max(lp, Math.min(100, v)); L.style.setProperty('--lp', lp); pct.textContent = 1 + Math.round(lp / 100 * 39); };
  const creep = setInterval(() => set(lp + (88 - lp) * 0.08), 160);
  try { await Promise.race([work(set), new Promise(r => setTimeout(r, 8000))]); } finally { clearInterval(creep); }
  set(100); await new Promise(r => setTimeout(r, 260));
  L.classList.add('out'); play('ding'); setTimeout(() => L.classList.add('gone'), 1400);
}
async function boot() {
  shell(); paintNav();
  addEventListener('scroll', () => { const h = document.documentElement.scrollHeight - innerHeight; $('#scrollbar').style.setProperty('--sp', h > 0 ? Math.min(1, scrollY / h) : 0); }, { passive: true });
  let failed = null;
  await withLoader(async set => {
    try { await Promise.all([loadPublic(), loadMe()]); } catch (e) { failed = e; return; }
    set(45);
    const s = S.pub.settings, m = mode(), hero = m === 'day' ? s.heroDay : s.heroNight;
    let done = 0; const jobs = [document.fonts?.ready, preload('img/logo.webp?v=3'), preload(hero), heroLayers(hero)].map(p => Promise.resolve(p).catch(() => {}).then(() => set(45 + (++done / 4) * 50)));
    // 3D-модуль грузится параллельно и заставку не держит: атриум показывается картинкой и оживает, когда WebGL готов
    if (hasWebGL()) ((location.hash || '#home') === '#home' ? import('./hero3d.js') : import('three')).catch(() => {});
    // картинки и шрифты — украшение: если телефон их не отдал быстро, страница всё равно показывается
    // (раньше при повторном открытии без заставки ожидание было бесконечным — видны были только шапка и фон)
    await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 2500))]);
    applyMode(); route();
  });
  if (failed) { $('#main').innerHTML = `<div class="gate"><h2>Сайт недоступен</h2><p class="mut">${esc(failed.message)}</p><button class="btn" onclick="location.reload()">Обновить</button></div>`; return; }
  if (!$('.view.on')) { applyMode(); route(); }
  addEventListener('hashchange', route); booted = true;
  // раздел «Отдых» собирается заранее в простое: плееру нужно время на загрузку
  setTimeout(() => { if (!view('leisure').querySelector('#venuesList')) renderLeisure(); }, 2500);
  const unsubscribe = subscribe(onChange);
  // свои брони и заявки — для отметки о новых ответах и подстановки профиля в формы
  if (!['me', 'contact'].includes(current)) loadItems();
  // Уход со страницы или перезагрузка: закрываем поток обновлений и отдаём видеопамять 3D-сцен.
  // На iPhone Safari иначе держит память старой страницы, и после пары перезагрузок подряд вкладка падает.
  addEventListener('pagehide', e => {
    if (e.persisted) return;   // страница уходит в кэш «назад-вперёд» и может вернуться живой — ничего не трогаем
    unsubscribe();
    document.querySelectorAll('canvas').forEach(c => { for (const t of ['webgl2', 'webgl']) { try { const gl = c.getContext(t); if (gl) { gl.getExtension('WEBGL_lose_context')?.loseContext(); break; } } catch { } } });
  });
  setInterval(() => { applyMode(); const c = $('#clock'); if (c) c.innerHTML = flap('clock', hhmm(Date.now())); applyWeather(); if (current === 'leisure' && !focusedIn(view('leisure'))) { renderLeisure(); $$('.view[data-view="leisure"] .reveal').forEach(e => e.classList.add('in')); } }, 20000);
  if (DEMO && !pref.get('mhc-demo-hint')) { pref.set('mhc-demo-hint', '1'); setTimeout(() => toast('Демо-версия: данные хранятся только в этом браузере'), 1200); }
}
boot();
