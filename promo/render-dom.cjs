// Покадровый рендер DOM-ролика: node promo/render-dom.cjs <out-dir> --page "ad5.html?v=1" [--stills 1,2.5] [--from N --to M]
// Страница отдаёт window.AD = { W, H, FPS, DUR, CUES, ready(), seek(t) }: seek ставит все анимации (Web Animations API)
// и состояние сцены на время t, после чего снимается скриншот. Всё детерминировано, кадры можно рендерить параллельно.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), out = path.resolve(process.argv[2] || 'dom-out');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(p) && fs.existsSync(path.join(ROOT, 'public', decodeURIComponent(new URL(req.url, 'http://x').pathname)))) p = path.join(ROOT, 'public', decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
srv.listen(0, async () => {
  const page0 = arg('--page') || 'ad5.html', V = /v=1/.test(page0);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--font-render-hinting=none'] });
  const page = await b.newPage({ viewport: V ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('response', r => r.status() >= 400 && errs.push(r.status() + ' ' + r.url()));
  await page.goto(`http://localhost:${srv.address().port}/promo/${page0}${page0.includes('?') ? '&' : '?'}still=1`);
  await page.evaluate(() => window.AD.ready());
  const meta = await page.evaluate(() => ({ FPS: AD.FPS, DUR: AD.DUR, CUES: AD.CUES }));
  fs.writeFileSync(path.join(out, 'cues.json'), JSON.stringify(meta, null, 1));
  const shot = async (t, name) => { await page.evaluate(t => AD.seek(t), t); await page.screenshot({ path: path.join(out, name), type: 'png' }); };
  const stills = arg('--stills');
  if (stills) for (const s of stills.split(',')) await shot(+s, `still-${s}.png`);
  else {
    const total = Math.round(meta.FPS * meta.DUR), from = +(arg('--from') || 0), to = Math.min(total, +(arg('--to') || total));
    for (let f = from; f < to; f++) { await shot(f / meta.FPS, `f${String(f).padStart(4, '0')}.png`); if (f % 60 === 0) process.stderr.write(`${f}/${total} `); }
  }
  console.log(JSON.stringify({ errors: errs })); await b.close(); srv.close();
});
