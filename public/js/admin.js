import { S, $, $$, esc, money, when, plural, I, bg, toast, fail, modal, confirmBox, oocSwitch, wireOoc, oocTag, icNeedBox, ic } from './ui.js';
import { api, upload, DEMO } from './api.js';
import { play } from './sound.js';
import { discordPreview } from './dcpreview.js';
import { ROOM_STATUS, BOOKING_STATUS, ORDER_STATUS, TICKET_STATUS, CIGAR_SHAPES, venueState, roomGameFloor } from './core.js';

const SECTIONS = [
  ['', [['overview', 'Обзор', 'mod']]],
  ['Работа', [['bookings', 'Брони', 'mod'], ['board', 'Доска номеров', 'mod'], ['tickets', 'Обращения', 'mod'], ['orders', 'Заказы', 'mod'], ['reviews', 'Отзывы', 'mod']]],
  ['Контент', [['events', 'События', 'mod'], ['journal', 'Журнал', 'mod'], ['offers', 'Предложения', 'admin'], ['faq', 'Вопросы и ответы', 'admin'], ['jobs', 'Вакансии', 'admin'], ['media', 'Картинки', 'mod']]],
  ['Отель', [['structure', 'Этажи и номера', 'admin'], ['types', 'Типы и цены', 'admin'], ['venues', 'Площадки', 'admin'], ['menu', 'Меню Le Ciel', 'admin'], ['cigars', 'Сигары', 'admin'], ['team', 'Анкеты сотрудников', 'admin'], ['depts', 'Отделы', 'admin']]],
  ['Система', [['discord', 'Discord', 'mod'], ['senders', 'Отправители', 'admin'], ['settings', 'Настройки', 'admin'], ['vice', 'Вайс-Сити', 'admin'], ['danger', 'Сброс данных', 'admin']]]
];
// Иконки разделов панели: единый контурный стиль (без эмодзи), помогают быстро находить нужное.
const SIP = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const svg = p => `<svg class="sic" viewBox="0 0 24 24" ${SIP} aria-hidden="true">${p}</svg>`;
const SI = {
  overview: svg('<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>'),
  bookings: svg('<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M9 14.5l2 2 4-4"/>'),
  board: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>'),
  tickets: svg('<path d="M4 5h16v11h-9l-4 3v-3H4z"/><path d="M8 9h8M8 12h5"/>'),
  orders: svg('<path d="M5 7h14l-1.4 8H6.4z"/><path d="M5 7 4 3H2"/><circle cx="9" cy="20" r="1.1"/><circle cx="16.5" cy="20" r="1.1"/>'),
  reviews: svg('<path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.9 7.2 19.4l.9-5.4L4.2 9.7l5.4-.8z"/>'),
  events: svg('<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M12 12.5l1 2 2 .3-1.5 1.5.4 2-1.9-1-1.9 1 .4-2L8.5 14.8l2-.3z"/>'),
  journal: svg('<path d="M5 4.5h10a3 3 0 0 1 3 3v12.5H8a3 3 0 0 1-3-3z"/><path d="M5 16.5a3 3 0 0 1 3-3h10"/>'),
  offers: svg('<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8.5" cy="8.5" r="1.3"/>'),
  faq: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 4 2.1c0 1.6-2 2-2 3.1"/><path d="M12 17.3h.01"/>'),
  jobs: svg('<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8 7.5V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>'),
  media: svg('<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4.5 18 5-5 4 4 2-2 4 4"/>'),
  structure: svg('<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M14 21V9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2"/>'),
  types: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M14.5 9.3a2.4 2.4 0 0 0-2.3-1.5h-1a2 2 0 0 0 0 4h1.4a2 2 0 0 1 0 4h-1a2.4 2.4 0 0 1-2.3-1.6"/>'),
  venues: svg('<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  menu: svg('<path d="M6 3v6a2 2 0 0 0 4 0V3M8 11v10M16.5 3c-1.4 0-2.3 2.2-2.3 5s.9 4 2.3 4m0-9v18"/>'),
  cigars: svg('<rect x="3" y="10" width="14" height="4" rx="1"/><path d="M17 10h2.5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H17M6.5 10V9M10 10V9"/>'),
  team: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3 3 0 0 1 0 5.6M20.5 20a5.5 5.5 0 0 0-4.5-5.4"/>'),
  depts: svg('<rect x="9" y="3" width="6" height="5" rx="1"/><path d="M12 8v3M6 14H5v-1a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1h-1"/><rect x="3" y="15" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/>'),
  discord: `<svg class="sic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9.1-.3 13.6.2 18.1a19.8 19.8 0 0 0 6 3l1.3-2.1a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.7 19.7 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>`,
  senders: svg('<path d="M4.5 12 20 5l-6.5 15-2.6-6.4z"/><path d="M11 13.5 20 5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M3 12h3M18 12h3M5.3 5.3 7.4 7.4M16.6 16.6l2.1 2.1M18.7 5.3 16.6 7.4M7.4 16.6l-2.1 2.1"/>'),
  vice: svg('<path d="M12 21c-.4-4.6-.8-9.2.6-14"/><path d="M12.6 7C10.4 4.8 7.2 4.6 5 6.6"/><path d="M12.6 7c.6-2.8 2.8-4.6 5.6-4.4"/><path d="M12.6 7c2.6-.6 5.2.6 6.4 3.2"/><path d="M12.6 7C10 7.4 8 9.4 7.6 12"/><path d="M3 21h18"/>'),
  danger: svg('<path d="M12 3 2.5 20h19z"/><path d="M12 9.5v4.5M12 17.2h.01"/>')
};
const BUILTIN_IMG = ['img/atrium-night.webp', 'img/atrium-day.webp', 'img/vice/night.webp', 'img/vice/day.webp', 'img/reception.webp', 'img/library.webp', ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `img/journal/p${n}.webp`)];
const BCHIP = { new: 'p', confirmed: 'ok', checkedin: 'v', done: 'm', cancelled: 'bad' };
let A = null, root = null, sec = 'overview', ctx = {}, sel = {}, bFilter = 'active', bq = '', aTicket = null, bChat = null, bFocus = null;
const bDraft = {};
const APP_VER = (v => (v && v !== 'dev' ? 'v' + v : ''))(document.querySelector('meta[name="version"]')?.content); // версия сайта
const isAdmin = () => S.me?.role === 'admin';
const can = r => r === 'mod' || isAdmin();

