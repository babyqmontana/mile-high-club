// Картинка дорожной карты для README: правите roadmap.html, затем  node docs/roadmap/render.cjs
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1920, height: 850 } });
  await p.goto('file://' + path.join(__dirname, 'roadmap.html')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(__dirname, 'roadmap.png') }); await b.close();
  console.log('Готово: docs/roadmap/roadmap.png. Сожмите в docs/img/roadmap.webp (например, cwebp -q 85).');
})();
