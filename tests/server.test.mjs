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
import { readProfile, privateIp } from '../server/lifex.js';

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

test('мост Discord: сообщения брони и заявки-с-сайта дублируются в канал, ответ из Discord приходит гостю', async () => {
  const s = openStore(path.join(dir, 'br-' + Date.now() + '.sqlite')); seed(s);
  const bridge = [], notes = [];
  const core = createCore(s, { bridge: a => bridge.push([a.kind, a.from, a.text]), notify: async (k, d) => notes.push([k, d.guestText || d.replyText || d.status]) });
  // бронь: сообщение гостя уходит в notify как booking_message (бот дублирует в канал)
  const b = await mkBooking(core, { guestKey: 'k1' });
  await core.handle('POST', `/me/bookings/${b.id}/messages`, { body: { text: 'Можно поздний заезд?' }, guestKey: 'k1' });
  assert.ok(notes.some(x => x[0] === 'booking_message' && /поздний заезд/.test(x[1])), 'сообщение гостя ушло в notify');
  // ответ персонала, написанный в канале Discord, попадает в переписку и уведомляет гостя
  core.bookingMessage(b.id, { by: 'Луи', text: 'Да, до 16:00 бесплатно' });
  const fresh = s.get('bookings', b.id);
  assert.equal(fresh.messages.at(-1).text, 'Да, до 16:00 бесплатно');
  assert.equal(fresh.messages.at(-1).from, 'staff');
  assert.equal(fresh.staffUnread, 0);
  assert.ok(s.all('notices').some(n => n.owner === 'g:k1' && /Отель ответил по брони/.test(n.text)), 'гостю пришло уведомление');
  // заявка в режиме «чат на сайте» зеркалится в канал при открытии и на каждое сообщение
  const t = (await core.handle('POST', '/tickets', { body: { discord: 'tony', topic: 'Вопрос', text: 'Есть ли парковка?' }, guestKey: 'k1' })).ticket;
  await core.handle('POST', `/tickets/${t.id}/mode`, { body: { mode: 'site' }, guestKey: 'k1' });
  // у гостя без имени персонажа сообщение не уходит; имя из профиля снимает запрет
  await assert.rejects(core.handle('POST', `/tickets/${t.id}/messages`, { body: { text: 'И где вход?' }, guestKey: 'k1' }), e => e.status === 428);
  await core.handle('PUT', '/me/profile', { body: { name: 'Тони Монтана' }, guestKey: 'k1' });
  await core.handle('POST', `/tickets/${t.id}/messages`, { body: { text: 'И где вход?' }, guestKey: 'k1' });
  await core.handle('PUT', '/me/profile', { body: { name: 'Аманда Ли' }, user: ADMIN });
  await core.handle('POST', `/tickets/${t.id}/messages`, { body: { text: 'Вход со стороны лобби' }, user: ADMIN });
  const kinds = bridge.filter(x => x[0] === 'ticket');
  assert.ok(kinds.some(x => x[1] === 'guest' && /парковка|вход/.test(x[2])), 'реплики гостя зеркалятся в канал');
  assert.ok(kinds.some(x => x[1] === 'staff' && /лобби/.test(x[2])), 'ответ персонала зеркалится в канал');
  s.close();
});

test('переписка по брони: гость пишет только в свою, персонал отвечает, статусы попадают в ленту, частые сообщения отсекаются', async () => {
  const s = openStore(path.join(dir, 'bm.sqlite')); seed(s); const core = createCore(s, {});
  const admin = { id: 'a', username: 'A', role: 'admin' }, mod = { id: 'm', username: 'M', role: 'mod' };
  const b = (await core.handle('POST', '/bookings', { body: { type: 'dlx', name: 'Гость', discord: 'g', date: '2026-12-01', nights: 2 }, guestKey: 'k1' })).booking;
  assert.equal(b.messages[0].from, 'system');
  await assert.rejects(core.handle('POST', `/me/bookings/${b.id}/messages`, { body: { text: 'чужая' }, guestKey: 'k2' }), /не найдена/);
  await assert.rejects(core.handle('POST', `/me/bookings/${b.id}/messages`, { body: { text: '   ' }, guestKey: 'k1' }), /Напишите/);
  await core.handle('POST', `/me/bookings/${b.id}/messages`, { body: { text: 'Можно с видом на город?' }, guestKey: 'k1' });
  assert.equal(s.get('bookings', b.id).staffUnread, 1);
  await assert.rejects(core.handle('POST', `/admin/bookings/${b.id}/messages`, { body: { text: 'x' }, user: null }), /прав|вход|доступ/i);
  await assert.rejects(core.handle('POST', `/admin/bookings/${b.id}/messages`, { body: { text: 'x' }, user: mod }), e => e.status === 428);
  await core.handle('PUT', '/me/profile', { body: { name: 'Марко Росси' }, user: mod });
  await core.handle('POST', `/admin/bookings/${b.id}/messages`, { body: { text: 'Подберём, ждите подтверждения' }, user: mod });
  const after = s.get('bookings', b.id);
  assert.equal(after.staffUnread, 0); assert.equal(after.messages.at(-1).from, 'staff'); assert.equal(after.messages.at(-1).by, 'Марко Росси');
  const items = await core.handle('GET', '/me/items', { guestKey: 'k1' });
  assert.ok(items.notices.some(n => /Отель ответил по брони/.test(n.text)), 'гостю пришло уведомление');
  await core.handle('POST', `/admin/bookings/${b.id}/action`, { body: { act: 'confirm', room: '2201' }, user: admin });
  assert.match(s.get('bookings', b.id).messages.at(-1).text, /подтверждена.*2201/);
  for (let i = 0; i < 5; i++) await core.handle('POST', `/me/bookings/${b.id}/messages`, { body: { text: 'ещё ' + i }, guestKey: 'k1' });
  await assert.rejects(core.handle('POST', `/me/bookings/${b.id}/messages`, { body: { text: 'спам' }, guestKey: 'k1' }), /часто/);
  s.close();
});

