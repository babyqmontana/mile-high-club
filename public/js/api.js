// Клиент API. На сервере — fetch к /api, в демо-версии (window.MHC_DEMO) — та же логика core.js прямо в браузере.
export const DEMO = !!window.MHC_DEMO;
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };
export const guestKey = ls.get('mhc-guest') || (() => { const k = Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set('mhc-guest', k); return k; })();
export const pref = ls;

let demo = null;
const listeners = new Set();
async function demoInit() {
  if (demo) return demo;
  const { createCore, seed } = await import('./core.js');
  const KEY = 'mhc-demo-v3';
  let data = {}; try { data = JSON.parse(ls.get(KEY) || '{}'); } catch { data = {}; }
  let saveT;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { } }, 400); };
  const col = c => (data[c] ||= {});
  const store = { all: c => Object.values(col(c)).map(x => structuredClone(x)), get: (c, id) => col(c)[id] ? structuredClone(col(c)[id]) : null, put: (c, id, d) => { col(c)[id] = structuredClone(d); persist(); }, del: (c, id) => { delete col(c)[id]; persist(); }, clear: c => { data[c] = {}; persist(); } };
  seed(store);
  const hooks = {
    changed: cols => setTimeout(() => listeners.forEach(fn => fn(cols)), 30),
    status: () => ({ connected: false, demo: true }),
    post: async () => true
  };
  const core = createCore(store, hooks);
  let user = null; try { user = JSON.parse(ls.get('mhc-demo-user') || 'null'); } catch { }
  demo = { core, store, get user() { return user; }, set user(u) { user = u; ls.set('mhc-demo-user', JSON.stringify(u)); } };
  return demo;
}

export async function api(method, path, body) {
  if (DEMO) {
    const d = await demoInit();
    try { return structuredClone(await d.core.handle(method, path, { body: body ? structuredClone(body) : {}, user: d.user, guestKey })); }
    catch (e) { const err = new Error(e.message || 'Ошибка'); err.status = e.status || 500; throw err; }
  }
  const r = await fetch('/api' + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Guest-Key': guestKey }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch { }
  if (!r.ok) { const e = new Error(j.error || 'Сервер недоступен, попробуйте ещё раз'); e.status = r.status; throw e; }
  return j;
}

export function subscribe(fn) {
  if (DEMO) { listeners.add(fn); return () => listeners.delete(fn); }
  let es, closed = false;
  const open = () => { es = new EventSource('/api/stream'); es.onmessage = e => { try { fn(JSON.parse(e.data).cols || []); } catch { } }; es.onerror = () => { es.close(); if (!closed) setTimeout(open, 4000); }; };
  open(); return () => { closed = true; es?.close(); };
}

export async function authConfig() {
  if (DEMO) return { oauth: false, demo: true };
  try { return await fetch('/auth/config').then(r => r.json()); } catch { return { oauth: false, demo: false }; }
}
export async function login(role = 'admin', next = 'admin') {
  if (DEMO) { const d = await demoInit(); d.user = { id: 'demo-' + role, username: role === 'admin' ? 'Демо-администратор' : role === 'mod' ? 'Демо-модератор' : 'Демо-гость', role, demo: true }; listeners.forEach(fn => fn(['me'])); return; }
  const cfg = await authConfig();
  location.href = cfg.oauth ? '/auth/discord?next=' + next : '/auth/demo?role=' + role;
}
export async function logout() {
  if (DEMO) { const d = await demoInit(); d.user = null; listeners.forEach(fn => fn(['me'])); return; }
  await fetch('/auth/logout', { method: 'POST' }); location.hash = '#home'; location.reload();
}

export async function upload(files) {
  files = [...files];
  if (DEMO) {
    const d = await demoInit(); const out = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const url = await shrink(f);
      const id = 'm' + Math.random().toString(36).slice(2, 9); const doc = { id, url, name: f.name, at: Date.now() };
      d.store.put('media', id, doc); out.push(doc);
    }
    listeners.forEach(fn => fn(['media'])); return out;
  }
  const fd = new FormData(); files.forEach(f => fd.append('files', f));
  const r = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Не удалось загрузить');
  return j.files || [];
}
// в демо картинки уменьшаем, чтобы влезли в память браузера
function shrink(file, max = 1400) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/webp', .82)); URL.revokeObjectURL(img.src); }; img.onerror = rej; img.src = URL.createObjectURL(file); });
}
