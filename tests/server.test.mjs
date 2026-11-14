// Нагрузка на сервер: кэш данных, ответы 304, заранее сжатая статика, отсутствие лишних записей.
// npm run test:server — поднимает сервер на свободном порту с временной базой.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../server/store.js';
import { createCore, seed } from '../public/js/core.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 3400 + Math.floor(Math.random() * 500), BASE = `http://127.0.0.1:${PORT}`;
let srv, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mhc-srv-'));
  srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DISCORD_BOT_TOKEN: '', GUILD_ID: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/api/public')).ok) return; } catch { } await new Promise(r => setTimeout(r, 250)); }
  throw new Error('сервер не поднялся');
});
after(() => { srv?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

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
