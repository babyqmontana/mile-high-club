import { play } from './sound.js';
export const S = { pub: null, me: null, items: { bookings: [], tickets: [], orders: [] }, admin: null, cart: new Map(), view: 'home' };
export const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => '$' + Number(n || 0).toLocaleString('ru-RU');
export const when = t => t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : '';
export const dayStr = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
export const hhmm = t => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
export const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k > 1 && k < 5 ? b : k === 1 ? a : c; };

const P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
export const I = {
  sun: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" ${P}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
  sound: `<svg viewBox="0 0 24 24" ${P}><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>`,
  mute: `<svg viewBox="0 0 24 24" ${P}><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>`,
  user: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" ${P}><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  x: `<svg viewBox="0 0 24 24" ${P}><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" ${P}><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  left: `<svg viewBox="0 0 24 24" ${P}><path d="m15 18-6-6 6-6"/></svg>`,
  right: `<svg viewBox="0 0 24 24" ${P}><path d="m9 18 6-6-6-6"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" ${P}><path d="M5 7h14l-1.5 9h-11z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${P}><path d="M12 5v14M5 12h14"/></svg>`,
  down: `<svg viewBox="0 0 24 24" ${P}><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`,
  fs: `<svg viewBox="0 0 24 24" ${P}><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" ${P}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" ${P}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${P}><path d="m5 12 5 5L20 7"/></svg>`,
  out: `<svg viewBox="0 0 24 24" ${P}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  box: `<svg viewBox="0 0 24 24" ${P}><path d="M3 8h18v12H3zM2 4h20v4H2z"/></svg>`,
  sync: `<svg viewBox="0 0 24 24" ${P}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9.1-.3 13.6.2 18.1a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>`
};

// картинка или условная заглушка, которую потом заменят в панели
export function bg(url, label = '', accent = '#F0177A', accent2 = '#F7B50A', cls = '') {
  if (url) return `class="${cls} cover" style="background-image:url('${esc(url)}')"`;
  return `class="${cls} ph" data-label="${esc(label)}" style="--a:${esc(accent)};--a2:${esc(accent2)}"`;
}

export function toast(text, kind = '', act) {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text; $('#toasts').append(el);
  // тост с действием: кнопка ведёт туда, где проблему можно исправить
  if (act) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tact'; b.textContent = act.label; b.onclick = () => { el.remove(); act.fn(); }; el.classList.add('act'); el.append(b); }
  play(kind === 'err' ? 'error' : 'soft');
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, act ? 8000 : 3000);
}
// Игровое имя: без него писать в обращениях нельзя. В панели — поле в боковой колонке, на сайте — профиль в кабинете
export const ic = { admin: null };
export function fixIc() {
  if (location.hash.startsWith('#admin') && ic.admin) return ic.admin();
  if (!location.hash.startsWith('#me')) location.hash = '#me';
  dispatchEvent(new CustomEvent('mhc-me', { detail: 'card' }));
  let n = 0; const go = () => { const i = document.getElementById('pfName'); if (i) { i.scrollIntoView({ block: 'center', behavior: 'smooth' }); i.focus({ preventScroll: true }); i.closest('.field')?.classList.add('flash'); } else if (n++ < 20) setTimeout(go, 150); }; go();
}
export const icNeedBox = (who = 'персонажа') => `<div class="compose icneed"><span>Чтобы писать, укажите имя ${who} — им подписываются сообщения.</span><button type="button" class="btn sm" data-icfix>Указать имя</button></div>`;
document.addEventListener('click', e => { if (e.target.closest?.('[data-icfix]')) fixIc(); });
export const fail = e => (e?.status === 428 ? toast(e.message, 'err', { label: 'Открыть профиль', fn: fixIc }) : toast(e?.message || 'Что-то пошло не так', 'err'));
// IC / OOC: IC — от лица персонажа, OOC — разговор игроков вне роли. Выбор помнится, пока страница открыта
const oocState = {};
export const oocSwitch = key => `<button type="button" class="oocsw" aria-pressed="${!!oocState[key]}" title="IC — от лица персонажа · OOC — вне роли" aria-label="Режим сообщения">${oocState[key] ? 'OOC' : 'IC'}</button>`;
export function wireOoc(f, key) {
  const b = f?.querySelector('.oocsw'); if (!b) return () => false;
  f.classList.toggle('ooc', !!oocState[key]);
  b.onclick = () => { oocState[key] = !oocState[key]; b.setAttribute('aria-pressed', oocState[key]); b.textContent = oocState[key] ? 'OOC' : 'IC'; f.classList.toggle('ooc', oocState[key]); f.querySelector('input,textarea')?.focus(); };
  return () => !!oocState[key];
}
export const oocTag = m => (m.ooc ? '<span class="ooctag">OOC</span>' : '');

// «Магнитная» кнопка: под курсором слегка тянется к нему (до max px). Только мышь и без «меньше анимации».
// Двигаем через CSS-свойство translate, чтобы не мешать transform, которым кнопки уже анимируются.
export function magnet(el, max = 6) {
  if (!el || el._mag || !matchMedia('(hover: hover) and (pointer: fine)').matches || document.documentElement.classList.contains('calm')) return;
  el._mag = true; el.classList.add('mag');
  el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; el.style.translate = `${(x * 2 * max).toFixed(1)}px ${(y * 2 * max).toFixed(1)}px`; });
  el.addEventListener('pointerleave', () => { el.style.translate = ''; });
}

// Есть ли WebGL. Проверяем один раз, пробный контекст сразу отпускаем.
// Без WebGL 3D-модули не загружаются вовсе (three.js — 670 КБ), а страницы показывают DOM-замену.
let glOk = null;
export function hasWebGL() {
  if (glOk !== null) return glOk;
  try { const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl'); glOk = !!g; g?.getExtension('WEBGL_lose_context')?.loseContext(); }
  catch { glOk = false; }
  return glOk;
}

// Слои поверх страницы: модалка, шторка, мобильное меню. Пока слой открыт, всё вокруг него inert
// (не ловит фокус и скрыто от скринридера), Tab ходит по кругу внутри слоя, Esc закрывает верхний слой,
// после закрытия фокус возвращается на элемент, с которого слой открыли.
const layers = [], inerted = new Set();
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function applyInert() {
  inerted.forEach(el => { el.inert = false; }); inerted.clear();
  const top = layers.at(-1)?.el; if (!top) return;
  for (let n = top; n && n !== document.body; n = n.parentElement)
    for (const sib of n.parentElement?.children || []) if (sib !== n && !sib.inert && sib.id !== 'toasts' && !sib.classList.contains('loader') && sib.tagName !== 'SCRIPT') { sib.inert = true; inerted.add(sib); }
}
export function pushLayer(el, onEsc) {
  if (layers.some(l => l.el === el)) return;
  layers.push({ el, onEsc, prev: document.activeElement }); applyInert();
}
export function popLayer(el) {
  const i = layers.findIndex(l => l.el === el); if (i < 0) return;
  const [l] = layers.splice(i, 1); applyInert();
  if (i === layers.length && l.prev?.isConnected) l.prev.focus({ preventScroll: true });
}
addEventListener('keydown', e => {
  const top = layers.at(-1); if (!top) return;
  if (e.key === 'Escape') { e.preventDefault(); top.onEsc?.(); return; }
  if (e.key !== 'Tab') return;
  const f = [...top.el.querySelectorAll(FOCUSABLE)].filter(x => x.getClientRects().length && !x.closest('[inert]'));
  if (!f.length) { e.preventDefault(); return; }
  const a = document.activeElement, first = f[0], last = f.at(-1);
  if (!top.el.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
});

// модальное окно; resolve(значение) при закрытии
export function modal(html, { wide = false, onMount } = {}) {
  return new Promise(resolve => {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    const close = v => { if (!m.isConnected) return; m.remove(); popLayer(m); resolve(v); };
    m.addEventListener('click', e => { if (e.target === m) close(null); const b = e.target.closest('[data-close]'); if (b) close(b.dataset.close === '' ? null : b.dataset.close); });
    document.body.append(m); pushLayer(m, () => close(null));
    const box = m.firstElementChild, h = box.querySelector('h2,h3');
    if (h) { h.id ||= 'dlg' + Math.random().toString(36).slice(2, 8); box.setAttribute('aria-labelledby', h.id); }
    onMount?.(box, close);
    (m.querySelector('[autofocus]') || m.querySelector('input,button'))?.focus();
  });
}
export async function confirmBox(title, text, okLabel = 'Подтвердить', danger = false) {
  const r = await modal(`<h3>${esc(title)}</h3><p class="mut">${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Отмена</button><button class="btn ${danger ? 'danger' : ''}" data-close="ok">${esc(okLabel)}</button></div>`);
  return r === 'ok';
}

// боковая панель
export function sheet(id) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; el.className = 'sheet'; el.innerHTML = '<div class="scrim"></div><div class="panel" role="dialog" aria-modal="true"></div>'; document.body.append(el); el.querySelector('.scrim').onclick = () => closeSheet(id); swipeToClose(el, id); }
  return el.querySelector('.panel');
}
// На телефоне шторка — нижняя: тянем вниз от верха (когда содержимое не прокручено) — закрывается.
// Кнопка «закрыть», Esc и тап по фону работают как раньше.
function swipeToClose(el, id) {
  const panel = el.querySelector('.panel'), narrow = matchMedia('(max-width: 640px)');
  let y0 = null, dy = 0;
  panel.addEventListener('touchstart', e => { if (!narrow.matches || panel.scrollTop > 0 || e.touches.length > 1 || e.target.closest('input,textarea,select')) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (y0 === null) return; dy = e.touches[0].clientY - y0;
    if (dy <= 0 || panel.scrollTop > 0) { if (dy < 0) y0 = null; el.classList.remove('dragging'); panel.style.removeProperty('--drag'); return; }
    e.preventDefault(); el.classList.add('dragging'); panel.style.setProperty('--drag', dy + 'px');
  }, { passive: false });
  const end = () => { if (y0 === null) return; y0 = null; el.classList.remove('dragging'); panel.style.removeProperty('--drag'); if (dy > Math.min(140, panel.offsetHeight * .25)) closeSheet(id); dy = 0; };
  panel.addEventListener('touchend', end); panel.addEventListener('touchcancel', end);
}
export function openSheet(id) { const el = document.getElementById(id); el.classList.add('on'); pushLayer(el, () => closeSheet(id)); play('open'); setTimeout(() => { if (el.classList.contains('on')) el.querySelector('input,select,button:not(.x)')?.focus(); }, 350); }
export function closeSheet(id) { const el = document.getElementById(id); if (el?.classList.contains('on')) { el.classList.remove('on'); popLayer(el); play('close'); } }

// плавное появление блоков при прокрутке
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
export function reveal(root) { if (!io) return; $$('.reveal:not(.in)', root).forEach(el => io.observe(el)); }
