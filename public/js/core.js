// Общая бизнес-логика сайта. Работает и на сервере (Node + SQLite), и в браузере (демо-режим).
// store: { all(col), get(col,id), put(col,id,doc), del(col,id), clear(col) } — синхронный.
// hooks: необязательные интеграции с Discord (на сервере их даёт бот).

export const ROLES = { guest: 0, mod: 1, admin: 2 };
// Время отеля — всегда московское (UTC+3), у любого гостя в любой стране.
export const MSK_OFFSET = 3 * 3600e3;
export const mskDate = (t = Date.now()) => new Date(t + MSK_OFFSET);
export const mskMinutes = (t = Date.now()) => { const d = mskDate(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
// Погода над отелем. «Авто» меняется каждые 3 часа по московскому времени и одинакова у всех гостей:
// зимой бывает снег, летом — дождь и туман. Новогодняя тема всегда включает снег.
export const WEATHER = { clear: 'Ясно', rain: 'Дождь', fog: 'Туман', snow: 'Снег' };
export function weatherNow(s = {}, t = Date.now()) {
  const d = mskDate(t), mon = d.getUTCMonth(), winter = mon >= 10 || mon <= 2, h = d.getUTCHours();
  let kind = s.weather && s.weather !== 'auto' ? s.weather : null;
  if (s.theme === 'newyear') kind = 'snow';
  if (!kind) {
    const block = Math.floor((t + MSK_OFFSET) / (3 * 3600e3)); let x = (block * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; const r = (x % 1000) / 1000;
    kind = winter ? (r < .38 ? 'snow' : r < .62 ? 'clear' : r < .82 ? 'fog' : 'rain') : (r < .55 ? 'clear' : r < .78 ? 'rain' : 'fog');
  }
  const base = [-6, -5, 0, 8, 15, 20, 23, 21, 15, 8, 1, -4][mon], daily = Math.round(Math.sin((h - 9) / 24 * Math.PI * 2) * 3);
  const temp = kind === 'snow' ? Math.min(-1, base + daily) : kind === 'rain' ? Math.max(2, base + daily - 2) : base + daily;
  return { kind, label: WEATHER[kind], temp, newyear: s.theme === 'newyear' };
}
export const ROOM_STATUS = { free: 'Свободен', booked: 'Забронирован', occupied: 'Заселён', cleaning: 'Уборка', repair: 'Ремонт' };
export const BOOKING_STATUS = { new: 'Новая', confirmed: 'Подтверждена', checkedin: 'Заселён', done: 'Завершена', cancelled: 'Отменена' };
export const ORDER_STATUS = { new: 'Новый', cooking: 'Готовится', delivering: 'Несём в номер', done: 'Доставлен', cancelled: 'Отменён' };
export const TICKET_STATUS = { checking: 'Проверка', open: 'Открыто', closed: 'Закрыто' };
export const CIGAR_SHAPES = { robusto: 'Робусто', corona: 'Корона', churchill: 'Черчилль', torpedo: 'Торпедо', belicoso: 'Беликозо', lancero: 'Лансеро', perfecto: 'Перфекто' };

// Что может редактировать каждая роль через общий редактор
const EDITABLE = {
  types: 'admin', venues: 'admin', menu: 'admin', cigars: 'admin', depts: 'admin', team: 'admin', offers: 'admin', faq: 'admin', settings: 'admin', media: 'mod',
  issues: 'mod', events: 'mod', senders: 'admin'
};
// Отправители постов в Discord: имя и аватарка вебхука
const DEFAULT_SENDERS = [['concierge', 'Консьерж'], ['reception', 'Ресепшен'], ['manager', 'Управляющий'], ['journal', 'Журнал «Высота»']].map(([id, name], order) => ({ id, name, avatar: `img/discord/${id}.png`, order }));
const PUBLIC_SETTINGS = ['weather', 'theme', 'hotelName', 'tagline', 'heroDay', 'heroNight', 'discordInvite', 'dayStart', 'nightStart', 'address', 'footer'];

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = m => { throw new HttpError(400, m); };
const need = (user, role) => { if (!user || (ROLES[user.role] ?? 0) < ROLES[role]) throw new HttpError(user ? 403 : 401, user ? 'Недостаточно прав' : 'Нужен вход через Discord'); };
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const code = () => 'MHC-' + Math.random().toString(36).slice(2, 6).toUpperCase();

export function minutesOf(hhmm) { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return ((h || 0) * 60 + (m || 0)) % 1440; }
export function inSpan(m, a, b) { return a === b ? true : a < b ? m >= a && m < b : m >= a || m < b; }
// Текущее состояние площадки: событие из Discord важнее расписания
export function venueState(venue, events, now = Date.now()) {
  const live = (events || []).find(e => e.venueId === venue.id && e.status !== 'cancelled' && e.start <= now && (e.end ? e.end > now : e.start + 3 * 3600e3 > now));
  if (live) return { state: 'event', label: live.name, event: live };
  if (venue.comingSoon) return { state: 'soon', label: 'Скоро открытие' };
  const m = mskMinutes(now);
  const span = (venue.schedule || []).find(s => inSpan(m, minutesOf(s.from), minutesOf(s.to)));
  return span ? { state: span.state || 'open', label: span.label || '', span } : { state: 'closed', label: 'Закрыто' };
}

export function createCore(store, hooks = {}) {
  const emit = cols => hooks.changed?.(cols); // бот подключается позже и оборачивает hooks.changed
  const log = (text, kind = 'info', by) => { const id = uid('l'); store.put('log', id, { id, text, kind, by: by || null, at: Date.now() }); trimLog(); };
  const trimLog = () => { const all = store.all('log').sort((a, b) => b.at - a.at); all.slice(400).forEach(l => store.del('log', l.id)); };
  const settings = () => store.get('settings', 'main') || {};
  const call = async (name, ...args) => { try { return hooks[name] ? await hooks[name](...args) : null; } catch (e) { log(`Discord: ${name} не выполнено (${e.message})`, 'error'); return null; } };
  const roomsSorted = () => store.all('rooms').sort((a, b) => a.floor - b.floor || String(a.id).localeCompare(String(b.id), 'ru', { numeric: true }));
  const freeSummary = () => { const types = sort(store.all('types')); const rooms = store.all('rooms'); return { total: rooms.length, free: rooms.filter(r => r.status === 'free').length, byType: types.map(t => ({ name: t.name, free: rooms.filter(r => r.type === t.id && r.status === 'free').length, total: rooms.filter(r => r.type === t.id).length })) }; };
  const senders = () => { if (!store.all('senders').length) DEFAULT_SENDERS.forEach(s => store.put('senders', s.id, s)); return sort(store.all('senders')); };
  const roomsChanged = () => { emit(['rooms']); call('roomsChanged', freeSummary()); };
  const ownerOf = (user, guestKey) => user ? 'd:' + user.id : guestKey ? 'g:' + str(guestKey, 64) : null;
  const isOwner = (doc, user, guestKey) => doc.owner && (doc.owner === ownerOf(user, guestKey) || (user && doc.owner === 'd:' + user.id));
  const sort = (arr, f = 'order') => arr.sort((a, b) => (a[f] ?? 0) - (b[f] ?? 0));

  function publicData() {
    const s = settings(), pub = {};
    PUBLIC_SETTINGS.forEach(k => pub[k] = s[k]);
    const now = Date.now();
    return {
      settings: pub,
      types: sort(store.all('types')),
      rooms: roomsSorted().map(r => ({ id: r.id, floor: r.floor, type: r.type, status: r.status })),
      venues: sort(store.all('venues')),
      menu: sort(store.all('menu')),
      cigars: sort(store.all('cigars')),
      depts: sort(store.all('depts')),
      team: sort(store.all('team')).filter(t => !t.hidden),
      offers: sort(store.all('offers')).filter(o => o.active !== false),
      faq: sort(store.all('faq')),
      issues: store.all('issues').filter(i => i.published).sort((a, b) => (b.date || 0) - (a.date || 0)),
      events: store.all('events').filter(e => e.status !== 'cancelled' && (e.end || e.start + 3 * 3600e3) > now - 3600e3).sort((a, b) => a.start - b.start).slice(0, 30),
      media: store.all('media').map(m => ({ id: m.id, url: m.url })),
      now
    };
  }

  const routes = [];
  const on = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

  /* ---------- публичное ---------- */
  on('GET', '/public', () => publicData());
  on('GET', '/me', ({ user }) => ({ user: user || null }));
  on('GET', '/me/items', ({ user, guestKey }) => {
    const o = ownerOf(user, guestKey); if (!o) return { bookings: [], tickets: [], orders: [] };
    const mine = c => store.all(c).filter(d => d.owner === o).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    return { bookings: mine('bookings'), tickets: mine('tickets').map(t => ({ ...t, messages: t.mode === 'site' ? t.messages : [] })), orders: mine('orders') };
  });

  on('POST', '/bookings', async ({ body, user, guestKey }) => {
    const t = store.get('types', str(body.type, 40)); if (!t) bad('Выберите тип номера');
    const name = str(body.name, 60), discord = str(body.discord || user?.username, 40), date = str(body.date, 10);
    if (!name || !discord || !/^\d{4}-\d{2}-\d{2}$/.test(date)) bad('Заполните имя, Discord и дату заезда');
    const nights = Math.min(30, Math.max(1, Math.round(num(body.nights, 1))));
    let room = str(body.room, 10) || null;
    if (room) { const r = store.get('rooms', room); if (!r || r.type !== t.id || r.status !== 'free') room = null; }
    if (!store.all('rooms').some(r => r.type === t.id && r.status === 'free')) bad(`Свободных номеров «${t.name}» сейчас нет`);
    const b = { id: uid('b'), code: code(), type: t.id, typeName: t.name, preferredRoom: room, room: null, name, discord, phone: str(body.phone, 20), date, nights, guests: Math.min(12, Math.max(1, Math.round(num(body.guests, 1)))), note: str(body.note, 600), total: t.price * nights, status: 'new', owner: ownerOf(user, guestKey), discordId: user?.id || null, createdAt: Date.now() };
    store.put('bookings', b.id, b); log(`Новая бронь ${b.code}: ${t.name}, ${date}, ${b.name}`, 'booking');
    emit(['bookings', 'log']); call('notify', 'booking', b);
    return { booking: b };
  });

  on('POST', '/orders', async ({ body, user, guestKey }) => {
    const room = str(body.room, 10); if (!store.get('rooms', room)) bad('Укажите номер комнаты из списка номеров отеля');
    const ids = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
    const items = ids.map(i => { const it = store.get('menu', str(i.id, 40)) || store.get('cigars', str(i.id, 40)); const q = Math.min(20, Math.max(1, Math.round(num(i.qty, 1)))); return it ? { id: it.id, name: it.cat ? it.name : 'Сигара ' + it.name, qty: q, price: it.price } : null; }).filter(Boolean);
    if (!items.length) bad('Заказ пуст');
    const o = { id: uid('o'), items, total: items.reduce((s, i) => s + i.qty * i.price, 0), room, name: str(body.name, 60), discord: str(body.discord || user?.username, 40), note: str(body.note, 300), status: 'new', owner: ownerOf(user, guestKey), createdAt: Date.now() };
    store.put('orders', o.id, o); log(`Заказ в номер ${room} на $${o.total}`, 'order'); emit(['orders', 'log']); call('notify', 'order', o);
    return { order: o };
  });

  on('POST', '/tickets', async ({ body, user, guestKey }) => {
    const discord = str(body.discord || user?.username, 40), text = str(body.text, 2000);
    if (!discord || !text) bad('Укажите Discord и опишите вопрос');
    const t = { id: uid('t'), discord, name: str(body.name, 60), topic: str(body.topic, 60) || 'Другое', text, status: 'checking', mode: null, owner: ownerOf(user, guestKey), discordId: user?.id || null, messages: [], createdAt: Date.now(), lastAt: Date.now(), lastFrom: 'guest' };
    store.put('tickets', t.id, t); emit(['tickets']);
    const member = await call('checkMember', discord, user?.id);
    return { ticket: t, member: member === null ? null : !!member };
  });
  const myTicket = (id, user, guestKey) => { const t = store.get('tickets', id); if (!t || (!isOwner(t, user, guestKey) && !(user && ROLES[user.role] >= 1))) throw new HttpError(404, 'Обращение не найдено'); return t; };
  on('POST', '/tickets/:id/recheck', async ({ params, user, guestKey }) => { const t = myTicket(params.id, user, guestKey); const m = await call('checkMember', t.discord, t.discordId); return { member: m === null ? null : !!m }; });
  on('POST', '/tickets/:id/mode', async ({ params, body, user, guestKey }) => {
    const t = myTicket(params.id, user, guestKey); const mode = body.mode === 'discord' ? 'discord' : 'site';
    t.mode = mode; t.status = 'open'; t.lastAt = Date.now();
    if (mode === 'site' && !t.messages.length) t.messages.push({ from: 'guest', text: t.text, at: Date.now() });
    if (mode === 'discord') { const ch = await call('createTicketChannel', t); t.channel = ch || null; }
    store.put('tickets', t.id, t); log(`Обращение от ${t.discord}: ${t.topic} (${mode === 'discord' ? 'тикет в Discord' : 'чат на сайте'})`, 'ticket'); emit(['tickets', 'log']);
    call('notify', mode === 'discord' ? 'ticket_discord' : 'ticket_site', t);
    return { ticket: t };
  });
  on('POST', '/tickets/:id/messages', ({ params, body, user, guestKey }) => {
    const t = myTicket(params.id, user, guestKey); const text = str(body.text, 2000); if (!text) bad('Пустое сообщение');
    if (t.status === 'closed') bad('Обращение закрыто');
    const staff = !isOwner(t, user, guestKey) && user && ROLES[user.role] >= 1;
    t.messages.push({ from: staff ? 'staff' : 'guest', text, at: Date.now(), by: staff ? user.username : undefined });
    if (t.messages.length > 300) t.messages = t.messages.slice(-300);
    t.lastAt = Date.now(); t.lastFrom = staff ? 'staff' : 'guest'; store.put('tickets', t.id, t); emit(['tickets']);
    if (!staff) call('notify', 'ticket_message', t);
    return { ticket: t };
  });

  /* ---------- персонал ---------- */
  on('GET', '/admin/all', ({ user }) => {
    need(user, 'mod');
    const s = settings();
    return { ...publicData(), team: store.all('team').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), offers: store.all('offers').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), settingsFull: user.role === 'admin' ? s : null, rooms: roomsSorted(), issues: store.all('issues').sort((a, b) => (b.date || 0) - (a.date || 0)), events: store.all('events').sort((a, b) => b.start - a.start).slice(0, 100),
      bookings: store.all('bookings').sort((a, b) => b.createdAt - a.createdAt).slice(0, 500), tickets: store.all('tickets').sort((a, b) => b.lastAt - a.lastAt).slice(0, 300), orders: store.all('orders').sort((a, b) => b.createdAt - a.createdAt).slice(0, 300), log: store.all('log').sort((a, b) => b.at - a.at).slice(0, 120), summary: freeSummary(), discord: hooks.status ? hooks.status() : { connected: false }, senders: senders(), posts: store.all('posts').sort((a, b) => b.at - a.at).slice(0, 30) };
  });
  on('PUT', '/admin/:col/:id', ({ params, body, user }) => {
    const role = EDITABLE[params.col]; if (!role) bad('Этот раздел так не редактируется'); need(user, role);
    const id = params.id === 'new' ? uid(params.col.slice(0, 2)) : str(params.id, 60);
    const prev = store.get(params.col, id) || {};
    const doc = { ...prev, ...clean(params.col, body || {}), id, updatedAt: Date.now() };
    if (params.col === 'settings' && id !== 'main') bad('Неверный раздел настроек');
    store.put(params.col, id, doc); log(`${user.username} изменил ${label(params.col)}: ${doc.name || doc.title || id}`, 'edit', user.username);
    emit([params.col, 'log']); return { doc };
  });
  on('DELETE', '/admin/:col/:id', ({ params, user }) => {
    const role = EDITABLE[params.col]; if (!role || params.col === 'settings') bad('Нельзя удалить'); need(user, role);
    const d = store.get(params.col, params.id); if (!d) throw new HttpError(404, 'Не найдено');
    if (params.col === 'types' && store.all('rooms').some(r => r.type === params.id)) bad('Сначала переназначьте номера этого типа');
    store.del(params.col, params.id); log(`${user.username} удалил ${label(params.col)}: ${d.name || d.title || d.id}`, 'edit', user.username); emit([params.col, 'log']); return { ok: true };
  });

  // номера и этажи
  on('POST', '/admin/rooms/:id/status', ({ params, body, user }) => {
    need(user, 'mod'); const r = store.get('rooms', params.id); if (!r) throw new HttpError(404, 'Номер не найден');
    const st = str(body.status, 20); if (!ROOM_STATUS[st]) bad('Неверный статус');
    Object.assign(r, { status: st, updatedAt: Date.now() }); if (st === 'free') Object.assign(r, { guest: null, discord: null, bookingId: null });
    store.put('rooms', r.id, r); log(`${user.username}: номер ${r.id} → ${ROOM_STATUS[st]}`, 'room', user.username); roomsChanged(); emit(['log']); return { room: r };
  });
  on('PUT', '/admin/rooms/:id', ({ params, body, user }) => {
    need(user, 'admin'); const r = store.get('rooms', params.id); if (!r) throw new HttpError(404, 'Номер не найден');
    const newId = str(body.id || r.id, 10); const type = str(body.type || r.type, 40);
    if (!/^[\w-]{1,10}$/.test(newId)) bad('Номер: только цифры и буквы, до 10 символов');
    if (!store.get('types', type)) bad('Нет такого типа номера');
    if (newId !== r.id && store.get('rooms', newId)) bad(`Номер ${newId} уже существует`);
    const doc = { ...r, id: newId, type, floor: Math.round(num(body.floor, r.floor)), note: str(body.note ?? r.note, 200) };
    if (newId !== r.id) store.del('rooms', r.id);
    store.put('rooms', newId, doc); log(`${user.username} изменил номер ${r.id}${newId !== r.id ? ' → ' + newId : ''}`, 'edit', user.username); roomsChanged(); emit(['log']); return { room: doc };
  });
  on('POST', '/admin/rooms', ({ body, user }) => {
    need(user, 'admin'); const id = str(body.id, 10), type = str(body.type, 40), floor = Math.round(num(body.floor, NaN));
    if (!/^[\w-]{1,10}$/.test(id) || !Number.isFinite(floor)) bad('Укажите номер и этаж'); if (store.get('rooms', id)) bad(`Номер ${id} уже есть`); if (!store.get('types', type)) bad('Выберите тип');
    const r = { id, floor, type, status: 'free', createdAt: Date.now() }; store.put('rooms', id, r); roomsChanged(); emit(['log']); log(`${user.username} добавил номер ${id}`, 'edit', user.username); return { room: r };
  });
  on('DELETE', '/admin/rooms/:id', ({ params, user }) => { need(user, 'admin'); if (!store.get('rooms', params.id)) throw new HttpError(404, 'Нет номера'); store.del('rooms', params.id); log(`${user.username} удалил номер ${params.id}`, 'edit', user.username); roomsChanged(); emit(['log']); return { ok: true }; });
  on('POST', '/admin/floors', ({ body, user }) => {
    need(user, 'admin'); const floor = Math.round(num(body.floor, NaN)), count = Math.min(40, Math.max(1, Math.round(num(body.count, 1)))), type = str(body.type, 40);
    if (!Number.isFinite(floor) || floor < -5 || floor > 300) bad('Укажите этаж'); if (!store.get('types', type)) bad('Выберите тип номеров');
    const start = Math.round(num(body.start, floor * 100 + 1)); const made = [];
    for (let i = 0; i < count; i++) { const id = String(start + i); if (store.get('rooms', id)) continue; store.put('rooms', id, { id, floor, type, status: 'free', createdAt: Date.now() }); made.push(id); }
    log(`${user.username} добавил ${made.length} номеров на ${floor} этаже`, 'edit', user.username); roomsChanged(); emit(['log']); return { made };
  });
  on('DELETE', '/admin/floors/:floor', ({ params, user }) => { need(user, 'admin'); const f = Math.round(num(params.floor, NaN)); const rs = store.all('rooms').filter(r => r.floor === f); rs.forEach(r => store.del('rooms', r.id)); log(`${user.username} удалил ${f} этаж (${rs.length} номеров)`, 'edit', user.username); roomsChanged(); emit(['log']); return { removed: rs.length }; });

  // брони
  on('POST', '/admin/bookings/:id/action', async ({ params, body, user }) => {
    need(user, 'mod'); const b = store.get('bookings', params.id); if (!b) throw new HttpError(404, 'Бронь не найдена');
    const act = str(body.act, 20), setRoom = (id, st, extra = {}) => { const r = store.get('rooms', id); if (!r) return; Object.assign(r, { status: st, updatedAt: Date.now() }, extra); if (st === 'free' || st === 'cleaning') Object.assign(r, { guest: null, discord: null, bookingId: null }); store.put('rooms', id, r); };
    if (act === 'confirm') { const room = str(body.room, 10); const r = store.get('rooms', room); if (!r || r.status !== 'free') bad('Выберите свободный номер'); if (b.room && b.room !== room) setRoom(b.room, 'free'); b.room = room; b.status = 'confirmed'; setRoom(room, 'booked', { guest: b.name, discord: b.discord, bookingId: b.id }); }
    else if (act === 'checkin') { if (!b.room) bad('Сначала назначьте номер'); b.status = 'checkedin'; setRoom(b.room, 'occupied', { guest: b.name, discord: b.discord, bookingId: b.id }); }
    else if (act === 'checkout') { b.status = 'done'; if (b.room) setRoom(b.room, 'cleaning'); }
    else if (act === 'cancel') { b.status = 'cancelled'; if (b.room) setRoom(b.room, 'free'); }
    else bad('Неизвестное действие');
    b.updatedAt = Date.now(); b.handledBy = user.username; store.put('bookings', b.id, b);
    log(`${user.username}: бронь ${b.code} → ${BOOKING_STATUS[b.status]}${b.room ? ', номер ' + b.room : ''}`, 'booking', user.username);
    emit(['bookings', 'log']); roomsChanged(); call('notify', 'booking_status', b); return { booking: b };
  });
  on('POST', '/admin/orders/:id/status', ({ params, body, user }) => { need(user, 'mod'); const o = store.get('orders', params.id); if (!o) throw new HttpError(404, 'Заказ не найден'); const st = str(body.status, 20); if (!ORDER_STATUS[st]) bad('Неверный статус'); o.status = st; o.updatedAt = Date.now(); store.put('orders', o.id, o); emit(['orders']); call('notify', 'order_status', o); return { order: o }; });
  on('POST', '/admin/tickets/:id/close', ({ params, user }) => { need(user, 'mod'); const t = store.get('tickets', params.id); if (!t) throw new HttpError(404, 'Нет обращения'); t.status = 'closed'; t.lastAt = Date.now(); store.put('tickets', t.id, t); log(`${user.username} закрыл обращение ${t.discord}`, 'ticket', user.username); emit(['tickets', 'log']); return { ticket: t }; });

  // события
  on('POST', '/admin/events/sync', async ({ user }) => { need(user, 'mod'); const r = await call('syncEvents'); emit(['events']); return { synced: r ?? 0, connected: !!hooks.syncEvents }; });

  // Discord
  const offline = 'Бот не подключён. Укажите DISCORD_BOT_TOKEN и GUILD_ID в .env';
  const link = v => { v = str(v, 400); return /^(https?:\/\/|\/?(uploads|img)\/)/.test(v) ? v : ''; };
  const cleanPost = b => {
    const p = { content: str(b.content, 2000), title: str(b.title, 256), url: /^https?:\/\//.test(b.url || '') ? str(b.url, 400) : '', description: str(b.description, 4000), color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#7A1E26', image: link(b.image), thumbnail: link(b.thumbnail), footer: str(b.footer, 200),
      fields: (Array.isArray(b.fields) ? b.fields : []).slice(0, 10).map(f => ({ name: str(f.name, 256), value: str(f.value, 1024), inline: !!f.inline })).filter(f => f.name && f.value),
      button: { label: str(b.button?.label, 80), url: /^https?:\/\//.test(b.button?.url || '') ? str(b.button.url, 400) : '' } };
    if (!p.content && !p.title && !p.description && !p.image && !p.fields.length) bad('Заполните текст или заголовок');
    if (p.button.label && !p.button.url) bad('Укажите адрес кнопки');
    return p;
  };
  on('GET', '/admin/discord/meta', async ({ user }) => { need(user, 'mod'); return (await call('guildMeta')) || { channels: [], roles: [] }; });
  // новый пост или правка уже отправленного: тот же канал и тот же отправитель
  on('POST', '/admin/discord/send', async ({ body, user }) => {
    need(user, 'mod'); if (!hooks.sendPost) bad(offline);
    const post = cleanPost(body.post || {}), prev = body.id ? store.get('posts', str(body.id, 60)) : null;
    const sender = store.get('senders', prev?.sender || str(body.sender, 60)) || senders()[0], channel = prev?.channel || str(body.channel, 30);
    if (!/^\d+$/.test(channel)) bad('Выберите канал');
    let r; try { r = await hooks.sendPost({ channel, sender, post, messageId: prev?.messageId }); } catch (e) { bad('Discord не принял сообщение: ' + e.message); }
    const doc = { id: prev?.id || uid('p'), channel, channelName: r.channelName, sender: sender.id, senderName: sender.name, messageId: r.messageId, post, by: user.username, at: prev?.at || Date.now(), editedAt: prev ? Date.now() : null };
    store.put('posts', doc.id, doc); store.all('posts').sort((a, b) => b.at - a.at).slice(100).forEach(p => store.del('posts', p.id));
    log(`${user.username} ${prev ? 'изменил пост' : 'отправил пост'} в ${r.channelName}: ${post.title || post.content.slice(0, 40) || 'без заголовка'}`, 'discord', user.username); emit(['log']);
    return { doc };
  });
  const roleList = l => (Array.isArray(l) ? l : []).map(x => str(x, 30)).filter(x => /^\d+$/.test(x)).slice(0, 20);
  on('POST', '/admin/discord/access', async ({ body, user }) => {
    need(user, 'admin');
    store.put('settings', 'main', { ...settings(), adminRoles: roleList(body.admin), directorRoles: roleList(body.director), modRoles: roleList(body.mod), announceChannel: /^\d+$/.test(body.announceChannel || '') ? str(body.announceChannel, 30) : '' });
    log(`${user.username} изменил доступ к панели и канал анонсов`, 'discord', user.username);
    await call('setupGuild'); emit(['settings', 'log']); return { ok: true };
  });
  on('POST', '/admin/discord/cleanup-plan', async ({ user }) => { need(user, 'admin'); const r = await call('planCleanup'); if (!r) bad(offline); return r; });
  on('POST', '/admin/discord/cleanup', async ({ user }) => { need(user, 'admin'); const r = await call('cleanupGuild'); if (!r) bad(offline); log(`${user.username} убрал лишнее с Discord-сервера: каналов ${r.channels}, категорий ${r.categories}, ролей ${r.roles}`, 'discord', user.username); emit(['settings', 'log']); return r; });
  on('POST', '/admin/discord/plan', async ({ user }) => { need(user, 'admin'); const r = await call('planGuild'); if (!r) bad(offline); return r; });
  on('POST', '/admin/discord/setup', async ({ user }) => { need(user, 'admin'); const r = await call('setupGuild'); if (!r) bad(offline); log(`${user.username} развернул структуру Discord-сервера`, 'discord', user.username); emit(['settings', 'log']); return r; });

  // сброс
  on('POST', '/admin/reset', ({ body, user }) => {
    need(user, 'admin'); if (body.confirm !== 'СБРОСИТЬ') bad('Введите СБРОСИТЬ для подтверждения');
    const scope = Array.isArray(body.scope) ? body.scope : [];
    const done = [];
    if (scope.includes('rooms')) { store.all('rooms').forEach(r => store.put('rooms', r.id, { id: r.id, floor: r.floor, type: r.type, status: 'free', createdAt: r.createdAt })); done.push('статусы номеров'); }
    for (const [k, n] of [['bookings', 'брони'], ['orders', 'заказы'], ['tickets', 'обращения'], ['log', 'журнал действий']]) if (scope.includes(k)) { store.clear(k); done.push(n); }
    if (!done.length) bad('Выберите, что сбросить');
    log(`${user.username} сбросил: ${done.join(', ')}`, 'danger', user.username); roomsChanged(); emit(['bookings', 'orders', 'tickets', 'log']); return { done };
  });

  function clean(col, b) {
    const o = {};
    const pick = (k, f) => { if (k in b) o[k] = f(b[k]); };
    const S = n => v => str(v, n), N = v => num(v), B = v => !!v, A = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => str(x, 40)).filter(Boolean).slice(0, 12);
    if (col === 'types') { pick('name', S(40)); pick('price', N); pick('desc', S(400)); pick('image', S(400)); pick('capacity', N); pick('order', N); pick('features', A); }
    if (col === 'venues') { pick('name', S(40)); pick('kind', S(20)); pick('floor', S(20)); pick('desc', S(500)); pick('image', S(400)); pick('order', N); pick('keywords', S(200)); pick('comingSoon', B); pick('accent', S(10)); if ('schedule' in b) o.schedule = (Array.isArray(b.schedule) ? b.schedule : []).slice(0, 8).map(s => ({ from: str(s.from, 5), to: str(s.to, 5), label: str(s.label, 80), state: ['live', 'open', 'calm', 'closed'].includes(s.state) ? s.state : 'open' })); }
    if (col === 'menu') { pick('cat', S(30)); pick('name', S(60)); pick('desc', S(200)); pick('price', N); pick('order', N); pick('image', S(400)); }
    if (col === 'cigars') { pick('name', S(40)); pick('origin', S(40)); pick('shape', v => CIGAR_SHAPES[v] ? v : 'robusto'); pick('length', N); pick('ring', N); pick('wrapper', S(9)); pick('band', S(9)); pick('band2', S(9)); pick('bandStyle', v => ['classic', 'medallion', 'double', 'foot', 'stripe'].includes(v) ? v : 'classic'); pick('bandText', S(14)); pick('bandText2', S(14)); pick('strength', v => Math.min(5, Math.max(1, Math.round(num(v, 3))))); pick('notes', A); pick('price', N); pick('order', N); pick('desc', S(400)); }
    if (col === 'team') { pick('name', S(60)); pick('position', S(60)); pick('dept', S(40)); pick('photo', S(400)); pick('bio', S(600)); pick('since', S(40)); pick('discord', S(40)); pick('quote', S(160)); pick('order', N); pick('hidden', B); pick('example', B); }
    if (col === 'offers') { pick('title', S(80)); pick('tag', S(30)); pick('desc', S(400)); pick('price', S(40)); pick('image', S(400)); pick('order', N); pick('active', B); pick('cta', S(30)); pick('link', S(120)); }
    if (col === 'faq') { pick('q', S(160)); pick('a', S(800)); pick('order', N); }
    if (col === 'depts') { pick('name', S(40)); pick('color', S(9)); pick('accent', S(9)); pick('desc', S(400)); pick('order', N); pick('gender', v => v === 'female' ? 'female' : 'male'); pick('duties', S(400)); pick('model', S(400)); pick('shirt', S(9)); if ('items' in b) o.items = (Array.isArray(b.items) ? b.items : []).slice(0, 8).map(it => ({ name: str(it.name, 40), kind: ['jacket', 'shirt', 'pants', 'tie', 'apron', 'vest', 'hat', 'shoes'].includes(it.kind) ? it.kind : 'jacket', color: str(it.color, 9), accent: str(it.accent, 9), frames: (Array.isArray(it.frames) ? it.frames : []).slice(0, 72).map(u => str(u, 400)) })); }
    if (col === 'media') { pick('url', S(2_000_000)); pick('name', S(80)); }
    if (col === 'issues') { pick('title', S(80)); pick('desc', S(600)); pick('publisher', S(60)); pick('number', S(20)); pick('cover', S(400)); pick('date', N); pick('published', B); pick('accent', S(9)); if ('pages' in b) o.pages = (Array.isArray(b.pages) ? b.pages : []).slice(0, 80).map(p => ({ kind: ['text', 'image', 'quote'].includes(p.kind) ? p.kind : 'text', title: str(p.title, 100), text: str(p.text, 3000), image: str(p.image, 400), cat: str(p.cat, 30) })); }
    if (col === 'events') { pick('name', S(100)); pick('desc', S(1000)); pick('start', N); pick('end', N); pick('location', S(100)); pick('venueId', S(40)); pick('image', S(400)); pick('status', v => ['scheduled', 'active', 'completed', 'cancelled'].includes(v) ? v : 'scheduled'); if (!('source' in o)) o.source = 'manual'; }
    if (col === 'senders') { pick('name', S(80)); pick('avatar', S(400)); pick('order', N); }
    if (col === 'settings') { for (const k of ['hotelName', 'tagline', 'heroDay', 'heroNight', 'discordInvite', 'address', 'footer']) pick(k, S(400)); pick('dayStart', N); pick('nightStart', N); pick('weather', v => ['auto', 'clear', 'rain', 'fog', 'snow'].includes(v) ? v : 'auto'); pick('theme', v => v === 'newyear' ? 'newyear' : 'none'); if (b.channels && typeof b.channels === 'object') o.channels = Object.fromEntries(Object.entries(b.channels).slice(0, 80).map(([k, v]) => [str(k, 30), str(v, 30)])); if (b.roles && typeof b.roles === 'object') o.roles = Object.fromEntries(Object.entries(b.roles).slice(0, 10).map(([k, v]) => [str(k, 30), str(v, 200)])); }
    return o;
  }
  const label = c => ({ types: 'тип номера', venues: 'площадку', menu: 'блюдо', cigars: 'сигару', depts: 'отдел', team: 'анкету', offers: 'предложение', faq: 'вопрос', settings: 'настройки', media: 'медиа', issues: 'выпуск журнала', events: 'событие', senders: 'отправителя' }[c] || c);

  async function handle(method, path, ctx = {}) {
    for (const r of routes) {
      if (r.method !== method) continue; const m = path.match(r.re); if (!m) continue;
      return await r.fn({ params: m.groups || {}, body: ctx.body || {}, user: ctx.user || null, guestKey: ctx.guestKey || null });
    }
    throw new HttpError(404, 'Не найдено');
  }
  // для бота: событие Discord → площадка по ключевым словам
  function matchVenue(text) { const t = String(text || '').toLowerCase(); return store.all('venues').find(v => [v.name, ...(String(v.keywords || '').split(','))].map(x => x.trim().toLowerCase()).filter(Boolean).some(k => t.includes(k)))?.id || null; }
  function upsertEvent(e) { const prev = store.get('events', e.id) || {}; const doc = { ...prev, ...e, venueId: e.venueId ?? matchVenue(`${e.location} ${e.name}`), source: 'discord', updatedAt: Date.now() }; store.put('events', doc.id, doc); emit(['events']); return doc; }
  function removeEvent(id) { store.del('events', id); emit(['events']); }

  return { handle, publicData, freeSummary, upsertEvent, removeEvent, matchVenue, settings, log, store };
}

/* ---------- стартовые данные ---------- */
// v2: анкеты, предложения, вопросы. Досеиваются и в уже работающую базу один раз.
function seedV2(store) {
  if (store.get('meta', 'v2')) return; const put = (c, d) => store.put(c, d.id, d);
  // анкеты: примеры, замените в панели («Анкеты сотрудников»)
  [['Имя Фамилия', 'Управляющий отелем', 'd8', 'Отвечает за всё, что происходит выше 20-го этажа. Пишите по любым вопросам брони и мероприятий.'],
   ['Имя Фамилия', 'Старший администратор ресепшена', 'd1', 'Встречает гостей, выдаёт ключи и знает, какой номер свободен прямо сейчас.'],
   ['Имя Фамилия', 'Шеф Le Ciel', 'd2', 'Французская кухня, дегустационные сеты и завтраки в номер.'],
   ['Имя Фамилия', 'Хьюмидор-мастер', 'd7', 'Подберёт сигару под напиток и настроение.']]
    .forEach(([name, position, dept, bio], i) => put('team', { id: 't' + (i + 1), name, position, dept, bio, since: '', discord: '', photo: '', quote: '', order: i, example: true }));
  [['Ночь над городом', 'Пакет', 'Номер Deluxe, бутылка шампанского и поздний выезд до 16:00.', 'от $2 400'],
   ['Ужин в Le Ciel', 'Ресторан', 'Сет из пяти блюд от шефа для двоих и столик у окна.', '$680'],
   ['Вечер в хьюмидоре', 'Сигарный клуб', 'Три сигары дома отеля, коньяк и место в клубе на весь вечер.', '$420']]
    .forEach(([title, tag, desc, price], i) => put('offers', { id: 'o' + (i + 1), title, tag, desc, price, image: '', order: i, active: true, cta: 'Забронировать', link: '#stay' }));
  [['Как забронировать номер?', 'Выберите номер в разделе «Номера» и оставьте заявку. Управляющий подтвердит бронь, а бот напишет вам в Discord.'],
   ['Нужно ли быть на Discord-сервере?', 'Для брони и заявок желательно: так бот сможет открыть вам тикет. Если вас нет на сервере, ответим в чате прямо на сайте.'],
   ['Во сколько заезд и выезд?', 'Заезд с 14:00, выезд до 12:00. Поздний выезд можно попросить в заявке.'],
   ['Как заказать еду в номер?', 'В разделе Le Ciel добавьте блюда в корзину и укажите номер. Заказ сразу увидит персонал.'],
   ['Когда работают бассейны?', 'Sky Pool днём с диджеем до 18:00, Night Pool до 04:00. Актуальный статус на главной и в разделе «Отдых».']]
    .forEach(([q, a], i) => put('faq', { id: 'q' + (i + 1), q, a, order: i }));
  store.put('meta', 'v2', { id: 'v2', at: Date.now() });
}
export function seed(store) {
  if (store.get('settings', 'main')) { seedV2(store); return false; }
  const put = (c, d) => store.put(c, d.id, d);
  put('settings', { id: 'main', hotelName: 'Mile High Club', tagline: 'Отель над Лос-Сантосом', heroDay: 'img/atrium-day.webp', heroNight: 'img/atrium-night.webp', discordInvite: 'https://discord.gg/G45rJ9qVY', dayStart: 6, nightStart: 18, address: 'Вайнвуд, 20–40 этажи', footer: 'Mile High Club, Лос-Сантос', channels: {}, roles: { admin: 'Администратор', mod: 'Модератор' } });
  const types = [
    ['std', 'Стандарт', 2500, 'Кровать king size, ванна у окна, стол с видом на Вайнвуд.', 2, ['Вид на город', 'Ванна у окна']],
    ['dlx', 'Делюкс', 4000, 'Панорама на две стороны, мини-бар и гардеробная.', 2, ['Панорама', 'Мини-бар']],
    ['jr', 'Джуниор-сюит', 7500, 'Гостиная и спальня, глубокая ванна, закат над океаном.', 3, ['Гостиная', 'Вид на океан']],
    ['ste', 'Сюит', 12000, 'Угловой сюит с террасой и баром на шесть гостей.', 6, ['Терраса', 'Бар']],
    ['ph', 'Пентхаус', 30000, 'Весь верхний этаж, обеденный стол на восемь и отдельный лифт.', 8, ['Отдельный лифт', 'Кинозал']]];
  types.forEach(([id, name, price, desc, capacity, features], i) => put('types', { id, name, price, desc, capacity, features, image: '', order: i }));
  const plan = [[20, 'std', 8], [21, 'std', 8], [22, 'dlx', 6], [23, 'dlx', 6], [24, 'jr', 4], [25, 'ste', 3], [26, 'ph', 1]];
  plan.forEach(([f, t, n]) => { for (let i = 1; i <= n; i++) { const id = String(f * 100 + i); put('rooms', { id, floor: f, type: t, status: 'free', createdAt: Date.now() }); } });
  put('venues', { id: 'sky', name: 'Sky Pool', kind: 'pool', floor: '38 этаж', order: 0, accent: '#F7B50A', keywords: 'sky pool, дневной бассейн, скай', desc: 'Открытая терраса, шезлонги и бар с лимонадами. Днём играет диджей.', image: '', schedule: [{ from: '10:00', to: '18:00', label: 'Диджей-сеты, бар у воды', state: 'live' }, { from: '18:00', to: '22:00', label: 'Тихий режим', state: 'calm' }, { from: '22:00', to: '10:00', label: 'Закрыто', state: 'closed' }] });
  put('venues', { id: 'night', name: 'Night Pool', kind: 'pool', floor: '40 этаж', order: 1, accent: '#F0177A', keywords: 'night pool, найтпул, ночной бассейн', desc: 'Неоновая подсветка воды и резиденты The Hot Times за пультом.', image: '', schedule: [{ from: '20:00', to: '22:00', label: 'Разогрев, лаунж', state: 'open' }, { from: '22:00', to: '04:00', label: 'Вечеринка', state: 'live' }, { from: '04:00', to: '20:00', label: 'Закрыто', state: 'closed' }] });
  put('venues', { id: 'hot', name: 'The Hot Times', kind: 'bar', floor: 'Атриум', order: 2, accent: '#FF7A3D', keywords: 'hot times, бар, атриум', desc: 'Лаунж-бар в атриуме под неоновой вывеской.', image: 'img/atrium-night.webp', schedule: [{ from: '18:00', to: '04:00', label: 'Бар открыт', state: 'open' }, { from: '04:00', to: '18:00', label: 'Закрыто', state: 'closed' }] });
  put('venues', { id: 'ciel', name: 'Le Ciel', kind: 'restaurant', floor: '30 этаж', order: 3, accent: '#F7B50A', keywords: 'le ciel, ресторан', desc: 'Французская кухня и доставка в номер.', image: '', schedule: [{ from: '12:00', to: '01:00', label: 'Кухня работает', state: 'open' }, { from: '01:00', to: '12:00', label: 'Только доставка в номер', state: 'calm' }] });
  put('venues', { id: 'cigar', name: 'Сигарный клуб', kind: 'club', floor: '31 этаж', order: 4, accent: '#C9A24A', keywords: 'сигар, cigar, хьюмидор', desc: 'Двенадцать кресел, кожаная стена и правило про телефоны.', image: '', schedule: [{ from: '19:00', to: '03:00', label: 'Клуб открыт', state: 'open' }, { from: '03:00', to: '19:00', label: 'Закрыто', state: 'closed' }] });
  put('venues', { id: 'spa', name: 'Спа', kind: 'spa', floor: '35 этаж', order: 5, accent: '#F4D9A0', keywords: 'спа, spa, хаммам', desc: 'Хаммам, массаж и солевой бассейн. Открытие скоро, следите за анонсами.', image: '', comingSoon: true, schedule: [] });
  const menu = [
    ['Закуски', 'Устрицы Жиллардо', 'Шесть штук, лимон, соус миньонет', 180], ['Закуски', 'Фуа-гра', 'Инжирный конфитюр, бриошь', 220], ['Закуски', 'Тартар из говядины', 'Каперсы, желток, картофель пай', 160], ['Закуски', 'Луковый суп', 'Сыр грюйер, гренки', 90],
    ['Основные', 'Утиная ножка конфи', 'Картофель сарладез, вишнёвый соус', 260], ['Основные', 'Буйабес', 'Марсельская уха, руй, багет', 320], ['Основные', 'Турнедо Россини', 'Говяжья вырезка, фуа-гра, трюфель', 420], ['Основные', 'Морской гребешок', 'Пюре из топинамбура, бёр-блан', 340],
    ['Десерты', 'Крем-брюле', 'Ваниль Таити', 80], ['Десерты', 'Тарт Татен', 'Карамелизованные яблоки, крем фреш', 90], ['Десерты', 'Суфле Гран Марнье', 'Крем англез', 110],
    ['Напитки', 'Шампанское брют', 'Бутылка, 0,75 л', 600], ['Напитки', 'Бордо, красное', 'Бутылка, 0,75 л', 380], ['Напитки', 'Шабли', 'Бокал', 70], ['Напитки', 'Кофе и пти-фур', 'Эспрессо, макарон, мадлен', 40]];
  menu.forEach(([cat, name, desc, price], i) => put('menu', { id: 'm' + (i + 1), cat, name, desc, price, order: i, image: '' }));
  const cig = [
    ['Habano Robusto', 'Куба', 'robusto', 124, 50, '#6a3f22', '#7a1f2e', '#1a1a1a', 'medallion', 'Habano', '', 3, ['кедр', 'какао', 'кожа'], 120],
    ['Churchill Reserva', 'Доминикана', 'churchill', 178, 47, '#9a6a3e', '#f0e6c8', '#7a1f2e', 'classic', 'Reserva', '', 3, ['сливки', 'орех', 'мёд'], 150],
    ['Maduro 1935', 'Никарагуа', 'robusto', 152, 52, '#3a2213', '#2a1a12', '#5a3a1c', 'double', 'Maduro', '1935', 5, ['эспрессо', 'чёрный перец'], 140],
    ['Petit Corona', 'Куба', 'corona', 129, 42, '#8a5a33', '#c9302c', '#f0e6c8', 'stripe', 'PC', '', 2, ['сено', 'мёд'], 90],
    ['Torpedo Altitude', 'Никарагуа', 'torpedo', 156, 52, '#4a2a17', '#1a1a1a', '#f0177a', 'medallion', 'Altitude', '', 4, ['тёмный шоколад', 'изюм'], 200],
    ['Lancero Mile High', 'Доминикана', 'lancero', 192, 38, '#7a4a28', '#f0177a', '#1a1a1a', 'foot', 'MHC', 'Mile High', 3, ['специи', 'кедр'], 180],
    ['Connecticut Corona', 'Гондурас', 'corona', 142, 42, '#b98a57', '#f0e6c8', '#c9a24a', 'classic', 'Conn.', '', 1, ['ваниль', 'сливки'], 80],
    ['Belicoso Noche', 'Никарагуа', 'belicoso', 140, 52, '#55301a', '#3a0f1f', '#f0177a', 'double', 'Noche', 'Night', 4, ['вишня', 'какао'], 160],
    ['Perfecto Dorado', 'Куба', 'perfecto', 150, 54, '#6d4626', '#b8860b', '#1a1a1a', 'stripe', 'D', '', 4, ['кожа', 'земля', 'табак'], 260]];
  cig.forEach(([name, origin, shape, length, ring, wrapper, band, band2, bandStyle, bandText, bandText2, strength, notes, price], i) => put('cigars', { id: 'c' + (i + 1), name, origin, shape, length, ring, wrapper, band, band2, bandStyle, bandText, bandText2, strength, notes, price, order: i, desc: '' }));
  const depts = [
    ['Ресепшен', '#15191c', '#C9A24A', 'Чёрный двубортный жакет с золотыми лацканами, кремовая рубашка, золотой галстук.', 'female'],
    ['Ресторан Le Ciel', '#F4F0E6', '#7A1F2E', 'Белый китель и бордовый фартук. Кухня работает в колпаках.', 'male'],
    ['Бар The Hot Times', '#0d0d10', '#F0177A', 'Чёрная рубашка и брюки, неоново-розовый галстук.', 'male'],
    ['Бассейны', '#F2EEE6', '#F7B50A', 'Бирюзовое поло, светлые шорты, жёлтая кепка спасателя.', 'female'],
    ['Хаускипинг', '#4F6B63', '#E9E4D8', 'Серо-зелёный костюм и белый фартук с карманами.', 'female'],
    ['Охрана', '#121A2B', '#0a0a0a', 'Тёмно-синий костюм, чёрный галстук, гарнитура.', 'male'],
    ['Сигарный клуб', '#4A2A17', '#C9A24A', 'Коричневый жилет, кремовая рубашка, золотая заколка.', 'male'],
    ['Управляющие', '#521827', '#F7B50A', 'Бордовая тройка с золотым галстуком.', 'male']];
  depts.forEach(([name, color, accent, desc, gender], i) => put('depts', { id: 'd' + (i + 1), name, color, accent, desc, gender, order: i }));
  seedV2(store);
  const day = 864e5, base = Date.now();
  put('issues', { id: 'i1', title: 'Высота', number: '№ 01', publisher: 'Mile High Media', desc: 'Первый выпуск: ночь в атриуме, бархат и неон, хьюмидор и кухня Le Ciel. Тестовый выпуск, страницы меняются в панели.', date: base - 2 * day, published: true, accent: '#F0177A', cover: 'img/journal/p1.webp',
    pages: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ kind: 'image', image: `img/journal/p${n}.webp`, title: '', text: '' })) });
  put('events', { id: 'e-demo1', name: 'Neon Night: открытие сезона', desc: 'Резиденты The Hot Times, неоновая вода и шампанское до утра.', start: base + 2 * 3600e3, end: base + 7 * 3600e3, location: 'Night Pool, 40 этаж', venueId: 'night', image: '', status: 'scheduled', source: 'manual' });
  put('events', { id: 'e-demo2', name: 'Дегустация сигар', desc: 'Три сигары дома отеля и коньяк. Двенадцать мест.', start: base + day + 3600e3 * 3, end: base + day + 3600e3 * 6, location: 'Сигарный клуб', venueId: 'cigar', image: '', status: 'scheduled', source: 'manual' });
  return true;
}
