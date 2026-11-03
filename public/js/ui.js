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

export function toast(text, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text; $('#toasts').append(el);
  play(kind === 'err' ? 'error' : 'soft');
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3000);
}
export const fail = e => toast(e?.message || 'Что-то пошло не так', 'err');

// модальное окно; resolve(значение) при закрытии
export function modal(html, { wide = false, onMount } = {}) {
  return new Promise(resolve => {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    const prev = document.activeElement;
    const close = v => { m.remove(); document.removeEventListener('keydown', key); prev?.focus?.(); resolve(v); };
    const key = e => { if (e.key === 'Escape') close(null); };
    m.addEventListener('click', e => { if (e.target === m) close(null); const b = e.target.closest('[data-close]'); if (b) close(b.dataset.close === '' ? null : b.dataset.close); });
    document.addEventListener('keydown', key); document.body.append(m);
    onMount?.(m.firstElementChild, close);
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
  if (!el) { el = document.createElement('div'); el.id = id; el.className = 'sheet'; el.innerHTML = '<div class="scrim"></div><div class="panel" role="dialog" aria-modal="true"></div>'; document.body.append(el); el.querySelector('.scrim').onclick = () => closeSheet(id); }
  return el.querySelector('.panel');
}
export function openSheet(id) { const el = document.getElementById(id); el.classList.add('on'); play('open'); setTimeout(() => el.querySelector('input,select,button:not(.x)')?.focus(), 350); }
export function closeSheet(id) { const el = document.getElementById(id); if (el?.classList.contains('on')) { el.classList.remove('on'); play('close'); } }
addEventListener('keydown', e => { if (e.key === 'Escape') $$('.sheet.on').forEach(s => closeSheet(s.id)); });

// плавное появление блоков при прокрутке
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
export function reveal(root) { if (!io) return; $$('.reveal:not(.in)', root).forEach(el => io.observe(el)); }
