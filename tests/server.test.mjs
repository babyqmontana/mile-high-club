// Нагрузка на сервер: кэш данных, ответы 304, заранее сжатая статика, отсутствие лишних записей.
// npm run test:server — поднимает сервер на свободном порту с временной базой.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../server/store.js';
import { createCore, seed } from '../public/js/core.js';
import { readProfile } from '../server/lifex.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // fileURLToPath: на Windows pathname даёт /C:/…
const PORT = 3400 + Math.floor(Math.random() * 500), BASE = `http://127.0.0.1:${PORT}`;
let srv, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mhc-srv-'));
  srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DISCORD_BOT_TOKEN: '', GUILD_ID: '', DEMO_LOGIN: 'true', NODE_ENV: 'test' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/public')).ok) return; } catch { } await new Promise(r => setTimeout(r, 250)); }
  throw new Error('сервер не поднялся');
});
// на Windows база занята, пока процесс сервера не завершился: ждём выхода и удаляем с повторами
after(async () => { if (srv && srv.exitCode === null) { const done = new Promise(r => srv.once('exit', r)); srv.kill(); await done; } fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

test('/api/public отдаётся с ETag, повтор — 304 без тела', async () => {
  const a = await fetch(BASE + '/api/public'); const etag = a.headers.get('etag'); await a.arrayBuffer();
  assert.ok(etag, 'есть ETag');
  const b = await fetch(BASE + '/api/public', { headers: { 'if-none-match': etag } });
  assert.equal(b.status, 304); assert.equal((await b.arrayBuffer()).byteLength, 0);
});

test('скрипты и стили приходят заранее сжатыми (brotli) и с вечным кэшем по версии', async () => {
  const r = await fetch(BASE + '/js/main.js?v=x', { headers: { 'accept-encoding': 'br' } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-encoding'), 'br');
  assert.match(r.headers.get('cache-control'), /immutable/);
  const html = await fetch(BASE + '/', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(html.headers.get('content-encoding'), 'gzip'); assert.match(html.headers.get('cache-control'), /no-cache/);
});

test('хранилище: одинаковая запись не трогает базу и не меняет версию', () => {
  const s = openStore(path.join(dir, 'unit.sqlite'));
  s.put('rooms', '1', { id: '1', status: 'free' }); const r1 = s.rev(['rooms']);
  s.put('rooms', '1', { id: '1', status: 'free' }); assert.equal(s.rev(['rooms']), r1);
  s.put('rooms', '1', { id: '1', status: 'booked' }); assert.equal(s.rev(['rooms']), r1 + 1);
  const doc = s.get('rooms', '1'); doc.status = 'x'; assert.equal(s.get('rooms', '1').status, 'booked', 'чтение отдаёт копию');
  s.close();
});

test('событие из Discord без изменений не будит гостей', () => {
  const s = openStore(path.join(dir, 'ev.sqlite')); seed(s); let emits = 0;
  const core = createCore(s, { changed: () => emits++ });
  const ev = { id: 'dc-1', name: 'Вечеринка', desc: '', start: 1, end: 2, location: 'Night Pool', image: '', status: 'scheduled', url: '' };
  core.upsertEvent(ev); assert.equal(emits, 1);
  core.upsertEvent({ ...ev }); assert.equal(emits, 1, 'повторная синхронизация того же события');
  core.upsertEvent({ ...ev, name: 'Вечеринка 2' }); assert.equal(emits, 2);
  core.removeEvent('dc-404'); assert.equal(emits, 2, 'удаление несуществующего');
  s.close();
});

/* ---------- безопасность и целостность ---------- */
const login = async role => { const r = await fetch(BASE + '/auth/demo?role=' + role, { redirect: 'manual' }); return (r.headers.get('set-cookie') || '').split(';')[0]; };

test('служебные имена разделов («constructor», «__proto__») не проходят как редактируемые', async () => {
  const cookie = await login('guest');
  for (const col of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const r = await fetch(BASE + `/api/admin/${col}/x`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
    assert.notEqual(r.status, 200, col); await r.arrayBuffer();
  }
});

test('загрузка файлов без входа персонала отклоняется до приёма данных', async () => {
  const fd = new FormData(); fd.append('files', new Blob([Buffer.alloc(1024)]), 'a.png');
  const r = await fetch(BASE + '/api/admin/upload', { method: 'POST', body: fd }); assert.equal(r.status, 403);
  const cookie = await login('mod'); const png = new FormData(); png.append('files', new Blob([Buffer.from('<html>не картинка</html>')], { type: 'image/png' }), 'x.png');
  const ok = await (await fetch(BASE + '/api/admin/upload', { method: 'POST', body: png, headers: { cookie } })).json();
  assert.equal(ok.files.length, 0, 'файл с чужим содержимым не сохраняется');
});

test('изменяющий запрос с чужого сайта отклоняется', async () => {
  const r = await fetch(BASE + '/api/tickets', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ discord: 'x', text: 'y' }) });
  assert.equal(r.status, 403);
});

test('кривой cookie не роняет сервер', async () => {
  const r = await fetch(BASE + '/api/me', { headers: { cookie: 'mhc_s=%E0%A4%A' } }); assert.equal(r.status, 200);
  assert.equal((await fetch(BASE + '/api/public')).status, 200, 'сервер жив');
});

test('бронь: переходы только по правилам, номер чужой брони не освобождается', async () => {
  const s = openStore(path.join(dir, 'bk.sqlite')); seed(s); const core = createCore(s, {});
  const admin = { id: 'a', username: 'A', role: 'admin' }, guest = { id: 'g', username: 'G', role: 'guest' };
  const mk = async () => (await core.handle('POST', '/bookings', { body: { type: 'dlx', name: 'Гость', discord: 'g', date: '2026-12-01', nights: 2 }, user: guest })).booking;
  const b1 = await mk(), b2 = await mk();
  assert.notEqual(b1.code, b2.code);
  await core.handle('POST', `/admin/bookings/${b1.id}/action`, { body: { act: 'confirm', room: '2201' }, user: admin });
  await core.handle('POST', `/admin/bookings/${b1.id}/action`, { body: { act: 'cancel' }, user: admin });
  await assert.rejects(core.handle('POST', `/admin/bookings/${b1.id}/action`, { body: { act: 'confirm', room: '2201' }, user: admin }), /недоступно/);
  await core.handle('POST', `/admin/bookings/${b2.id}/action`, { body: { act: 'confirm', room: '2201' }, user: admin });
  await assert.rejects(core.handle('DELETE', '/admin/rooms/2201', { user: admin }), /бронь|гость/);
  assert.equal(s.get('rooms', '2201').status, 'booked');
  s.close();
});

test('этаж правится целиком: новый номер этажа с перенумерацией, общий тип, бронь переезжает вместе с номером', async () => {
  const s = openStore(path.join(dir, 'fl.sqlite')); seed(s); const core = createCore(s, {});
  const admin = { id: 'a', username: 'A', role: 'admin' }, mod = { id: 'm', username: 'M', role: 'mod' }, guest = { id: 'g', username: 'G', role: 'guest' };
  const b = (await core.handle('POST', '/bookings', { body: { type: 'dlx', name: 'Гость', discord: 'g', date: '2026-12-01', nights: 2 }, user: guest })).booking;
  await core.handle('POST', `/admin/bookings/${b.id}/action`, { body: { act: 'confirm', room: '2201' }, user: admin });
  await assert.rejects(core.handle('PUT', '/admin/floors/22', { body: { floor: 40 }, user: mod }), /прав|доступ/i);
  const n22 = s.all('rooms').filter(r => r.floor === 22).length, type = s.all('types').at(-1).id;
  const res = await core.handle('PUT', '/admin/floors/22', { body: { floor: 40, type }, user: admin });
  assert.equal(res.rooms.length, n22);
  assert.equal(s.all('rooms').filter(r => r.floor === 22).length, 0);
  assert.ok(s.get('rooms', '4001') && !s.get('rooms', '2201'));
  assert.ok(s.all('rooms').filter(r => r.floor === 40).every(r => r.type === type));
  assert.equal(s.get('bookings', b.id).room, '4001');
  // перенумерация не затирает чужие номера
  await core.handle('POST', '/admin/rooms', { body: { id: '4101', floor: 41, type }, user: admin });
  await assert.rejects(core.handle('PUT', '/admin/floors/40', { body: { floor: 41 }, user: admin }), /заняты/);
  s.close();
});

test('ссылки и цвета из панели проходят только безопасные', async () => {
  const s = openStore(path.join(dir, 'url.sqlite')); seed(s); const core = createCore(s, {}); const admin = { id: 'a', username: 'A', role: 'admin' };
  const { doc } = await core.handle('PUT', '/admin/offers/new', { body: { title: 'x', link: 'javascript:alert(1)', image: 'https://ok.example/a.webp' }, user: admin });
  assert.equal(doc.link, ''); assert.equal(doc.image, 'https://ok.example/a.webp');
  const v = (await core.handle('PUT', '/admin/venues/sky', { body: { accent: 'red;background:url(x)' }, user: admin })).doc; assert.equal(v.accent, '');
  s.close();
});

test('способ связи по обращению выбирается один раз — второй канал не создаётся', async () => {
  const s = openStore(path.join(dir, 'tk.sqlite')); seed(s); let made = 0;
  const core = createCore(s, { createTicketChannel: async () => { made++; await new Promise(r => setTimeout(r, 30)); return 'ch' + made; } });
  const { ticket } = await core.handle('POST', '/tickets', { body: { discord: 'g', text: 'вопрос' }, guestKey: 'k' });
  await Promise.all([1, 2, 3].map(() => core.handle('POST', `/tickets/${ticket.id}/mode`, { body: { mode: 'discord' }, guestKey: 'k' })));
  assert.equal(made, 1); assert.equal(s.get('tickets', ticket.id).channel, 'ch1');
  s.close();
});

/* ---------- кабинет гостя ---------- */
const cab = () => { const s = openStore(path.join(dir, 'cab-' + Math.random().toString(36).slice(2) + '.sqlite')); seed(s); return { s, core: createCore(s, {}) }; };
const ADMIN = { id: 'a', username: 'A', role: 'admin' }, GUEST = { id: 'g1', username: 'G', role: 'guest' };
const mkBooking = async (core, ctx, extra = {}) => (await core.handle('POST', '/bookings', { body: { type: 'dlx', name: 'Тони', discord: 'tony', date: '2026-12-01', nights: 2, ...extra }, ...ctx })).booking;

test('кабинет: после входа брони, заказы, заявки и профиль с устройства переходят в аккаунт', async () => {
  const { s, core } = cab(), dev = { guestKey: 'device-1' };
  await mkBooking(core, dev); await core.handle('PUT', '/me/profile', { body: { name: 'Тони', phone: '555' }, ...dev });
  assert.equal((await core.handle('POST', '/me/claim', { user: GUEST, guestKey: 'device-1' })).moved, 1);
  const it = await core.handle('GET', '/me/items', { user: GUEST });
  assert.equal(it.bookings.length, 1); assert.equal(it.profile.phone, '555');
  assert.equal((await core.handle('GET', '/me/items', dev)).bookings.length, 0, 'на ключе устройства ничего не осталось');
  s.close();
});

test('кабинет: гость отменяет только свою бронь до заселения, номер освобождается', async () => {
  const { s, core } = cab(), me = { guestKey: 'k1' }, other = { guestKey: 'k2' };
  const b = await mkBooking(core, me);
  await assert.rejects(core.handle('POST', `/me/bookings/${b.id}/cancel`, other), /не найдена/);
  await core.handle('POST', `/admin/bookings/${b.id}/action`, { body: { act: 'confirm', room: '2201' }, user: ADMIN });
  await core.handle('POST', `/me/bookings/${b.id}/cancel`, me);
  assert.equal(s.get('bookings', b.id).status, 'cancelled'); assert.equal(s.get('rooms', '2201').status, 'free');
  const b2 = await mkBooking(core, me);
  await core.handle('POST', `/admin/bookings/${b2.id}/action`, { body: { act: 'confirm', room: '2201' }, user: ADMIN });
  await core.handle('POST', `/admin/bookings/${b2.id}/action`, { body: { act: 'checkin' }, user: ADMIN });
  await assert.rejects(core.handle('POST', `/me/bookings/${b2.id}/cancel`, me), /управляющих/);
  s.close();
});

test('кабинет: перенос только неподтверждённой брони, сумма пересчитывается', async () => {
  const { s, core } = cab(), me = { guestKey: 'k1' };
  const b = await mkBooking(core, me), per = b.total / b.nights;
  const r = await core.handle('POST', `/me/bookings/${b.id}/reschedule`, { body: { date: '2026-12-20', nights: 4 }, ...me });
  assert.equal(r.booking.date, '2026-12-20'); assert.equal(r.booking.total, per * 4);
  await core.handle('POST', `/admin/bookings/${b.id}/action`, { body: { act: 'confirm', room: '2201' }, user: ADMIN });
  await assert.rejects(core.handle('POST', `/me/bookings/${b.id}/reschedule`, { body: { date: '2026-12-25', nights: 1 }, ...me }), /неподтверждённую/);
  s.close();
});

test('кабинет: статус гостя по прожитым ночам даёт скидку из настроек', async () => {
  const { s, core } = cab(), me = { user: GUEST };
  await core.handle('PUT', '/admin/settings/main', { body: { tiers: [{ name: 'Silver', nights: 2, discount: 10, perk: '' }] }, user: ADMIN });
  const b = await mkBooking(core, me); assert.equal(b.discount, 0);
  for (const act of ['confirm', 'checkin', 'checkout']) await core.handle('POST', `/admin/bookings/${b.id}/action`, { body: { act, room: '2201' }, user: ADMIN });
  const st = (await core.handle('GET', '/me/items', me)).stats; assert.equal(st.nights, 2); assert.equal(st.tier.name, 'Silver');
  const b2 = await mkBooking(core, me); assert.equal(b2.discount, 10); assert.equal(b2.total, Math.round(b.total * 0.9));
  s.close();
});

test('кабинет: «Удалить мои данные» убирает всё своё и не трогает чужое', async () => {
  const { s, core } = cab(), me = { guestKey: 'k1' }, other = { guestKey: 'k2' };
  const b = await mkBooking(core, me); await mkBooking(core, other);
  await core.handle('POST', `/admin/bookings/${b.id}/action`, { body: { act: 'confirm', room: '2201' }, user: ADMIN });
  await core.handle('PUT', '/me/profile', { body: { name: 'Тони' }, ...me });
  await assert.rejects(core.handle('POST', '/me/delete', { body: { confirm: 'да' }, ...me }), /УДАЛИТЬ/);
  const r = await core.handle('POST', '/me/delete', { body: { confirm: 'УДАЛИТЬ' }, ...me });
  assert.equal(r.deleted.bookings, 1); assert.equal(s.get('rooms', '2201').status, 'free');
  assert.equal((await core.handle('GET', '/me/items', me)).profile, null);
  assert.equal((await core.handle('GET', '/me/items', other)).bookings.length, 1, 'чужая бронь на месте');
  assert.ok(!s.all('log').some(l => l.text.includes(b.code)), 'в журнале нет кода удалённой брони');
  s.close();
});

test('кабинет: секреты отеля сохраняются в аккаунте, мусорные id отбрасываются', async () => {
  const { s, core } = cab();
  const r = await core.handle('POST', '/me/achievements', { body: { ids: ['logo', 'konami', '<script>', 'x'.repeat(40)] }, user: GUEST });
  assert.deepEqual(r.achievements, ['logo', 'konami']);
  assert.deepEqual((await core.handle('POST', '/me/achievements', { body: { ids: ['night'] }, user: GUEST })).achievements, ['logo', 'konami', 'night']);
  assert.deepEqual((await core.handle('POST', '/me/achievements', { body: { ids: ['logo'] } })).achievements, [], 'без входа не хранится');
  s.close();
});

/* ---------- LifeX ---------- */
test('LifeX: профиль читается при разных названиях полей, опасные ссылки отбрасываются', () => {
  const a = readProfile({ user: { id: 7, username: 'tony', display_name: 'Тони', avatar_url: 'https://cdn.x/a.png', profile_url: 'javascript:alert(1)' } });
  assert.deepEqual([a.id, a.username, a.name, a.avatar, a.url], ['7', 'tony', 'Тони', 'https://cdn.x/a.png', '']);
  const b = readProfile({ data: { sub: 'u1', preferred_username: 'bob', picture: 'ftp://x/a.png', avatar: { url: 'nope' } } });
  assert.deepEqual([b.id, b.name, b.avatar], ['u1', 'bob', '']);
});

test('LifeX: привязка заполняет пустые поля профиля, отвязка и удаление данных убирают копию аватара', async () => {
  const s = openStore(path.join(dir, 'lx.sqlite')); seed(s); const removed = [];
  const core = createCore(s, { removeUpload: u => removed.push(u) }), me = { guestKey: 'k1' };
  await core.handle('PUT', '/me/profile', { body: { phone: '111' }, ...me });
  core.linkLifex('g:k1', { id: 'lx1', username: 'tony', name: 'Тони', phone: '999', avatar: '/uploads/lx-0123456789abcdef.png', url: 'https://lifex/tony' });
  let p = (await core.handle('GET', '/me/items', me)).profile;
  assert.equal(p.name, 'Тони'); assert.equal(p.phone, '111', 'заполненный телефон не перезаписывается'); assert.equal(p.lifex.username, 'tony');
  core.linkLifex('g:k1', { id: 'lx1', username: 'tony', name: 'Тони', avatar: '/uploads/lx-fedcba9876543210.png' });
  assert.deepEqual(removed, ['/uploads/lx-0123456789abcdef.png'], 'старая копия аватара удаляется при обновлении');
  core.linkLifex('g:k1', { id: 'x', avatar: 'https://evil/a.png' }); assert.equal(s.get('profiles', 'g:k1').lifex.avatar, '', 'чужой адрес аватара не сохраняется');
  core.linkLifex('g:k1', { id: 'lx1', avatar: '/uploads/lx-1111111111111111.png' });
  await core.handle('DELETE', '/me/lifex', me); assert.equal((await core.handle('GET', '/me/items', me)).profile.lifex, undefined);
  core.linkLifex('g:k1', { id: 'lx1', avatar: '/uploads/lx-2222222222222222.png' });
  await core.handle('POST', '/me/delete', { body: { confirm: 'УДАЛИТЬ' }, ...me });
  assert.ok(removed.includes('/uploads/lx-1111111111111111.png') && removed.includes('/uploads/lx-2222222222222222.png'));
  s.close();
});

/* ---------- отзывы, вакансии ---------- */
test('отзывы: только после выезда, один на бронь, на сайте только одобренные', async () => {
  const { s, core } = cab(), me = { guestKey: 'k1' };
  const b = await mkBooking(core, me);
  await assert.rejects(core.handle('POST', '/me/reviews', { body: { bookingId: b.id, stars: 5, text: 'Отличный отель, всем советую' }, ...me }), /после выезда/);
  for (const act of ['confirm', 'checkin', 'checkout']) await core.handle('POST', `/admin/bookings/${b.id}/action`, { body: { act, room: '2201' }, user: ADMIN });
  await assert.rejects(core.handle('POST', '/me/reviews', { body: { bookingId: b.id, stars: 5, text: 'Отлично' }, guestKey: 'чужой' }), /не найдена/);
  const { review } = await core.handle('POST', '/me/reviews', { body: { bookingId: b.id, stars: 5, text: 'Отличный отель, всем советую' }, ...me });
  await assert.rejects(core.handle('POST', '/me/reviews', { body: { bookingId: b.id, stars: 4, text: 'И ещё один отзыв сюда' }, ...me }), /уже есть/);
  assert.equal(core.publicData().reviews.count, 0, 'до одобрения не виден');
  await core.handle('POST', `/admin/reviews/${review.id}`, { body: { status: 'approved', reply: 'Спасибо!' }, user: ADMIN });
  const pub = core.publicData().reviews; assert.equal(pub.count, 1); assert.equal(pub.avg, 5); assert.equal(pub.list[0].reply, 'Спасибо!'); assert.equal(pub.list[0].owner, undefined, 'владелец не уходит наружу');
  await core.handle('POST', '/me/delete', { body: { confirm: 'УДАЛИТЬ' }, ...me }); assert.equal(core.publicData().reviews.count, 0, 'удаляется вместе с данными гостя');
  s.close();
});

test('«Пойду» убрано: маршрута нет, у событий нет счётчика', async () => {
  const { s, core } = cab(), start = Date.now() + 50 * 60e3;
  const ev = (await core.handle('PUT', '/admin/events/new', { body: { name: 'Вечеринка', start, end: start + 3600e3, status: 'scheduled' }, user: ADMIN })).doc;
  await assert.rejects(core.handle('POST', `/events/${ev.id}/going`, { user: GUEST }));
  assert.equal(core.publicData().events.find(e => e.id === ev.id).going, undefined);
  assert.equal((await core.handle('GET', '/me/items', { user: GUEST })).going, undefined);
  s.close();
});

test('вакансии: на сайте только открытые, редактирует только администрация', async () => {
  const { s, core } = cab();
  await core.handle('PUT', '/admin/jobs/new', { body: { title: 'Бармен', open: true, desc: 'Ночные смены' }, user: ADMIN });
  await core.handle('PUT', '/admin/jobs/new', { body: { title: 'Закрытая', open: false }, user: ADMIN });
  assert.deepEqual(core.publicData().jobs.map(j => j.title), ['Бармен']);
  await assert.rejects(core.handle('PUT', '/admin/jobs/new', { body: { title: 'x' }, user: { id: 'm', username: 'M', role: 'mod' } }));
  s.close();
});

test('защита от спама: не больше 3 активных броней и 2 заказов в работе на гостя', async () => {
  const { s, core } = cab(), me = { guestKey: 'spam' };
  for (let i = 0; i < 3; i++) await mkBooking(core, me);
  await assert.rejects(mkBooking(core, me), /активные брони/);
  const b = (await core.handle('GET', '/me/items', me)).bookings[0];
  await core.handle('POST', `/me/bookings/${b.id}/cancel`, me); await mkBooking(core, me);   // после отмены снова можно
  const menu = core.publicData().menu[0].id, order = () => core.handle('POST', '/orders', { body: { room: '2201', items: [{ id: menu, qty: 1 }] }, ...me });
  await order(); await order(); await assert.rejects(order(), /в работе/);
  s.close();
});

test('уведомления на сайте: подтверждение брони, отметка «прочитано», только свои', async () => {
  const { s, core } = cab(), me = { guestKey: 'n1' }, other = { guestKey: 'n2' };
  const b = await mkBooking(core, me);
  await core.handle('POST', `/admin/bookings/${b.id}/action`, { body: { act: 'confirm', room: '2201' }, user: ADMIN });
  const n = (await core.handle('GET', '/me/items', me)).notices;
  assert.equal(n.length, 1); assert.match(n[0].text, /подтверждена/); assert.equal(n[0].read, false); assert.equal(n[0].owner, undefined);
  assert.equal((await core.handle('GET', '/me/items', other)).notices.length, 0, 'чужие не видны');
  assert.equal((await core.handle('POST', '/me/notices/read', me)).read, 1);
  assert.equal((await core.handle('GET', '/me/items', me)).notices[0].read, true);
  s.close();
});

test('шаблоны ответов: чистятся при сохранении и видны только панели', async () => {
  const { s, core } = cab();
  await core.handle('PUT', '/admin/settings/main', { body: { replyTemplates: [{ title: 'Привет', text: 'Здравствуйте, {имя}!' }, { title: '', text: 'без названия' }, 'мусор'] }, user: ADMIN });
  assert.deepEqual(core.settings().replyTemplates, [{ title: 'Привет', text: 'Здравствуйте, {имя}!' }]);
  assert.equal(core.publicData().settings.replyTemplates, undefined, 'на публичный сайт не уходят');
  assert.equal((await core.handle('GET', '/admin/all', { user: { id: 'm', username: 'M', role: 'mod' } })).replyTemplates.length, 1, 'персонал видит шаблоны');
  s.close();
});

test('проверка ника Discord: без бота ответ «неизвестно», свой ник у вошедшего — найден', async () => {
  const { s, core } = cab();
  assert.deepEqual(await core.handle('POST', '/check-discord', { body: { discord: '@someone' } }), { member: null });
  assert.deepEqual(await core.handle('POST', '/check-discord', { body: { discord: 'G' }, user: GUEST }), { member: true });
  const c2 = createCore(s, { checkMember: async n => n === 'tony' });
  assert.deepEqual(await c2.handle('POST', '/check-discord', { body: { discord: 'tony' } }), { member: true });
  assert.deepEqual(await c2.handle('POST', '/check-discord', { body: { discord: 'nobody' } }), { member: false });
  s.close();
});

test('новый отзыв уходит персоналу через notify', async () => {
  const s = openStore(path.join(dir, 'rv-' + Date.now() + '.sqlite')); seed(s);
  const got = [], core = createCore(s, { notify: async (k, d) => { got.push([k, d.stars]); } }), me = { guestKey: 'r1' };
  const b = await mkBooking(core, me);
  for (const act of ['confirm', 'checkin', 'checkout']) await core.handle('POST', `/admin/bookings/${b.id}/action`, { body: { act, room: '2201' }, user: ADMIN });
  await core.handle('POST', '/me/reviews', { body: { bookingId: b.id, stars: 4, text: 'Хорошо отдохнули, спасибо' }, ...me });
  assert.deepEqual(got.find(x => x[0] === 'review'), ['review', 4]);
  s.close();
});
