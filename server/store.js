import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Простое хранилище документов поверх SQLite: коллекция + id + JSON.
export function openStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (col, id))');
  const qAll = db.prepare('SELECT data FROM docs WHERE col = ?');
  const qGet = db.prepare('SELECT data FROM docs WHERE col = ? AND id = ?');
  const qPut = db.prepare('INSERT INTO docs (col, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated = excluded.updated');
  const qDel = db.prepare('DELETE FROM docs WHERE col = ? AND id = ?');
  const qClear = db.prepare('DELETE FROM docs WHERE col = ?');
  return {
    all: col => qAll.all(col).map(r => JSON.parse(r.data)),
    get: (col, id) => { const r = qGet.get(col, String(id)); return r ? JSON.parse(r.data) : null; },
    put: (col, id, doc) => { qPut.run(col, String(id), JSON.stringify(doc), Date.now()); },
    del: (col, id) => { qDel.run(col, String(id)); },
    clear: col => { qClear.run(col); },
    close: () => db.close()
  };
}
