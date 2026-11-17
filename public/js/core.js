// Общая бизнес-логика сайта. Работает и на сервере (Node + SQLite), и в браузере (демо-режим).
// store: { all(col), get(col,id), put(col,id,doc), del(col,id), clear(col) } — синхронный.
// hooks: необязательные интеграции с Discord (на сервере их даёт бот).

export const ROLES = { guest: 0, mod: 1, admin: 2 };
// Время отеля единое (UTC+3), у любого гостя в любой стране.
export const MSK_OFFSET = 3 * 3600e3;
export const mskDate = (t = Date.now()) => new Date(t + MSK_OFFSET);
export const mskMinutes = (t = Date.now()) => { const d = mskDate(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
// Погода над отелем. «Авто» меняется каждые 3 часа по времени отеля и одинакова у всех гостей:
// ясно, дождь или туман. Снег идёт только в новогодней теме и никогда сам по себе.
export const WEATHER = { clear: 'Ясно', rain: 'Дождь', fog: 'Туман', snow: 'Снег' };
export function weatherNow(s = {}, t = Date.now()) {
  const d = mskDate(t), mon = d.getUTCMonth(), winter = mon >= 10 || mon <= 2, h = d.getUTCHours();
  let kind = s.weather && s.weather !== 'auto' ? s.weather : null;
  if (kind === 'snow') kind = null;
  if (s.theme === 'newyear') kind = 'snow';
  if (!kind) {
    const block = Math.floor((t + MSK_OFFSET) / (3 * 3600e3)); let x = (block * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; const r = (x % 1000) / 1000;
    kind = winter ? (r < .5 ? 'clear' : r < .78 ? 'fog' : 'rain') : (r < .55 ? 'clear' : r < .78 ? 'rain' : 'fog');
  }
  const base = [-6, -5, 0, 8, 15, 20, 23, 21, 15, 8, 1, -4][mon], daily = Math.round(Math.sin((h - 9) / 24 * Math.PI * 2) * 3);
  const temp = kind === 'snow' ? Math.min(-1, base + daily) : kind === 'rain' ? Math.max(2, base + daily - 2) : base + daily;
  return { kind, label: WEATHER[kind], temp, newyear: s.theme === 'newyear' };
}
export const ROOM_STATUS = { free: 'Свободен', booked: 'Забронирован', occupied: 'Заселён', cleaning: 'Уборка', repair: 'Ремонт' };
export const BOOKING_STATUS = { new: 'Новая', confirmed: 'Подтверждена', checkedin: 'Заселён', done: 'Завершена', cancelled: 'Отменена' };
export const ORDER_STATUS = { new: 'Новый', cooking: 'Готовится', delivering: 'Несём в номер', done: 'Доставлен', cancelled: 'Отменён' };
export const TICKET_STATUS = { checking: 'Проверка', opening: 'Открывается', open: 'Открыто', closed: 'Закрыто' };
export const CIGAR_SHAPES = { robusto: 'Робусто', corona: 'Корона', churchill: 'Черчилль', torpedo: 'Торпедо', belicoso: 'Беликозо', lancero: 'Лансеро', perfecto: 'Перфекто' };

// Что может редактировать каждая роль через общий редактор
const EDITABLE = {
  jobs: 'admin', types: 'admin', venues: 'admin', menu: 'admin', cigars: 'admin', depts: 'admin', team: 'admin', offers: 'admin', faq: 'admin', settings: 'admin', media: 'mod',
  issues: 'mod', events: 'mod', senders: 'admin'
};
// Отправители постов в Discord: имя и аватарка вебхука
const DEFAULT_SENDERS = [['concierge', '🛎️ Консьерж MHC', '#F7B50A'], ['reception', '🔑 Ресепшен MHC', '#F0177A'], ['manager', '🥂 Управляющий MHC', '#EF5617'], ['journal', '📰 Журнал «Высота»', '#F4D9A0']].map(([id, name, color], order) => ({ id, name, color, avatar: `img/discord/${id}.png`, order }));
const PUBLIC_SETTINGS = ['tiers', 'deckTracks', 'weather', 'theme', 'hotelName', 'tagline', 'heroDay', 'heroNight', 'discordInvite', 'dayStart', 'nightStart', 'address', 'footer'];

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = m => { throw new HttpError(400, m); };
// неизвестная роль в требовании — это ошибка в коде, а не «можно всем»
const need = (user, role) => { if (!Object.hasOwn(ROLES, role)) throw new HttpError(403, 'Недостаточно прав'); if (!user || (ROLES[user.role] ?? 0) < ROLES[role]) throw new HttpError(user ? 403 : 401, user ? 'Недостаточно прав' : 'Нужен вход через Discord'); };
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const code = () => 'MHC-' + Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');

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

export const DEFAULT_TIERS = [{ name: 'Silver', nights: 5, discount: 0, perk: '' }, { name: 'Gold', nights: 15, discount: 0, perk: '' }, { name: 'VIP', nights: 30, discount: 0, perk: '' }];
const ACH_ID = /^[a-z0-9_-]{2,24}$/;
// защита от спама: сколько одновременно может быть у одного гостя
export const LIMITS = { bookings: 3, orders: 2, tickets: 3 };

export function createCore(store, hooks = {}) {
  const emit = cols => hooks.changed?.(cols); // бот подключается позже и оборачивает hooks.changed
  // журнал подрезается не на каждой записи, а раз в 25: сортировка всего журнала — лишняя работа
  let logN = 0;
  const log = (text, kind = 'info', by) => { const id = uid('l'); store.put('log', id, { id, text, kind, by: by || null, at: Date.now() }); if (++logN % 25 === 1) trimLog(); };
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
  // отзывы: на сайте только одобренные персоналом; рейтинг — по ним же
  function reviewsPublic() {
    const ok = store.all('reviews').filter(r => r.status === 'approved').sort((a, b) => b.createdAt - a.createdAt);
    return { avg: ok.length ? Math.round(ok.reduce((n, r) => n + r.stars, 0) / ok.length * 10) / 10 : 0, count: ok.length, list: ok.slice(0, 12).map(r => ({ id: r.id, name: r.name, typeName: r.typeName, stars: r.stars, text: r.text, reply: r.reply || '', createdAt: r.createdAt })) };
  }
  // кабинет гостя: профиль хранится по владельцу (Discord-аккаунт или ключ устройства)
  const profileOf = owner => (owner && store.get('profiles', owner)) || null;
  const tiers = () => { const t = settings().tiers; return (Array.isArray(t) && t.length ? t : DEFAULT_TIERS).slice().sort((a, b) => a.nights - b.nights); };
  // статус гостя: по завершённым проживаниям; любимый тип и номер — по всем броням, кроме отменённых
  function guestStats(owner) {
    const all = owner ? store.all('bookings').filter(b => b.owner === owner) : [];
    const done = all.filter(b => b.status === 'done'), nights = done.reduce((n, b) => n + (b.nights || 0), 0);
    const top = list => { const c = {}; list.filter(Boolean).forEach(x => c[x] = (c[x] || 0) + 1); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
    const live = all.filter(b => b.status !== 'cancelled'), T = tiers();
    const tier = [...T].reverse().find(t => nights >= t.nights) || null, next = T.find(t => nights < t.nights) || null;
    return { nights, stays: done.length, favType: top(live.map(b => b.typeName)), favRoom: top(live.map(b => b.room)), tier, next };
  }
  function notice(owner, kind, text, link = '#me') {
    if (!owner) return;
    const id = uid('n'); store.put('notices', id, { id, owner, kind, text: str(text, 300), link, at: Date.now(), read: false });
    store.all('notices').filter(n => n.owner === owner).sort((a, b) => b.at - a.at).slice(40).forEach(n => store.del('notices', n.id));
  }
  const ruDay = d => { try { return new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch { return d; } };
  // уведомление гостю идёт вместе с карточкой персоналу; quiet — гость отключил личные сообщения в профиле
  const discordIdOf = d => d.discordId || (String(d.owner || '').startsWith('d:') ? d.owner.slice(2) : null);
  const notifyGuest = (kind, d) => call('notify', kind, { ...d, discordId: discordIdOf(d), quiet: profileOf(d.owner)?.dm === false });

  function publicData() {
    const s = settings(), pub = {};
    PUBLIC_SETTINGS.forEach(k => pub[k] = s[k]);
    pub.tiers = tiers();
    const now = Date.now();
    return {
      settings: pub,
      types: sort(store.all('types')),
      rooms: roomsSorted().map(r => ({ id: r.id, floor: r.floor, type: r.type, status: r.status })),
      venues: sort(store.all('venues')).filter(v => !v.staffOnly),
      menu: sort(store.all('menu')),
      cigars: sort(store.all('cigars')),
      depts: sort(store.all('depts')),
      team: sort(store.all('team')).filter(t => !t.hidden),
      offers: sort(store.all('offers')).filter(o => o.active !== false),
      faq: sort(store.all('faq')),
      issues: store.all('issues').filter(i => i.published).sort((a, b) => (b.date || 0) - (a.date || 0)),
      events: store.all('events').filter(e => !['cancelled', 'completed'].includes(e.status) && (e.end || e.start + 3 * 3600e3) > now - 3600e3).sort((a, b) => a.start - b.start).slice(0, 30),
      jobs: sort(store.all('jobs')).filter(j => j.open !== false),
      reviews: reviewsPublic(),
      media: store.all('media').map(m => ({ id: m.id, url: m.url })),
      guests: hooks.guests?.() || null, // гостей в отеле сейчас (онлайн сервера) и в гостевой книге (участники)
      now
    };
  }

  const routes = [], closing = new Set();
  const on = (method, pattern, fn) => routes.push({ method, generic: pattern.includes(':col'), re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

  /* ---------- публичное ---------- */
  on('GET', '/public', () => publicData());
  on('GET', '/me', ({ user }) => ({ user: user || null }));
  on('GET', '/me/items', ({ user, guestKey }) => {
    const o = ownerOf(user, guestKey); if (!o) return { bookings: [], tickets: [], orders: [], profile: null, stats: guestStats(null), reviews: [], notices: [] };
    const mine = c => store.all(c).filter(d => d.owner === o).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
    return { bookings: mine('bookings'), tickets: mine('tickets').map(t => ({ ...t, messages: t.mode === 'site' ? t.messages : [] })), orders: mine('orders'), profile: profileOf(o), stats: guestStats(o), notices: store.all('notices').filter(n => n.owner === o).sort((a, b) => b.at - a.at).slice(0, 30).map(({ owner, ...n }) => n), reviews: store.all('reviews').filter(r => r.owner === o).map(({ owner, ...r }) => r) };
  });
  // после входа брони, заказы, обращения и профиль с этого устройства переходят в аккаунт
  on('POST', '/me/claim', ({ user, guestKey }) => {
    if (!user || !guestKey) return { moved: 0 };
    const from = ownerOf(null, guestKey), to = ownerOf(user); let moved = 0;
    for (const c of ['bookings', 'orders', 'tickets']) store.all(c).filter(d => d.owner === from).forEach(d => { store.put(c, d.id, { ...d, owner: to, discordId: d.discordId || user.id }); moved++; });
    store.all('reviews').filter(r => r.owner === from).forEach(r => store.put('reviews', r.id, { ...r, owner: to }));
    store.all('notices').filter(n => n.owner === from).forEach(n => store.put('notices', n.id, { ...n, owner: to }));
    const gp = profileOf(from);
    if (gp) { const up = profileOf(to) || { id: to }; store.put('profiles', to, { ...gp, ...Object.fromEntries(Object.entries(up).filter(([, v]) => v !== '' && v != null)), lifex: up.lifex || gp.lifex, id: to, achievements: [...new Set([...(gp.achievements || []), ...(up.achievements || [])])].slice(0, 40), updatedAt: Date.now() }); store.del('profiles', from); }
    if (moved) emit(['bookings', 'orders', 'tickets']);
    return { moved };
  });
  on('PUT', '/me/profile', ({ body, user, guestKey }) => {
    const o = ownerOf(user, guestKey); if (!o) bad('Профиль недоступен');
    const prev = profileOf(o) || { id: o, achievements: [] };
    const doc = { ...prev, id: o, name: str(body.name ?? prev.name, 60), phone: str(body.phone ?? prev.phone, 20), note: str(body.note ?? prev.note, 300), dm: body.dm === undefined ? prev.dm !== false : !!body.dm, updatedAt: Date.now() };
    store.put('profiles', o, doc); return { profile: doc };
  });
  on('POST', '/me/notices/read', ({ user, guestKey }) => {
    const o = ownerOf(user, guestKey); let n = 0;
    store.all('notices').filter(x => x.owner === o && !x.read).forEach(x => { store.put('notices', x.id, { ...x, read: true }); n++; });
    return { read: n };
  });
  // «Секреты отеля» вошедшего гостя хранятся в аккаунте и не теряются при смене устройства
  on('POST', '/me/achievements', ({ body, user }) => {
    if (!user) return { achievements: [] };
    const o = ownerOf(user), prev = profileOf(o) || { id: o, dm: true };
    const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, 60).filter(x => typeof x === 'string' && ACH_ID.test(x));
    const achievements = [...new Set([...(prev.achievements || []), ...ids])].slice(0, 40);
    if (achievements.length !== (prev.achievements || []).length) store.put('profiles', o, { ...prev, achievements, updatedAt: Date.now() });
    return { achievements };
  });
  // LifeX: привязанный профиль игровой соцсети. Имя и телефон заполняют пустые поля профиля гостя, аватар заменяет фото
  function linkLifex(owner, lx) {
    if (!owner) return;
    const prev = profileOf(owner) || { id: owner, dm: true, achievements: [] }, old = prev.lifex?.avatar;
    const lifex = { id: str(lx.id, 64), username: str(lx.username, 40), name: str(lx.name, 60), bio: str(lx.bio, 300), url: /^https:\/\//.test(lx.url || '') ? str(lx.url, 300) : '', avatar: /^\/uploads\/lx-/.test(lx.avatar || '') ? lx.avatar : '', linkedAt: Date.now() };
    store.put('profiles', owner, { ...prev, id: owner, name: prev.name || lifex.name, phone: prev.phone || str(lx.phone, 20), lifex, updatedAt: Date.now() });
    if (old && old !== lifex.avatar) call('removeUpload', old);
  }
  on('DELETE', '/me/lifex', ({ user, guestKey }) => {
    const o = ownerOf(user, guestKey), prev = profileOf(o); if (!prev?.lifex) return { profile: prev };
    const { lifex, ...rest } = prev; store.put('profiles', o, { ...rest, updatedAt: Date.now() }); call('removeUpload', lifex.avatar);
    return { profile: profileOf(o) };
  });
  on('POST', '/check-discord', async ({ body, user }) => {
    const nick = str(body.discord, 40).replace(/^@/, ''); if (!nick) return { member: null };
    if (user && !String(user.id).startsWith('demo') && nick.toLowerCase() === String(user.username || '').toLowerCase()) return { member: true };
    const m = await call('checkMember', nick, null); return { member: m === null ? null : !!m };
  });
  // отзыв — только после завершённого проживания, один на бронь; на сайт попадает после одобрения персоналом
  on('POST', '/me/reviews', ({ body, user, guestKey }) => {
    const b = myBooking(str(body.bookingId, 40), user, guestKey);
    if (b.status !== 'done') bad('Отзыв можно оставить после выезда');
    if (store.all('reviews').some(r => r.bookingId === b.id)) bad('Отзыв на эту бронь уже есть');
    const stars = Math.round(num(body.stars, 0)), text = str(body.text, 1000);
    if (stars < 1 || stars > 5) bad('Поставьте оценку от 1 до 5 звёзд');
    if (text.length < 10) bad('Напишите хотя бы пару слов о проживании');
    const r = { id: uid('rv'), bookingId: b.id, code: b.code, owner: b.owner, name: b.name, typeName: b.typeName, stars, text, status: 'pending', createdAt: Date.now() };
    store.put('reviews', r.id, r); log(`Новый отзыв (${stars}★) на бронь ${b.code}`, 'review'); emit(['reviews', 'log']); call('notify', 'review', r);
    const { owner, ...out } = r; return { review: out };
  });
  const myBooking = (id, user, guestKey) => { const b = store.get('bookings', id); if (!b || !isOwner(b, user, guestKey)) throw new HttpError(404, 'Бронь не найдена'); return b; };
  const freeRoomOf = b => { const r = b.room && store.get('rooms', b.room); if (r && (!r.bookingId || r.bookingId === b.id) && r.status === 'booked') { store.put('rooms', r.id, { ...r, status: 'free', guest: null, discord: null, bookingId: null, updatedAt: Date.now() }); return true; } return false; };
  // гость сам отменяет бронь до заселения; номер, если уже назначен, освобождается
  on('POST', '/me/bookings/:id/cancel', ({ params, user, guestKey }) => {
    const b = myBooking(params.id, user, guestKey);
    if (!['new', 'confirmed'].includes(b.status)) bad(`Бронь сейчас «${BOOKING_STATUS[b.status]}» — отменить её можно только через управляющих`);
    const roomFreed = freeRoomOf(b);
    Object.assign(b, { status: 'cancelled', cancelledBy: 'guest', updatedAt: Date.now() }); store.put('bookings', b.id, b);
    log(`Гость отменил бронь ${b.code}`, 'booking'); emit(['bookings', 'log']); if (roomFreed) roomsChanged();
    call('notify', 'booking_status', { ...b, quiet: true }); return { booking: b };
  });
  // перенос даты и срока — пока бронь не подтверждена; сумма пересчитывается по той же цене и скидке
  on('POST', '/me/bookings/:id/reschedule', ({ params, body, user, guestKey }) => {
    const b = myBooking(params.id, user, guestKey);
    if (b.status !== 'new') bad('Перенести можно только неподтверждённую бронь. Подтверждённую переносят управляющие');
    const date = str(body.date, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) bad('Укажите дату заезда');
    const nights = Math.min(30, Math.max(1, Math.round(num(body.nights, b.nights))));
    const price = b.price ?? store.get('types', b.type)?.price ?? Math.round(b.total / b.nights);
    Object.assign(b, { date, nights, total: Math.round(price * nights * (100 - (b.discount || 0)) / 100), updatedAt: Date.now() }); store.put('bookings', b.id, b);
    log(`Гость перенёс бронь ${b.code}: ${date}, ночей ${nights}`, 'booking'); emit(['bookings', 'log']);
    call('notify', 'booking', b); return { booking: b };
  });
  // «Удалить мои данные»: брони, заказы, обращения, профиль и упоминания в журнале. Действующие брони отменяются
  on('POST', '/me/delete', async ({ body, user, guestKey }) => {
    if (str(body.confirm, 20) !== 'УДАЛИТЬ') bad('Для подтверждения введите УДАЛИТЬ');
    const owners = [ownerOf(user), guestKey && ownerOf(null, guestKey)].filter(Boolean); if (!owners.length) bad('Нечего удалять');
    const mine = c => store.all(c).filter(d => owners.includes(d.owner));
    const bookings = mine('bookings'), orders = mine('orders'), tickets = mine('tickets');
    let rooms = false;
    for (const b of bookings) { const r = b.room && store.get('rooms', b.room); if (r && r.bookingId === b.id && ['booked', 'occupied'].includes(r.status)) { store.put('rooms', r.id, { ...r, status: r.status === 'occupied' ? 'cleaning' : 'free', guest: null, discord: null, bookingId: null, updatedAt: Date.now() }); rooms = true; } store.del('bookings', b.id); }
    orders.forEach(o => store.del('orders', o.id));
    mine('reviews').forEach(r => store.del('reviews', r.id)); mine('rsvp').forEach(r => store.del('rsvp', r.id)); mine('notices').forEach(n => store.del('notices', n.id));
    for (const t of tickets) { if (t.channel) await call('dropTicketChannel', t); store.del('tickets', t.id); }
    // карточки в ленте персонала тоже убираем
    for (const d of [...bookings.map(b => 'b:' + b.id), ...orders.map(o => 'o:' + o.id), ...tickets.map(t => 't:' + t.id)]) call('dropCard', d);
    const marks = [...bookings.map(b => b.code), ...tickets.map(t => `от ${t.discord}`), ...tickets.map(t => `обращение ${t.discord}`)].filter(x => x && x.length > 3);
    store.all('log').filter(l => marks.some(m => String(l.text).includes(m))).forEach(l => store.del('log', l.id));
    owners.forEach(o => { const pr = profileOf(o); if (pr?.lifex?.avatar) call('removeUpload', pr.lifex.avatar); store.del('profiles', o); });
    emit(['bookings', 'orders', 'tickets', 'log', 'reviews']); if (rooms) roomsChanged();
    return { deleted: { bookings: bookings.length, orders: orders.length, tickets: tickets.length } };
  });

  on('POST', '/bookings', async ({ body, user, guestKey }) => {
    const t = store.get('types', str(body.type, 40)); if (!t) bad('Выберите тип номера');
    const name = str(body.name, 60), discord = str(body.discord || user?.username, 40), date = str(body.date, 10);
    if (!name || !discord || !/^\d{4}-\d{2}-\d{2}$/.test(date)) bad('Заполните имя, Discord и дату заезда');
    const nights = Math.min(30, Math.max(1, Math.round(num(body.nights, 1))));
    let room = str(body.room, 10) || null;
    if (room) { const r = store.get('rooms', room); if (!r || r.type !== t.id || r.status !== 'free') room = null; }
    if (!store.all('rooms').some(r => r.type === t.id && r.status === 'free')) bad(`Свободных номеров «${t.name}» сейчас нет`);
    // код брони должен быть уникальным: по нему гость и персонал находят бронь
    let bc = code(); for (let k = 0; k < 20 && store.all('bookings').some(x => x.code === bc); k++) bc = code();
    const owner0 = ownerOf(user, guestKey);
    if (owner0 && store.all('bookings').filter(x => x.owner === owner0 && ['new', 'confirmed'].includes(x.status)).length >= LIMITS.bookings) bad(`У вас уже ${LIMITS.bookings} активные брони. Дождитесь подтверждения или отмените лишнюю в кабинете`);
    const owner = owner0, tier = guestStats(owner).tier, discount = Math.min(50, Math.max(0, Math.round(num(tier?.discount, 0))));
    const b = { id: uid('b'), code: bc, type: t.id, typeName: t.name, preferredRoom: room, room: null, name, discord, phone: str(body.phone, 20), date, nights, guests: Math.min(12, Math.max(1, Math.round(num(body.guests, 1)))), note: str(body.note, 600), price: t.price, discount, tier: tier?.name || null, total: Math.round(t.price * nights * (100 - discount) / 100), status: 'new', owner, discordId: user?.id || null, createdAt: Date.now() };
    store.put('bookings', b.id, b); log(`Новая бронь ${b.code}: ${t.name}, ${date}, ${b.name}`, 'booking');
    emit(['bookings', 'log']); call('notify', 'booking', b);
    return { booking: b };
  });

  on('POST', '/orders', async ({ body, user, guestKey }) => {
    const room = str(body.room, 10); if (!store.get('rooms', room)) bad('Укажите номер комнаты из списка номеров отеля');
    const ids = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
    const items = ids.map(i => { const it = store.get('menu', str(i.id, 40)) || store.get('cigars', str(i.id, 40)); const q = Math.min(20, Math.max(1, Math.round(num(i.qty, 1)))); return it ? { id: it.id, name: it.cat ? it.name : 'Сигара ' + it.name, qty: q, price: it.price } : null; }).filter(Boolean);
    if (!items.length) bad('Заказ пуст');
    const ow = ownerOf(user, guestKey); if (ow && store.all('orders').filter(x => x.owner === ow && ['new', 'cooking', 'delivering'].includes(x.status)).length >= LIMITS.orders) bad(`У вас уже ${LIMITS.orders} заказа в работе. Дождитесь доставки — и закажите ещё`);
    const o = { id: uid('o'), items, total: items.reduce((s, i) => s + i.qty * i.price, 0), room, name: str(body.name, 60), discord: str(body.discord || user?.username, 40), note: str(body.note, 300), status: 'new', owner: ownerOf(user, guestKey), discordId: user?.id || null, createdAt: Date.now() };
    store.put('orders', o.id, o); log(`Заказ в номер ${room} на $${o.total}`, 'order'); emit(['orders', 'log']); call('notify', 'order', o);
    return { order: o };
  });

  on('POST', '/tickets', async ({ body, user, guestKey }) => {
    const discord = str(body.discord || user?.username, 40), text = str(body.text, 2000);
    if (!discord || !text) bad('Укажите Discord и опишите вопрос');
    const ot = ownerOf(user, guestKey); if (ot && store.all('tickets').filter(x => x.owner === ot && x.status !== 'closed').length >= LIMITS.tickets) bad(`У вас уже ${LIMITS.tickets} открытые заявки. Продолжите разговор в них — ссылки в кабинете`);
    const t = { id: uid('t'), discord, name: str(body.name, 60), topic: str(body.topic, 60) || 'Другое', text, status: 'checking', mode: null, owner: ownerOf(user, guestKey), discordId: user?.id || null, messages: [], createdAt: Date.now(), lastAt: Date.now(), lastFrom: 'guest' };
    store.put('tickets', t.id, t); emit(['tickets']);
    const member = await call('checkMember', discord, user?.id);
    return { ticket: t, member: member === null ? null : !!member };
  });
  const myTicket = (id, user, guestKey) => { const t = store.get('tickets', id); if (!t || (!isOwner(t, user, guestKey) && !(user && ROLES[user.role] >= 1))) throw new HttpError(404, 'Обращение не найдено'); return t; };
  on('POST', '/tickets/:id/recheck', async ({ params, user, guestKey }) => { const t = myTicket(params.id, user, guestKey); const m = await call('checkMember', t.discord, t.discordId); return { member: m === null ? null : !!m }; });
  on('POST', '/tickets/:id/mode', async ({ params, body, user, guestKey }) => {
    const t0 = myTicket(params.id, user, guestKey); const mode = body.mode === 'discord' ? 'discord' : 'site';
    // способ связи выбирается один раз: повтор (двойной клик, повторная отправка) не создаёт второй канал
    if (t0.status !== 'checking') return { ticket: t0, fallback: false };
    t0.status = 'opening'; store.put('tickets', t0.id, t0);
    // Канал не создался (бот недоступен или гостя нет на сервере): обращение уходит в чат на сайте, а не теряется
    let fallback = false, channel = null;
    if (mode === 'discord') { channel = (await call('createTicketChannel', t0)) || null; if (!channel) fallback = true; }
    // пока ждали Discord, тикет мог измениться: берём свежую запись и меняем только своё
    const t = store.get('tickets', t0.id) || t0;
    t.mode = channel ? 'discord' : 'site'; t.channel = channel; t.status = 'open'; t.lastAt = Date.now(); if (t0.discordId) t.discordId = t0.discordId;
    if (t.mode === 'site' && !t.messages.length) t.messages.push({ from: 'guest', text: t.text, at: Date.now() });
    store.put('tickets', t.id, t); log(`Обращение от ${t.discord}: ${t.topic} (${t.mode === 'discord' ? 'тикет в Discord' : 'чат на сайте'})`, 'ticket'); emit(['tickets', 'log']);
    call('notify', t.mode === 'discord' ? 'ticket_discord' : 'ticket_site', t);
    return { ticket: t, fallback };
  });
  on('POST', '/tickets/:id/messages', ({ params, body, user, guestKey }) => {
    const t = myTicket(params.id, user, guestKey); const text = str(body.text, 2000); if (!text) bad('Пустое сообщение');
    if (t.status === 'closed') bad('Обращение закрыто');
    const staff = !isOwner(t, user, guestKey) && user && ROLES[user.role] >= 1;
    t.messages.push({ from: staff ? 'staff' : 'guest', text, at: Date.now(), by: staff ? user.username : undefined });
    if (t.messages.length > 300) t.messages = t.messages.slice(-300);
    t.lastAt = Date.now(); t.lastFrom = staff ? 'staff' : 'guest'; store.put('tickets', t.id, t); emit(['tickets']);
    if (staff && t.mode === 'discord' && t.channel) call('ticketReply', t, text, user.username);
    if (staff) notice(t.owner, 'ticket', `Ответ управляющего по «${t.topic}»: ${text.slice(0, 160)}`);
    if (staff && t.mode === 'site') notifyGuest('ticket_reply', { ...t, replyText: text }); else call('notify', 'ticket_update', t);
    return { ticket: t };
  });

  /* ---------- персонал ---------- */
  on('GET', '/admin/all', ({ user }) => {
    need(user, 'mod');
    const s = settings();
    return { ...publicData(), venues: sort(store.all('venues')), team: store.all('team').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), offers: store.all('offers').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), settingsFull: user.role === 'admin' ? s : null, rooms: roomsSorted(), issues: store.all('issues').sort((a, b) => (b.date || 0) - (a.date || 0)), events: store.all('events').sort((a, b) => b.start - a.start).slice(0, 100),
      bookings: store.all('bookings').sort((a, b) => b.createdAt - a.createdAt).slice(0, 500), reviews: store.all('reviews').sort((a, b) => b.createdAt - a.createdAt).slice(0, 300).map(({ owner, ...r }) => r), jobsAll: sort(store.all('jobs')), replyTemplates: s.replyTemplates || null, tickets: store.all('tickets').sort((a, b) => b.lastAt - a.lastAt).slice(0, 300), orders: store.all('orders').sort((a, b) => b.createdAt - a.createdAt).slice(0, 300), log: store.all('log').sort((a, b) => b.at - a.at).slice(0, 120), summary: freeSummary(), discord: hooks.status ? hooks.status() : { connected: false }, senders: senders(), posts: store.all('posts').sort((a, b) => b.at - a.at).slice(0, 30) };
  });
  // отзывы: опубликовать, скрыть, ответить от имени отеля, удалить
  on('POST', '/admin/reviews/:id', ({ params, body, user }) => {
    need(user, 'mod'); const r = store.get('reviews', params.id); if (!r) throw new HttpError(404, 'Отзыв не найден');
    if ('status' in body) { if (!['pending', 'approved', 'hidden'].includes(body.status)) bad('Неверный статус'); r.status = body.status; }
    if ('reply' in body) { r.reply = str(body.reply, 600); r.replyBy = user.username; }
    if (body.status === 'approved' && r.status === 'approved' && !r.noticed) { notice(r.owner, 'review', 'Ваш отзыв опубликован на главной. Спасибо!', '#home'); r.noticed = true; }
    if (body.reply && body.reply !== r.replyNoticed) { notice(r.owner, 'review', 'Отель ответил на ваш отзыв.', '#home'); r.replyNoticed = body.reply; }
    r.updatedAt = Date.now(); store.put('reviews', r.id, r);
    log(`${user.username}: отзыв на ${r.code} — ${{ approved: 'опубликован', hidden: 'скрыт', pending: 'на модерации' }[r.status]}`, 'review', user.username); emit(['reviews', 'log']);
    return { review: r };
  });
  on('DELETE', '/admin/reviews/:id', ({ params, user }) => { need(user, 'mod'); const r = store.get('reviews', params.id); if (!r) throw new HttpError(404, 'Отзыв не найден'); store.del('reviews', r.id); log(`${user.username} удалил отзыв на ${r.code}`, 'review', user.username); emit(['reviews', 'log']); return { ok: true }; });
  // Удаление обращений: только закрытых, чтобы открытый тикет-канал не остался без записи на сайте
  on('POST', '/admin/tickets/purge', ({ user }) => { need(user, 'admin'); const list = store.all('tickets').filter(t => t.status === 'closed'); list.forEach(t => store.del('tickets', t.id)); log(`${user.username} удалил закрытые обращения: ${list.length}`, 'danger', user.username); emit(['tickets', 'log']); return { deleted: list.length }; });
  on('DELETE', '/admin/tickets/:id', ({ params, user }) => { need(user, 'admin'); const t = store.get('tickets', params.id); if (!t) throw new HttpError(404, 'Нет обращения'); if (t.status !== 'closed') bad('Сначала закройте обращение'); store.del('tickets', t.id); log(`${user.username} удалил обращение ${t.discord}: ${t.topic}`, 'danger', user.username); emit(['tickets', 'log']); return { ok: true }; });
  on('PUT', '/admin/:col/:id', ({ params, body, user }) => {
    // только собственные ключи: «constructor», «__proto__» и т.п. не должны проходить как раздел
    const role = Object.hasOwn(EDITABLE, params.col) && EDITABLE[params.col]; if (!role) bad('Этот раздел так не редактируется'); need(user, role);
    const id = params.id === 'new' ? uid(params.col.slice(0, 2)) : str(params.id, 60);
    const prev = store.get(params.col, id) || {};
    const doc = { ...prev, ...clean(params.col, body || {}), id, updatedAt: Date.now() };
    if (params.col === 'settings' && id !== 'main') bad('Неверный раздел настроек');
    store.put(params.col, id, doc); log(`${user.username} изменил ${label(params.col)}: ${doc.name || doc.title || id}`, 'edit', user.username);
    emit([params.col, 'log']); return { doc };
  });
  on('DELETE', '/admin/:col/:id', ({ params, user }) => {
    const role = Object.hasOwn(EDITABLE, params.col) && EDITABLE[params.col]; if (!role || params.col === 'settings') bad('Нельзя удалить'); need(user, role);
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
    if (newId !== r.id) { store.del('rooms', r.id); store.all('bookings').filter(b => b.room === r.id || b.preferredRoom === r.id).forEach(b => store.put('bookings', b.id, { ...b, room: b.room === r.id ? newId : b.room, preferredRoom: b.preferredRoom === r.id ? newId : b.preferredRoom })); emit(['bookings']); }
    store.put('rooms', newId, doc); log(`${user.username} изменил номер ${r.id}${newId !== r.id ? ' → ' + newId : ''}`, 'edit', user.username); roomsChanged(); emit(['log']); return { room: doc };
  });
  on('POST', '/admin/rooms', ({ body, user }) => {
    need(user, 'admin'); const id = str(body.id, 10), type = str(body.type, 40), floor = Math.round(num(body.floor, NaN));
    if (!/^[\w-]{1,10}$/.test(id) || !Number.isFinite(floor)) bad('Укажите номер и этаж'); if (store.get('rooms', id)) bad(`Номер ${id} уже есть`); if (!store.get('types', type)) bad('Выберите тип');
    const r = { id, floor, type, status: 'free', createdAt: Date.now() }; store.put('rooms', id, r); roomsChanged(); emit(['log']); log(`${user.username} добавил номер ${id}`, 'edit', user.username); return { room: r };
  });
  const busy = r => ['booked', 'occupied'].includes(r.status) || store.all('bookings').some(b => b.room === r.id && ['confirmed', 'checkedin'].includes(b.status));
  on('DELETE', '/admin/rooms/:id', ({ params, user }) => { need(user, 'admin'); const rr = store.get('rooms', params.id); if (!rr) throw new HttpError(404, 'Нет номера'); if (busy(rr)) bad('В номере бронь или гость — сначала завершите или перенесите бронь'); store.del('rooms', params.id); log(`${user.username} удалил номер ${params.id}`, 'edit', user.username); roomsChanged(); emit(['log']); return { ok: true }; });
  on('POST', '/admin/floors', ({ body, user }) => {
    need(user, 'admin'); const floor = Math.round(num(body.floor, NaN)), count = Math.min(40, Math.max(1, Math.round(num(body.count, 1)))), type = str(body.type, 40);
    if (!Number.isFinite(floor) || floor < -5 || floor > 300) bad('Укажите этаж'); if (!store.get('types', type)) bad('Выберите тип номеров');
    const start = Math.round(num(body.start, floor * 100 + 1)); const made = [];
    for (let i = 0; i < count; i++) { const id = String(start + i); if (store.get('rooms', id)) continue; store.put('rooms', id, { id, floor, type, status: 'free', createdAt: Date.now() }); made.push(id); }
    log(`${user.username} добавил ${made.length} номеров на ${floor} этаже`, 'edit', user.username); roomsChanged(); emit(['log']); return { made };
  });
  on('DELETE', '/admin/floors/:floor', ({ params, user }) => { need(user, 'admin'); const f = Math.round(num(params.floor, NaN)); const rs = store.all('rooms').filter(r => r.floor === f); if (rs.some(busy)) bad('На этаже есть брони или гости — сначала завершите их'); rs.forEach(r => store.del('rooms', r.id)); log(`${user.username} удалил ${f} этаж (${rs.length} номеров)`, 'edit', user.username); roomsChanged(); emit(['log']); return { removed: rs.length }; });

  // брони
  on('POST', '/admin/bookings/:id/action', async ({ params, body, user }) => {
    need(user, 'mod'); const b = store.get('bookings', params.id); if (!b) throw new HttpError(404, 'Бронь не найдена');
    const act = str(body.act, 20);
    // допустимые переходы: нельзя «подтвердить» отменённую или «отменить» уже завершённую бронь
    const FROM = { confirm: ['new', 'confirmed'], checkin: ['confirmed'], checkout: ['checkedin'], cancel: ['new', 'confirmed', 'checkedin'] };
    if (FROM[act] && !FROM[act].includes(b.status)) bad(`Бронь сейчас «${BOOKING_STATUS[b.status]}» — это действие недоступно`);
    // номер освобождаем, только если он всё ещё за этой бронью: его могли отдать другому гостю
    const release = (id, st) => { const r = store.get('rooms', id); if (r && (!r.bookingId || r.bookingId === b.id)) setRoom(id, st); };
    const setRoom = (id, st, extra = {}) => { const r = store.get('rooms', id); if (!r) return; Object.assign(r, { status: st, updatedAt: Date.now() }, extra); if (st === 'free' || st === 'cleaning') Object.assign(r, { guest: null, discord: null, bookingId: null }); store.put('rooms', id, r); };
    if (act === 'confirm') { const room = str(body.room, 10); const r = store.get('rooms', room); if (!r || r.status !== 'free') bad('Выберите свободный номер'); if (b.room && b.room !== room) release(b.room, 'free'); b.room = room; b.status = 'confirmed'; setRoom(room, 'booked', { guest: b.name, discord: b.discord, bookingId: b.id }); }
    else if (act === 'checkin') { if (!b.room) bad('Сначала назначьте номер'); b.status = 'checkedin'; setRoom(b.room, 'occupied', { guest: b.name, discord: b.discord, bookingId: b.id }); }
    else if (act === 'checkout') { b.status = 'done'; if (b.room) release(b.room, 'cleaning'); }
    else if (act === 'cancel') { b.status = 'cancelled'; if (b.room) release(b.room, 'free'); }
    else bad('Неизвестное действие');
    b.updatedAt = Date.now(); b.handledBy = user.username; store.put('bookings', b.id, b);
    log(`${user.username}: бронь ${b.code} → ${BOOKING_STATUS[b.status]}${b.room ? ', номер ' + b.room : ''}`, 'booking', user.username);
    const BN = { confirmed: `Бронь ${b.code} подтверждена: номер ${b.room}, заезд ${ruDay(b.date)}.`, checkedin: `Добро пожаловать в Mile High Club! Вы заселены в номер ${b.room}.`, done: `Спасибо, что остановились у нас! Оцените проживание — оставьте отзыв в кабинете.`, cancelled: `Бронь ${b.code} отменена. Если это ошибка, напишите управляющим.` };
    if (BN[b.status]) notice(b.owner, 'booking', BN[b.status]);
    emit(['bookings', 'log']); roomsChanged(); notifyGuest('booking_status', b); return { booking: b };
  });
  on('POST', '/admin/orders/:id/status', ({ params, body, user }) => { need(user, 'mod'); const o = store.get('orders', params.id); if (!o) throw new HttpError(404, 'Заказ не найден'); const st = str(body.status, 20); if (!ORDER_STATUS[st]) bad('Неверный статус'); o.status = st; o.updatedAt = Date.now(); store.put('orders', o.id, o); { const ON = { cooking: `Заказ в номер ${o.room} готовится.`, delivering: `Заказ уже несут в номер ${o.room}.`, done: `Заказ доставлен в номер ${o.room}. Приятного аппетита!`, cancelled: `Заказ в номер ${o.room} отменён.` }; if (ON[st]) notice(o.owner, 'order', ON[st]); } emit(['orders']); notifyGuest('order_status', o); return { order: o }; });
  on('POST', '/admin/tickets/:id/close', async ({ params, user }) => { need(user, 'mod'); const t = store.get('tickets', params.id); if (!t) throw new HttpError(404, 'Нет обращения');
    if (t.status === 'closed') return { ticket: t };
    if (closing.has(t.id)) bad('Обращение уже закрывается'); closing.add(t.id);
    try {
    if (t.channel && hooks.closeTicketChannel) { let history; try { history = await hooks.closeTicketChannel(t, user.username); } catch (e) { bad('Обращение не закрыто: ' + e.message); } if (history.length) t.messages = [{ from: 'guest', by: t.name || t.discord, text: t.text, at: t.createdAt }, ...history.filter(m => m.from !== 'bot')].slice(-300); t.channel = null; }
    const fresh = store.get('tickets', t.id) || t; Object.assign(fresh, { messages: t.messages, channel: t.channel, status: 'closed', closedBy: user.username, lastAt: Date.now() });
    store.put('tickets', fresh.id, fresh); log(`${user.username} закрыл обращение ${fresh.discord}`, 'ticket', user.username); emit(['tickets', 'log']); notice(fresh.owner, 'ticket', `Обращение «${fresh.topic}» закрыто.`); notifyGuest('ticket_closed', fresh); return { ticket: fresh };
    } finally { closing.delete(t.id); } });

  // события
  on('POST', '/admin/events/sync', async ({ user }) => { need(user, 'mod'); const r = await call('syncEvents'); emit(['events']); return { synced: r ?? 0, connected: !!hooks.syncEvents }; });

  // Discord
  const offline = 'Бот не подключён. Укажите DISCORD_BOT_TOKEN и GUILD_ID в .env';
  const link = v => { v = str(v, 400); return /^(https?:\/\/|\/?(uploads|img)\/)/.test(v) ? v : ''; };
  const cleanPost = b => {
    const p = { content: str(b.content, 2000), title: str(b.title, 256), url: /^https?:\/\//.test(b.url || '') ? str(b.url, 400) : '', description: str(b.description, 4000), color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#F0177A', image: link(b.image), thumbnail: link(b.thumbnail), footer: str(b.footer, 200),
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
    store.put('settings', 'main', { ...settings(), adminRoles: roleList(body.admin), directorRoles: roleList(body.director), modRoles: roleList(body.mod), devRoles: roleList(body.dev), announceChannel: /^\d+$/.test(body.announceChannel || '') ? str(body.announceChannel, 30) : '', reviewRole: /^\d+$/.test(body.reviewRole || '') ? str(body.reviewRole, 30) : '', jobRole: /^\d+$/.test(body.jobRole || '') ? str(body.jobRole, 30) : '' });
    log(`${user.username} изменил доступ к панели и канал анонсов`, 'discord', user.username);
    await call('setupGuild'); emit(['settings', 'log']); return { ok: true };
  });
  on('POST', '/admin/discord/profile', async ({ user }) => { need(user, 'admin'); const r = await call('applyProfile'); if (!r) bad(offline); log(`${user.username} обновил профиль Discord-сервера`, 'discord', user.username); emit(['log']); return r; });
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
    // ссылки и картинки: только http(s), пути сайта, якоря и встроенные картинки — никаких javascript: и подобного
    const U = n => v => { const x = str(v, n); return !x || /^(https?:\/\/|\/(?!\/)|img\/|models\/|uploads\/|#[\w-]*$|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(x) ? x : ''; };
    const H = v => { const x = str(v, 9); return /^#[0-9a-f]{3,8}$/i.test(x) ? x : ''; };  // цвета: только #hex
    const S = n => v => str(v, n), N = v => num(v), B = v => !!v, A = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => str(x, 40)).filter(Boolean).slice(0, 12);
    if (col === 'types') { pick('name', S(40)); pick('price', N); pick('desc', S(400)); pick('image', U(400)); pick('capacity', N); pick('order', N); pick('features', A); }
    if (col === 'venues') { pick('name', S(40)); pick('kind', S(20)); pick('floor', S(20)); pick('gameFloor', S(40)); pick('staffOnly', B); pick('desc', S(500)); pick('image', U(400)); pick('order', N); pick('keywords', S(200)); pick('comingSoon', B); pick('accent', H); if ('schedule' in b) o.schedule = (Array.isArray(b.schedule) ? b.schedule : []).slice(0, 8).map(s => ({ from: str(s.from, 5), to: str(s.to, 5), label: str(s.label, 80), state: ['live', 'open', 'calm', 'closed'].includes(s.state) ? s.state : 'open' })); }
    if (col === 'menu') { pick('cat', S(30)); pick('name', S(60)); pick('desc', S(200)); pick('price', N); pick('order', N); pick('image', U(400)); }
    if (col === 'cigars') { pick('name', S(40)); pick('origin', S(40)); pick('shape', v => CIGAR_SHAPES[v] ? v : 'robusto'); pick('length', N); pick('ring', N); pick('wrapper', H); pick('band', H); pick('band2', H); pick('bandStyle', v => ['classic', 'medallion', 'double', 'foot', 'stripe'].includes(v) ? v : 'classic'); pick('bandText', S(14)); pick('bandText2', S(14)); pick('strength', v => Math.min(5, Math.max(1, Math.round(num(v, 3))))); pick('notes', A); pick('price', N); pick('order', N); pick('desc', S(400)); }
    if (col === 'team') { pick('name', S(60)); pick('position', S(60)); pick('dept', S(40)); pick('photo', U(400)); pick('bio', S(600)); pick('since', S(40)); pick('discord', S(40)); pick('quote', S(160)); pick('order', N); pick('hidden', B); pick('example', B); }
    if (col === 'offers') { pick('title', S(80)); pick('tag', S(30)); pick('desc', S(400)); pick('price', S(40)); pick('image', U(400)); pick('order', N); pick('active', B); pick('cta', S(30)); pick('link', U(120)); }
    if (col === 'faq') { pick('q', S(160)); pick('a', S(800)); pick('order', N); }
    if (col === 'jobs') { pick('title', S(80)); pick('dept', S(40)); pick('desc', S(800)); pick('duties', S(800)); pick('reqs', S(800)); pick('schedule', S(120)); pick('pay', S(60)); pick('open', B); pick('order', N); }
    if (col === 'depts') { pick('name', S(40)); pick('color', H); pick('accent', H); pick('desc', S(400)); pick('order', N); pick('duties', S(400)); pick('shirt', H); }
    if (col === 'media') { pick('url', U(2_000_000)); pick('name', S(80)); }
    if (col === 'issues') { pick('title', S(80)); pick('desc', S(600)); pick('publisher', S(60)); pick('number', S(20)); pick('cover', U(400)); pick('date', N); pick('published', B); pick('accent', H); if ('pages' in b) o.pages = (Array.isArray(b.pages) ? b.pages : []).slice(0, 80).map(p => ({ kind: ['text', 'image', 'quote'].includes(p.kind) ? p.kind : 'text', title: str(p.title, 100), text: str(p.text, 3000), image: U(400)(p.image), cat: str(p.cat, 30) })); }
    if (col === 'events') { pick('name', S(100)); pick('desc', S(1000)); pick('start', N); pick('end', N); pick('location', S(100)); pick('venueId', S(40)); pick('image', U(400)); pick('status', v => ['scheduled', 'active', 'completed', 'cancelled'].includes(v) ? v : 'scheduled'); if (!('source' in o)) o.source = 'manual'; }
    if (col === 'senders') { pick('name', S(80)); pick('avatar', U(400)); pick('color', v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#F0177A'); pick('order', N); }
    if (col === 'settings') { if ('replyTemplates' in b) o.replyTemplates = (Array.isArray(b.replyTemplates) ? b.replyTemplates : []).slice(0, 20).map(t => ({ title: str(t?.title, 40), text: str(t?.text, 600) })).filter(t => t.title && t.text); if ('deckTracks' in b) o.deckTracks = (Array.isArray(b.deckTracks) ? b.deckTracks : []).slice(0, 30).map(t => ({ url: str(t?.url, 200), title: str(t?.title, 80) })).filter(t => /^\/uploads\/[a-f0-9]{16}\.(mp3|ogg|m4a)$/.test(t.url)); if ('tiers' in b) o.tiers = (Array.isArray(b.tiers) ? b.tiers : []).slice(0, 6).map(t => ({ name: str(t.name, 30), nights: Math.max(1, Math.round(num(t.nights, 1))), discount: Math.min(50, Math.max(0, Math.round(num(t.discount, 0)))), perk: str(t.perk, 120) })).filter(t => t.name); for (const k of ['hotelName', 'tagline', 'address', 'footer']) pick(k, S(400)); for (const k of ['heroDay', 'heroNight', 'discordInvite', 'deckUrl']) pick(k, U(400)); pick('staffExtras', B); pick('dayStart', N); pick('nightStart', N); pick('weather', v => ['auto', 'clear', 'rain', 'fog', 'snow'].includes(v) ? v : 'auto'); pick('theme', v => v === 'newyear' ? 'newyear' : 'none'); if (b.channels && typeof b.channels === 'object') o.channels = Object.fromEntries(Object.entries(b.channels).slice(0, 80).map(([k, v]) => [str(k, 30), str(v, 30)])); if (b.roles && typeof b.roles === 'object') o.roles = Object.fromEntries(Object.entries(b.roles).slice(0, 10).map(([k, v]) => [str(k, 30), str(v, 200)])); }
    return o;
  }
  const label = c => ({ jobs: 'вакансию', types: 'тип номера', venues: 'площадку', menu: 'блюдо', cigars: 'сигару', depts: 'отдел', team: 'анкету', offers: 'предложение', faq: 'вопрос', settings: 'настройки', media: 'медиа', issues: 'выпуск журнала', events: 'событие', senders: 'отправителя' }[c] || c);

  // Сначала точные маршруты (/admin/rooms/:id), потом общий редактор (/admin/:col/:id) — иначе общий перехватывал
  // удаление и правку номеров и этажей и отвечал «Нельзя удалить»
  let ordered = null;
  async function handle(method, path, ctx = {}) {
    ordered ||= [...routes.filter(r => !r.generic), ...routes.filter(r => r.generic)];
    for (const r of ordered) {
      if (r.method !== method) continue; const m = path.match(r.re); if (!m) continue;
      return await r.fn({ params: m.groups || {}, body: ctx.body || {}, user: ctx.user || null, guestKey: ctx.guestKey || null });
    }
    throw new HttpError(404, 'Не найдено');
  }
  // для бота: событие Discord → площадка по ключевым словам
  function matchVenue(text) { const t = String(text || '').toLowerCase(); return store.all('venues').find(v => [v.name, ...(String(v.keywords || '').split(','))].map(x => x.trim().toLowerCase()).filter(Boolean).some(k => t.includes(k)))?.id || null; }
  // событие из Discord: если ничего не поменялось, не пишем в базу и не заставляем всех гостей перезагружать данные
  function upsertEvent(e) {
    const prev = store.get('events', e.id) || {}; const doc = { ...prev, ...e, venueId: e.venueId ?? matchVenue(`${e.location} ${e.name}`), source: 'discord' };
    const same = JSON.stringify({ ...doc, updatedAt: 0 }) === JSON.stringify({ ...prev, updatedAt: 0 });
    if (same) return prev;
    doc.updatedAt = Date.now(); store.put('events', doc.id, doc); emit(['events']); return doc;
  }
  // сообщение из тикет-канала Discord: копия для панели сайта
  function ticketMessage(id, m) { const t = store.get('tickets', id); if (!t) return; if (m.from === 'staff') notice(t.owner, 'ticket', `Ответ управляющего по «${t.topic}»: ${String(m.text || '').slice(0, 160)}`); t.messages.push(m); if (t.messages.length > 300) t.messages = t.messages.slice(-300); t.lastAt = m.at; t.lastFrom = m.from; store.put('tickets', t.id, t); emit(['tickets']); call('notify', 'ticket_update', t); }
  function removeEvent(id) { if (!store.get('events', id)) return; store.del('events', id); emit(['events']); }

  return { handle, publicData, freeSummary, upsertEvent, removeEvent, ticketMessage, matchVenue, settings, log, store, linkLifex };
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
// Этажи из лифта в игре: подписи к площадкам, новая площадка и служебный этаж. Один раз, правки в панели не трогает.
function floorsV1(store) {
  const s = store.get('settings', 'main'); if (s.floorsV1) return;
  const names = { ciel: 'French Restaurant', cigar: 'Cigar Lounge', night: 'Rooftop Pool 1', sky: 'Rooftop Pool 2', spa: 'Spa & Gym' };
  for (const [id, gameFloor] of Object.entries(names)) { const v = store.get('venues', id); if (v && !v.gameFloor) store.put('venues', id, { ...v, gameFloor }); }
  if (!store.get('venues', 'assmosphere')) store.put('venues', 'assmosphere', { id: 'assmosphere', name: 'Assmosphere', gameFloor: 'Assmosphere', kind: 'bar', floor: '33 этаж', order: 6, accent: '#EF5617', keywords: 'assmosphere', desc: 'Ночная площадка отеля.', image: '', comingSoon: true, schedule: [] });
  if (!store.get('venues', 'yusuf')) store.put('venues', 'yusuf', { id: 'yusuf', name: 'Кабинет Юсуфа', gameFloor: "Yusuf's Office", kind: 'club', floor: '36 этаж', order: 7, accent: '#59161E', keywords: '', desc: 'Служебный этаж, только для персонала.', image: '', staffOnly: true, schedule: [] });
  for (const d of DEFAULT_SENDERS) { const x = store.get('senders', d.id); if (x) store.put('senders', d.id, { ...x, name: d.name, color: x.color || d.color }); }
  store.put('settings', 'main', { ...s, floorsV1: true });
}
// Примеры событий из первой версии не должны попасть к гостям. В панели они остаются отменёнными.
function hideDemoEvents(store) { for (const id of ['e-demo1', 'e-demo2']) { const e = store.get('events', id); if (e && e.status !== 'cancelled') store.put('events', id, { ...e, status: 'cancelled' }); } }

// Кнопка лифта в игре для этажа номеров: снизу вверх, верхние этажи сверх шести идут на Rooms Floor 6
export function roomGameFloor(rooms, floor) { const list = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b), i = list.indexOf(floor); return i < 0 ? '' : `Rooms Floor ${Math.min(i + 1, 6)}`; }

export function seed(store) { const fresh = seedBase(store); floorsV1(store); hideDemoEvents(store); siteV3(store); return fresh; }
function siteV3(store) { const s = store.get('settings', 'main'); if (s.siteV3) return; store.put('settings', 'main', { ...s, siteV3: true, weather: s.weather === 'snow' ? 'auto' : s.weather }); }
function seedBase(store) {
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
  return true;
}
