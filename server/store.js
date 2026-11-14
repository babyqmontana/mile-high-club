import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Простое хранилище документов поверх SQLite: коллекция + id + JSON.
// Чтения идут из памяти: коллекция один раз загружается из базы, дальше база только пишется.
// Документы хранятся строками JSON и разбираются при каждом чтении, поэтому вызывающий код
// по-прежнему получает свою копию и может её менять, не задевая кэш.
// rev(col) — номер версии коллекции: растёт при каждой записи, по нему сервер понимает, что ответ можно отдать из кэша.
export function openStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');   // с WAL это надёжно и в разы быстрее записи по умолчанию
  db.pragma('temp_store = MEMORY');
  db.exec('CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (col, id))');
  const qAll = db.prepare('SELECT id, data FROM docs WHERE col = ?');
  const qPut = db.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated = excluded.updated');
  const qDel = db.prepare('DELETE FROM docs WHERE col = ? AND id = ?');
  const qClear = db.prepare('DELETE FROM docs WHERE col = ?');

  const cache = new Map(), revs = new Map();
  const col = c => { let m = cache.get(c); if (!m) { m = new Map(qAll.all(c).map(r => [r.id, r.data])); cache.set(c, m); } return m; };
  const bump = c => revs.set(c, (revs.get(c) || 0) + 1);

  return {
    all: c => { const out = []; for (const s of col(c).values()) out.push(JSON.parse(s)); return out; },
    get: (c, id) => { const s = col(c).get(String(id)); return s ? JSON.parse(s) : null; },
    put: (c, id, doc) => {
      const s = JSON.stringify(doc), m = col(c), k = String(id);
      if (m.get(k) === s) return;                       // ничего не изменилось — не пишем и не будим подписчиков
      qPut.run(c, k, s, Date.now()); m.set(k, s); bump(c);
    },
    del: (c, id) => { const m = col(c), k = String(id); if (!m.has(k)) return; qDel.run(c, k); m.delete(k); bump(c); },
    clear: c => { qClear.run(c); cache.set(c, new Map()); bump(c); },
    rev: cols => cols.reduce((s, c) => s + (revs.get(c) || 0), 0),
    backup: dest => db.backup(dest),   // целая копия базы, без остановки сервера
    close: () => db.close()
  };
}
