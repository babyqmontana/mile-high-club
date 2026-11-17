// Картинки для превью ссылки и значков приложения:  node docs/og/render.cjs
// public/img/og.jpg — превью в Discord, Telegram и т.п.; public/img/app-192.png, app-512.png, app-maskable.png — значки приложения
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const IMG = path.join(__dirname, '../../public/img');
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file://' + path.join(__dirname, 'og.html')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(IMG, 'og.jpg'), type: 'jpeg', quality: 88 });
  // значки: эмблема на фоне сайта; у «maskable» запас по краям, чтобы система могла обрезать в круг или скруглённый квадрат
  const emblem = 'data:image/webp;base64,' + fs.readFileSync(path.join(IMG, 'emblem.webp')).toString('base64');
  for (const [name, size, pad] of [['app-192.png', 192, .1], ['app-512.png', 512, .1], ['app-maskable.png', 512, .22]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,#3a0f1c,#0d0809 70%)"><img src="${emblem}" style="width:${Math.round(size * (1 - pad * 2))}px;height:auto">`);
    await p.waitForTimeout(200); await p.screenshot({ path: path.join(IMG, name), type: 'png' });
  }
  await b.close(); console.log('Готово: public/img/og.jpg и значки приложения');
})();
