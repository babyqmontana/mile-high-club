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