export async function mountAdmin(v, c) {
  ctx = c; root = v;
  const allowed = SECTIONS.flatMap(([, it]) => it).filter(([, , r]) => can(r)).map(x => x[0]);
  let h = null; try { h = sessionStorage.getItem('mhc-sec'); } catch { } // хранилище может быть заблокировано браузером
  if (h && allowed.includes(h)) sec = h;
  root.innerHTML = `<div class="admin"><aside class="aside" id="aside"></aside><div class="amain" id="amain"><div class="empty">Загружаем панель…</div></div></div>`;
  await load(); paintAside(); paint();
}
export function unmount() { root = null; }
async function load() { try { A = await api('GET', '/admin/all'); } catch (e) { fail(e); if (e.status === 401 || e.status === 403) ctx.openLogin?.(); } }
export async function refresh(cols) {
  if (!root || !document.body.contains(root)) return;
  await load(); paintAside();
  const m = $('#amain');
  // новая картинка или трек в медиатеке нужны только самой медиатеке: остальные разделы не перерисовываем
  if (cols.every(c => c === 'media') && sec !== 'media') return;
  // несохранённая форма (поля, загруженные треки) не стирается фоновым обновлением — раньше трек «загружался и пропадал»
  if (m?.querySelector('form[data-dirty="1"]')) { if (sec === 'tickets') paintChat(); return; } if (m && m.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { if (sec === 'tickets') paintChat(); return; }
  if (sec === 'tickets' && cols.every(c => c === 'tickets')) { paintTicketList(); paintChat(); return; }
  paint();
}
function badges() { if (!A) return {}; return { bookings: A.bookings.filter(b => b.status === 'new' || b.staffUnread > 0).length, tickets: A.tickets.filter(t => t.status === 'open' && t.mode === 'site' && t.lastFrom === 'guest').length, orders: A.orders.filter(o => ['new', 'cooking'].includes(o.status)).length, reviews: (A.reviews || []).filter(r => r.status === 'pending').length }; }
function paintAside() {
  const b = badges(), u = S.me;
  $('#aside').innerHTML = `<div class="who">${u.avatar ? `<img class="avatar" src="${esc(u.avatar)}" alt="">` : `<span class="avatar">${esc(u.username[0])}</span>`}<div class="grow"><b style="font-size:.88rem">${esc(u.username)}</b><div class="note">${u.role === 'admin' ? 'Администратор' : 'Модератор'}${u.demo ? ' · демо' : ''}${APP_VER ? ` · <span class="ver num">${APP_VER}</span>` : ''}</div></div><button class="ibtn" id="aOut" aria-label="Выйти">${I.out}</button></div><form class="aic${A.me?.ic ? '' : ' need'}" id="aIc"><label for="aIcIn">Игровое имя <span class="note">— им подписаны ответы гостям</span></label><div class="row"><input class="inp" id="aIcIn" maxlength="60" placeholder="Имя Фамилия персонажа" value="${esc(A.me?.ic || '')}" autocomplete="off"><button class="btn sm">${A.me?.ic ? 'Сохранить' : 'Указать'}</button></div></form><div class="asearch"><input class="inp" id="aSq" type="search" placeholder="Поиск: код, ник, имя, номер" autocomplete="off" aria-label="Поиск по броням, заказам, обращениям и отзывам"><div class="ares" id="aRes" hidden></div></div><div class="anav" id="anav">` +
    SECTIONS.map(([g, items]) => { const vis = items.filter(([, , r]) => can(r)); return vis.length ? (g ? `<span class="grp">${g}</span>` : '') + vis.map(([k, n]) => `<button data-s="${k}" aria-pressed="${k === sec}" data-sfx="soft"><span class="nl">${SI[k] || ''}<span>${n}</span></span>${b[k] ? `<span class="badge">${b[k]}</span>` : ''}</button>`).join('') : ''; }).join('') + '</div>';
  if (innerWidth <= 900) { const on = $('#anav [aria-pressed="true"]'), as = $('#anav'); if (on && as) as.scrollTo({ left: on.offsetLeft - as.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' }); }
  $$('#aside [data-s]').forEach(x => x.onclick = () => { sec = x.dataset.s; try { sessionStorage.setItem('mhc-sec', sec); } catch { } paintAside(); paint(); scrollTo({ top: 0 }); });
  $('#aOut').onclick = () => ctx.logout();
  ic.admin = () => { const i = $('#aIcIn'); if (!i) return; i.scrollIntoView({ block: 'center', behavior: 'smooth' }); i.focus({ preventScroll: true }); $('#aIc').classList.add('flash'); };
  $('#aIc').onsubmit = async e => { e.preventDefault(); const name = $('#aIcIn').value.trim(); if (!name) return fail({ message: 'Впишите имя персонажа' });
    if (await run(() => api('PUT', '/me/profile', { name }), 'Игровое имя сохранено')) { await load(); paintAside(); paint(); } };
  wireSearch();
}
// Общий поиск: брони, заказы, обращения и отзывы — по коду, нику Discord, имени, номеру комнаты
let flashId = null;
function wireSearch() {
  const inp = $('#aSq'), box = $('#aRes'); if (!inp) return;
  const norm = v => String(v || '').toLowerCase();
  const find = q => {
    q = norm(q).trim().replace(/^@/, ''); if (q.length < 2) return [];
    const hit = (...f) => f.some(x => norm(x).includes(q)), out = [];
    for (const b of A.bookings) if (hit(b.code, b.name, b.discord, b.room, b.phone)) out.push({ k: 'Бронь', t: `${b.code} · ${b.name}`, d: `${b.discord} · ${b.typeName}${b.room ? ' · ' + b.room : ''} · ${BOOKING_STATUS[b.status]}`, go: () => { sec = 'bookings'; bFilter = 'all'; bq = b.code; flashId = b.id; } });
    for (const o of A.orders) if (hit(o.name, o.discord, o.room, o.id)) out.push({ k: 'Заказ', t: `Номер ${o.room} · ${money(o.total)}`, d: `${o.name || o.discord || '—'} · ${ORDER_STATUS[o.status]} · ${when(o.createdAt)}`, go: () => { sec = 'orders'; flashId = o.id; } });
    for (const t of A.tickets) if (hit(t.discord, t.name, t.topic, t.text)) out.push({ k: 'Обращение', t: `${t.discord} · ${t.topic}`, d: `${TICKET_STATUS[t.status]} · ${when(t.lastAt || t.createdAt)}`, go: () => { sec = 'tickets'; aTicket = t.id; } });
    for (const r of A.reviews || []) if (hit(r.name, r.code, r.text)) out.push({ k: 'Отзыв', t: `${'★'.repeat(r.stars)} ${r.name}`, d: `${r.code || ''} · ${r.text.slice(0, 60)}`, go: () => { sec = 'reviews'; rvFilter = r.status; flashId = r.id; } });
    return out.slice(0, 14);
  };
  let res = [];
  const show = () => { res = find(inp.value); box.hidden = !inp.value.trim();
    box.innerHTML = res.length ? res.map((r, i) => `<button type="button" data-ri="${i}"><span class="chip m">${r.k}</span><b>${esc(r.t)}</b><small class="note">${esc(r.d)}</small></button>`).join('') : `<div class="note" style="padding:.6rem">${inp.value.trim().length < 2 ? 'Введите хотя бы 2 символа' : 'Ничего не нашли'}</div>`;
    $$('#aRes [data-ri]').forEach(b => b.onclick = () => { res[+b.dataset.ri].go(); box.hidden = true; inp.value = ''; try { sessionStorage.setItem('mhc-sec', sec); } catch { } paintAside(); paint(); scrollTo({ top: 0 }); }); };
  inp.oninput = show; inp.onfocus = () => inp.value && show();
  inp.onkeydown = e => { if (e.key === 'Enter' && res[0]) { e.preventDefault(); box.querySelector('[data-ri="0"]').click(); } if (e.key === 'Escape') { box.hidden = true; inp.blur(); } };
  document.addEventListener('click', e => { if (!e.target.closest('.asearch')) box.hidden = true; });
}
// Шаблоны ответов: настраиваются в «Настройках», {имя} подставляется
export const DEFAULT_REPLIES = [
  { title: 'Номер готов', text: 'Здравствуйте, {имя}! Ваш номер готов, ключ-карта ждёт на ресепшене. Хорошего отдыха в Mile High Club!' },
  { title: 'Заезд и выезд', text: '{имя}, заезд с 14:00, выезд до 12:00. Поздний выезд — по запросу, напишите нам.' },
  { title: 'Бронь подтверждена', text: '{имя}, ваша бронь подтверждена. Ждём вас в Mile High Club!' },
  { title: 'Уточним и вернёмся', text: '{имя}, спасибо за вопрос! Уточним детали и ответим в ближайшее время.' },
  { title: 'Спасибо за отзыв', text: 'Спасибо за тёплые слова, {имя}! Будем рады видеть вас снова.' }];
const replies = () => (A?.replyTemplates?.length ? A.replyTemplates : DEFAULT_REPLIES);
function tplSelect(id) { return `<select class="inp tpl" id="${id}" aria-label="Шаблон ответа"><option value="">Шаблоны…</option>${replies().map((t, i) => `<option value="${i}">${esc(t.title)}</option>`).join('')}</select>`; }
function wireTpl(selId, target, name) {
  const sel = $('#' + selId); if (!sel) return;
  sel.onchange = () => { const t = replies()[+sel.value]; sel.value = ''; if (!t) return; const el = typeof target === 'string' ? $(target) : target; if (!el) return;
    const txt = t.text.replace(/\{имя\}/g, name || 'гость'); el.value = el.value ? el.value.trimEnd() + ' ' + txt : txt; el.focus(); el.dispatchEvent(new Event('input')); };
}
// Выгрузка в таблицу: CSV для Excel и Google Таблиц (точка с запятой, BOM — кириллица открывается без настроек)
const day = t => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
const EXPORTS = {
  bookings: { name: 'брони', rows: () => A.bookings, cols: [['Код', b => b.code], ['Статус', b => BOOKING_STATUS[b.status]], ['Имя', b => b.name], ['Discord', b => b.discord], ['Телефон', b => b.phone], ['Тип', b => b.typeName], ['Номер', b => b.room], ['Заезд', b => b.date], ['Ночей', b => b.nights], ['Гостей', b => b.guests], ['Сумма', b => b.total], ['Скидка, %', b => b.discount || ''], ['Пожелания', b => b.notes || b.note], ['Создана', b => day(b.createdAt)]] },
  orders: { name: 'заказы', rows: () => A.orders, cols: [['Номер', o => o.room], ['Статус', o => ORDER_STATUS[o.status]], ['Гость', o => o.name], ['Discord', o => o.discord], ['Состав', o => (o.items || []).map(i => `${i.name} × ${i.qty}`).join(', ')], ['Сумма', o => o.total], ['Комментарий', o => o.note || o.comment], ['Создан', o => day(o.createdAt)]] },
  reviews: { name: 'отзывы', rows: () => A.reviews || [], cols: [['Оценка', r => r.stars], ['Статус', r => ({ pending: 'На проверке', approved: 'Опубликован', hidden: 'Скрыт' })[r.status]], ['Имя', r => r.name], ['Бронь', r => r.code], ['Тип', r => r.typeName], ['Отзыв', r => r.text], ['Ответ отеля', r => r.reply], ['Создан', r => day(r.createdAt)]] }
};
const exportBtn = kind => `<button class="btn sm ghost" data-export="${kind}" title="Скачать таблицу для Excel">${I.down} В таблицу</button>`;
function wireExport(m) {
  m.querySelectorAll('[data-export]').forEach(b => b.onclick = () => {
    const X = EXPORTS[b.dataset.export], today = new Date().toISOString().slice(0, 10);
    modal(`<form class="stack" id="xF"><h3>Выгрузка: ${X.name}</h3><div class="seg" role="group" aria-label="Период"><button type="button" data-p="7">7 дней</button><button type="button" data-p="30" aria-pressed="true">30 дней</button><button type="button" data-p="0">Всё время</button></div>
      <div class="row" style="gap:.5rem"><label class="field grow"><span>С</span><input class="inp" type="date" name="from"></label><label class="field grow"><span>По</span><input class="inp" type="date" name="to" value="${today}"></label></div>
      <p class="note" id="xN"></p><div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close="">Отмена</button><button class="btn">Скачать CSV</button></div></form>`, {
      onMount(box, close) {
        const F = box.querySelector('#xF'), pick = () => { const a = F.from.value ? new Date(F.from.value + 'T00:00').getTime() : 0, z = F.to.value ? new Date(F.to.value + 'T23:59:59').getTime() : Infinity; return X.rows().filter(r => r.createdAt >= a && r.createdAt <= z); };
        const count = () => { box.querySelector('#xN').textContent = `Строк в выгрузке: ${pick().length}`; };
        const set = d => { F.from.value = d ? new Date(Date.now() - d * 864e5).toISOString().slice(0, 10) : ''; F.to.value = today; box.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.p === d))); count(); };
        box.querySelectorAll('[data-p]').forEach(x => x.onclick = () => set(+x.dataset.p)); F.from.oninput = F.to.oninput = () => { box.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', 'false')); count(); }; set(30);
        F.onsubmit = e => { e.preventDefault(); const rows = pick(); if (!rows.length) return toast('За этот период записей нет', 'err');
          const cell = v => { v = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
          const csv = '\ufeff' + [X.cols.map(c => c[0]), ...rows.map(r => X.cols.map(c => c[1](r)))].map(l => l.map(cell).join(';')).join('\r\n');
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `mhc-${b.dataset.export}-${F.from.value || 'all'}_${F.to.value || today}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          toast(`Скачано строк: ${rows.length}`); close(null); };
      } });
  });
}
function head(title, actions = '', sub = '') { return `<div class="atop"><div class="stack" style="gap:.3rem"><h2>${title}</h2>${sub ? `<p class="note">${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`; }
function paint() {
  const m = $('#amain'); if (!m || !A) return;
  try { ({ overview, bookings, board, tickets, orders, reviews, jobs, events, journal, media, structure, types, venues, menu, cigars, depts, team, offers, faq, discord, senders, settings, vice, danger }[sec] || overview)(m); }
  catch (e) { console.error(e); m.innerHTML = `<div class="empty">Ошибка раздела: ${esc(e.message)}</div>`; }
  wireExport(m);
  // пометка «есть несохранённое»: фоновое обновление такую форму не перерисует; при отправке пометка снимается
  m.querySelectorAll('form').forEach(f => { f.addEventListener('input', () => { f.dataset.dirty = '1'; }); f.addEventListener('submit', () => { delete f.dataset.dirty; }, true); });
  if (flashId) { const el = m.querySelector(`[data-flash="${CSS.escape(flashId)}"]`); flashId = null; if (el) { el.classList.add('flash'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.classList.remove('flash'), 2400); } }
}
const run = async (fn, ok) => { try { const r = await fn(); if (ok) { toast(ok); play('success'); } return r; } catch (e) { fail(e); return null; } };

/* ---------- обзор ---------- */
function overview(m) {
  const b = badges(), s = A.summary, dc = A.discord || {};
  m.innerHTML = head('Обзор', `<a class="btn ghost sm" href="#home">${I.arrow} На сайт</a>`) + `
    <div class="kpis"><div class="kpi"><b class="num">${s.free}<small class="mut" style="font-size:.9rem">/${s.total}</small></b><span>свободно номеров</span></div><div class="kpi"><b class="num">${b.bookings}</b><span>новых броней</span></div><div class="kpi"><b class="num">${b.tickets}</b><span>ждут ответа в чате</span></div><div class="kpi"><b class="num">${b.orders}</b><span>заказов в работе</span></div>
      <div class="kpi"><b style="font-size:1rem;color:${dc.connected ? 'var(--ok)' : 'var(--mut)'}">${dc.connected ? 'Бот онлайн' : DEMO || dc.demo ? 'Демо-режим' : 'Бот не подключён'}</b><span>${dc.connected ? esc(dc.guild) + ' · ' + dc.members + ' участников' : 'Discord'}</span></div></div>
    <div class="g2" style="margin-top:1.2rem;align-items:start">
      <div class="card pad stack"><h3 style="font-size:1rem">Свободно по типам</h3>${s.byType.map(t => `<div class="row" style="justify-content:space-between"><span>${esc(t.name)}</span><span class="num"><b>${t.free}</b> / ${t.total}</span></div><div class="timeline" style="height:6px"><i class="open" style="left:0;width:${t.total ? t.free / t.total * 100 : 0}%"></i></div>`).join('')}
        <div class="row"><button class="btn sm" data-go="bookings">Брони</button><button class="btn sm ghost" data-go="board">Доска номеров</button></div></div>
      <div class="card pad stack"><h3 style="font-size:1rem">Последние действия</h3><div class="list" style="max-height:380px;overflow:auto">${A.log.slice(0, 40).map(l => `<div class="row" style="justify-content:space-between;font-size:.86rem;border-bottom:1px solid var(--line);padding-bottom:.4rem"><span class="grow">${esc(l.text)}</span><span class="note num">${when(l.at)}</span></div>`).join('') || '<p class="note">Пока пусто.</p>'}</div></div></div>`;
  $$('#amain [data-go]').forEach(x => x.onclick = () => { sec = x.dataset.go; paintAside(); paint(); });
}

/* ---------- брони ---------- */
function bookings(m) {
  const list = A.bookings.filter(b => (bFilter === 'new' ? b.status === 'new' : bFilter === 'active' ? ['new', 'confirmed', 'checkedin'].includes(b.status) : true) && (!bq || [b.code, b.name, b.discord, b.room].join(' ').toLowerCase().includes(bq.toLowerCase())));
  m.innerHTML = head('Брони', `${exportBtn('bookings')}<div class="seg"><button data-f="new" aria-pressed="${bFilter === 'new'}">Новые</button><button data-f="active" aria-pressed="${bFilter === 'active'}">Активные</button><button data-f="all" aria-pressed="${bFilter === 'all'}">Все</button></div><input class="inp" id="bq" placeholder="Код, имя, Discord, номер" value="${esc(bq)}" style="width:220px">`) +
    (list.length ? `<div class="list">${list.map(b => { const free = A.rooms.filter(r => r.type === b.type && r.status === 'free');
      return `<div class="item" data-flash="${esc(b.id)}"><div class="top"><span class="row"><b class="num">${esc(b.code)}</b><span>${esc(b.typeName)}${b.room ? ' · <b>номер ' + esc(b.room) + '</b>' : b.preferredRoom ? ` · просит ${esc(b.preferredRoom)}` : ''}</span></span><span class="chip ${BCHIP[b.status]}">${BOOKING_STATUS[b.status]}</span></div>
      <span class="note">${esc(b.name)} · Discord <b>${esc(b.discord)}</b>${b.phone ? ' · тел. ' + esc(b.phone) : ''} · заезд ${esc(b.date)}, ${b.nights} ноч., ${b.guests} гост. · ${money(b.total)}${b.discount ? ` (скидка ${b.discount}%${b.tier ? ', ' + esc(b.tier) : ''})` : ''}${b.cancelledBy === 'guest' ? ' · отменил гость' : ''} · ${when(b.createdAt)}${b.handledBy ? ' · ' + esc(b.handledBy) : ''}</span>${b.note ? `<span>${esc(b.note)}</span>` : ''}
      <div class="acts" data-id="${esc(b.id)}">${b.status === 'new' ? `<select aria-label="Номер"><option value="">Назначить номер…</option>${free.map(r => `<option ${r.id === b.preferredRoom ? 'selected' : ''}>${esc(r.id)}</option>`).join('')}</select><button class="btn sm" data-a="confirm">Подтвердить</button><button class="btn sm ghost" data-a="cancel">Отклонить</button>` : ''}${b.status === 'confirmed' ? '<button class="btn sm" data-a="checkin">Заселить</button><button class="btn sm ghost" data-a="cancel">Отменить</button>' : ''}${b.status === 'checkedin' ? '<button class="btn sm" data-a="checkout">Выселить</button>' : ''}<button class="btn sm ${b.staffUnread ? '' : 'ghost'}" data-bchat="${esc(b.id)}" aria-expanded="${bChat === b.id}">Чат с гостем${b.staffUnread ? ` <span class="badge" aria-label="Новых сообщений: ${b.staffUnread}">${b.staffUnread}</span>` : (b.messages || []).some(m => m.from !== 'system') ? ` · ${(b.messages || []).filter(m => m.from !== 'system').length}` : ''}</button></div>
      ${bChat === b.id ? bookingChat(b) : ''}</div>`; }).join('')}</div>` : '<div class="empty">Броней нет.</div>');
  $$('#amain [data-f]').forEach(x => x.onclick = () => { bFilter = x.dataset.f; paint(); });
  $$('#amain [data-bchat]').forEach(x => x.onclick = () => { const id = x.dataset.bchat; bChat = bChat === id ? null : id; paint();
    const b = A.bookings.find(q => q.id === id); if (bChat && b?.staffUnread) { b.staffUnread = 0; api('POST', `/admin/bookings/${id}/read`).then(() => paintAside()).catch(() => {}); }
    if (bChat) { const box = $('#bcMsgs'); if (box) box.scrollTop = box.scrollHeight; $('#bcIn')?.focus({ preventScroll: true }); } });
  if (bChat && $('#bcF')) { const b = A.bookings.find(q => q.id === bChat), ta = $('#bcIn'); const box = $('#bcMsgs'); if (box) box.scrollTop = box.scrollHeight;
    if (bDraft[bChat]) ta.value = bDraft[bChat]; ta.oninput = () => { bDraft[bChat] = ta.value; };
    // список перерисовывается при новых сообщениях: курсор остаётся в поле ответа
    if (bFocus === bChat) ta.focus({ preventScroll: true }); ta.onfocus = () => { bFocus = bChat; }; ta.onblur = () => { setTimeout(() => { if (document.activeElement !== $('#bcIn')) bFocus = null; }, 0); };
    wireTpl('bcTpl', ta, b?.name); const isOoc = wireOoc($('#bcF'), 'b:' + bChat);
    ta.onkeydown = e => { if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return; e.preventDefault(); if (e.isComposing || e.keyCode === 229) return; if (!e.repeat) $('#bcF').requestSubmit(); };
    $('#bcF').onsubmit = async e => { e.preventDefault(); const text = ta.value.trim(); if (!text) return; const btn = $('#bcF button.btn'); btn.disabled = true;
      const r = await run(() => api('POST', `/admin/bookings/${bChat}/messages`, { text, ooc: isOoc() })); btn.disabled = false;
      if (r) { bDraft[bChat] = ''; play('soft'); const i = A.bookings.findIndex(q => q.id === r.booking.id); if (i >= 0) A.bookings[i] = r.booking; paint(); $('#bcIn')?.focus({ preventScroll: true }); } }; }
  $('#bq').oninput = e => { bq = e.target.value; clearTimeout(bookings.t); bookings.t = setTimeout(() => { paint(); $('#bq').focus(); $('#bq').setSelectionRange(bq.length, bq.length); }, 250); };
  $$('#amain .acts').forEach(a => a.querySelectorAll('[data-a]').forEach(btn => btn.onclick = async () => {
    if (btn.dataset.a === 'cancel' && !await confirmBox('Отменить бронь?', 'Гость получит уведомление в Discord, номер освободится.', 'Отменить бронь', true)) return;
    run(() => api('POST', `/admin/bookings/${a.dataset.id}/action`, { act: btn.dataset.a, room: a.querySelector('select')?.value }), 'Готово');
  }));
}

// переписка по брони: гость пишет из кабинета, ответ уходит ему на сайт (колокольчик) и в личные сообщения Discord
function bookingChat(b) {
  const ms = b.messages || [];
  return `<div class="bchat"><div class="msgs" id="bcMsgs" role="log" aria-label="Переписка по брони ${esc(b.code)}">${ms.map(m => m.from === 'system' ? `<div class="msg sys">${esc(m.text)} <small>${when(m.at)}</small></div>`
      : `<div class="msg ${m.from === 'staff' ? 'me' : ''}${m.ooc ? ' ooc' : ''}">${m.from === 'guest' ? `<b class="who">${esc(b.name)}</b>` : `<b class="who">${esc(m.by || 'Отель')}</b>`}${oocTag(m)}${esc(m.text)}<small>${when(m.at)}</small></div>`).join('') || '<div class="msg sys">Сообщений пока нет — напишите гостю первым</div>'}</div>
    ${A.me?.ic ? `<form class="compose" id="bcF">${tplSelect('bcTpl')}${oocSwitch('b:' + b.id)}<textarea id="bcIn" rows="1" maxlength="1000" placeholder="Ответ гостю ${esc(b.name)}…" aria-label="Ответ гостю"></textarea><button class="btn sm">Отправить</button></form>` : icNeedBox('вашего персонажа')}
    <p class="note" style="margin:0">Гость увидит ответ в кабинете и в колокольчике${b.discord ? `, бот продублирует в личные сообщения Discord (${esc(b.discord)})` : ''}.</p></div>`;
}
/* ---------- доска номеров ---------- */
// Доска номеров — «шахматка»: строки — этажи, клетки — номера, цвет — статус.
// Счётчики сверху — фильтры и цели для перетаскивания. Клик по номеру — карточка: статус, гость, бронь.
// «Выбрать несколько» — смена статуса сразу у группы (например, после уборки всего этажа).
const RSC = { free: 'var(--gold)', booked: 'var(--pink)', occupied: 'var(--violet)', cleaning: '#7fb6a8', repair: 'var(--mut)' };
let bSel = new Set(), bMulti = false, bOpen = null;
// Вид доски запоминается у администратора в браузере: 'floors' — по этажам (шахматка), 'kanban' — колонки по статусу (как было изначально).
function boardStyle() { try { return localStorage.getItem('mhc:boardStyle') === 'kanban' ? 'kanban' : 'floors'; } catch { return 'floors'; } }
function setBoardStyle(v) { try { localStorage.setItem('mhc:boardStyle', v === 'kanban' ? 'kanban' : 'floors'); } catch {} }
// Размер плиток доски «по этажам»: 'lg' — крупно и наглядно (как было раньше), 'sm' — компактно, больше номеров на экране.
function boardSize() { try { return localStorage.getItem('mhc:boardSize') === 'sm' ? 'sm' : 'lg'; } catch { return 'lg'; } }
function setBoardSize(v) { try { localStorage.setItem('mhc:boardSize', v === 'sm' ? 'sm' : 'lg'); } catch {} }
function board(m) {
  const T = Object.fromEntries(A.types.map(t => [t.id, t.name])), ft = sel.boardType || '', fs = sel.boardStatus || '';
  const style = boardStyle(), kb = style === 'kanban', bsz = boardSize();
  if (kb) { bMulti = false; bOpen = null; }
  const rooms = A.rooms.filter(r => (!ft || r.type === ft));
  const shown = r => !fs || r.status === fs;
  const floors = [...new Set(rooms.map(r => r.floor))].sort((a, b) => b - a);
  const cnt = st => rooms.filter(r => r.status === st).length;
  // короткие метки типов: инициалы, а при совпадении — первые буквы слова (Ст / Сю)
  const SH = (() => { const used = new Set(), out = {}; for (const t of A.types) { const w = t.name.split(/[\s-]+/).filter(Boolean), c = [w.map(x => x[0]).join('').slice(0, 2).toUpperCase(), (w[0] || '').slice(0, 2), (w[0] || '').slice(0, 3), t.id.slice(0, 3)].map(x => x.charAt(0).toUpperCase() + x.slice(1)); out[t.id] = c.find(x => x && !used.has(x)) || t.id; used.add(out[t.id]); } return out; })();
  const short = id => SH[id] || id;
  bSel = new Set([...bSel].filter(id => A.rooms.some(r => r.id === id)));
  const styleToggle = `<div class="seg bstyle" role="group" aria-label="Вид доски"><button data-bs="floors" aria-pressed="${!kb}">По этажам</button><button data-bs="kanban" aria-pressed="${kb}">Колонки по статусу</button></div>`;
  const sizeToggle = kb ? '' : `<div class="seg bsize" role="group" aria-label="Размер доски"><button data-bz="lg" aria-pressed="${bsz === 'lg'}">Крупно</button><button data-bz="sm" aria-pressed="${bsz === 'sm'}">Компактно</button></div>`;
  m.innerHTML = head('Доска номеров', `${styleToggle}${sizeToggle}${isAdmin() ? '<button class="btn sm ghost" id="bStruct">Этажи и номера</button>' : ''}<select class="inp" id="bt" style="width:190px"><option value="">Все типы</option>${A.types.map(t => `<option value="${esc(t.id)}" ${t.id === ft ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>${kb ? '' : `<button class="btn sm ${bMulti ? '' : 'ghost'}" id="bMulti">${bMulti ? 'Готово' : 'Выбрать несколько'}</button>`}`,
    kb ? 'Перетащите карточку номера в другую колонку или смените статус в списке на карточке. Бот в Discord сразу обновит свободные номера.'
       : 'Нажмите на номер, чтобы сменить статус и увидеть гостя. Номер можно перетащить на нужный статус в строке сверху. Бот в Discord сразу обновит свободные номера.') +
    (kb
      ? `<div class="kanban">${Object.entries(ROOM_STATUS).map(([k, n]) => { const rs = rooms.filter(r => r.status === k).sort((a, b) => String(a.id).localeCompare(String(b.id), 'ru', { numeric: true }));
          return `<div class="col" data-drop="${k}" style="--sc:${RSC[k]}"><h4><span>${n}</span><span class="num">${rs.length}</span></h4>${rs.map(r => `<div class="rc" draggable="true" data-id="${esc(r.id)}"><b>${esc(r.id)}</b><span class="note">${esc(T[r.type] || r.type)}${r.guest ? ' · ' + esc(r.guest) : ''}</span><select class="inp sm" data-id="${esc(r.id)}" aria-label="Статус номера ${esc(r.id)}">${Object.entries(ROOM_STATUS).map(([s, sn]) => `<option value="${s}" ${s === k ? 'selected' : ''}>${sn}</option>`).join('')}</select></div>`).join('') || '<p class="note" style="margin:.2rem .3rem 0">—</p>'}</div>`; }).join('')}</div>`
      : `<div class="bst" role="group" aria-label="Фильтр по статусу"><button class="bst-i ${!fs ? 'on' : ''}" data-fs=""><b class="num">${rooms.length}</b><span>Все</span></button>${Object.entries(ROOM_STATUS).map(([k, n]) => `<button class="bst-i ${fs === k ? 'on' : ''}" data-fs="${k}" data-drop="${k}" style="--sc:${RSC[k]}"><i></i><b class="num">${cnt(k)}</b><span>${n}</span></button>`).join('')}</div>
    ${bMulti ? `<div class="bbulk"><span><b class="num">${bSel.size}</b> выбрано</span>${Object.entries(ROOM_STATUS).map(([k, n]) => `<button class="btn sm ghost" data-bulk="${k}" ${bSel.size ? '' : 'disabled'} style="--sc:${RSC[k]}"><i class="dot"></i>${n}</button>`).join('')}<button class="btn sm ghost" id="bAll">Выбрать видимые</button><button class="btn sm ghost" id="bNone" ${bSel.size ? '' : 'disabled'}>Снять</button></div>` : ''}
    <div class="chess sz-${bsz} ${bMulti ? 'multi' : ''}">${floors.map(f => { const fr = rooms.filter(r => r.floor === f).sort((a, b) => String(a.id).localeCompare(String(b.id), 'ru', { numeric: true })), free = fr.filter(r => r.status === 'free').length;
      return `<div class="cf"><div class="cf-h"><b class="num">${f}</b><span>этаж</span><small>${esc(roomGameFloor(A.rooms, f))}</small><small class="num">${free}/${fr.length} св.</small></div><div class="cf-r">${fr.map(r => `<button class="ch ${shown(r) ? '' : 'dim'} ${bSel.has(r.id) ? 'sel' : ''} ${bOpen === r.id ? 'open' : ''}" draggable="true" data-id="${esc(r.id)}" style="--sc:${RSC[r.status]}" title="${esc(r.id)} · ${esc(T[r.type] || r.type)} · ${ROOM_STATUS[r.status]}${r.guest ? ' · ' + esc(r.guest) : ''}" aria-label="Номер ${esc(r.id)}, ${ROOM_STATUS[r.status]}"><b class="num">${esc(r.id)}</b><span>${esc(short(r.type))}</span>${r.guest ? '<i class="g" aria-hidden="true"></i>' : ''}</button>`).join('')}</div></div>`; }).join('') || '<div class="empty">Номеров нет. Добавьте этажи в разделе «Этажи и номера».</div>'}</div>`) +
    `<div class="legend chl">${Object.entries(ROOM_STATUS).map(([k, n]) => `<span><i style="background:${RSC[k]}"></i>${n}</span>`).join('')}<span><i class="g"></i>Есть гость</span>${kb ? '' : `<span class="note">Буквы — тип номера: ${A.types.map(t => `${short(t.id)} — ${esc(t.name)}`).join(', ')}</span>`}</div>
    <div id="bCard"></div>`;
  const set = (id, st) => run(() => api('POST', `/admin/rooms/${encodeURIComponent(id)}/status`, { status: st })).then(r => { if (r) { play('wood'); const x = A.rooms.find(q => q.id === id); if (x) { x.status = st; if (st === 'free' || st === 'cleaning') Object.assign(x, { guest: null, discord: null, bookingId: null }); } } return r; });
  $('#bt').onchange = e => { sel.boardType = e.target.value; paint(); };
  $('#bStruct') && ($('#bStruct').onclick = () => { sec = 'structure'; paintAside(); paint(); scrollTo({ top: 0 }); });
  $$('.bstyle [data-bs]').forEach(b => b.onclick = () => { if (b.dataset.bs !== boardStyle()) { setBoardStyle(b.dataset.bs); bMulti = false; bOpen = null; bSel.clear(); paint(); } });
  $$('.bsize [data-bz]').forEach(b => b.onclick = () => { if (b.dataset.bz !== boardSize()) { setBoardSize(b.dataset.bz); paint(); } });
  $('#bMulti') && ($('#bMulti').onclick = () => { bMulti = !bMulti; bSel.clear(); bOpen = null; paint(); });
  $$('.bst-i').forEach(b => b.onclick = () => { sel.boardStatus = sel.boardStatus === b.dataset.fs ? '' : b.dataset.fs; paint(); });
  // карточки канбана: перетаскивание между колонками + выбор статуса в списке
  $$('.rc').forEach(c => { c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('drag'); }; c.ondragend = () => c.classList.remove('drag'); });
  $$('.rc select').forEach(s => s.onchange = async () => { const r = A.rooms.find(x => x.id === s.dataset.id); if (r && s.value !== r.status) { if (await set(s.dataset.id, s.value)) paint(); else paint(); } });
  $$('.ch').forEach(c => {
    c.onclick = () => { const id = c.dataset.id; if (bMulti) { bSel.has(id) ? bSel.delete(id) : bSel.add(id); paint(); } else { bOpen = bOpen === id ? null : id; paint(); } };
    c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('drag'); }; c.ondragend = () => c.classList.remove('drag');
  });
  $$('[data-drop]').forEach(t => { t.ondragover = e => { e.preventDefault(); t.classList.add('over'); }; t.ondragleave = () => t.classList.remove('over'); t.ondrop = async e => { e.preventDefault(); t.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'), r = A.rooms.find(x => x.id === id); if (r && r.status !== t.dataset.drop && await set(id, t.dataset.drop)) paint(); }; });
  if (bMulti) {
    $$('[data-bulk]').forEach(b => b.onclick = async () => { const st = b.dataset.bulk, ids = [...bSel].filter(id => A.rooms.find(r => r.id === id)?.status !== st); if (!ids.length) return toast('У выбранных номеров уже этот статус');
      if (!await confirmBox(`Статус «${ROOM_STATUS[st]}»`, `Номеров: ${ids.length} (${ids.slice(0, 12).join(', ')}${ids.length > 12 ? '…' : ''}).`, 'Сменить')) return;
      let ok = 0; for (const id of ids) if (await set(id, st)) ok++; toast(`Готово: ${ok} из ${ids.length}`); bSel.clear(); paint(); });
    $('#bAll').onclick = () => { $$('.ch:not(.dim)').forEach(c => bSel.add(c.dataset.id)); paint(); };
    $('#bNone').onclick = () => { bSel.clear(); paint(); };
  }
  // карточка выбранного номера
  const r = !bMulti && bOpen && A.rooms.find(x => x.id === bOpen);
  if (r) {
    const bk = r.bookingId ? A.bookings.find(b => b.id === r.bookingId) : A.bookings.find(b => b.room === r.id && ['confirmed', 'checkedin'].includes(b.status));
    $('#bCard').innerHTML = `<div class="card pad stack bcard" style="--sc:${RSC[r.status]}"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><span class="lbl">${esc(roomGameFloor(A.rooms, r.floor)) || r.floor + ' этаж'} · ${r.floor} этаж</span><h3 style="font-size:1.4rem;margin:.1rem 0 0">Номер <span class="num">${esc(r.id)}</span></h3><span class="note">${esc(T[r.type] || r.type)}</span></div><button class="ibtn" id="bcX" aria-label="Закрыть">${I.x}</button></div>
      <div class="seg bseg" role="group" aria-label="Статус">${Object.entries(ROOM_STATUS).map(([k, n]) => `<button data-st="${k}" aria-pressed="${k === r.status}" style="--sc:${RSC[k]}"><i class="dot"></i>${n}</button>`).join('')}</div>
      ${r.guest || bk ? `<dl class="bk-facts">${r.guest ? `<div><dt>Гость</dt><dd>${esc(r.guest)}</dd></div>` : ''}${r.discord ? `<div><dt>Discord</dt><dd>${esc(r.discord)}</dd></div>` : ''}${bk ? `<div><dt>Бронь</dt><dd class="num">${esc(bk.code)} · ${BOOKING_STATUS[bk.status]}</dd></div><div><dt>Даты</dt><dd>${esc(bk.date)}, ${bk.nights} ноч.</dd></div>` : ''}</dl>${bk ? `<div><button class="btn sm ghost" id="bcBk">Открыть бронь</button></div>` : ''}` : '<p class="note" style="margin:0">Гостя нет.</p>'}
      ${isAdmin() ? `<form class="stack bc-edit" id="bcEd" style="gap:.5rem;border-top:1px solid var(--line);padding-top:.8rem"><span class="lbl">Номер, этаж и тип</span><div class="g3"><label class="field"><span>Номер</span><input data-k="id" value="${esc(r.id)}" maxlength="10"></label><label class="field"><span>Этаж</span><input data-k="floor" type="number" value="${r.floor}"></label><label class="field"><span>Тип</span><select data-k="type">${A.types.map(t => `<option value="${esc(t.id)}" ${t.id === r.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div><div class="row"><button class="btn sm">Сохранить</button><button type="button" class="btn sm ghost" id="bcAll">Все этажи и номера</button></div></form>` : '<p class="note" style="margin:0">Номер, этаж и тип меняет администратор в разделе «Этажи и номера».</p>'}</div>`;
    $('#bcX').onclick = () => { bOpen = null; paint(); };
    $$('.bseg [data-st]').forEach(b => b.onclick = async () => { if (b.dataset.st !== r.status && await set(r.id, b.dataset.st)) paint(); });
    $('#bcBk') && ($('#bcBk').onclick = () => { sec = 'bookings'; bq = bk.code; paintAside(); paint(); });
    $('#bcEd') && ($('#bcEd').onsubmit = async e => { e.preventDefault(); const body = Object.fromEntries([...e.target.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value]));
      const res = await run(() => api('PUT', `/admin/rooms/${encodeURIComponent(r.id)}`, body), 'Номер сохранён'); if (res) { bOpen = res.room.id; await load(); paint(); } });
    $('#bcAll') && ($('#bcAll').onclick = () => { sec = 'structure'; paintAside(); paint(); scrollTo({ top: 0 }); });
    $('#bCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/* ---------- обращения ---------- */
function tickets(m) {
  m.innerHTML = head('Обращения', isAdmin() ? `<button class="btn ghost sm" id="tPurge">${I.trash} Удалить закрытые</button>` : '', 'Чаты с сайта отвечаются здесь. Переписка тикетов из Discord видна здесь, ответ уходит в их канал.') + `<div class="split"><div class="tlist" id="tl"></div><div id="tc"></div></div>`;
  wireTicketPurge();
  paintTicketList(); paintChat();
}
function wireTicketPurge() { $('#tPurge') && ($('#tPurge').onclick = async () => { const n = A.tickets.filter(t => t.status === 'closed').length; if (!n) return toast('Закрытых обращений нет'); if (!await confirmBox('Удалить закрытые обращения?', `Будет удалено: ${n}. Открытые останутся. Транскрипты в Discord сохранятся.`, 'Удалить', true)) return; const r = await run(() => api('POST', '/admin/tickets/purge')); if (r) { toast(`Удалено: ${r.deleted}`); aTicket = null; await load(); paint(); } }); }
function paintTicketList() {
  const el = $('#tl'); if (!el) return;
  el.innerHTML = A.tickets.length ? A.tickets.map(t => `<button data-id="${esc(t.id)}" aria-pressed="${t.id === aTicket}"><span class="row" style="justify-content:space-between"><b>${esc(t.discord)}</b><span class="chip ${t.status === 'open' ? 'ok' : t.status === 'checking' ? 'warn' : 'm'}">${TICKET_STATUS[t.status]}</span></span><span>${esc(t.topic)}</span><span class="note">${t.mode === 'discord' ? 'Тикет в Discord' : t.mode === 'site' ? 'Чат на сайте' : 'Не выбрал канал'} · ${when(t.lastAt)}${t.lastFrom === 'guest' && t.mode === 'site' && t.status === 'open' ? ' · <b style="color:var(--pink)">ждёт ответа</b>' : ''}</span></button>`).join('') : '<div class="empty">Обращений пока нет.</div>';
  $$('#tl button').forEach(b => b.onclick = () => { aTicket = b.dataset.id; paintTicketList(); paintChat(innerWidth > 900); if (innerWidth <= 900) $('#tc')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
}
function paintChat(force) {
  const el = $('#tc'); if (!el) return; const t = A.tickets.find(x => x.id === aTicket);
  if (!t) { el.innerHTML = `<div class="empty">Выберите обращение ${innerWidth <= 900 ? 'в списке выше' : 'слева'}.</div>`; return; }
  const draft = $('#acIn')?.value || '', focused = el.contains(document.activeElement);
  const msgs = t.mode === 'site' ? t.messages : t.status === 'closed' && t.messages[0]?.text === t.text ? t.messages : [{ from: 'guest', text: t.text, at: t.createdAt }, ...t.messages];
  el.innerHTML = `<div class="chat"><header><div><b>${esc(t.discord)} · ${esc(t.topic)}</b><div class="note">${esc(t.name || 'Без имени')} · ${t.mode === 'discord' ? (t.channel ? 'тикет-канал создан в Discord' : 'тикет в Discord') : 'чат на сайте'}</div></div>${t.status !== 'closed' ? `<button class="btn sm ghost" id="acClose">Закрыть</button>` : `<div class="row"><span class="chip m">Закрыто</span>${isAdmin() ? `<button class="btn sm ghost" id="acDel">${I.trash} Удалить</button>` : ''}</div>`}</header>
    <div class="msgs" id="acMsgs">${msgs.map(x => `<div class="msg ${x.from === 'staff' ? 'me' : ''}${x.ooc ? ' ooc' : ''}">${oocTag(x)}${esc(x.text)}<small>${x.from === 'staff' ? esc(x.by || 'Персонал') : esc(x.by || 'Гость')} · ${when(x.at)}</small></div>`).join('')}</div>
    ${(t.mode === 'site' || t.channel) && t.status !== 'closed' ? (A.me?.ic ? `<form class="compose" id="acF">${tplSelect('acTpl')}${oocSwitch('t:' + t.id)}<input id="acIn" placeholder="Ответ гостю от ${esc(A.me.ic)}" autocomplete="off" aria-label="Ответ гостю"><button class="btn sm" data-sfx="">Ответить</button></form>` : icNeedBox('вашего персонажа')) : `<div class="compose note">${t.status === 'closed' ? `Обращение закрыто${t.closedBy ? ': ' + esc(t.closedBy) : ''}. Выше сохранённая история.` : 'Гостя нет на сервере, ответить здесь нельзя.'}</div>`}</div>`;
  if ($('#acIn')) { $('#acIn').value = draft; if (focused || force) $('#acIn').focus(); }
  wireTpl('acTpl', '#acIn', t.name || t.discord);
  $('#acMsgs').scrollTop = 1e6;
  const isOoc = wireOoc($('#acF'), 't:' + t.id);
  $('#acF') && ($('#acF').onsubmit = async e => { e.preventDefault(); const inp = $('#acIn'), text = inp.value.trim(); if (!text) return; inp.value = ''; const r = await run(() => api('POST', `/tickets/${t.id}/messages`, { text, ooc: isOoc() })); if (r) { play('soft'); await load(); paintTicketList(); paintChat(true); } else inp.value = text; });
  $('#acDel') && ($('#acDel').onclick = async () => { if (!await confirmBox('Удалить обращение?', 'Переписка исчезнет с сайта. Транскрипт в Discord останется.', 'Удалить', true)) return; if (await run(() => api('DELETE', `/admin/tickets/${t.id}`), 'Обращение удалено')) { aTicket = null; await load(); paintTicketList(); paintChat(); } });
  $('#acClose') && ($('#acClose').onclick = async () => { if (await run(() => api('POST', `/admin/tickets/${t.id}/close`), 'Обращение закрыто')) { await load(); paintTicketList(); paintChat(); } });
}

/* ---------- заказы ---------- */
function orders(m) {
  m.innerHTML = head('Заказы в номер', A.orders.length ? exportBtn('orders') : '') + (A.orders.length ? `<div class="list">${A.orders.map(o => `<div class="item" data-flash="${esc(o.id)}"><div class="top"><b>Номер ${esc(o.room)} · ${money(o.total)}</b><span class="chip ${o.status === 'done' ? 'ok' : o.status === 'cancelled' ? 'bad' : o.status === 'new' ? 'p' : 'warn'}">${ORDER_STATUS[o.status]}</span></div><span>${o.items.map(i => esc(i.name) + ' × ' + i.qty).join(', ')}</span><span class="note">${esc(o.name || 'Без имени')}${o.discord ? ' · Discord ' + esc(o.discord) : ''} · ${when(o.createdAt)}</span><div class="acts">${Object.entries(ORDER_STATUS).map(([k, v]) => `<button class="btn sm ${k === o.status ? '' : 'ghost'}" data-o="${esc(o.id)}" data-s="${k}">${v}</button>`).join('')}</div></div>`).join('')}</div>` : '<div class="empty">Заказов пока нет.</div>');
  $$('#amain [data-o]').forEach(b => b.onclick = () => run(() => api('POST', `/admin/orders/${b.dataset.o}/status`, { status: b.dataset.s }), 'Статус обновлён'));
}

/* ---------- универсальный редактор ---------- */
function field(f, val) {
  const id = 'f_' + f.k, v = val ?? f.def ?? '';
  if (f.type === 'textarea') return `<label class="field" style="grid-column:1/-1"><span>${f.label}</span><textarea id="${id}">${esc(v)}</textarea></label>`;
  if (f.type === 'select') return `<label class="field"><span>${f.label}</span><select id="${id}">${f.options.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  if (f.type === 'check') return `<label class="check" style="grid-column:1/-1"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}>${f.label}</label>`;
  if (f.type === 'color') return `<label class="field"><span>${f.label}</span><input type="color" id="${id}" value="${esc(v || '#888888')}"></label>`;
  if (f.type === 'image') return `<div class="field" style="grid-column:1/-1"><span>${f.label}</span><div class="imgpick"><div id="${id}_pv" ${bg(v, '', '#F0177A', '#F7B50A', 'pv')}></div><input type="hidden" id="${id}" value="${esc(v)}"><button type="button" class="btn sm ghost" data-pick="${id}">Выбрать</button><button type="button" class="btn sm ghost" data-clear="${id}">Убрать</button></div></div>`;
  if (f.type === 'tags') return `<label class="field" style="grid-column:1/-1"><span>${f.label}</span><input id="${id}" value="${esc((v || []).join(', '))}" placeholder="через запятую"></label>`;
  return `<label class="field"><span>${f.label}</span><input id="${id}" type="${f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text'}" value="${esc(f.type === 'datetime' && v ? toLocal(v) : v)}" ${f.step ? `step="${f.step}"` : ''}></label>`;
}
const toLocal = t => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
function readFields(fields) { const o = {}; for (const f of fields) { const el = $('#f_' + f.k); if (!el) continue; o[f.k] = f.type === 'check' ? el.checked : f.type === 'number' ? Number(el.value) : f.type === 'tags' ? el.value.split(',').map(s => s.trim()).filter(Boolean) : f.type === 'datetime' ? (el.value ? new Date(el.value).getTime() : 0) : el.value; } return o; }
function wirePickers(scope = document) {
  $$('[data-pick]', scope).forEach(b => b.onclick = async () => { const url = await pickImage(); if (url === null) return; $('#' + b.dataset.pick).value = url; const pv = $('#' + b.dataset.pick + '_pv'); pv.className = 'pv cover'; pv.style.backgroundImage = `url('${url}')`; });
  $$('[data-clear]', scope).forEach(b => b.onclick = () => { $('#' + b.dataset.clear).value = ''; const pv = $('#' + b.dataset.clear + '_pv'); pv.className = 'pv ph'; pv.style.backgroundImage = ''; });
}
function crud(m, { col, title, sub, items, fields, label, extra, after, newDefaults = {}, readOnly }) {
  const cur = sel[col] === 'new' ? { ...newDefaults } : items.find(x => x.id === sel[col]) || null;
  m.innerHTML = head(title, `<button class="btn sm" id="cNew">${I.plus} Добавить</button>`, sub) + `<div class="split"><div class="tlist">${items.map(x => `<button data-id="${esc(x.id)}" aria-pressed="${x.id === sel[col]}">${label(x)}</button>`).join('') || '<div class="empty">Пусто.</div>'}</div>
    <div>${cur ? `<form class="card pad stack" id="cForm"><div class="g2">${fields.map(f => field(f, cur[f.k])).join('')}</div>${extra ? extra(cur) : ''}<div class="row" style="justify-content:space-between"><div class="row"><button class="btn" type="submit" ${readOnly?.(cur) ? 'disabled' : ''}>Сохранить</button>${sel[col] !== 'new' ? `<button class="btn ghost" type="button" id="cDel">${I.trash} Удалить</button>` : ''}</div><span class="note">${readOnly?.(cur) || ''}</span></div></form>` : '<div class="empty">Выберите запись слева или добавьте новую.</div>'}</div></div>`;
  $$('#amain .tlist [data-id]').forEach(b => b.onclick = () => { sel[col] = b.dataset.id; paint(); });
  $('#cNew').onclick = () => { sel[col] = 'new'; paint(); };
  if (!cur) return; wirePickers($('#cForm')); after?.(cur);
  $('#cForm').onsubmit = async e => { e.preventDefault(); const body = { ...readFields(fields), ...(extra?.read?.() || {}) }; if (extra?.collect) Object.assign(body, extra.collect()); const r = await run(() => api('PUT', `/admin/${col}/${sel[col] === 'new' ? 'new' : encodeURIComponent(sel[col])}`, body), 'Сохранено'); if (r) { sel[col] = r.doc.id; await load(); paint(); ctx.reloadPublic?.(); } };
  $('#cDel') && ($('#cDel').onclick = async () => { if (!await confirmBox('Удалить?', `${label(cur).replace(/<[^>]+>/g, ' ')} будет удалено.`, 'Удалить', true)) return; const r = await run(() => api('DELETE', `/admin/${col}/${encodeURIComponent(sel[col])}`), 'Удалено'); if (r) { sel[col] = null; await load(); paint(); } });
}

/* ---------- контент ---------- */
function events(m) {
  const vOpts = [['', 'Определить по месту'], ...A.venues.map(v => [v.id, v.name])];
  crud(m, { col: 'events', title: 'События', sub: 'События из Discord подтягиваются сами (раз в 5 минут и сразу при изменении). Место события связывается с площадкой по ключевым словам.', items: A.events,
    label: e => `<b>${esc(e.name)}</b><span class="note">${when(e.start)} · ${e.source === 'discord' ? 'Discord' : 'вручную'}${e.status === 'cancelled' ? ' · отменено' : ''}</span>`,
    fields: [{ k: 'name', label: 'Название' }, { k: 'location', label: 'Место' }, { k: 'start', label: 'Начало', type: 'datetime' }, { k: 'end', label: 'Конец', type: 'datetime' }, { k: 'venueId', label: 'Площадка', type: 'select', options: vOpts }, { k: 'status', label: 'Статус', type: 'select', options: [['scheduled', 'Запланировано'], ['active', 'Идёт'], ['completed', 'Завершено'], ['cancelled', 'Отменено']] }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'image', label: 'Обложка', type: 'image' }],
    newDefaults: { start: Date.now() + 3600e3, end: Date.now() + 4 * 3600e3, status: 'scheduled' },
    readOnly: e => e.source === 'discord' ? 'Событие из Discord: правки перезапишутся при синхронизации, меняйте его в Discord. Площадку можно закрепить здесь.' : '' });
  $('.atop .row').insertAdjacentHTML('afterbegin', `<button class="btn sm ghost" id="evSync">${I.sync} Синхронизировать</button>`);
  $('#evSync').onclick = async () => { const r = await run(() => api('POST', '/admin/events/sync')); if (r) toast(r.connected ? `Синхронизировано событий: ${r.synced}` : 'Бот не подключён: события из Discord появятся после запуска бота'); };
  const f = $('#cForm'); if (f && A.events.find(e => e.id === sel.events)?.source === 'discord') { f.querySelector('button[type=submit]').disabled = false; }
}
function journal(m) {
  const items = A.issues, cur = sel.issue === 'new' ? { title: '', number: '', desc: '', publisher: 'Mile High Media', published: false, pages: [], date: Date.now() } : items.find(x => x.id === sel.issue);
  if (cur) sel.pages = sel.pagesFor === (sel.issue) ? sel.pages : structuredClone(cur.pages || []), sel.pagesFor = sel.issue;
  m.innerHTML = head('Журнал', `<button class="btn sm" id="iNew">${I.plus} Добавить выпуск</button>`, 'Страницы — картинки (как в журнале ONE). Загрузите сразу все страницы по порядку, потом поправьте порядок стрелками.') +
    `<div class="split"><div class="tlist">${items.map(x => `<button data-id="${esc(x.id)}" aria-pressed="${x.id === sel.issue}"><span class="row" style="flex-wrap:nowrap"><span style="width:38px;aspect-ratio:1/1.414;border-radius:3px;flex:none;background:center/cover url('${esc(x.cover || x.pages?.[0]?.image || '')}')"></span><span class="grow"><b>${esc(x.title || 'Без названия')}</b><br><span class="note">${esc(x.number || '')} · ${(x.pages || []).length} стр. · ${x.published ? 'опубликован' : 'черновик'}</span></span></span></button>`).join('') || '<div class="empty">Выпусков нет.</div>'}</div><div id="iEd">${cur ? '' : '<div class="empty">Выберите выпуск или добавьте новый.</div>'}</div></div>`;
  $$('#amain .tlist [data-id]').forEach(b => b.onclick = () => { sel.issue = b.dataset.id; paint(); });
  $('#iNew').onclick = () => { sel.issue = 'new'; sel.pagesFor = null; paint(); };
  if (!cur) return;
  const F = [{ k: 'title', label: 'Название' }, { k: 'number', label: 'Номер выпуска' }, { k: 'publisher', label: 'Издатель' }, { k: 'date', label: 'Дата', type: 'datetime' }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'cover', label: 'Обложка (если пусто — первая страница)', type: 'image' }, { k: 'published', label: 'Опубликован на сайте', type: 'check' }];
  $('#iEd').innerHTML = `<form class="card pad stack" id="iForm"><div class="g2">${F.map(f => field(f, cur[f.k])).join('')}</div>
    <div class="stack"><div class="row" style="justify-content:space-between"><span class="lbl">Страницы (${sel.pages.length})</span><div class="row"><label class="btn sm">${I.plus} Загрузить страницы<input type="file" accept="image/*" multiple hidden id="pUp"></label><button type="button" class="btn sm ghost" id="pLib">Из картинок</button><button type="button" class="btn sm ghost" id="pTxt">Текстовая страница</button></div></div>
      <div class="drop" id="pDrop">Перетащите сюда картинки страниц</div><div class="pages" id="pGrid"></div></div>
    <div class="row"><button class="btn" type="submit">Сохранить выпуск</button>${sel.issue !== 'new' ? `<a class="btn ghost" href="#issue-${esc(cur.id)}">Открыть на сайте</a><button type="button" class="btn ghost" id="iDel">${I.trash} Удалить</button>` : ''}</div></form>`;
  wirePickers($('#iForm'));
  const grid = () => { $('#pGrid').innerHTML = sel.pages.map((p, i) => `<div class="p" ${p.image ? `style="background-image:url('${esc(p.image)}')"` : `style="background:var(--card2);display:grid;place-items:center;padding:8px;font-size:.7rem;text-align:center"`}>${p.image ? '' : esc(p.title || p.text?.slice(0, 60) || 'Текст')}<span class="n">${i + 1}</span><div class="tools"><button type="button" data-u="${i}" aria-label="Раньше">‹</button><button type="button" data-d="${i}" aria-label="Позже">›</button>${p.kind !== 'image' ? `<button type="button" data-e="${i}" aria-label="Изменить">✎</button>` : ''}<button type="button" data-x="${i}" aria-label="Удалить">×</button></div></div>`).join('') || '<p class="note">Страниц пока нет.</p>';
    $$('#pGrid [data-u]').forEach(b => b.onclick = () => { const i = +b.dataset.u; if (i > 0) [sel.pages[i - 1], sel.pages[i]] = [sel.pages[i], sel.pages[i - 1]]; grid(); });
    $$('#pGrid [data-d]').forEach(b => b.onclick = () => { const i = +b.dataset.d; if (i < sel.pages.length - 1) [sel.pages[i + 1], sel.pages[i]] = [sel.pages[i], sel.pages[i + 1]]; grid(); });
    $$('#pGrid [data-x]').forEach(b => b.onclick = () => { sel.pages.splice(+b.dataset.x, 1); grid(); });
    $$('#pGrid [data-e]').forEach(b => b.onclick = async () => { const i = +b.dataset.e; const p = await textPage(sel.pages[i]); if (p) { sel.pages[i] = p; grid(); } });
    $('.lbl', $('#iForm')).textContent = `Страницы (${sel.pages.length})`; };
  grid();
  const addFiles = async files => { const r = await run(() => upload([...files].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true })))); if (r?.length) { r.forEach(f => sel.pages.push({ kind: 'image', image: f.url })); grid(); toast(`Добавлено страниц: ${r.length}`); } };
  $('#pUp').onchange = e => addFiles(e.target.files);
  const d = $('#pDrop'); d.ondragover = e => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over'); d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); addFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))); };
  $('#pLib').onclick = async () => { const u = await pickImage(); if (u) { sel.pages.push({ kind: 'image', image: u }); grid(); } };
  $('#pTxt').onclick = async () => { const p = await textPage({ kind: 'text' }); if (p) { sel.pages.push(p); grid(); } };
  $('#iForm').onsubmit = async e => { e.preventDefault(); const body = { ...readFields(F), pages: sel.pages }; const r = await run(() => api('PUT', `/admin/issues/${sel.issue === 'new' ? 'new' : encodeURIComponent(sel.issue)}`, body), 'Выпуск сохранён'); if (r) { sel.issue = r.doc.id; sel.pagesFor = null; await load(); paint(); ctx.reloadPublic?.(); } };
  $('#iDel') && ($('#iDel').onclick = async () => { if (!await confirmBox('Удалить выпуск?', `«${cur.title}» исчезнет с сайта.`, 'Удалить', true)) return; const r = await run(() => api('DELETE', `/admin/issues/${encodeURIComponent(sel.issue)}`), 'Удалено'); if (r) { sel.issue = null; await load(); paint(); } });
}
async function textPage(p) {
  let out = null;
  await modal(`<h3>Текстовая страница</h3><div class="stack"><label class="field"><span>Вид</span><select id="tpK"><option value="text" ${p.kind !== 'quote' ? 'selected' : ''}>Статья</option><option value="quote" ${p.kind === 'quote' ? 'selected' : ''}>Цитата</option></select></label><label class="field"><span>Рубрика</span><input id="tpC" value="${esc(p.cat || '')}"></label><label class="field"><span>Заголовок</span><input id="tpT" value="${esc(p.title || '')}"></label><label class="field"><span>Текст (абзацы через пустую строку)</span><textarea id="tpX" style="min-height:180px">${esc(p.text || '')}</textarea></label></div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Отмена</button><button class="btn" id="tpOk">Готово</button></div>`,
    { onMount: (box, close) => { $('#tpOk', box).onclick = () => { out = { kind: $('#tpK').value, cat: $('#tpC').value, title: $('#tpT').value, text: $('#tpX').value, image: p.image || '' }; close('ok'); }; } });
  return out;
}
export async function pickImage() {
  let chosen = null;
  const media = (A?.media || []).filter(x => !/\.(glb|mp3|ogg|m4a)$/i.test(x.url));
  await modal(`<div class="row" style="justify-content:space-between"><h3>Картинки</h3><label class="btn sm">${I.plus} Загрузить<input type="file" accept="image/*" multiple hidden id="miUp"></label></div>
    <span class="lbl">Загруженные</span><div class="mgrid" id="miGrid">${media.map(x => `<button type="button" data-u="${esc(x.url)}" style="background-image:url('${esc(x.url)}')" aria-label="Выбрать"></button>`).join('') || '<p class="note">Пока ничего не загружено.</p>'}</div>
    <span class="lbl">Встроенные</span><div class="mgrid">${BUILTIN_IMG.map(u => `<button type="button" data-u="${u}" style="background-image:url('${u}')" aria-label="Выбрать"></button>`).join('')}</div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Отмена</button></div>`,
    { wide: true, onMount: (box, close) => {
      box.addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (b) { chosen = b.dataset.u; close('ok'); } });
      $('#miUp', box).onchange = async e => { const r = await run(() => upload(e.target.files)); if (r?.length) { chosen = r[0].url; close('ok'); load(); } };
    } });
  return chosen;
}
function media(m) {
  const list = (A.media || []).filter(x => !/\.(mp3|ogg|m4a)$/i.test(x.url));
  m.innerHTML = head('Картинки', `<label class="btn sm">${I.plus} Загрузить<input type="file" accept="image/*" multiple hidden id="mUp"></label>`, 'Сюда загружаются обложки, фото номеров и страницы журнала. Заглушки на сайте меняются на эти картинки в нужных разделах.') +
    `<div class="drop" id="mDrop" style="margin-bottom:1rem">Перетащите картинки сюда</div><div class="mgrid">${list.map(x => `<div style="position:relative"><button type="button" style="background-image:url('${esc(x.url)}');width:100%" data-copy="${esc(x.url)}" aria-label="Скопировать ссылку"></button><button class="ibtn" style="position:absolute;top:6px;right:6px;background:var(--bg)" data-del="${esc(x.id)}" aria-label="Удалить">${I.trash}</button></div>`).join('') || '<p class="note">Пока пусто.</p>'}</div>`;
  const add = async files => { const r = await run(() => upload(files)); if (r?.length) { toast(`Загружено: ${r.length}`); await load(); paint(); } };
  $('#mUp').onchange = e => add(e.target.files);
  const d = $('#mDrop'); d.ondragover = e => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over'); d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); add(e.dataTransfer.files); };
  $$('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Ссылка скопирована'); } catch { toast(b.dataset.copy.slice(0, 80)); } });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!await confirmBox('Удалить картинку?', 'Там, где она стоит, появится заглушка.', 'Удалить', true)) return; if (await run(() => api('DELETE', `/admin/media/${b.dataset.del}`), 'Удалено')) { await load(); paint(); } });
}

/* ---------- отель ---------- */
function structure(m) {
  const floors = [...new Set(A.rooms.map(r => r.floor))].sort((a, b) => b - a), T = A.types;
  const tOpt = v => T.map(t => `<option value="${esc(t.id)}" ${t.id === v ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  m.innerHTML = head('Этажи и номера', '', `${A.rooms.length} ${plural(A.rooms.length, 'номер', 'номера', 'номеров')} на ${floors.length} ${plural(floors.length, 'этаже', 'этажах', 'этажах')}. Номер комнаты, этаж и тип можно поменять у каждого номера.`) +
    `<div class="g2" style="align-items:start;margin-bottom:1.2rem"><form class="card pad stack" id="flF"><h3 style="font-size:1rem">Добавить этаж</h3><div class="g3"><label class="field"><span>Этаж</span><input id="flN" type="number" value="${(floors[0] ?? 19) + 1}"></label><label class="field"><span>Номеров</span><input id="flC" type="number" min="1" max="40" value="6"></label><label class="field"><span>Первый номер</span><input id="flS" type="number" placeholder="авто"></label></div><label class="field"><span>Тип номеров</span><select id="flT">${tOpt(T[0]?.id)}</select></label><button class="btn">Добавить этаж</button></form>
      <form class="card pad stack" id="rmF"><h3 style="font-size:1rem">Добавить один номер</h3><div class="g3"><label class="field"><span>Номер</span><input id="rmN" placeholder="2109"></label><label class="field"><span>Этаж</span><input id="rmFl" type="number"></label></div><label class="field"><span>Тип</span><select id="rmT">${tOpt(T[0]?.id)}</select></label><button class="btn ghost">Добавить номер</button></form></div>
    <div class="stack">${floors.map(f => { const rs = A.rooms.filter(r => r.floor === f); return `<div class="card pad stack"><div class="row" style="justify-content:space-between"><h3 style="font-size:1.05rem">${f} этаж <span class="note">· ${roomGameFloor(A.rooms, f)} · ${rs.length} ${plural(rs.length, 'номер', 'номера', 'номеров')}</span></h3><button class="btn sm ghost" data-delf="${f}">${I.trash} Удалить этаж</button></div>
      <form class="row fl-ed" data-flo="${f}" style="gap:.6rem;align-items:flex-end;flex-wrap:wrap"><label class="field" style="width:110px"><span>Номер этажа</span><input type="number" data-fk="floor" value="${f}"></label><label class="field" style="min-width:180px"><span>Тип для всех номеров</span><select data-fk="type"><option value="">— не менять —</option>${tOpt('')}</select></label><label class="row" style="gap:.4rem;align-items:center;padding-bottom:.55rem"><input type="checkbox" data-fk="renumber" checked> <span class="note">перенумеровать (${f}01 → новый этаж)</span></label><button class="btn sm">Сохранить этаж</button></form>
      <div class="scroll"><table class="tbl"><thead><tr><th>Номер</th><th>Этаж</th><th>Тип</th><th>Статус</th><th></th></tr></thead><tbody>${rs.map(r => `<tr data-id="${esc(r.id)}"><td><input value="${esc(r.id)}" data-k="id" style="width:90px"></td><td><input type="number" value="${r.floor}" data-k="floor" style="width:80px"></td><td><select data-k="type">${tOpt(r.type)}</select></td><td><span class="chip ${r.status === 'free' ? 'ok' : 'm'}">${ROOM_STATUS[r.status]}</span></td><td style="white-space:nowrap"><button class="btn sm" data-save>Сохранить</button> <button class="btn sm ghost icon" data-delr aria-label="Удалить номер">${I.trash}</button></td></tr>`).join('')}</tbody></table></div></div>`; }).join('')}</div>`;
  $('#flF').onsubmit = async e => { e.preventDefault(); const r = await run(() => api('POST', '/admin/floors', { floor: $('#flN').value, count: $('#flC').value, start: $('#flS').value || undefined, type: $('#flT').value })); if (r) { toast(`Добавлено номеров: ${r.made.length}`); play('success'); await load(); paint(); } };
  $('#rmF').onsubmit = async e => { e.preventDefault(); if (await run(() => api('POST', '/admin/rooms', { id: $('#rmN').value, floor: $('#rmFl').value, type: $('#rmT').value }), 'Номер добавлен')) { await load(); paint(); } };
  $$('#amain tr[data-id]').forEach(tr => {
    tr.querySelector('[data-save]').onclick = async () => { const body = Object.fromEntries([...tr.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value])); if (await run(() => api('PUT', `/admin/rooms/${encodeURIComponent(tr.dataset.id)}`, body), 'Номер сохранён')) { await load(); paint(); } };
    tr.querySelector('[data-delr]').onclick = async () => { if (!await confirmBox(`Удалить номер ${tr.dataset.id}?`, 'Номер исчезнет с сайта и с доски.', 'Удалить', true)) return; if (await run(() => api('DELETE', `/admin/rooms/${encodeURIComponent(tr.dataset.id)}`), 'Удалено')) { await load(); paint(); } };
  });
  $$('form[data-flo]').forEach(fm => fm.onsubmit = async e => { e.preventDefault(); const q = k => fm.querySelector(`[data-fk="${k}"]`), body = { floor: q('floor').value, type: q('type').value || undefined, renumber: q('renumber').checked };
    if (+body.floor === +fm.dataset.flo && !body.type) return toast('Ничего не изменилось');
    if (await run(() => api('PUT', `/admin/floors/${fm.dataset.flo}`, body), 'Этаж сохранён')) { await load(); paint(); } });
  $$('[data-delf]').forEach(b => b.onclick = async () => { if (!await confirmBox(`Удалить ${b.dataset.delf} этаж?`, 'Все номера этажа будут удалены.', 'Удалить этаж', true)) return; if (await run(() => api('DELETE', `/admin/floors/${b.dataset.delf}`), 'Этаж удалён')) { await load(); paint(); } });
}
function types(m) {
  crud(m, { col: 'types', title: 'Типы номеров и цены', items: A.types, label: t => `<b>${esc(t.name)}</b><span class="note">${money(t.price)} · ${A.rooms.filter(r => r.type === t.id).length} номеров</span>`,
    fields: [{ k: 'name', label: 'Название' }, { k: 'price', label: 'Цена за ночь, $', type: 'number' }, { k: 'capacity', label: 'Гостей', type: 'number' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'features', label: 'Особенности', type: 'tags' }, { k: 'image', label: 'Фото', type: 'image' }], newDefaults: { price: 3000, capacity: 2, order: A.types.length } });
}
function venues(m) {
  const cur = sel.venues === 'new' ? { schedule: [] } : A.venues.find(v => v.id === sel.venues);
  if (cur) sel.sched = sel.schedFor === sel.venues ? sel.sched : structuredClone(cur.schedule || []), sel.schedFor = sel.venues;
  crud(m, { col: 'venues', title: 'Площадки и расписание', sub: 'Статусы «Live», «Открыто», «Тихо», «Закрыто» на главной считаются по этому расписанию. События из Discord с ключевыми словами площадки перекрывают расписание.', items: A.venues,
    label: v => { const st = venueState(v, A.events); return `<b>${esc(v.name)}</b><span class="note">${esc(st.label)}</span>`; },
    fields: [{ k: 'name', label: 'Название' }, { k: 'kind', label: 'Тип', type: 'select', options: [['pool', 'Бассейн'], ['bar', 'Бар'], ['restaurant', 'Ресторан'], ['club', 'Клуб'], ['spa', 'Спа']] }, { k: 'floor', label: 'Этаж / место' }, { k: 'gameFloor', label: 'Кнопка лифта в игре' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'accent', label: 'Цвет', type: 'color' }, { k: 'keywords', label: 'Ключевые слова для событий Discord' }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'image', label: 'Фото (у бассейнов без фото — анимация воды)', type: 'image' }, { k: 'staffOnly', label: 'Только для персонала: на сайте не показывать', type: 'check' }, { k: 'comingSoon', label: 'Скоро открытие (скрыть расписание)', type: 'check' }],
    extra: () => `<div class="stack"><div class="row" style="justify-content:space-between"><span class="lbl">Расписание</span><button type="button" class="btn sm ghost" id="scAdd">${I.plus} Интервал</button></div><div id="scRows" class="stack" style="gap:.5rem"></div></div>`,
    after: () => { const rows = () => { $('#scRows').innerHTML = sel.sched.map((s, i) => `<div class="row" data-i="${i}" style="flex-wrap:nowrap"><input class="inp" type="time" value="${esc(s.from)}" data-k="from" style="width:110px"><span>–</span><input class="inp" type="time" value="${esc(s.to)}" data-k="to" style="width:110px"><select class="inp" data-k="state" style="width:130px">${[['live', 'Live'], ['open', 'Открыто'], ['calm', 'Тихо'], ['closed', 'Закрыто']].map(([k, l]) => `<option value="${k}" ${k === s.state ? 'selected' : ''}>${l}</option>`).join('')}</select><input class="inp grow" value="${esc(s.label)}" data-k="label" placeholder="Что происходит"><button type="button" class="ibtn" data-x="${i}" aria-label="Удалить">${I.x}</button></div>`).join('') || '<p class="note">Интервалов нет — площадка считается закрытой.</p>';
      $$('#scRows [data-k]').forEach(inp => inp.oninput = () => { sel.sched[+inp.closest('[data-i]').dataset.i][inp.dataset.k] = inp.value; }); $$('#scRows [data-x]').forEach(b => b.onclick = () => { sel.sched.splice(+b.dataset.x, 1); rows(); }); };
      rows(); $('#scAdd').onclick = () => { sel.sched.push({ from: '10:00', to: '18:00', state: 'open', label: '' }); rows(); }; },
    newDefaults: { kind: 'pool', accent: '#F7B50A', order: A.venues.length, schedule: [] } });
  // расписание уходит вместе с формой
  const f = $('#cForm'); if (f) { const orig = f.onsubmit; f.onsubmit = async e => { e.preventDefault(); const body = { ...readFields([{ k: 'name' }, { k: 'kind' }, { k: 'floor' }, { k: 'order', type: 'number' }, { k: 'accent' }, { k: 'keywords' }, { k: 'desc' }, { k: 'image' }, { k: 'comingSoon', type: 'check' }]), schedule: sel.sched }; const r = await run(() => api('PUT', `/admin/venues/${sel.venues === 'new' ? 'new' : encodeURIComponent(sel.venues)}`, body), 'Сохранено'); if (r) { sel.venues = r.doc.id; sel.schedFor = null; await load(); paint(); } }; }
}
function menu(m) {
  const cats = [...new Set(A.menu.map(i => i.cat))];
  crud(m, { col: 'menu', title: 'Меню Le Ciel', items: A.menu, label: i => `<b>${esc(i.name)}</b><span class="note">${esc(i.cat)} · ${money(i.price)}</span>`,
    fields: [{ k: 'name', label: 'Блюдо' }, { k: 'cat', label: 'Раздел' }, { k: 'price', label: 'Цена, $', type: 'number' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'desc', label: 'Описание', type: 'textarea' }], newDefaults: { cat: cats[0] || 'Основные', price: 100, order: A.menu.length },
    after: () => { $('#f_cat').setAttribute('list', 'catList'); $('#f_cat').insertAdjacentHTML('afterend', `<datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`); } });
}
let prevR = null;
function cigars(m) {
  crud(m, { col: 'cigars', title: 'Сигары в хьюмидоре', sub: 'Каждая сигара строится в 3D из формата, размера и цветов. Предпросмотр справа обновляется сразу.', items: A.cigars, label: c => `<span class="row" style="flex-wrap:nowrap"><i style="width:10px;height:10px;border-radius:50%;background:${esc(c.band)}"></i><b>${esc(c.name)}</b></span><span class="note">${esc(CIGAR_SHAPES[c.shape])} · ${money(c.price)}</span>`,
    fields: [{ k: 'name', label: 'Название' }, { k: 'origin', label: 'Страна' }, { k: 'shape', label: 'Формат', type: 'select', options: Object.entries(CIGAR_SHAPES) }, { k: 'price', label: 'Цена, $', type: 'number' }, { k: 'length', label: 'Длина, мм', type: 'number' }, { k: 'ring', label: 'Ринг (диаметр в 1/64")', type: 'number' }, { k: 'strength', label: 'Крепость 1–5', type: 'number' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'wrapper', label: 'Цвет покровного листа', type: 'color' }, { k: 'band', label: 'Цвет кольца', type: 'color' }, { k: 'band2', label: 'Второй цвет кольца', type: 'color' }, { k: 'bandStyle', label: 'Дизайн кольца', type: 'select', options: [['classic', 'Классика'], ['medallion', 'Медальон'], ['double', 'Двойное кольцо'], ['foot', 'Кольцо у ножки'], ['stripe', 'Полоса с печатью']] }, { k: 'bandText', label: 'Надпись на кольце' }, { k: 'bandText2', label: 'Надпись на втором кольце' }, { k: 'notes', label: 'Ноты вкуса', type: 'tags' }, { k: 'desc', label: 'Описание', type: 'textarea' }],
    newDefaults: { shape: 'robusto', length: 130, ring: 50, wrapper: '#7a4a28', band: '#c9a24a', band2: '#1a1a1a', bandStyle: 'classic', strength: 3, price: 120, order: A.cigars.length },
    extra: () => `<div class="hum" id="cPrev" style="height:220px"></div>`,
    after: () => { import('./humidor3d.js').then(mod => preview(mod)); } });
}
async function preview(mod) {
  const host = $('#cPrev'); if (!host) return; const THREE = await import('three');
  prevR?.dispose?.(); const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.outputColorSpace = THREE.SRGBColorSpace; host.append(r.domElement);
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 0.6, 5); cam.lookAt(0, 0, 0);
  sc.add(new THREE.HemisphereLight(0xffe6c4, 0x2a160a, 1.6)); const k = new THREE.DirectionalLight(0xffe2b8, 2.4); k.position.set(2, 4, 3); sc.add(k);
  let obj = null, mats = [], raf = 0;
  const build = () => { if (obj) { sc.remove(obj); mats.forEach(x => x.dispose?.()); mats = []; } const c = { id: sel.cigars, ...readFields([{ k: 'name' }, { k: 'shape' }, { k: 'length', type: 'number' }, { k: 'ring', type: 'number' }, { k: 'wrapper' }, { k: 'band' }, { k: 'band2' }, { k: 'bandStyle' }, { k: 'bandText' }, { k: 'bandText2' }]) }; obj = mod.buildCigar(c, mats); obj.rotation.y = Math.PI / 2; sc.add(obj); };
  const size = () => { const w = host.clientWidth, h = host.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  build(); size(); ['shape', 'length', 'ring', 'wrapper', 'band', 'band2', 'bandStyle', 'bandText', 'bandText2'].forEach(k => $('#f_' + k)?.addEventListener('input', build));
  const loop = t => { if (!document.body.contains(host)) { r.dispose(); return; } if (obj) { obj.rotation.x = Math.sin(t / 1400) * 0.3; obj.children[0].rotation.y = t / 1600; } r.render(sc, cam); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop); prevR = r;
}
function depts(m) {
  const F = [{ k: 'name', label: 'Отдел' }, { k: 'color', label: 'Цвет отдела', type: 'color' }, { k: 'accent', label: 'Акцент', type: 'color' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'desc', label: 'Описание', type: 'textarea' }];
  crud(m, { col: 'depts', title: 'Отделы', sub: 'Отделы группируют анкеты на странице «Персонал». Цвет и акцент красят карточки сотрудников отдела.', items: A.depts, label: d => `<span class="row" style="flex-wrap:nowrap"><i style="width:12px;height:12px;border-radius:50%;background:${esc(d.color)};box-shadow:inset 0 0 0 3px ${esc(d.accent)}"></i><b>${esc(d.name)}</b></span>`,
    fields: F, newDefaults: { color: '#222222', accent: '#C9A24A', order: A.depts.length } });
}

function team(m) {
  const dOpts = [['', 'Без отдела'], ...A.depts.map(d => [d.id, d.name])];
  crud(m, { col: 'team', title: 'Анкеты сотрудников', sub: 'Карточки на странице «Персонал». Фото лучше вертикальное (3:4). Отметка «Пример» показывает на сайте плашку, что это заглушка — снимите её, когда заполните настоящие данные.', items: A.team,
    label: t => `<span class="row" style="flex-wrap:nowrap"><span style="width:28px;height:28px;border-radius:50%;flex:none;background:var(--card2) center/cover ${t.photo ? `url('${esc(t.photo)}')` : ''}"></span><span><b>${esc(t.name || 'Без имени')}</b><br><span class="note">${esc(t.position || '')}${t.hidden ? ' · скрыт' : ''}${t.example ? ' · пример' : ''}</span></span></span>`,
    fields: [{ k: 'name', label: 'Имя (как в игре)' }, { k: 'position', label: 'Должность' }, { k: 'dept', label: 'Отдел', type: 'select', options: dOpts }, { k: 'since', label: 'В отеле с' }, { k: 'discord', label: 'Discord' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'quote', label: 'Цитата (необязательно)' }, { k: 'bio', label: 'О сотруднике', type: 'textarea' }, { k: 'photo', label: 'Фото', type: 'image' }, { k: 'example', label: 'Пример (заглушка)', type: 'check' }, { k: 'hidden', label: 'Скрыть с сайта', type: 'check' }],
    newDefaults: { order: A.team.length } });
}
function offers(m) {
  crud(m, { col: 'offers', title: 'Специальные предложения', sub: 'Пакеты и акции на главной. Неактивные не показываются.', items: A.offers,
    label: o => `<b>${esc(o.title || 'Без названия')}</b><span class="note">${esc(o.tag || '')}${o.price ? ' · ' + esc(o.price) : ''}${o.active === false ? ' · выключено' : ''}</span>`,
    fields: [{ k: 'title', label: 'Название' }, { k: 'tag', label: 'Метка (Пакет, Ресторан…)' }, { k: 'price', label: 'Цена (текстом, например «от $2 400»)' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'cta', label: 'Текст кнопки' }, { k: 'link', label: 'Куда ведёт (#stay, #dining, #cigars, #contact)' }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'image', label: 'Картинка', type: 'image' }, { k: 'active', label: 'Показывать на сайте', type: 'check' }],
    newDefaults: { active: true, cta: 'Забронировать', link: '#stay', order: A.offers.length } });
}
// отзывы гостей: на сайт попадают только одобренные; ответ отеля виден под отзывом
let rvFilter = 'pending';
function reviews(m) {
  const all = A.reviews || [], by = st => all.filter(r => r.status === st), list = by(rvFilter);
  const RS = { pending: 'На проверке', approved: 'Опубликованы', hidden: 'Скрытые' };
  m.innerHTML = head('Отзывы гостей', all.length ? exportBtn('reviews') : '', 'Гость может оставить отзыв после выезда, один на бронь. На главной показываются только опубликованные.') +
    `<div class="row" style="gap:.4rem;margin-bottom:1rem">${Object.entries(RS).map(([k, n]) => `<button class="btn sm ${k === rvFilter ? '' : 'ghost'}" data-rf="${k}">${n} · ${by(k).length}</button>`).join('')}</div>` +
    (list.length ? `<div class="list">${list.map(r => `<div class="item" data-flash="${esc(r.id)}"><div class="top"><span class="row" style="gap:.5rem"><b style="color:var(--gold)">${'★'.repeat(r.stars)}<span style="color:var(--line2)">${'★'.repeat(5 - r.stars)}</span></b><b>${esc(r.name)}</b><span class="note">${esc(r.typeName || '')} · бронь ${esc(r.code || '')} · ${when(r.createdAt)}</span></span><span class="chip ${r.status === 'approved' ? 'ok' : r.status === 'hidden' ? 'bad' : 'p'}">${{ pending: 'На проверке', approved: 'Опубликован', hidden: 'Скрыт' }[r.status]}</span></div>
      <span style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.text)}</span>
      <label class="field"><span>Ответ отеля (виден под отзывом)</span><textarea data-reply="${esc(r.id)}" maxlength="600" placeholder="Спасибо, что выбрали Mile High Club…">${esc(r.reply || '')}</textarea></label><div>${tplSelect('rt-' + r.id)}</div>
      <div class="row" style="gap:.4rem">${r.status !== 'approved' ? `<button class="btn sm" data-rs="${esc(r.id)}|approved">Опубликовать</button>` : ''}${r.status !== 'hidden' ? `<button class="btn sm ghost" data-rs="${esc(r.id)}|hidden">Скрыть</button>` : ''}<button class="btn sm ghost" data-rsave="${esc(r.id)}">Сохранить ответ</button><button class="btn sm ghost" data-rdel="${esc(r.id)}" style="color:var(--bad)">Удалить</button></div></div>`).join('')}</div>`
      : `<div class="empty">${rvFilter === 'pending' ? 'Новых отзывов нет.' : 'Пусто.'}</div>`);
  $$('[data-rf]').forEach(b => b.onclick = () => { rvFilter = b.dataset.rf; paint(); });
  list.forEach(r => wireTpl('rt-' + r.id, $(`[data-reply="${CSS.escape(r.id)}"]`), r.name));
  const reply = id => $(`[data-reply="${CSS.escape(id)}"]`)?.value;
  $$('[data-rs]').forEach(b => b.onclick = async () => { const [id, status] = b.dataset.rs.split('|'); if (await run(() => api('POST', `/admin/reviews/${id}`, { status, reply: reply(id) }), status === 'approved' ? 'Отзыв опубликован' : 'Отзыв скрыт')) { await load(); paintAside(); paint(); } });
  $$('[data-rsave]').forEach(b => b.onclick = async () => { const id = b.dataset.rsave; if (await run(() => api('POST', `/admin/reviews/${id}`, { reply: reply(id) }), 'Ответ сохранён')) { await load(); paint(); } });
  $$('[data-rdel]').forEach(b => b.onclick = async () => { if (!await confirmBox('Удалить отзыв?', 'Отзыв исчезнет из панели и с сайта. Гость сможет оставить новый.', 'Удалить', true)) return; if (await run(() => api('DELETE', `/admin/reviews/${b.dataset.rdel}`), 'Отзыв удалён')) { await load(); paintAside(); paint(); } });
}
function jobs(m) {
  const items = A.jobsAll || [], dn = id => A.depts?.find(d => d.id === id)?.name || '';
  crud(m, { col: 'jobs', title: 'Вакансии', sub: 'Открытые вакансии видны на сайте в разделе «Вакансии». Отклик приходит обычной заявкой с темой «Работа в отеле».', items,
    label: j => `<b>${esc(j.title || 'Без названия')}</b><span class="note">${esc(dn(j.dept))}${j.pay ? ' · ' + esc(j.pay) : ''}${j.open === false ? ' · закрыта' : ''}</span>`,
    fields: [{ k: 'title', label: 'Должность' }, { k: 'dept', label: 'Отдел', type: 'select', options: [['', '—'], ...(A.depts || []).map(d => [d.id, d.name])] }, { k: 'pay', label: 'Оплата (текстом, например «$900 / смена»)' }, { k: 'schedule', label: 'График (например «вечерние смены»)' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'open', label: 'Вакансия открыта и видна на сайте', type: 'check' }, { k: 'desc', label: 'Коротко о вакансии', type: 'textarea' }, { k: 'duties', label: 'Чем заниматься', type: 'textarea' }, { k: 'reqs', label: 'Кого ищем', type: 'textarea' }],
    newDefaults: { open: true, order: items.length } });
}
function faq(m) {
  crud(m, { col: 'faq', title: 'Вопросы и ответы', sub: 'Блок «Частые вопросы» на странице заявки.', items: A.faq,
    label: q => `<b>${esc(q.q || 'Вопрос')}</b>`,
    fields: [{ k: 'q', label: 'Вопрос' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'a', label: 'Ответ', type: 'textarea' }],
    newDefaults: { order: A.faq.length } });
}

/* ---------- система ---------- */
/* Discord: сайт управляет сервером. Посты собираются здесь и уходят через вебхук в выбранный канал. */
const POST0 = () => ({ content: '', title: '', url: '', description: '', color: '#F7B50A', image: '', thumbnail: '', footer: '', fields: [], button: { label: '', url: '' } });
const PALETTE = [['#F0177A', 'Розовый'], ['#F7B50A', 'Золотой'], ['#EF5617', 'Пламя'], ['#F4D9A0', 'Песок'], ['#F9EDC7', 'Крем'], ['#59161E', 'Вино']];
let dMeta = null, dPost = POST0(), dEdit = null, dChannel = '', dSender = '';
const PF = [{ k: 'title', label: 'Заголовок' }, { k: 'url', label: 'Ссылка заголовка' }, { k: 'description', label: 'Текст', type: 'textarea' }, { k: 'color', label: 'Цвет полосы', type: 'color' }, { k: 'footer', label: 'Подпись снизу' }, { k: 'image', label: 'Картинка', type: 'image' }, { k: 'thumbnail', label: 'Миниатюра', type: 'image' }];
function postPreview(p) {
  const sender = A.senders?.find(x => x.id === (dEdit?.sender || dSender)) || A.senders?.[0];
  const channelName = dEdit?.channelName || dMeta?.channels.find(c => c.id === dChannel)?.name || '';
  return discordPreview(p, { sender, channelName, at: dEdit?.at });
}
function discord(m) {
  const dc = A.discord || {}, s = A.settingsFull || {}, admin = isAdmin();
  // список каналов запрашиваем, когда бот онлайн; пустой или неудачный ответ не запоминаем навсегда — его можно обновить
  if (!dMeta || (!dMeta.loaded && !dMeta.loading && dc.connected)) {
    dMeta = { channels: [], roles: [], loading: dc.connected };
    if (dc.connected) api('GET', '/admin/discord/meta').then(r => { dMeta = { ...r, loaded: true }; paint(); }).catch(e => { dMeta = { channels: [], roles: [], loaded: true, error: e.message }; paint(); });
  }
  const chOpts = (sel, post) => dMeta.channels.map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''} ${post && c.canPost === false ? 'disabled' : ''}>${c.parent ? esc(c.parent) + ' / ' : ''}${esc(c.name)}${post && c.canPost === false ? ' — нет права «Управлять вебхуками»' : ''}</option>`).join('');
  const postable = dMeta.channels.filter(c => c.canPost !== false).length;
  const chNote = !dc.connected ? '' : dMeta.loading ? '<p class="note">Загружаем каналы сервера…</p>' : dMeta.error ? `<p class="note">Каналы не загрузились: ${esc(dMeta.error)}. <button type="button" class="btn ghost sm" data-meta>Повторить</button></p>`
    : !postable ? `<p class="note">${dMeta.channels.length ? 'Бот видит каналы, но ни в одном не может создать вебхук: выдайте его роли право «Управлять вебхуками».' : 'Бот не видит ни одного текстового канала: проверьте его права на сервере.'} <button type="button" class="btn ghost sm" data-meta>Обновить список</button></p>` : '';
  const roleOpts = sel => dMeta.roles.map(r => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>@${esc(r.name)}</option>`).join('');
  const roleBox = (id, on) => `<div class="stack" id="${id}" style="gap:.35rem;max-height:13rem;overflow:auto">${dMeta.roles.map(r => `<label class="check"><input type="checkbox" value="${esc(r.id)}" ${on?.includes(r.id) ? 'checked' : ''}><span style="color:${esc(r.color || 'inherit')}">${esc(r.name)}</span></label>`).join('') || '<span class="note">Роли появятся, когда бот будет онлайн.</span>'}</div>`;
  m.innerHTML = head('Discord', '', 'Сайт главный: посты, вебхуки и доступ настраиваются здесь. Сервер получает посты, уведомления персоналу и тикеты, а события с сервера появляются в афише на сайте.') + `
    <div class="g2" style="align-items:start">
      <form class="card pad stack" id="dForm"><h3 style="font-size:1rem">${dEdit ? 'Правка поста' : 'Новый пост'}</h3>
        ${dEdit ? `<p class="note">Канал ${esc(dEdit.channelName)}, отправитель ${esc(dEdit.senderName)}. Они не меняются при правке.</p>` : `<div class="g2"><label class="field"><span>Канал</span><select id="dCh"><option value="">Выберите канал</option>${chOpts(dChannel, true)}</select></label><label class="field"><span>Отправитель</span><select id="dSn">${(A.senders || []).map(x => `<option value="${esc(x.id)}" ${x.id === dSender ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label></div>${chNote}`}
        <label class="field"><span>Сообщение над карточкой</span><textarea id="f_content">${esc(dPost.content)}</textarea></label>
        <div class="g2">${PF.map(f => field(f, dPost[f.k])).join('')}</div>
        <div class="row" style="gap:.4rem" aria-label="Палитра сайта">${PALETTE.map(([c, n]) => `<button type="button" class="btn ghost sm" data-col="${c}" title="${n}" aria-label="${n}" style="width:2rem;min-width:0;padding:0;background:${c}"></button>`).join('')}</div>
        <div class="stack" style="gap:.4rem"><span class="lbl">Поля</span><div class="stack" id="dFields" style="gap:.4rem">${dPost.fields.map((f, i) => `<div class="row" data-i="${i}"><input class="inp grow" data-k="name" placeholder="Название" value="${esc(f.name)}"><input class="inp grow" data-k="value" placeholder="Значение" value="${esc(f.value)}"><label class="check"><input type="checkbox" data-k="inline" ${f.inline ? 'checked' : ''}>В ряд</label><button type="button" class="btn ghost sm" data-del="${i}" aria-label="Убрать поле">${I.trash}</button></div>`).join('')}</div><div><button type="button" class="btn ghost sm" id="dAddF">${I.plus} Добавить поле</button></div></div>
        <div class="g2"><label class="field"><span>Текст кнопки-ссылки</span><input id="dBl" value="${esc(dPost.button.label)}"></label><label class="field"><span>Адрес кнопки</span><input id="dBu" value="${esc(dPost.button.url)}" placeholder="https://"></label></div>
        <div class="row"><button class="btn" ${dc.connected ? '' : 'disabled'}>${dEdit ? 'Сохранить правку' : 'Отправить'}</button>${dEdit ? '<button type="button" class="btn ghost" id="dCancel">Отменить</button>' : '<button type="button" class="btn ghost" id="dClear">Очистить</button>'}</div>
        ${dc.connected ? '<p class="note">Картинки видны в Discord, только если сайт открыт по публичному https-адресу.</p>' : `<p class="note">${DEMO || dc.demo ? 'Это демо-версия: отправка работает только на вашем сервере.' : 'Отправка заработает, когда бот будет подключён.'}</p>`}</form>
      <div class="stack" style="gap:1rem"><div class="card pad stack"><h3 style="font-size:1rem">Как это будет выглядеть в Discord</h3><div id="dPrev">${postPreview(dPost)}</div></div>
        <div class="card pad stack"><h3 style="font-size:1rem">Отправленные</h3>${(A.posts || []).length ? `<div class="stack" style="gap:.3rem">${A.posts.map(p => `<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="note" style="min-width:0;overflow-wrap:anywhere"><b>${esc(p.post.title || p.post.content.slice(0, 50) || 'Без заголовка')}</b><br>${esc(p.channelName)} · ${esc(p.senderName)} · ${when(p.at)}</span><span class="row" style="gap:.3rem;flex-wrap:nowrap"><button type="button" class="btn ghost sm" data-view-post="${esc(p.id)}">Просмотр</button><button type="button" class="btn ghost sm" data-edit="${esc(p.id)}">Изменить</button></span></div>`).join('')}</div>` : '<span class="note">Постов ещё не было.</span>'}</div>
        <div class="card pad stack"><h3 style="font-size:1rem">Состояние</h3><div class="row"><span class="chip ${dc.connected ? 'ok' : 'm'}"><span class="d"></span>${dc.connected ? 'Бот онлайн' : 'Бот не подключён'}</span>${dc.connected ? `<span class="note">${esc(dc.bot || '')} · ${esc(dc.guild || '')}</span>` : ''}</div>
          ${admin ? `<div class="row"><button type="button" class="btn ghost sm" id="dSetup" ${dc.connected ? '' : 'disabled'}>Обновить структуру</button><button type="button" class="btn ghost sm" id="dProf" ${dc.connected ? '' : 'disabled'}>Профиль сервера</button><button type="button" class="btn ghost sm" id="dClean" ${dc.connected ? '' : 'disabled'}>Убрать лишнее</button></div><p class="note">Перед каждым действием бот покажет список изменений.</p>` : ''}</div></div></div>
    ${admin ? `<form class="card pad stack" id="dAcc" style="margin-top:1rem"><h3 style="font-size:1rem">Доступ и анонсы</h3><div class="g2"><div class="field"><span>Администраторы</span>${roleBox('dAdm', s.adminRoles)}</div><div class="field"><span>Директора</span>${roleBox('dDir', s.directorRoles)}</div><div class="field"><span>Персонал отеля</span>${roleBox('dMod', s.modRoles)}</div><div class="field"><span>Разработка (тестовый канал)</span>${roleBox('dDev', s.devRoles)}</div></div>
      <div class="g2"><label class="field"><span>Кого отмечать при новом отзыве</span><select id="dRvR"><option value="">Никого, только сообщение</option>${roleOpts(s.reviewRole)}</select></label><label class="field"><span>Кого отмечать при отклике на вакансию</span><select id="dJbR"><option value="">Никого, только сообщение</option>${roleOpts(s.jobRole)}</select></label><label class="field"><span>Кого звать в канал брони с чатом гостя</span><select id="dBkR"><option value="">Никого, только канал</option>${roleOpts(s.bookingRole)}</select></label></div>
      <label class="field"><span>Канал для анонсов событий с сервера</span><select id="dAnn"><option value="">Первый канал объявлений</option>${chOpts(s.announceChannel)}</select></label>
      <p class="note">Права дают только отмеченные роли. Администраторы видят всё и управляют сайтом. Директора видят дирекцию и персонал. Персонал видит только свой раздел. Директора и персонал работают в панели как модераторы. Владелец сервера всегда администратор.</p><div><button class="btn" ${dc.connected ? '' : 'disabled'}>Сохранить</button></div></form>` : ''}`;
  wirePickers($('#dForm'));
  const read = () => {
    const o = readFields(PF); dPost = { ...dPost, ...o, content: $('#f_content').value, button: { label: $('#dBl').value, url: $('#dBu').value },
      fields: $$('#dFields [data-i]').map(r => ({ name: r.querySelector('[data-k=name]').value, value: r.querySelector('[data-k=value]').value, inline: r.querySelector('[data-k=inline]').checked })) };
    if ($('#dCh')) { dChannel = $('#dCh').value; dSender = $('#dSn').value; }
    $('#dPrev').innerHTML = postPreview(dPost);
  };
  $$('[data-meta]').forEach(b => b.onclick = () => { dMeta = null; paint(); });
  $('#dForm').oninput = read; $('#dForm').onchange = read;
  $$('[data-col]').forEach(b => b.onclick = () => { $('#f_color').value = b.dataset.col; read(); });
  $('#dSn') && ($('#dSn').onchange = () => { const c = A.senders?.find(x => x.id === $('#dSn').value)?.color; if (c) $('#f_color').value = c; read(); });
  $('#dAddF').onclick = () => { read(); dPost.fields.push({ name: '', value: '', inline: false }); paint(); };
  $$('#dFields [data-del]').forEach(b => b.onclick = () => { read(); dPost.fields.splice(+b.dataset.del, 1); paint(); });
  $('#dClear') && ($('#dClear').onclick = () => { dPost = POST0(); paint(); });
  $('#dCancel') && ($('#dCancel').onclick = () => { dEdit = null; dPost = POST0(); paint(); });
  // отправленный пост: как он выглядит в Discord сейчас (последняя сохранённая версия)
  $$('[data-view-post]').forEach(b => b.onclick = () => { const x = A.posts.find(p => p.id === b.dataset.viewPost); if (!x) return;
    modal(`<h3>Пост в Discord</h3><p class="note">${esc(x.channelName)} · ${esc(x.senderName)} · ${when(x.at)}${x.editedAt ? ' · изменён' : ''}</p>${discordPreview({ ...POST0(), ...x.post }, { sender: A.senders?.find(s => s.id === x.sender) || { name: x.senderName }, channelName: x.channelName, at: x.at })}<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Закрыть</button></div>`, { wide: true }); });
  $$('[data-edit]').forEach(b => b.onclick = () => { dEdit = A.posts.find(p => p.id === b.dataset.edit); dPost = { ...POST0(), ...structuredClone(dEdit.post) }; paint(); });
  $('#dForm').onsubmit = async e => { e.preventDefault(); read(); const r = await run(() => api('POST', '/admin/discord/send', { id: dEdit?.id, channel: dChannel, sender: dSender || A.senders?.[0]?.id, post: dPost }), dEdit ? 'Пост изменён' : 'Отправлено'); if (r) { dEdit = null; dPost = POST0(); await load(); paint(); } };
  const checked = id => $$(`#${id} input:checked`).map(i => i.value);
  $('#dAcc') && ($('#dAcc').onsubmit = async e => { e.preventDefault(); if (await run(() => api('POST', '/admin/discord/access', { admin: checked('dAdm'), director: checked('dDir'), mod: checked('dMod'), dev: checked('dDev'), announceChannel: $('#dAnn').value, reviewRole: $('#dRvR').value, jobRole: $('#dJbR').value, bookingRole: $('#dBkR').value }), 'Доступ сохранён')) { await load(); paint(); } });
  $('#dSetup') && ($('#dSetup').onclick = async () => { const p = await run(() => api('POST', '/admin/discord/plan')); if (!p) return; if (!p.lines.length) return toast('Структура уже на месте'); if (!await confirmBox('Обновить структуру?', p.lines.join('; ') + '.', 'Обновить')) return; const r = await run(() => api('POST', '/admin/discord/setup')); if (r) { toast(r.skipped.length ? `Готово. Пропущено: ${r.skipped.join(', ')}` : 'Структура обновлена'); play('success'); await load(); paint(); } });
  $('#dProf') && ($('#dProf').onclick = async () => { const r = await run(() => api('POST', '/admin/discord/profile')); if (r) { const bad = Object.entries(r).filter(([, v]) => v !== 'ok'); toast(bad.length ? `Не вышло: ${bad.map(([k, v]) => `${k} (${v})`).join('; ')}` : 'Профиль сервера обновлён', bad.length ? 'err' : ''); } });
  $('#dClean') && ($('#dClean').onclick = async () => { const p = await run(() => api('POST', '/admin/discord/cleanup-plan')); if (!p) return; const n = p.channels.length + p.categories.length + p.roles.length; if (!n) return toast(p.kept.length ? `Удалять нечего. Оставлены каналы с сообщениями: ${p.kept.join(', ')}` : 'Лишнего нет'); const list = [p.channels.length && `Каналы (${p.channels.length}): ${p.channels.join(', ')}`, p.categories.length && `Категории (${p.categories.length}): ${p.categories.join(', ')}`, p.roles.length && `Роли (${p.roles.length}): ${p.roles.join(', ')}`, p.kept.length && `Останутся, там писали люди: ${p.kept.join(', ')}`].filter(Boolean).join('. '); if (!await confirmBox('Удалить с сервера?', `Удаляется только то, что создал бот. Вернуть нельзя. ${list}.`, 'Удалить', true)) return; const r = await run(() => api('POST', '/admin/discord/cleanup')); if (r) { toast(`Удалено каналов: ${r.channels}, категорий: ${r.categories}, ролей: ${r.roles}`); play('success'); dMeta = null; await load(); paint(); } });
}
function senders(m) {
  crud(m, { col: 'senders', title: 'Отправители', sub: 'От этих имён уходят посты в Discord. У каждого в канале свой вебхук с именем и аватаркой.', items: A.senders || [], newDefaults: { name: '', avatar: '' },
    fields: [{ k: 'name', label: 'Имя' }, { k: 'color', label: 'Цвет постов', type: 'color' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'avatar', label: 'Аватарка', type: 'image' }],
    label: x => `<b>${esc(x.name)}</b>` });
}
function settings(m) {
  const s = A.settingsFull || {};
  const F = [{ k: 'weather', label: 'Погода над отелем', type: 'select', options: [['auto', 'Авто (смена каждые 3 ч)'], ['clear', 'Ясно'], ['rain', 'Дождь'], ['fog', 'Туман']] }, { k: 'theme', label: 'Тема сайта (снег только в новогодней)', type: 'select', options: [['none', 'Обычная'], ['newyear', 'Новогодняя']] }, { k: 'hotelName', label: 'Название отеля' }, { k: 'tagline', label: 'Слоган на главной' }, { k: 'discordInvite', label: 'Ссылка на Discord-сервер' }, { k: 'address', label: 'Адрес' }, { k: 'footer', label: 'Подвал сайта' }, { k: 'heroNight', label: 'Главная картинка', type: 'image' }];
  m.innerHTML = head('Настройки') + `<form class="card pad stack" id="sF"><div class="g2">${F.map(f => field(f, s[f.k])).join('')}</div>
    <div class="stack" style="gap:.5rem"><span class="lbl">Статусы гостей</span><p class="note">Статус даётся за прожитые ночи (завершённые брони). Скидка применяется к новым броням гостя автоматически, привилегия видна в кабинете. Пустое название — статус удаляется.</p>
      <div class="row note" aria-hidden="true" style="flex-wrap:wrap;gap:.5rem"><span style="flex:1 1 8rem">Название</span><span style="flex:0 1 6rem">С ночей</span><span style="flex:0 1 6rem">Скидка, %</span><span style="flex:2 1 12rem">Привилегия</span></div><div class="stack" id="tiersBox" style="gap:.4rem">${(A.settingsFull?.tiers?.length ? A.settingsFull.tiers : (S.pub?.settings?.tiers || [])).concat([{ name: '', nights: '', discount: '', perk: '' }]).map(t => `<div class="row tier-row" style="flex-wrap:wrap"><input class="inp" data-t="name" placeholder="Название" value="${esc(t.name)}" style="flex:1 1 8rem"><input class="inp" type="number" data-t="nights" min="1" placeholder="Ночей" value="${esc(t.nights)}" style="flex:0 1 6rem" aria-label="С какого числа ночей"><input class="inp" type="number" data-t="discount" min="0" max="50" placeholder="Скидка %" value="${esc(t.discount)}" style="flex:0 1 6rem" aria-label="Скидка, %"><input class="inp" data-t="perk" placeholder="Привилегия" value="${esc(t.perk)}" style="flex:2 1 12rem"></div>`).join('')}</div></div>
    <div class="stack" style="gap:.5rem"><span class="lbl">Шаблоны ответов</span><p class="note">Вставляются одной кнопкой в чате обращения и в ответе на отзыв. {имя} заменяется именем гостя.</p><div class="stack" id="tplBox" style="gap:.5rem"></div><div><button type="button" class="btn sm ghost" id="tplAdd">${I.plus} Добавить шаблон</button></div></div>
    <div class="stack" style="gap:.5rem"><span class="lbl">Блюдо дня под клошем (Le Ciel)</span><p class="note">Что показывать на карточке «Что сегодня под клошем». Авто — меняется само по дню из «основных».</p>
      <label class="field"><span>Режим</span><select id="spMode"><option value="auto">Авто (смена по дню)</option><option value="menu">Выбрать блюдо из меню</option><option value="custom">Своё блюдо (вне меню)</option></select></label>
      <label class="field" id="spMenuF"><span>Блюдо из меню</span><select id="spMenu"><option value="">— выберите —</option>${(A.menu || []).map(d => `<option value="${esc(d.id)}">${esc(d.cat ? d.cat + ' · ' : '')}${esc(d.name)}</option>`).join('')}</select></label>
      <div class="g2" id="spCustomF"><label class="field"><span>Название</span><input id="spName" maxlength="60" placeholder="Утиная ножка конфи"></label><label class="field"><span>Цена</span><input id="spPrice" type="number" min="0" placeholder="260"></label></div>
      <label class="field" id="spDescF"><span>Описание</span><input id="spDesc" maxlength="200" placeholder="Картофель сарладез, вишнёвый соус"></label></div>
    <div class="stack" style="gap:.5rem"><span class="lbl">Окошки на сайте</span><p class="note">Что показывать гостям в шапке и на табло. Выключенное окно просто скрывается — данные не теряются.</p>
      <label class="check"><input type="checkbox" id="wgWeather"> Погода и температура над отелем</label>
      <label class="check"><input type="checkbox" id="wgGuests"> Счётчик гостей онлайн</label>
      <label class="check"><input type="checkbox" id="wgFree"> «Свободно» — свободные номера в шапке</label></div>
    <div class="stack" style="gap:.5rem"><span class="lbl">Интеграция LifeX</span><p class="note">Привязка профиля игровой соцсети LifeX в кабинете гостя: подтягиваются аватар, имя персонажа и телефон. Включение и выключение не удаляют уже привязанные профили — данные гостей остаются.</p>
      <label class="check"><input type="checkbox" id="lxEn" ${A.lifex?.envOk ? '' : 'disabled'}> Включить привязку LifeX для гостей</label>
      ${A.lifex?.envOk ? '' : '<p class="note" style="margin:0">Адреса приложения LifeX не заданы на хостинге, поэтому привязка сейчас не работает. Чтобы включить её, добавьте в <b>.env</b> ключи <span class="num">LIFEX_CLIENT_ID</span>, <span class="num">LIFEX_REDIRECT_URI</span>, <span class="num">LIFEX_TOKEN_URL</span> и <span class="num">LIFEX_PROFILE_URL</span> (см. README).</p>'}</div>
    <div class="stack" style="gap:.5rem"><span class="lbl">Музыка на вертушке («Отдых»)</span><p class="note">Треки mp3, ogg или m4a. Играет случайный трек со случайного места. Пока треков нет, вертушка в разделе «Отдых» скрыта.</p>
      <div class="stack" id="trkBox" style="gap:.4rem"></div><div class="row"><label class="btn sm ghost" style="cursor:pointer">${I.plus} Загрузить треки<input type="file" id="trkUp" accept="audio/mpeg,audio/ogg,audio/mp4,.mp3,.ogg,.m4a" multiple hidden></label></div></div>
    <p class="note">Роли, которые дают доступ к панели, выбираются в разделе Discord.</p><div><button class="btn">Сохранить</button></div></form>`;
  wirePickers($('#sF'));
  (() => { const sp = s.special || { mode: 'auto' }; $('#spMode').value = sp.mode || 'auto'; if (sp.mode === 'menu') $('#spMenu').value = sp.menuId || '';
    if (sp.mode === 'custom') { $('#spName').value = sp.name || ''; $('#spDesc').value = sp.desc || ''; $('#spPrice').value = sp.price || ''; }
    const upd = () => { const mv = $('#spMode').value; $('#spMenuF').hidden = mv !== 'menu'; $('#spCustomF').hidden = $('#spDescF').hidden = mv !== 'custom'; };
    $('#spMode').onchange = upd; upd(); })();
  (() => { const w = s.widgets || {}; $('#wgWeather').checked = w.weather !== false; $('#wgGuests').checked = w.guests !== false; $('#wgFree').checked = w.free !== false; })();
  (() => { $('#lxEn').checked = (s.lifex?.enabled !== false); })();
  let tpls = (A.replyTemplates?.length ? A.replyTemplates : DEFAULT_REPLIES).map(t => ({ ...t }));
  const paintTpl = () => { $('#tplBox').innerHTML = tpls.map((t, i) => `<div class="tplrow"><input class="inp" data-tt="${i}" value="${esc(t.title)}" placeholder="Название"><textarea class="inp" data-tx="${i}" rows="2" placeholder="Текст ответа">${esc(t.text)}</textarea><button type="button" class="btn sm ghost" data-tdel="${i}" aria-label="Удалить шаблон">${I.trash}</button></div>`).join('');
    $$('#tplBox [data-tt]').forEach(x => x.oninput = () => { tpls[+x.dataset.tt].title = x.value; }); $$('#tplBox [data-tx]').forEach(x => x.oninput = () => { tpls[+x.dataset.tx].text = x.value; });
    $$('#tplBox [data-tdel]').forEach(x => x.onclick = () => { tpls.splice(+x.dataset.tdel, 1); paintTpl(); }); };
  paintTpl(); $('#tplAdd').onclick = () => { tpls.push({ title: '', text: '' }); paintTpl(); $(`#tplBox [data-tt="${tpls.length - 1}"]`).focus(); };
  let tracks = (s.deckTracks || []).map(t => ({ ...t }));
  const paintTracks = () => { $('#trkBox').innerHTML = tracks.length ? tracks.map((t, i) => `<div class="row trk" style="flex-wrap:nowrap"><span class="note num" style="width:1.5rem">${i + 1}</span><input class="inp grow" data-ti="${i}" value="${esc(t.title)}" placeholder="Название трека"><audio src="${esc(t.url)}" controls preload="none" style="height:2rem;max-width:12rem"></audio><button type="button" class="btn sm ghost" data-td="${i}" aria-label="Убрать трек">${I.trash}</button></div>`).join('') : '<span class="note">Треков нет, вертушка на сайте скрыта.</span>';
    $$('#trkBox [data-ti]').forEach(x => x.oninput = () => { tracks[+x.dataset.ti].title = x.value; });
    $$('#trkBox [data-td]').forEach(x => x.onclick = () => { tracks.splice(+x.dataset.td, 1); paintTracks(); $('#sF').dataset.dirty = '1'; }); };
  paintTracks();
  $('#trkUp').onchange = async e => { const files = [...e.target.files]; if (!files.length) return; const r = await run(() => upload(files)); e.target.value = '';
    const got = (r || []).filter(x => /\.(mp3|ogg|m4a)$/i.test(x.url)); if (!got.length) return toast('Не получилось загрузить. Нужны mp3, ogg или m4a до 10 МБ', 'err');
    got.forEach(x => tracks.push({ url: x.url, title: String(x.name || '').replace(/\.[^.]+$/, '') })); paintTracks(); $('#sF').dataset.dirty = '1'; toast(`Загружено треков: ${got.length}. Не забудьте сохранить настройки`); };
  $('#sF').onsubmit = async e => { e.preventDefault(); const body = { ...readFields(F), replyTemplates: tpls.filter(t => t.title.trim() && t.text.trim()), deckTracks: tracks, special: (() => { const mv = $('#spMode').value; return mv === 'menu' ? { mode: 'menu', menuId: $('#spMenu').value } : mv === 'custom' ? { mode: 'custom', name: $('#spName').value, desc: $('#spDesc').value, price: +$('#spPrice').value || 0 } : { mode: 'auto' }; })(), widgets: { weather: $('#wgWeather').checked, guests: $('#wgGuests').checked, free: $('#wgFree').checked }, lifex: { enabled: $('#lxEn').checked }, tiers: $$('#tiersBox .tier-row').map(r => Object.fromEntries([...r.querySelectorAll('[data-t]')].map(i => [i.dataset.t, i.value]))).filter(t => t.name.trim()) }; if (await run(() => api('PUT', '/admin/settings/main', body), 'Настройки сохранены')) { await load(); ctx.reloadPublic?.(); } };
}
// «Горячие туры» — пасхалка с рейсом в Вайс-Сити: кнопку в подвале можно выключить, фоны темы — заменить своими
function vice(m) {
  const v = A.settingsFull?.vice || {};
  const F = [{ k: 'heroNight', label: 'Первый экран ночью', type: 'image' }, { k: 'heroDay', label: 'Первый экран днём', type: 'image' }, { k: 'bg', label: 'Фон страниц (за карточками)', type: 'image' }];
  m.innerHTML = head('Вайс-Сити', '', 'Пасхалка «Горячие туры»: гость покупает рейс в подвале сайта, улетает в Вайс-Сити и получает секрет «Горячий тур». Рейс одноразовый — после возвращения в Лос-Сантос кнопка у гостя пропадает.') + `<form class="card pad stack" id="vF">
    <label class="check"><input type="checkbox" id="vEn"> Показывать кнопку «Горячие туры» в подвале сайта</label>
    <p class="note" style="margin:0">Выключено — новые гости кнопку не видят. Кто уже в Вайс-Сити, сможет вернуться: кнопка обратного рейса у них останется.</p>
    <div class="stack" style="gap:.5rem"><span class="lbl">Фоны темы</span><p class="note" style="margin:0">Свои картинки вместо стандартных сцен Вайс-Сити. Пусто — используются сцены отеля в Майами. Лучше всего — горизонтальные, от 1920 px.</p>
      <div class="g2">${F.map(f => field(f, v[f.k] || '')).join('')}</div></div>
    <div><button class="btn">Сохранить</button></div></form>`;
  wirePickers($('#vF')); $('#vEn').checked = v.enabled !== false;
  $('#vF').onsubmit = async e => { e.preventDefault(); const body = { vice: { enabled: $('#vEn').checked, ...readFields(F) } };
    if (await run(() => api('PUT', '/admin/settings/main', body), 'Сохранено')) { delete $('#vF').dataset.dirty; await load(); ctx.reloadPublic?.(); } };
}
function danger(m) {
  m.innerHTML = head('Сброс данных', '', 'Используйте, чтобы начать с чистого листа: например, после тестов.') + `<div class="danger"><h3 style="font-size:1.05rem;color:var(--bad)">Сбросить статистику</h3>
    <div class="stack" style="gap:.5rem">${[['rooms', 'Статусы всех номеров → «Свободен»'], ['bookings', 'Все брони'], ['orders', 'Все заказы в номер'], ['tickets', 'Все обращения и чаты'], ['log', 'Журнал действий']].map(([k, l]) => `<label class="check"><input type="checkbox" value="${k}" checked>${l}</label>`).join('')}</div>
    <label class="field"><span>Для подтверждения введите СБРОСИТЬ</span><input id="rsIn" autocomplete="off" placeholder="СБРОСИТЬ"></label><div><button class="btn danger" id="rsBtn" disabled>Сбросить выбранное</button></div><p class="note">Номера, типы, цены, меню, сигары, журнал и настройки не удаляются.</p></div>`;
  $('#rsIn').oninput = e => $('#rsBtn').disabled = e.target.value.trim() !== 'СБРОСИТЬ';
  $('#rsBtn').onclick = async () => {
    const scope = $$('.danger input[type=checkbox]:checked').map(i => i.value); if (!scope.length) { toast('Отметьте, что сбросить', 'err'); return; }
    if (!await confirmBox('Точно сбросить?', 'Это действие нельзя отменить. Выбранные данные будут удалены для всех.', 'Да, сбросить', true)) return;
    const r = await run(() => api('POST', '/admin/reset', { confirm: 'СБРОСИТЬ', scope }), 'Сброшено'); if (r) { await load(); paint(); }
  };
}
