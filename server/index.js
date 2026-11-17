import express from 'express';
import compression from 'compression';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { openStore } from './store.js';
import { createCore, seed, HttpError } from '../public/js/core.js';
import { startBot } from './bot.js';
import { mountLifex } from './lifex.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(ROOT, '.env'));
const env = process.env;
const PORT = +env.PORT || 3000;
const DATA = path.resolve(ROOT, env.DATA_DIR || 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
// Ключ сессий: заготовка из .env.example или короткая строка — это не секрет, подписи можно подделать.
// Тогда берём случайный ключ из data/.secret и предупреждаем.
const weakSecret = !env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || /замените|change.?me/i.test(env.SESSION_SECRET);
if (env.SESSION_SECRET && weakSecret) console.warn('SESSION_SECRET слабый или не заменён — используется случайный ключ из data/.secret');
const SECRET = !weakSecret ? env.SESSION_SECRET : (() => { const f = path.join(DATA, '.secret'); if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex')); return fs.readFileSync(f, 'utf8'); })();
// Демо-вход даёт права администратора любому: в боевом режиме (NODE_ENV=production) он выключен,
// включить его там можно только явным ALLOW_DEMO_IN_PRODUCTION=true
const DEMO = env.DEMO_LOGIN === 'true' && (env.NODE_ENV !== 'production' || env.ALLOW_DEMO_IN_PRODUCTION === 'true');
if (env.DEMO_LOGIN === 'true' && !DEMO) console.warn('DEMO_LOGIN проигнорирован: в боевом режиме демо-вход выключен');
else if (DEMO) console.warn('ВНИМАНИЕ: включён демо-вход — любой посетитель может войти администратором');
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
// Обращение, у которого процесс упал посреди открытия канала, возвращаем гостю на выбор, а не держим в «открывается»
for (const t of store.all('tickets').filter(x => x.status === 'opening')) store.put('tickets', t.id, { ...t, status: 'checking' });
// Резервные копии базы: при запуске и раз в сутки, хранится 7 последних (data/backups)
const BACKUPS = path.join(DATA, 'backups');
async function backupDb() {
  try {
    fs.mkdirSync(BACKUPS, { recursive: true });
    const name = `mhc-${new Date().toISOString().slice(0, 10)}.sqlite`; await store.backup(path.join(BACKUPS, name));
    fs.readdirSync(BACKUPS).filter(f => /^mhc-.*\.sqlite$/.test(f)).sort().reverse().slice(7).forEach(f => fs.rmSync(path.join(BACKUPS, f), { force: true }));
  } catch (e) { console.error('Резервная копия не сделана:', e.message); }
}
setTimeout(backupDb, 60e3).unref(); setInterval(backupDb, 24 * 3600e3).unref();
// Бот не поднялся: его хуки убираем, иначе сайт будет считать заявки отправленными
const bot = await startBot({ core, store, env, hooks }).catch(e => { console.error('Discord-бот не запустился:', e.message); Object.keys(hooks).filter(k => k !== 'changed').forEach(k => delete hooks[k]); return null; });

/* ---- сессии: подписанная cookie ---- */
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const encode = obj => { const v = Buffer.from(JSON.stringify(obj)).toString('base64url'); return v + '.' + sign(v); };
const decode = s => { if (!s) return null; const [v, sig] = s.split('.'); if (!v || !sig) return null; const a = Buffer.from(sign(v)), b = Buffer.from(sig); if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; try { const o = JSON.parse(Buffer.from(v, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; } };
const dec = v => { try { return decodeURIComponent(v); } catch { return v; } };  // кривой % в cookie не должен ронять запрос
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => { const i = c.indexOf('='); return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), dec(c.slice(i + 1).trim())]; }).filter(p => p[0]));
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
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self' https://discord.com" });
  if (secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
// Защита от подделки запросов с чужих сайтов: изменяющий запрос должен прийти с нашего же адреса.
// Браузер всегда шлёт Origin для POST/PUT/DELETE через fetch; запросы без Origin (curl, бот на сервере) не трогаем.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const o = req.get('origin'); if (!o) return next();
  let host; try { host = new URL(o).host; } catch { return res.status(403).json({ error: 'Запрос отклонён' }); }
  if (host !== req.get('host') && host !== req.get('x-forwarded-host')) return res.status(403).json({ error: 'Запрос с чужого сайта отклонён' });
  next();
});

