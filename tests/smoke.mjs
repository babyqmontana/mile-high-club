// Smoke-тест сайта: поднимает сервер в демо-режиме на временной базе, проходит все разделы
// на трёх размерах экрана и основные сценарии гостя и персонала.
// Запуск: npm run smoke            (нужен установленный Playwright с Chromium)
//         npm run smoke -- --shots out/   — дополнительно сохранить скриншоты разделов
// Выход с кодом 1, если хоть одна проверка не прошла.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('Playwright не найден: установите его (npm i -g playwright) или запустите там, где он есть.'); process.exit(2); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const ROUTES = ['home', 'stay', 'leisure', 'dining', 'cigars', 'journal', 'issue-i1', 'staff', 'contact', 'me', 'admin', 'no-such-room'];
const VIEWS = { 'issue-i1': 'issue', 'no-such-room': 'lost' };
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, hasTouch: true },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
];
// шум окружения, а не ошибки сайта (шрифты Google без сети, программный WebGL в контейнере)
const IGNORE = [/fonts\.(googleapis|gstatic)\.com/, /GPU stall due to ReadPixels/, /WebGL.*(software|swiftshader)/i, /Automatic fallback to software WebGL/];

const results = []; let failed = 0;
const check = (name, ok, info = '') => { results.push({ name, ok, info }); if (!ok) failed++; console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${info ? ' — ' + info : ''}`); };

const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const port = await freePort();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mhc-smoke-'));
const BASE = `http://localhost:${port}`;
const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, DEMO_LOGIN: 'true', DISCORD_BOT_TOKEN: '', DISCORD_CLIENT_ID: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
const stop = () => { server.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); };
for (let i = 0; i < 60 && !/localhost:/.test(serverLog); i++) await new Promise(r => setTimeout(r, 250));
if (!/localhost:/.test(serverLog)) { console.error('Сервер не запустился:\n' + serverLog); stop(); process.exit(1); }

const browser = await chromium.launch();
const ready = p => p.waitForSelector('#loader.gone', { state: 'attached', timeout: 30000 });
function watch(page) {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.some(r => r.test(m.text()))) errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('requestfailed', r => { const u = r.url(); if (u.startsWith(BASE) && !/\/api\/stream/.test(u)) errs.push('requestfailed: ' + u.replace(BASE, '')); });
  page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400 && !/\/api\/stream/.test(r.url())) errs.push(`HTTP ${r.status()} ${r.url().replace(BASE, '')}`); });
  return errs;
}

