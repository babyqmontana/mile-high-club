// Картинка дорожной карты для README: правите roadmap.html, затем  node docs/roadmap/render.cjs
const { chromium } = require('playwright'), path = require('path');
(async () => {
  // CHROME_PATH — свой Chromium-браузер, если скачанный Playwright не запускается (антивирус); профиль временный
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), p = await b.newPage({ viewport: { width: 1920, height: 960 } });
  await p.goto('file://' + path.join(__dirname, 'roadmap.html')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
  // текущая версия всегда из package.json, даже если roadmap.html забыли поправить
  const ver = 'v' + require(path.join(__dirname, '../../package.json')).version;
  await p.evaluate(v => document.querySelectorAll('[data-current]').forEach(e => { e.textContent = v; }), ver);
  await p.screenshot({ path: path.join(__dirname, 'roadmap.png') }); await b.close();
  console.log('Готово: docs/roadmap/roadmap.png. Сожмите в docs/img/roadmap.webp (например, cwebp -q 85).');
})();