/* ---- вход через Discord ---- */
app.get('/auth/config', (req, res) => res.json({ oauth: OAUTH, demo: DEMO, lifex: !!hooks.lifexOn?.() }));
app.get('/auth/discord', (req, res) => {
  if (!OAUTH) return res.redirect('/#admin');
  const state = crypto.randomBytes(16).toString('hex'); setCookie(res, 'mhc_state', state + '|' + String(req.query.next || 'admin').replace(/[^a-z-]/g, ''), 600);
  const q = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, redirect_uri: env.DISCORD_REDIRECT_URI, response_type: 'code', scope: 'identify guilds.members.read', state, prompt: 'none' });
  res.redirect('https://discord.com/oauth2/authorize?' + q);
});
app.get('/auth/callback', async (req, res) => {
  if (limited('auth:' + req.ip)) return res.redirect('/#login-error');
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
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 40, fields: 10, parts: 60 } });
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'model/gltf-binary': 'glb', 'application/octet-stream': 'glb', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a' };
// тип файла проверяется по содержимому, а не по тому, что прислал браузер
const MAGIC = { jpg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, png: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  webp: b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP', gif: b => /^GIF8[79]a$/.test(b.toString('latin1', 0, 6)), glb: b => b.toString('latin1', 0, 4) === 'glTF',
  mp3: b => b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0), ogg: b => b.toString('latin1', 0, 4) === 'OggS', m4a: b => b.toString('latin1', 4, 8) === 'ftyp' };