test('«Горячие туры»: кнопку можно выключить, свои фоны темы проходят проверку ссылок', async () => {
  const s = openStore(path.join(dir, 'vc-' + Date.now() + '.sqlite')); seed(s); const core = createCore(s, {});
  const admin = { id: 'a', username: 'A', role: 'admin' };
  assert.equal(core.publicData().settings.vice, undefined, 'по умолчанию кнопка включена (настройки нет)');
  await core.handle('PUT', '/admin/settings/main', { body: { vice: { enabled: false, heroNight: 'img/vice/night.webp', heroDay: 'javascript:alert(1)', bg: '/uploads/abcdef0123456789.webp' } }, user: admin });
  const v = core.publicData().settings.vice;
  assert.equal(v.enabled, false); assert.equal(v.heroNight, 'img/vice/night.webp'); assert.equal(v.heroDay, '', 'опасная ссылка отброшена'); assert.equal(v.bg, '/uploads/abcdef0123456789.webp');
  await assert.rejects(core.handle('PUT', '/admin/settings/main', { body: { vice: { enabled: true } }, user: { id: 'm', username: 'M', role: 'mod' } }), /прав|доступ/i);
  s.close();
});

test('блюдо дня: режимы авто/из меню/своё сохраняются и отдаются на сайт', async () => {
  const s = openStore(path.join(dir, 'sp-' + Date.now() + '.sqlite')); seed(s); const core = createCore(s, {});
  const menuId = s.all('menu')[0].id;
  await core.handle('PUT', '/admin/settings/main', { body: { special: { mode: 'menu', menuId } }, user: ADMIN });
  assert.deepEqual(core.publicData().settings.special, { mode: 'menu', menuId });
  await core.handle('PUT', '/admin/settings/main', { body: { special: { mode: 'custom', name: 'Утиная ножка', desc: 'конфи', price: '260' } }, user: ADMIN });
  assert.deepEqual(core.publicData().settings.special, { mode: 'custom', name: 'Утиная ножка', desc: 'конфи', price: 260 });
  await core.handle('PUT', '/admin/settings/main', { body: { special: { mode: 'что-то' } }, user: ADMIN });
  assert.deepEqual(core.publicData().settings.special, { mode: 'auto' });
  s.close();
});

test('окошки сайта: можно скрыть погоду/онлайн/свободно, по умолчанию показаны', async () => {
  const s = openStore(path.join(dir, 'wg-' + Date.now() + '.sqlite')); seed(s); const core = createCore(s, {});
  assert.equal(core.publicData().settings.widgets, undefined, 'по умолчанию поля нет — сайт показывает всё');
  await core.handle('PUT', '/admin/settings/main', { body: { widgets: { weather: false, guests: false } }, user: ADMIN });
  assert.deepEqual(core.publicData().settings.widgets, { weather: false, guests: false, free: true }, 'непереданное окошко считается включённым');
  await core.handle('PUT', '/admin/settings/main', { body: { widgets: { weather: true, guests: true, free: false } }, user: ADMIN });
  assert.deepEqual(core.publicData().settings.widgets, { weather: true, guests: true, free: false });
  s.close();
});

