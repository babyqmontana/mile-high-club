// Рендер ролика: node promo/render.cjs <out-dir> [--page ad.html|nostalgia.html] [--stills 0.5,2,4.6] [--from N --to M]
// Поднимает статический сервер на корень репозитория (нужен логотип из public/img), открывает promo/ad.html
// в Chromium (Playwright) и сохраняет кадры PNG. Затем: ffmpeg собирает видео (см. promo/README.md).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), out = path.resolve(process.argv[2] || 'promo-out');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
srv.listen(0, async () => {
  const port = srv.address().port; fs.mkdirSync(out, { recursive: true });
  const pageName = arg('--page') || 'ad.html', vertical = /nostalgia/.test(pageName);
  // WebGL в headless — через SwiftShader (детерминированно, без GPU)
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: vertical ? { width: 540, height: 960 } : { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.goto(`http://localhost:${port}/promo/${pageName}?still=1`); await page.evaluate(() => window.AD.ready());
  const meta = await page.evaluate(() => ({ FPS: AD.FPS, DUR: AD.DUR, BPM: AD.BPM, CUES: AD.CUES, SHOTS: AD.SHOTS }));
  fs.writeFileSync(path.join(out, 'cues.json'), JSON.stringify(meta, null, 1));
  const grab = async (frame, name) => {
    const data = await page.evaluate(f => { AD.render(f); return document.getElementById('c').toDataURL('image/png'); }, frame);
    fs.writeFileSync(path.join(out, name), Buffer.from(data.split(',')[1], 'base64'));
  };
  const stills = arg('--stills');
  if (stills) { for (const s of stills.split(',')) await grab(Math.round(+s * meta.FPS), `still-${s}.png`); }
  else {
    const total = meta.FPS * meta.DUR, from = +(arg('--from') || 0), to = Math.min(total, +(arg('--to') || total));
    for (let f = from; f < to; f++) { await grab(f, `f${String(f).padStart(4, '0')}.png`); if (f % 60 === 0) process.stderr.write(`${f}/${total} `); }
  }
  console.log(JSON.stringify({ errors: errs }));
  await b.close(); srv.close();
});
