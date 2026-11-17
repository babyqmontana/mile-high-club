// Пересобрать: запустить сайт на 3999 (DEMO_LOGIN=true npm run dev с PORT=3999), затем node docs/secrets/render.cjs
// Постер «Секреты отеля»: все достижения из кода сайта — иконки, названия, подсказки, редкость, два состояния
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:3999/#home'); await p.waitForTimeout(1500);
  const L = await p.evaluate(async () => (await import('/js/achievements.js')).LIST.map(a => ({ id: a.id, t: a.t, d: a.d, h: a.h, i: a.i, r: a.r || 1, season: !!a.season })));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const R = { 1: ['Обычные', 'Обычное', 'r1'], 2: ['Редкие', 'Редкое', 'r2'], 3: ['Легендарные', 'Легендарное', 'r3'] };
  const card = a => `<div class="card ${R[a.r][2]}${a.id === 'platinum' ? ' plat' : ''}">
    <div class="states"><span class="tile off">?</span><span class="arr">→</span><span class="tile on">${a.i}</span></div>
    <div class="body"><div class="top"><b>${esc(a.t)}</b><em>${R[a.r][1]}${a.season ? ' · сезонное' : ''}</em></div>
      <p class="hint"><span>Подсказка</span>${esc(a.h)}</p><p class="done"><span>Получено</span>${esc(a.d)}</p></div></div>`;
  const sec = r => { const list = L.filter(a => a.r === r); return `<section><h2 class="${R[r][2]}">${R[r][0]} <small>${list.length}</small></h2><div class="grid">${list.map(card).join('')}</div></section>`; };
  const plat = L.find(a => a.id === 'platinum');
  const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700;800&family=Onest:wght@400;500;600;700&display=swap">
<style>
:root{--bg:#0d0809;--card:#1a1113;--card2:#241719;--line:#3a2629;--fg:#F9EDC7;--mut:#B3A792;--pink:#F0177A;--gold:#F7B50A}
*{box-sizing:border-box}body{margin:0;width:1600px;background:var(--bg);color:var(--fg);font:400 15px/1.45 Onest,sans-serif}
.wrap{padding:64px 72px 72px;background:radial-gradient(900px 520px at 10% 0,rgba(240,23,122,.22),transparent 70%),radial-gradient(800px 600px at 100% 30%,rgba(247,181,10,.1),transparent 70%)}
.eb{font:700 14px Onest;letter-spacing:.32em;color:var(--gold);text-transform:uppercase}
h1{margin:10px 0 6px;font:800 60px/1.02 Unbounded;letter-spacing:-.02em}h1 span{color:var(--pink)}
.lead{color:var(--mut);max-width:900px;font-size:17px;margin:0}
.how{margin:34px 0 10px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.how>div{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;display:grid;gap:12px;align-content:start}
.how b{font:700 15px Onest}.how small{color:var(--mut);font-size:13.5px}
.toast{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;background:#170e10;border-radius:14px;padding:12px;box-shadow:0 0 0 1px var(--line)}
.toast.leg{box-shadow:0 0 0 1px var(--gold),0 0 24px -6px rgba(247,181,10,.6)}
.toast .k{font:700 10px Onest;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}.toast .n{font:800 15px Unbounded}
.tile{width:56px;height:56px;border-radius:12px;display:grid;place-items:center;flex:none}
.tile svg{width:28px;height:28px}
.tile.on{color:#2a1a05;background:linear-gradient(140deg,#ffe0a0,#f7b50a 45%,#ef5617);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),0 6px 16px -6px rgba(247,181,10,.6)}
.tile.off{background:var(--card2);color:var(--mut);box-shadow:inset 0 0 0 1px var(--line);font:800 22px Unbounded}
.plat .tile.on,.tile.on.platg{background:linear-gradient(140deg,#fff3dc,#f0177a 55%,#f7b50a)}
.r3 .tile.on,.tile.on.leg{box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),0 0 0 2px var(--gold),0 0 22px -4px rgba(247,181,10,.8)}
section{margin-top:40px}
h2{margin:0 0 16px;font:800 26px Unbounded;display:flex;align-items:center;gap:12px}h2 small{font:700 14px Onest;color:var(--bg);background:var(--mut);border-radius:20px;padding:2px 10px}
h2.r2 small{background:var(--pink);color:#fff}h2.r3 small{background:var(--gold)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{display:grid;grid-template-columns:auto 1fr;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;align-items:start}
.card.r2{border-color:rgba(240,23,122,.35)}.card.r3{border-color:rgba(247,181,10,.5)}
.states{display:flex;align-items:center;gap:6px}.arr{color:var(--mut);font-size:16px}
.states .tile{width:48px;height:48px}.states .tile svg{width:24px;height:24px}.states .tile.off{font-size:18px}
.top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.top b{font:800 16px Unbounded;letter-spacing:-.01em}
em{font:700 10.5px Onest;font-style:normal;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);white-space:nowrap}
.r2 em{color:var(--pink)}.r3 em{color:var(--gold)}
p{margin:8px 0 0;font-size:13.5px;line-height:1.45}p span{display:block;font:700 10px Onest;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin-bottom:2px}
.hint{color:var(--mut)}.done{color:#e9dcc0}
.foot{margin-top:40px;color:var(--mut);font-size:13.5px;display:flex;justify-content:space-between}
</style>
<div class="wrap"><div class="eb">Mile High Club · секреты отеля</div><h1>25 скрытых <span>достижений</span></h1>
<p class="lead">Секреты спрятаны по всему сайту. Пока секрет не найден, гость видит знак вопроса и подсказку. Нашёл — карточка загорается иконкой и шуточным описанием, а внизу экрана всплывает уведомление в духе Steam.</p>
<div class="how">
<div><b>1. Скрыто</b><div style="display:flex;gap:12px;align-items:center"><span class="tile off">?</span><small>Знак вопроса и подсказка в коллекции «Секреты отеля» в подвале сайта</small></div></div>
<div><b>2. Получено</b><div style="display:flex;gap:12px;align-items:center"><span class="tile on">${L.find(a => a.id === 'logo').i}</span><small>Иконка загорается золотом, появляется дата и шуточное описание</small></div></div>
<div><b>3. Легендарное</b><div class="toast leg"><span class="tile on leg">${L.find(a => a.id === 'privacy').i}</span><div><div class="k">Легендарное · получено</div><div class="n">Мелкий шрифт</div></div></div></div>
<div><b>4. Платиновый гость</b><div style="display:flex;gap:12px;align-items:center"><span class="tile on platg leg">${plat.i}</span><small>Все секреты, кроме сезонных. Розово-золотая иконка</small></div></div>
</div>
${sec(1)}${sec(2)}${sec(3)}
<div class="foot"><span>Прогресс хранится в браузере, а после входа через Discord — и в аккаунте</span><span>mhc-ls-project.ru</span></div></div>`;
  await p.setContent(html, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
  const h = await p.evaluate(() => document.body.scrollHeight); await p.setViewportSize({ width: 1600, height: h });
  await p.screenshot({ path: '' + require('path').join(__dirname, 'secrets.png') + '', fullPage: true });
  console.log('высота', h, 'секретов', L.length); await b.close();
})();
