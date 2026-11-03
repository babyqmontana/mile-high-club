import express from 'express';
import compression from 'compression';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.js';
import { createCore, seed, HttpError } from '../public/js/core.js';
import { startBot } from './bot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(ROOT, '.env'));
const env = process.env;
const PORT = +env.PORT || 3000;
const DATA = path.resolve(ROOT, env.DATA_DIR || 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const SECRET = env.SESSION_SECRET || (() => { const f = path.join(DATA, '.secret'); if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex')); return fs.readFileSync(f, 'utf8'); })();
const DEMO = env.DEMO_LOGIN === 'true';
const OAUTH = !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_REDIRECT_URI);

const store = openStore(path.join(DATA, 'mhc.sqlite'));
if (seed(store)) console.log('База создана и заполнена стартовыми данными');

/* ---- realtime (SSE) ---- */
const clients = new Set();
let pending = new Set(), flushT = null;
const hooks = {
  changed(cols) { cols.forEach(c => pending.add(c)); clearTimeout(flushT); flushT = setTimeout(() => { const msg = `data: ${JSON.stringify({ cols: [...pending] })}\n\n`; pending = new Set(); for (const r of clients) r.write(msg); }, 200); }
};
const core = createCore(store, hooks);
const bot = await startBot({ core, store, env, hooks }).catch(e => { console.error('Discord-бот не запустился:', e.message); return null; });

/* ---- сессии: подписанная cookie ---- */
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const encode = obj => { const v = Buffer.from(JSON.stringify(obj)).toString('base64url'); return v + '.' + sign(v); };
const decode = s => { if (!s) return null; const [v, sig] = s.split('.'); if (!v || !sig) return null; const a = Buffer.from(sign(v)), b = Buffer.from(sig); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; try { const o = JSON.parse(Buffer.from(v, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; } };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(p => p[0]));
const secure = (env.PUBLIC_URL || '').startsWith('https');
const setCookie = (res, name, val, maxAge) => res.append('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);

async function currentUser(req, res) {
  const s = decode(cookies(req).mhc_s); if (!s) return null;
  // роль перепроверяем через бота раз в 10 минут: сняли роль в Discord — пропал доступ
  if (bot && s.checked < Date.now() - 10 * 60e3 && !s.demo) {
    const role = await hooks.resolveRole?.(s.id).catch(() => null);
    if (role) { s.role = role; s.checked = Date.now(); setCookie(res, 'mhc_s', encode(s), 7 * 86400); }
  }
  return { id: s.id, username: s.username, avatar: s.avatar, role: s.role, demo: !!s.demo };
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// gzip/brotli для всего, кроме потока событий: сжатие буферизует SSE и события перестают приходить
app.use(compression({ filter: (req, res) => req.path !== '/api/stream' && compression.filter(req, res) }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'same-origin'); next(); });

/* ---- вход через Discord ---- */
app.get('/auth/config', (req, res) => res.json({ oauth: OAUTH, demo: DEMO }));
app.get('/auth/discord', (req, res) => {
  if (!OAUTH) return res.redirect('/#admin');
  const state = crypto.randomBytes(16).toString('hex'); setCookie(res, 'mhc_state', state + '|' + String(req.query.next || 'admin').replace(/[^a-z-]/g, ''), 600);
  const q = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, redirect_uri: env.DISCORD_REDIRECT_URI, response_type: 'code', scope: 'identify guilds.members.read', state, prompt: 'none' });
  res.redirect('https://discord.com/oauth2/authorize?' + q);
});
app.get('/auth/callback', async (req, res) => {
  try {
    const [state, next] = (cookies(req).mhc_state || '').split('|');
    if (!req.query.code || !state || state !== req.query.state) throw new Error('state');
    const tok = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code: req.query.code, redirect_uri: env.DISCORD_REDIRECT_URI }) }).then(r => r.json());
    if (!tok.access_token) throw new Error('token');
    const auth = { Authorization: 'Bearer ' + tok.access_token };
    const me = await fetch('https://discord.com/api/users/@me', { headers: auth }).then(r => r.json());
    let role = 'guest';
    if (bot) role = (await hooks.resolveRole?.(me.id).catch(() => null)) || 'guest';
    else if (env.GUILD_ID) { // без бота: роли из OAuth и списка ID в .env
      const m = await fetch(`https://discord.com/api/users/@me/guilds/${env.GUILD_ID}/member`, { headers: auth }).then(r => r.ok ? r.json() : null);
      const ids = new Set(m?.roles || []); const has = k => (env[k] || '').split(',').map(s => s.trim()).filter(Boolean).some(id => ids.has(id));
      role = has('ADMIN_ROLE_IDS') ? 'admin' : has('MOD_ROLE_IDS') ? 'mod' : 'guest';
    }
    const avatar = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null;
    setCookie(res, 'mhc_s', encode({ id: me.id, username: me.global_name || me.username, avatar, role, checked: Date.now(), exp: Date.now() + 7 * 86400e3 }), 7 * 86400);
    setCookie(res, 'mhc_state', '', 0);
    core.log(`${me.global_name || me.username} вошёл через Discord (${role === 'admin' ? 'администратор' : role === 'mod' ? 'модератор' : 'гость'})`, 'auth');
    res.redirect('/#' + (role === 'guest' ? (next === 'admin' ? 'admin' : next || 'home') : next || 'admin'));
  } catch (e) { res.redirect('/#login-error'); }
});
app.get('/auth/demo', (req, res) => {
  if (!DEMO) return res.status(404).end();
  const role = ['admin', 'mod', 'guest'].includes(req.query.role) ? req.query.role : 'admin';
  setCookie(res, 'mhc_s', encode({ id: 'demo-' + role, username: role === 'admin' ? 'Демо-администратор' : role === 'mod' ? 'Демо-модератор' : 'Демо-гость', avatar: null, role, demo: true, checked: Date.now(), exp: Date.now() + 86400e3 }), 86400);
  res.redirect('/#' + (role === 'guest' ? 'home' : 'admin'));
});
app.post('/auth/logout', (req, res) => { setCookie(res, 'mhc_s', '', 0); res.json({ ok: true }); });