try {
  /* ---------- все разделы на трёх экранах ---------- */
  for (const vp of VIEWPORTS) {
    console.log(`\n[${vp.name}]`);
    const ctx = await browser.newContext({ ...vp, deviceScaleFactor: 1 }); const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(BASE + '/#home'); await ready(page);
    for (const r of ROUTES) {
      await page.evaluate(h => { location.hash = '#' + h; }, r);
      // переход-лифт и программный WebGL в контейнере могут задержать смену раздела — ждём сам раздел, а не фиксированное время
      await page.waitForFunction(v => document.querySelector('.view.on')?.dataset.view === v, VIEWS[r] || r, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(r === 'home' || r === 'stay' || r === 'cigars' ? 2200 : 900);
      const st = await page.evaluate(() => ({ view: document.querySelector('.view.on')?.dataset.view, html: (document.querySelector('.view.on')?.innerHTML || '').length, over: document.documentElement.scrollWidth - innerWidth }));
      check(`${vp.name} #${r}: раздел открыт и не пуст`, st.view === (VIEWS[r] || r) && st.html > 200, `view=${st.view}, ${st.html} символов`);
      check(`${vp.name} #${r}: нет горизонтальной прокрутки`, st.over <= 1, `лишние ${st.over}px`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${vp.name}-${r}.png`), fullPage: !['home', 'stay'].includes(r) });
    }
    check(`${vp.name}: нет ошибок в консоли и сети`, errs.length === 0, errs.slice(0, 5).join(' | '));
    await ctx.close();
  }

  /* ---------- GPU: переключения день/ночь не копят WebGL-контексты ---------- */
  {
    const gctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const gp = await gctx.newPage(); const gerr = watch(gp);
    await gp.addInitScript(() => { window.__gls = []; const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, a) { const c = o.call(this, t, a); if (c && /webgl/.test(t) && !window.__gls.includes(c)) window.__gls.push(c); return c; }; });
    await gp.goto(BASE + '/#home'); await ready(gp); await gp.waitForTimeout(2000);
    for (let i = 0; i < 4; i++) { await gp.click('#modeBtn'); await gp.waitForTimeout(1200); }
    const gl = await gp.evaluate(() => ({ created: __gls.length, live: __gls.filter(g => !g.isContextLost()).length }));
    check('GPU: после 4 переключений день/ночь жив один WebGL-контекст атриума', gl.created === 0 || gl.live <= 1, JSON.stringify(gl) + (gl.created === 0 ? ' (WebGL недоступен в этом браузере — проверка не применима)' : ''));
    check('GPU: нет ошибок в консоли', gerr.length === 0, gerr.slice(0, 3).join(' | '));
    await gctx.close();
  }

  /* ---------- без WebGL: 3D не грузится, все сценарии остаются доступны ---------- */
  {
    const nb = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
    const np = await nb.newPage({ viewport: { width: 1280, height: 800 } }); const nerr = watch(np); const reqs = [];
    np.on('request', r => reqs.push(r.url()));
    await np.goto(BASE + '/#home'); await ready(np); await np.waitForTimeout(1200);
    const home = await np.evaluate(() => ({ gl: !!document.createElement('canvas').getContext('webgl'), dv2: getComputedStyle(document.querySelector('#dv2')).opacity, static: document.querySelector('#dive').classList.contains('static') }));
    check('без WebGL: атриум статичный, второй экран виден', !home.gl && home.static && home.dv2 === '1', JSON.stringify(home));
    await np.evaluate(() => { location.hash = '#stay'; }); await np.waitForSelector('.facade .ff', { timeout: 8000 });
    const target = await np.$$eval('.facade .ff', bs => bs.at(-1).dataset.f);
    await np.click(`.facade .ff[data-f="${target}"]`); await np.waitForTimeout(1200);
    const lift = await np.evaluate(() => document.querySelector('#lfBtns [aria-pressed="true"]')?.dataset.f);
    check('без WebGL: фасад башни вместо 3D, клик по этажу вызывает лифт', lift === target, `этаж ${target}, лифт ${lift}`);
    await np.evaluate(() => { location.hash = '#cigars'; }); await np.waitForTimeout(1200);
    const hum = await np.evaluate(() => ({ flat: document.querySelector('#hum').classList.contains('flat'), lid: getComputedStyle(document.querySelector('#lidBtn')).display, info: !!document.querySelector('#cInfo h3') }));
    check('без WebGL: хьюмидор — понятная замена, карточка сигары и заказ работают', hum.flat && hum.lid === 'none' && hum.info, JSON.stringify(hum));
    check('без WebGL: three.js не скачивается', !reqs.some(u => /three\.module\.js|skyline3d|humidor3d|hero3d/.test(u)), reqs.filter(u => /three|3d\.js/.test(u)).join(' '));
    check('без WebGL: нет ошибок в консоли', nerr.length === 0, nerr.slice(0, 3).join(' | '));
    await nb.close();
  }

  /* ---------- сценарии ---------- */
  console.log('\n[сценарии]');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const page = await ctx.newPage(); const errs = watch(page);
  await page.goto(BASE + '/#stay'); await ready(page); await page.waitForTimeout(800);

  // главная: табло показывает реальные данные, клик по площадке ведёт к её карточке в «Отдыхе»
  await page.evaluate(() => { location.hash = '#home'; }); await page.waitForSelector('.fboard');
  const board = await page.evaluate(async () => {
    const pub = await fetch('/api/public').then(r => r.json());
    const rows = [...document.querySelectorAll('.fb-row')];
    return { rooms: rows[0].querySelector('.sr').textContent, want: `${pub.rooms.filter(r => r.status === 'free').length}/${pub.rooms.length}`, venues: document.querySelectorAll('.fb-row[data-venue]').length, total: pub.venues.length, floors: document.querySelectorAll('.shaft-floor').length };
  });
  check('главная: табло — свободные номера совпадают с API', board.rooms === board.want, JSON.stringify(board));
  check('главная: на табло все площадки, в шахте все этажи', board.venues === board.total && board.floors === board.total + 2, JSON.stringify(board));
  const target = await page.$eval('.fb-row[data-venue][href="#leisure"]', a => a.dataset.venue);
  await page.click(`.fb-row[data-venue="${target}"]`);
  const hl = await page.waitForSelector(`#venuesList .venue.hl[data-venue="${target}"]`, { timeout: 8000 }).then(() => true).catch(() => false);
  check('главная: клик по площадке на табло открывает её карточку в «Отдыхе»', hl, target);
  // «Сутки отеля»: ползунок с клавиатуры меняет время и пересчитывает статусы, «Сейчас» возвращает
  await page.waitForSelector('#hdRange');
  const lanes = await page.$$eval('.hd-lane', ls => ls.length);
  await page.focus('#hdRange'); await page.keyboard.press('End'); await page.waitForTimeout(200);
  const at = await page.evaluate(() => ({ vt: document.querySelector('#hdRange').getAttribute('aria-valuetext'), chips: document.querySelectorAll('.hd-st .chip').length }));
  await page.click('#hdNow'); await page.waitForTimeout(200);
  const nowT = await page.$eval('#hdT', e => e.textContent);
  check('сутки отеля: полоса на каждую площадку, ползунок → 23:45, «Сейчас» возвращает', lanes > 0 && at.chips === lanes && at.vt === '23:45 МСК' && nowT.startsWith('сейчас'), JSON.stringify({ lanes, ...at, nowT }));
  await page.evaluate(() => { location.hash = '#stay'; }); await page.waitForTimeout(1200);

  // фильтр номеров: тип «Пентхаус» → лифт едет на его этаж, в плане только подходящие номера; сравнение типов
  await page.waitForSelector('#rFilt [data-rt]');
  const ph = await page.evaluate(async () => { const pub = await fetch('/api/public').then(r => r.json()); const t = pub.types.at(-1); return { id: t.id, floors: [...new Set(pub.rooms.filter(r => r.type === t.id).map(r => r.floor))] }; });
  await page.click(`#rFilt [data-rt="${ph.id}"]`); await page.waitForTimeout(1500);
  const rf = await page.evaluate(() => ({ lift: +document.querySelector('#lfBtns [aria-pressed="true"]')?.dataset.f, plan: [...document.querySelectorAll('#lfInner .room')].map(b => b.classList.contains('dim')) }));
  check('номера: фильтр по типу ведёт лифт на подходящий этаж, в плане нет погашенных', ph.floors.includes(rf.lift) && rf.plan.length > 0 && rf.plan.every(d => !d), JSON.stringify({ ...ph, ...rf }));
  await page.click('#rfReset'); await page.waitForTimeout(300);
  const cmpIds = await page.$$eval('#types [data-cmp]', bs => bs.slice(0, 2).map(b => b.dataset.cmp));
  for (const id of cmpIds) await page.click(`#types [data-cmp="${id}"]`);
  const cols = await page.$$eval('.cmp thead th', ths => ths.length).catch(() => 0);
  check('номера: сравнение двух типов — таблица с двумя колонками', cols === 3, `столбцов ${cols}`);
  await page.click('#cmpClear').catch(() => {});

  // бронь
  await page.click('#types [data-t]');
  await page.waitForSelector('#bookSheet.on #bForm');
  await page.fill('#bName', 'Смоук Тест'); await page.fill('#bDiscord', 'smoke_test');
  await page.click('#bForm button[type=submit]');
  const code = await page.waitForSelector('#bookSheet .success .code', { timeout: 8000 }).then(e => e.textContent()).catch(() => null);
  check('бронь: получен код брони', /^MHC-[A-Z0-9]{4}$/.test(code || ''), code || 'нет кода');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#me'; });
  const inMe = !!code && await page.waitForFunction(c => document.querySelector('.view[data-view="me"]')?.textContent.includes(c), code, { timeout: 8000 }).then(() => true).catch(() => false);
  check('бронь: видна в «Мои брони»', inMe);

  // заказ в номер
  await page.evaluate(() => { location.hash = '#dining'; }); await page.waitForTimeout(900);
  await page.click('#dishes [data-p]');
  await page.waitForFunction(() => document.querySelector('#fab')?.classList.contains('on'));
  check('заказ: блюдо в корзине, FAB показывает 1', (await page.textContent('#fabN')) === '1');
  await page.click('#fab'); await page.waitForSelector('#cartSheet.on #oForm');
  await page.selectOption('#oRoom', { index: 1 }); await page.fill('#oName', 'Смоук'); await page.fill('#oDiscord', 'smoke_test');
  await page.click('#oForm button');
  const orderOk = await page.waitForSelector('#cartSheet .success', { timeout: 8000 }).then(() => true).catch(() => false);
  check('заказ: принят', orderOk);
  await page.keyboard.press('Escape');

  // фильтр хьюмидора: «Крепкие» оставляет только крепость 4–5, стрелки ходят только по ним
  await page.evaluate(() => { location.hash = '#cigars'; }); await page.waitForSelector('#cFilt [data-cs="4"]');
  await page.click('#cFilt [data-cs="4"]');
  const strong = await page.evaluate(async () => {
    const pub = await fetch('/api/public').then(r => r.json()), want = pub.cigars.filter(c => c.strength >= 4).map(c => c.name).sort();
    const got = [...document.querySelectorAll('#cStrip button')].map(b => b.textContent.trim()).sort();
    const seen = new Set(); for (let i = 0; i < want.length + 2; i++) { document.querySelector('#cNext').click(); seen.add(document.querySelector('#cInfo h3').textContent); }
    return { want, got, outside: [...seen].filter(n => !want.includes(n)) };
  });
  check('сигары: фильтр «Крепкие» — лента и стрелки только по крепости 4–5', JSON.stringify(strong.want) === JSON.stringify(strong.got) && strong.outside.length === 0, JSON.stringify(strong));
  await page.click('#cFilt [data-cs="0"]');

  // заявка → чат на сайте
  await page.evaluate(() => { location.hash = '#contact'; }); await page.waitForTimeout(900);
  await page.fill('#tDiscord', 'smoke_test'); await page.fill('#tText', 'Проверка заявки smoke-тестом');
  await page.click('#tForm button');
  await page.waitForSelector('#tSite', { timeout: 8000 });
  await page.click('#tSite');
  const chat = await page.waitForSelector('#chatF', { timeout: 8000 }).then(() => true).catch(() => false);
  check('заявка: открыт чат на сайте', chat);
  if (chat) {
    await page.fill('#chatIn', 'Второе сообщение'); await page.press('#chatIn', 'Enter');
    const sent = await page.waitForFunction(() => document.querySelector('#msgs')?.textContent.includes('Второе сообщение'), null, { timeout: 8000 }).then(() => true).catch(() => false);
    check('заявка: сообщение в чате доставлено', sent);
  }

  // доступность слоёв: модалка анкеты держит фокус, Esc закрывает и возвращает фокус на карточку
  await page.evaluate(() => { location.hash = '#staff'; }); await page.waitForTimeout(1200);
  await page.focus('.tcard'); await page.keyboard.press('Enter'); await page.waitForSelector('.modal');
  let inside = 0; for (let i = 0; i < 15; i++) { await page.keyboard.press('Tab'); inside += await page.evaluate(() => !!document.activeElement?.closest('.modal')); }
  check('модалка: Tab не выходит за окно', inside === 15, `${inside}/15`);
  check('модалка: фон недоступен (inert)', await page.evaluate(() => document.querySelector('#app').inert === true));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const back = await page.evaluate(() => ({ open: !!document.querySelector('.modal'), focus: document.activeElement?.classList.contains('tcard'), inert: document.querySelector('#app').inert }));
  check('модалка: Esc закрывает, фокус вернулся на карточку, фон снова доступен', !back.open && back.focus && !back.inert, JSON.stringify(back));

  // шторка брони держит фокус и закрывается по Esc
  await page.evaluate(() => { location.hash = '#stay'; }); await page.waitForTimeout(1200);
  await page.click('#types [data-t]'); await page.waitForSelector('#bookSheet.on #bForm'); await page.waitForTimeout(400);
  inside = 0; for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); inside += await page.evaluate(() => !!document.activeElement?.closest('#bookSheet')); }
  check('шторка: Tab не выходит за шторку', inside === 20, `${inside}/20`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('шторка: Esc закрывает', await page.evaluate(() => !document.querySelector('#bookSheet.on') && !document.querySelector('#app').inert));

  // быстрые переходы подряд, пока идёт анимация лифта, — в итоге открыт последний раздел
  for (const h of ['dining', 'cigars', 'journal', 'leisure']) { await page.evaluate(h => { location.hash = '#' + h; }, h); await page.waitForTimeout(120); }
  await page.waitForTimeout(1500);
  const fin = await page.evaluate(() => ({ view: document.querySelector('.view.on')?.dataset.view, on: document.querySelectorAll('.view.on').length }));
  check('переходы: серия быстрых переходов заканчивается на последнем разделе', fin.view === 'leisure' && fin.on === 1, JSON.stringify(fin));

  // повторный визит в той же вкладке — без заставки
  const t0 = Date.now(); await page.reload(); await ready(page);
  const loaderShown = await page.evaluate(() => getComputedStyle(document.querySelector('#loader')).display !== 'none' && !document.querySelector('#loader').classList.contains('gone'));
  check('загрузка: при повторном визите заставки нет', !loaderShown, `${Date.now() - t0} мс до готовности`);

  // мобильное меню: Esc закрывает, фокус возвращается на кнопку меню
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const mp = await mctx.newPage(); const merrs = watch(mp);
  await mp.goto(BASE + '/#home'); await ready(mp);
  await mp.click('#burger'); await mp.waitForTimeout(350);
  const opened = await mp.evaluate(() => ({ on: document.querySelector('#drawer').classList.contains('on'), exp: document.querySelector('#burger').getAttribute('aria-expanded'), mainInert: document.querySelector('main').inert }));
  check('меню: открыто, aria-expanded=true, контент inert', opened.on && opened.exp === 'true' && opened.mainInert, JSON.stringify(opened));
  await mp.keyboard.press('Escape'); await mp.waitForTimeout(350);
  const closed = await mp.evaluate(() => ({ on: document.querySelector('#drawer').classList.contains('on'), focus: document.activeElement?.id, mainInert: document.querySelector('main').inert }));
  check('меню: Esc закрывает, фокус на кнопке меню', !closed.on && closed.focus === 'burger' && !closed.mainInert, JSON.stringify(closed));
  await mp.click('#burger'); await mp.waitForTimeout(350); await mp.click('#drawer a[href="#dining"]'); await mp.waitForTimeout(1300);
  check('меню: пункт меню открывает раздел и закрывает меню', await mp.evaluate(() => document.querySelector('.view.on')?.dataset.view === 'dining' && !document.querySelector('#drawer.on') && !document.querySelector('main').inert));
  check('мобильные сценарии: нет ошибок в консоли и сети', merrs.length === 0, merrs.slice(0, 5).join(' | '));
  await mctx.close();

  // персонал: демо-вход администратора, подтверждение брони, номер на башне меняет статус
  await page.goto(BASE + '/auth/demo?role=admin'); await ready(page);
  const adminOk = await page.waitForSelector('#aside', { timeout: 10000 }).then(() => true).catch(() => false);
  check('панель: демо-администратор вошёл', adminOk);
  const conf = await page.evaluate(async () => {
    const j = (m, u, b) => fetch('/api' + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
    const all = await j('GET', '/admin/all'); const b = all.bookings.find(x => x.status === 'new'); if (!b) return { err: 'нет новой брони' };
    const room = all.rooms.find(r => r.type === b.type && r.status === 'free'); if (!room) return { err: 'нет свободного номера' };
    const res = await j('POST', `/admin/bookings/${b.id}/action`, { act: 'confirm', room: room.id });
    const pub = await j('GET', '/public');
    return { status: res.booking?.status, room: room.id, roomStatus: pub.rooms.find(r => r.id === room.id)?.status };
  });
  check('панель: бронь подтверждена, номер стал «Забронирован»', conf.status === 'confirmed' && conf.roomStatus === 'booked', JSON.stringify(conf));

  // «Отдых» обновляется точечно: правка одной площадки перерисовывает только её карточку
  const guest = await ctx.newPage(); const gerrs = watch(guest);
  await guest.goto(BASE + '/#leisure'); await ready(guest); await guest.waitForSelector('#venuesList .venue');
  await guest.evaluate(() => [...document.querySelectorAll('#venuesList .venue')].forEach((el, i) => { el.dataset.mark = i; }));
  await page.evaluate(() => fetch('/api/admin/venues/sky', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desc: 'Обновлено smoke-тестом' }) }));
  const upd = await guest.waitForFunction(() => document.querySelector('#venuesList').textContent.includes('Обновлено smoke-тестом'), null, { timeout: 8000 }).then(() => guest.evaluate(() => [...document.querySelectorAll('#venuesList .venue')].map(el => el.dataset.mark ?? 'new'))).catch(() => null);
  check('отдых: по SSE заменена только изменённая карточка', !!upd && upd[0] === 'new' && upd.slice(1).every((m, i) => m === String(i + 1)), JSON.stringify(upd));
  check('отдых: нет ошибок в консоли и сети', gerrs.length === 0, gerrs.slice(0, 5).join(' | '));
  await guest.close();
  check('сценарии: нет ошибок в консоли и сети', errs.length === 0, errs.slice(0, 5).join(' | '));
  await ctx.close();
} catch (e) {
  check('smoke-тест завершился без исключений', false, e.message.split('\n')[0]);
} finally {
  await browser.close(); stop();
}
console.log(`\n${results.length - failed}/${results.length} проверок прошли`);
process.exit(failed ? 1 : 0);