// права проверяются ДО приёма файлов: иначе любой мог бы прислать сотни мегабайт в память сервера
const staffOnly = async (req, res, next) => { try { const user = await currentUser(req, res); if (!user || !['admin', 'mod'].includes(user.role)) return res.status(403).json({ error: 'Нужен вход персонала' }); req.user = user; next(); } catch (e) { next(e); } };
let uploading = 0;
const uploadSlot = (req, res, next) => { if (uploading >= 3) return res.status(503).json({ error: 'Сервер занят загрузкой, повторите через минуту' }); uploading++; res.on('close', () => uploading--); next(); };
app.post('/api/admin/upload', staffOnly, uploadSlot, (req, res, next) => upload.array('files', 40)(req, res, e => e ? res.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 10 МБ' : 'Файлы не приняты' }) : next()), async (req, res) => {
  const user = req.user;
  const out = [];
  for (const f of req.files || []) {
    const isGlb = /\.glb$/i.test(f.originalname), am = /\.(mp3|ogg|m4a)$/i.exec(f.originalname);
    const ext = isGlb ? 'glb' : am ? am[1].toLowerCase() : EXT[f.mimetype]; if (!ext || (ext === 'glb' && !isGlb) || !MAGIC[ext]?.(f.buffer)) continue;
    if ((isGlb || am) && user.role !== 'admin') continue;
    const id = crypto.randomBytes(8).toString('hex'), name = `${id}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS, name), f.buffer);
    const doc = { id, url: '/uploads/' + name, name: String(f.originalname).slice(0, 80), size: f.size, at: Date.now() };
    store.put('media', id, doc); out.push(doc);
  }
  hooks.changed(['media']);
  res.json({ files: out });
});

/* ---- поток изменений ---- */
const perIp = new Map(), MAX_STREAMS = 5000, MAX_PER_IP = 12;
app.get('/api/stream', (req, res) => {
  const ip = req.ip, n = perIp.get(ip) || 0;
  if (clients.size >= MAX_STREAMS || n >= MAX_PER_IP) return res.status(429).end();
  perIp.set(ip, n + 1); res.on('close', () => { const k = (perIp.get(ip) || 1) - 1; if (k) perIp.set(ip, k); else perIp.delete(ip); });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders(); res.write('retry: 5000\n\n'); clients.add(res);
  req.on('close', () => clients.delete(res));
});
// один общий таймер «пинга» на всех подключённых, а не по таймеру на каждого
setInterval(() => { for (const r of clients) r.write(': ping\n\n'); }, 25000).unref();

/* ---- API ---- */
const hits = new Map();
const limited = (ip) => { const now = Date.now(), h = (hits.get(ip) || []).filter(t => t > now - 60e3); h.push(now); hits.set(ip, h); return h.length > 40; };
setInterval(() => { const old = Date.now() - 60e3; for (const [ip, h] of hits) if (!h.length || h[h.length - 1] < old) hits.delete(ip); }, 60e3).unref();
// создание броней, заказов, заявок и отзывов — отдельный, более строгий лимит с одного адреса
const slow = new Map();
const limitedBy = (key, max, ms) => { const now = Date.now(), h = (slow.get(key) || []).filter(t => t > now - ms); if (h.length >= max) { slow.set(key, h); return true; } h.push(now); slow.set(key, h); return false; };
setInterval(() => { const old = Date.now() - 3600e3; for (const [k, h] of slow) if (!h.length || h[h.length - 1] < old) slow.delete(k); }, 600e3).unref();
const CREATE = [[/^\/api\/(bookings|orders|tickets|me\/reviews)$/, 'create', 8, 10 * 60e3], [/^\/api\/check-discord$/, 'check', 12, 60e3]];
// Публичные данные одинаковы для всех гостей: собираем их один раз на версию данных (и раз в минуту — из-за
// времени событий), сжимаем один раз и отдаём с ETag. Повторный запрос браузера получает 304 без тела.
const PUBLIC_COLS = ['settings', 'types', 'rooms', 'venues', 'menu', 'cigars', 'depts', 'team', 'offers', 'faq', 'issues', 'events', 'media', 'jobs', 'reviews', 'rsvp'];
let pubCache = null;
app.get('/api/public', (req, res, next) => {
  try {
    const g = hooks.guests?.(); // онлайн сервера не хранится в базе: без него в ключе новые цифры ждали бы минуту
    const key = store.rev(PUBLIC_COLS) + ':' + Math.floor(Date.now() / 60e3) + ':' + (g ? g.online + '/' + g.total : '-');
    if (!pubCache || pubCache.key !== key) {
      const raw = Buffer.from(JSON.stringify(core.publicData()));
      const etag = '"p' + crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 16) + '"';
      pubCache = pubCache?.etag === etag ? { ...pubCache, key } : { key, etag, raw, br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }), gz: zlib.gzipSync(raw, { level: 6 }) };
    }
    sendBuf(req, res, pubCache, 'application/json; charset=utf-8', 'no-cache');
  } catch (e) { next(e); }
});
// привязка профиля LifeX к кабинету гостя (подключается, когда в .env заданы адреса LifeX)
mountLifex(app, { env, core, setCookie, encode, decode, cookies, currentUser, limited, UPLOADS, MAGIC, secure, hooks });
app.all('/api/*', async (req, res) => {
  try {
    if (req.method !== 'GET' && !req.path.startsWith('/api/admin') && limited(req.ip)) return res.status(429).json({ error: 'Слишком много запросов, подождите минуту' });
    if (req.method === 'POST') for (const [re, k, max, ms] of CREATE) if (re.test(req.path) && limitedBy(k + ':' + req.ip, max, ms)) return res.status(429).json({ error: k === 'check' ? 'Слишком много проверок, подождите минуту' : 'Слишком много заявок подряд. Подождите несколько минут или напишите управляющим' });
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
// Текстовая статика (js, css, svg, json) сжимается один раз — brotli и gzip — и дальше отдаётся из памяти,
// а не пережимается на каждый запрос. Сжатие идёт в пуле потоков, сервер не замирает.
const brotli = promisify(zlib.brotliCompress), gzip = promisify(zlib.gzip), staticCache = new Map();
const TEXT = { '.webmanifest': 'application/manifest+json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
app.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const type = TEXT[path.extname(req.path)]; if (!type) return next();
  let file; try { file = path.join(PUBLIC, decodeURIComponent(req.path)); } catch { return next(); }
  if (!file.startsWith(PUBLIC + path.sep)) return next();
  let st; try { st = fs.statSync(file); } catch { return next(); } if (!st.isFile()) return next();
  const id = file + ':' + st.mtimeMs + ':' + st.size;
  let entry = staticCache.get(file);
  if (!entry || entry.id !== id) {
    const raw = fs.readFileSync(file);
    entry = { id, raw, etag: '"s' + crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 16) + '"', ready: Promise.all([brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }), gzip(raw, { level: 9 })]) };
    staticCache.set(file, entry);
    entry.ready.then(([br, gz]) => { entry.br = br; entry.gz = gz; }).catch(() => {});
  }
  if (!entry.br) await entry.ready.catch(() => {});
  const cc = req.path === '/sw.js' ? 'no-cache' : req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
  sendBuf(req, res, entry, type, cc);
});
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(PUBLIC, { index: false, maxAge: '1h', setHeaders: (res, p) => {
  if (res.req.query.v) res.set('Cache-Control', 'public, max-age=31536000, immutable');
  else if (/\.(glb|webp|jpg|png|woff2)$/.test(p)) res.set('Cache-Control', 'public, max-age=604800');
} }));
app.get('*', sendIndex);
const INDEX_BUF = (() => { const raw = Buffer.from(INDEX_HTML); return { raw, etag: '"i' + crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 16) + '"', br: zlib.brotliCompressSync(raw), gz: zlib.gzipSync(raw, { level: 9 }) }; })();
function sendIndex(req, res) { sendBuf(req, res, INDEX_BUF, 'text/html; charset=utf-8', 'no-cache'); }
// Отдать заранее сжатый буфер: 304 по ETag, иначе brotli/gzip по Accept-Encoding
function sendBuf(req, res, e, type, cacheControl) {
  res.set({ 'Content-Type': type, 'Cache-Control': cacheControl, ETag: e.etag, Vary: 'Accept-Encoding' });
  if (req.headers['if-none-match'] === e.etag) return res.status(304).end();
  const ae = String(req.headers['accept-encoding'] || ''), body = e.br && /\bbr\b/.test(ae) ? (res.set('Content-Encoding', 'br'), e.br) : e.gz && /\bgzip\b/.test(ae) ? (res.set('Content-Encoding', 'gzip'), e.gz) : e.raw;
  res.set('Content-Length', body.length); return req.method === 'HEAD' ? res.end() : res.end(body);
}
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
  // превью ссылки (Discord, Telegram) понимает только полные адреса: подставляем PUBLIC_URL
  const site = (env.PUBLIC_URL || '').replace(/\/$/, '');
  if (/^https?:\/\//.test(site)) html = html.replace(/(<meta (?:property|name)="(?:og:url|og:image|twitter:image)" content=")\//g, `$1${site}/`);
  return html;
}

app.use((err, req, res, next) => { console.error(err); if (res.headersSent) return res.end(); res.status(500).json({ error: 'Ошибка сервера' }); });
process.on('unhandledRejection', e => console.error('Необработанная ошибка:', e));
process.on('uncaughtException', e => { console.error('Непойманное исключение, перезапуск:', e); process.exit(1); });  // systemd поднимет заново
app.listen(PORT, () => console.log(`Mile High Club: http://localhost:${PORT}  (Discord-вход: ${OAUTH ? 'включён' : 'не настроен'}, демо-вход: ${DEMO ? 'включён' : 'выключен'}, бот: ${bot ? 'запущен' : 'не запущен'})`));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
}
