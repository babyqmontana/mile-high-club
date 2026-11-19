// Привязка профиля LifeX (внутриигровая соцсеть) к кабинету гостя.
// Схема — OAuth 2.0 с PKCE, как на странице авторизации LifeX (/oauth/authorize: response_type, client_id, redirect_uri,
// scope, state, code_challenge, code_challenge_method). Адреса выдачи токена и профиля берутся из документации
// приложения LifeX (/dev/docs) и задаются в .env: LIFEX_TOKEN_URL и LIFEX_PROFILE_URL.
// Токены не сохраняются: профиль читается один раз при привязке, аватар копируется к нам в uploads.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';

// адрес из частного/локального диапазона (loopback, LAN, link-local, облачные метаданные) — цель SSRF, не публичный хост
export function privateIp(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127); }
  const x = ip.toLowerCase().replace(/^\[|\]$/g, '');
  return x === '::1' || x === '::' || x.startsWith('fe80') || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('::ffff:') && privateIp(x.slice(7));
}
// хост публичный только если ВСЕ его A/AAAA-записи вне частных диапазонов (защита и от DNS-rebinding на момент проверки)
async function publicHost(host) {
  if (net.isIP(host)) return !privateIp(host);
  try { const ips = await dns.lookup(host, { all: true }); return ips.length > 0 && ips.every(a => !privateIp(a.address)); } catch { return false; }
}

const b64url = buf => Buffer.from(buf).toString('base64url');
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : typeof v === 'number' ? String(v).slice(0, n) : '');

// Поля профиля у разных API называются по-разному — берём первое найденное
export function readProfile(raw) {
  const j = raw?.user || raw?.data?.user || raw?.data || raw?.profile || raw || {};
  const pick = (...ks) => { for (const k of ks) { const v = k.split('.').reduce((o, p) => o?.[p], j); if (v != null && v !== '') return v; } return null; };
  let avatar = pick('avatar_url', 'avatarUrl', 'avatar.url', 'avatar', 'picture', 'photo_url', 'photoUrl', 'profile_image_url', 'image');
  if (avatar && typeof avatar === 'object') avatar = avatar.url || null;
  const id = str(pick('id', 'sub', 'user_id', 'userId', 'uid'), 64), username = str(pick('username', 'handle', 'login', 'preferred_username', 'nickname'), 40);
  const url = str(pick('profile_url', 'profileUrl', 'url', 'link'), 300);
  return {
    id, username,
    name: str(pick('display_name', 'displayName', 'name', 'full_name', 'fullName'), 60) || username,
    bio: str(pick('bio', 'description', 'about', 'status'), 300),
    phone: str(pick('phone', 'phone_number', 'phoneNumber'), 20),
    url: /^https:\/\//.test(url) ? url : '',
    avatar: typeof avatar === 'string' && /^https?:\/\//.test(avatar) ? avatar.slice(0, 500) : ''
  };
}