/* ---- загрузка картинок ---- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'model/gltf-binary': 'glb', 'application/octet-stream': 'glb' };
app.post('/api/admin/upload', upload.array('files', 60), async (req, res) => {
  const user = await currentUser(req, res);
  if (!user || !['admin', 'mod'].includes(user.role)) return res.status(403).json({ error: 'Нужен вход персонала' });
  const out = [];
  for (const f of req.files || []) {
    const isGlb = /\.glb$/i.test(f.originalname);
    const ext = isGlb ? 'glb' : EXT[f.mimetype]; if (!ext || (ext === 'glb' && !isGlb)) continue;
    if (isGlb && user.role !== 'admin') continue;
    const id = crypto.randomBytes(8).toString('hex'), name = `${id}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS, name), f.buffer);
    const doc = { id, url: '/uploads/' + name, name: String(f.originalname).slice(0, 80), size: f.size, at: Date.now() };
    store.put('media', id, doc); out.push(doc);
  }
  hooks.changed(['media']);
  res.json({ files: out });
});

/* ---- поток изменений ---- */
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders(); res.write('retry: 3000\n\n'); clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

/* ---- API ---- */
const hits = new Map();
const limited = (ip) => { const now = Date.now(), h = (hits.get(ip) || []).filter(t => t > now - 60e3); h.push(now); hits.set(ip, h); return h.length > 40; };
app.all('/api/*', async (req, res) => {
  try {
    if (req.method !== 'GET' && !req.path.startsWith('/api/admin') && limited(req.ip)) return res.status(429).json({ error: 'Слишком много запросов, подождите минуту' });
    const user = await currentUser(req, res);
    const out = await core.handle(req.method, req.path.slice(4), { body: req.body, user, guestKey: req.get('x-guest-key') });
    res.set('Cache-Control', 'no-store').json(out);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(e); res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ---- статика ---- */
// Сборщика нет, поэтому версии ставит сервер: при старте считает хеш каждого JS/CSS и вписывает
// их в importmap страницы. Importmap срабатывает и для относительных импортов ('./ui.js'),
// так что все модули грузятся с ?v=хеш и кэшируются навсегда, а после выкладки — обновляются сразу.
const PUBLIC = path.join(ROOT, 'public');
const INDEX_HTML = renderIndex();
app.use('/uploads', express.static(UPLOADS, { maxAge: '30d', immutable: true }));
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(PUBLIC, { index: false, maxAge: '1h', setHeaders: (res, p) => {
  if (res.req.query.v) res.set('Cache-Control', 'public, max-age=31536000, immutable');
  else if (/\.(glb|webp|jpg|png|woff2)$/.test(p)) res.set('Cache-Control', 'public, max-age=604800');
} }));
app.get('*', sendIndex);
function sendIndex(req, res) { res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }).send(INDEX_HTML); }
function renderIndex() {
  const files = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.(js|css)$/.test(e.name)) files.push(f); } };
  ['js', 'css', 'vendor'].forEach(d => fs.existsSync(path.join(PUBLIC, d)) && walk(path.join(PUBLIC, d)));
  const ver = {};
  for (const f of files) ver['/' + path.relative(PUBLIC, f).split(path.sep).join('/')] = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
  const v = url => url + '?v=' + ver[url];
  let html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  const imports = {};
  for (const [k, target] of Object.entries(map.imports)) {
    const abs = '/' + target.replace(/^\.\//, '');
    if (k.endsWith('/')) { // префикс вроде three/addons/ — каждому файлу под ним своя версия
      for (const url of Object.keys(ver)) if (url.startsWith(abs)) imports[k + url.slice(abs.length)] = v(url);
      imports[k] = abs;
    } else imports[k] = ver[abs] ? v(abs) : abs;
  }
  for (const url of Object.keys(ver)) if (url.endsWith('.js')) imports[url] = v(url);
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${JSON.stringify({ imports })}</script>`);
  // прямые ссылки из разметки: css/app.css, js/main.js, vendor/page-flip.browser.js
  html = html.replace(/(href|src)="((?:css|js|vendor)\/[^"?]+\.(?:css|js))"/g, (m, attr, rel) => ver['/' + rel] ? `${attr}="${v('/' + rel)}"` : m);
  return html;
}

app.listen(PORT, () => console.log(`Mile High Club: http://localhost:${PORT}  (Discord-вход: ${OAUTH ? 'включён' : 'не настроен'}, демо-вход: ${DEMO ? 'включён' : 'выключен'}, бот: ${bot ? 'запущен' : 'не запущен'})`));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
}
