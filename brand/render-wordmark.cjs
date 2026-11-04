// Кадры анимированного логотипа: node brand/render-wordmark.cjs <out-dir> [--stills 0,20,40]
// Затем GIF/MP4/WebP собирает ffmpeg (команды в brand/README.md).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, out = path.resolve(process.argv[2] || 'wm-frames');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const T = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
srv.listen(0, async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 720, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${srv.address().port}/wordmark-anim.html?still=1`); await page.evaluate(() => WM.ready());
  const { FRAMES } = await page.evaluate(() => ({ FRAMES: WM.FRAMES }));
  const list = arg('--stills') ? arg('--stills').split(',').map(Number) : [...Array(FRAMES).keys()];
  for (const f of list) {
    const data = await page.evaluate(f => { WM.render(f); return document.getElementById('c').toDataURL('image/png'); }, f);
    fs.writeFileSync(path.join(out, arg('--stills') ? `still-${f}.png` : `f${String(f).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log(JSON.stringify({ frames: list.length, errors: errs })); await b.close(); srv.close();
});