export function mountLifex(app, { env, core, setCookie, encode, decode, cookies, currentUser, limited, UPLOADS, MAGIC, secure, hooks }) {
  const conf = {
    clientId: env.LIFEX_CLIENT_ID || '', secret: env.LIFEX_CLIENT_SECRET || '', redirect: env.LIFEX_REDIRECT_URI || '',
    authUrl: env.LIFEX_AUTH_URL || 'https://lifex.ls-project.com/oauth/authorize',
    tokenUrl: env.LIFEX_TOKEN_URL || '', profileUrl: env.LIFEX_PROFILE_URL || '', scope: env.LIFEX_SCOPE || 'profile'
  };
  // LifeX выключен по умолчанию: включается только явным LIFEX_ENABLED=true и при заданных адресах приложения
  const on = env.LIFEX_ENABLED === 'true' && !!(conf.clientId && conf.redirect && conf.tokenUrl && conf.profileUrl);
  // короткое сообщение для кабинета: сайт покажет его всплывашкой и сотрёт
  const flash = (res, code) => res.append('Set-Cookie', `mhc_lx_msg=${code}; Path=/; Max-Age=120; SameSite=Lax${secure ? '; Secure' : ''}`);
  const back = (res, code) => { setCookie(res, 'mhc_lx', '', 0); flash(res, code); res.redirect('/#me'); };

  // аватар забираем к себе: картинка не пропадёт, если в LifeX её сменят, а гости не ходят за ней на чужой сервер
  // адрес аватара пришёл из ответа LifeX: качаем только по https или с того же сервера, что и API профиля
  const sameHost = u => { try { return new URL(u).host === new URL(conf.profileUrl).host; } catch { return false; } };
  async function saveAvatar(url, id) {
    if (!url || !(/^https:\/\//.test(url) || sameHost(url))) return '';
    try {
      // аватар качаем только с публичного хоста: внутренние адреса и облачные метаданные закрыты (SSRF)
      let host; try { host = new URL(url).hostname; } catch { return ''; }
      if (!(await publicHost(host))) return '';
      const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) }); if (!r.ok) return '';
      if (+(r.headers.get('content-length') || 0) > 3 * 1024 * 1024) return '';
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 3 * 1024 * 1024) return '';
      const ext = ['png', 'jpg', 'webp', 'gif'].find(e => MAGIC[e]?.(buf)); if (!ext) return '';
      const name = `lx-${crypto.createHash('sha1').update(id + ':' + buf.length + ':' + Date.now()).digest('hex').slice(0, 16)}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS, name), buf); return '/uploads/' + name;
    } catch { return ''; }
  }
  // удалить свою копию аватара, когда профиль отвязан или данные удалены
  hooks.removeUpload = url => { const m = /^\/uploads\/(lx-[a-f0-9]{16}\.(png|jpg|webp|gif))$/.exec(url || ''); if (m) fs.rmSync(path.join(UPLOADS, m[1]), { force: true }); };
  hooks.lifexOn = () => on;

  // начало: гость с кабинета; без входа через Discord профиль привязывается к ключу этого устройства
  app.get('/auth/lifex', async (req, res) => {
    if (!on) return back(res, 'off');
    const user = await currentUser(req, res).catch(() => null), gk = str(req.query.gk, 64);
    const owner = user ? 'd:' + user.id : /^[\w.-]{8,64}$/.test(gk) ? 'g:' + gk : null;
    if (!owner) return back(res, 'owner');
    const state = b64url(crypto.randomBytes(16)), verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    setCookie(res, 'mhc_lx', encode({ state, verifier, owner, exp: Date.now() + 600e3 }), 600);
    res.redirect(conf.authUrl + '?' + new URLSearchParams({ response_type: 'code', client_id: conf.clientId, redirect_uri: conf.redirect, scope: conf.scope, state, code_challenge: challenge, code_challenge_method: 'S256' }));
  });

  app.get('/auth/lifex/callback', async (req, res) => {
    if (limited('lifex:' + req.ip)) return back(res, 'error');
    const s = decode(cookies(req).mhc_lx);
    if (!s || s.exp < Date.now() || !req.query.state || req.query.state !== s.state) return back(res, 'error');
    if (req.query.error) return back(res, req.query.error === 'access_denied' ? 'denied' : 'error');
    if (!req.query.code) return back(res, 'error');
    try {
      const body = new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: conf.redirect, client_id: conf.clientId, code_verifier: s.verifier });
      if (conf.secret) body.set('client_secret', conf.secret);
      const tok = await fetch(conf.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body, signal: AbortSignal.timeout(10000) }).then(r => r.json());
      if (!tok?.access_token) throw new Error('нет токена');
      const raw = await fetch(conf.profileUrl, { headers: { Authorization: 'Bearer ' + tok.access_token, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null);
      const p = readProfile(raw); if (!p.id && !p.username) throw new Error('пустой профиль');
      const avatar = await saveAvatar(p.avatar, p.id || p.username);
      core.linkLifex(s.owner, { id: p.id, username: p.username, name: p.name, bio: p.bio, phone: p.phone, url: p.url, avatar });
      back(res, 'ok');
    } catch (e) { console.error('LifeX:', e.message); back(res, 'error'); }
  });
  return { on };
}