test('LifeX: тумблер в настройках сохраняется и не трогает данные гостей', async () => {
  const s = openStore(path.join(dir, 'lx-' + Date.now() + '.sqlite')); seed(s); const core = createCore(s, {});
  assert.equal(core.settings().lifex, undefined, 'по умолчанию поля нет');
  // гость привязал профиль LifeX
  core.linkLifex('g:guestkey123456', { id: 'u1', username: 'ivan', name: 'Иван', bio: 'био', phone: '555', url: 'https://lifex.ls-project.com/u', avatar: '' });
  assert.equal(s.get('profiles', 'g:guestkey123456').lifex.username, 'ivan');
  // админ выключает интеграцию — данные гостя должны остаться
  await core.handle('PUT', '/admin/settings/main', { body: { lifex: { enabled: false } }, user: ADMIN });
  assert.equal(core.settings().lifex.enabled, false);
  assert.equal(s.get('profiles', 'g:guestkey123456').lifex.username, 'ivan', 'привязанный профиль не сброшен');
  await core.handle('PUT', '/admin/settings/main', { body: { lifex: { enabled: true } }, user: ADMIN });
  assert.equal(core.settings().lifex.enabled, true);
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

test('LifeX: скачивание аватара отсекает внутренние адреса (SSRF)', () => {
  for (const ip of ['169.254.169.254', '127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '100.100.100.200', '::1', '::ffff:127.0.0.1'])
    assert.equal(privateIp(ip), true, ip + ' должен считаться приватным');
  for (const ip of ['8.8.8.8', '1.2.3.4', '2606:4700:4700::1111'])
    assert.equal(privateIp(ip), false, ip + ' должен считаться публичным');
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

test('кабинет и «Гости»: просьбы, поправки администратора, заметка и ключ не утекают', async () => {
  const s = openStore(path.join(dir, 'guests.sqlite')); seed(s); const core = createCore(s, {}); const admin = { id: 'a1', username: 'Админ', role: 'admin' }, mod = { id: 'm1', username: 'Мод', role: 'mod' }, guestKey = 'секретный-ключ-гостя';
  const go = (m, p, body, who = { guestKey }) => core.handle(m, p, { body, ...who });
  const free = s.all('rooms').find(r => r.status === 'free'), { booking: b } = await go('POST', '/bookings', { type: free.type, name: 'Тони', discord: 'tony', date: '2026-12-01', nights: 2, guests: 1 });
  await assert.rejects(go('POST', `/me/bookings/${b.id}/service`, { kind: 'towels' }), /недоступна/);
  await go('POST', `/admin/bookings/${b.id}/action`, { act: 'confirm', room: free.id }, { user: admin }); await go('POST', `/admin/bookings/${b.id}/action`, { act: 'checkin' }, { user: admin });
  const r = await go('POST', `/me/bookings/${b.id}/service`, { kind: 'wake', time: '08:00' }); assert.equal(r.booking.services[0].status, 'new');
  await assert.rejects(go('POST', `/me/bookings/${b.id}/service`, { kind: 'wake', time: '09:00' }), /уже передана/);
  for (const kind of ['__proto__', 'constructor', 'toString']) await assert.rejects(go('POST', `/me/bookings/${b.id}/service`, { kind }), /Такой услуги нет/);
  await assert.rejects(core.handle('POST', `/me/bookings/${b.id}/service`, { body: { kind: 'towels' }, guestKey: 'чужой' }), /не найдена/);
  await go('POST', `/admin/bookings/${b.id}/service`, { service: r.booking.services[0].id, status: 'done' }, { user: mod });
  await go('PUT', '/me/profile', { name: 'Тони', prefs: { pillow: 'firm', temp: 'lava', __proto__: { x: 1 } }, adj: { nights: 500 }, staffNote: 'взлом' });
  let me = await go('GET', '/me/items'); assert.deepEqual(me.profile.prefs, { pillow: 'firm' }); assert.equal(me.stats.nights, 0); assert.equal(me.bookings[0].services[0].status, 'done');
  for (const user of [mod, { id: 'g', username: 'G', role: 'guest' }]) await assert.rejects(go('GET', '/admin/guests', {}, { user }), /Недостаточно прав/);
  const list = await go('GET', '/admin/guests', {}, { user: admin }); assert.ok(!JSON.stringify(list).includes(guestKey), 'ключ гостя не уходит в панель');
  assert.ok(!JSON.stringify(await go('GET', '/admin/all', {}, { user: mod })).includes(guestKey));
  const g = list.guests.find(x => x.profile.name === 'Тони'); await go('PUT', `/admin/guests/${g.ref}`, { nights: 16, staffNote: 'тайна', tier: 'VIP' }, { user: admin });
  me = await go('GET', '/me/items'); assert.equal(me.stats.nights, 16); assert.equal(me.stats.tier.name, 'VIP'); assert.equal(me.stats.next, null); assert.ok(!JSON.stringify(me).includes('тайна'));
  await assert.rejects(go('PUT', `/admin/guests/${g.ref}`, { nights: -1 }, { user: admin }), /от 0/); await assert.rejects(go('PUT', '/admin/guests/нет', { name: 'x' }, { user: admin }), /не найден/);
  core.seen({ id: 'd1', username: 'Диск', role: 'guest' }); assert.equal(s.get('accounts', 'd:d1'), null); core.seen({ id: 'd1', username: 'Диск', role: 'guest' }, true); assert.equal(s.get('accounts', 'd:d1').logins, 1);
  await go('POST', '/me/delete', { confirm: 'УДАЛИТЬ' }, { user: { id: 'd1', username: 'Диск', role: 'guest' } }); assert.equal(s.get('accounts', 'd:d1'), null);
  await go('POST', `/admin/guests/${g.ref}/delete`, { confirm: 'УДАЛИТЬ' }, { user: admin }); assert.equal(s.all('bookings').length, 0);
  s.close();
});
