// Аутфит без 3D-человека: каждая вещь крутится сама по себе, как товар на 360°.
// Пока нет фото — рисуем условную вещь-заглушку в цветах отдела. Когда в панели загрузят
// серию фото вещи по кругу (24–36 кадров), карточка листает их при перетаскивании.
export const KINDS = { jacket: 'Пиджак', shirt: 'Рубашка', pants: 'Брюки', tie: 'Галстук', apron: 'Фартук', vest: 'Жилет', hat: 'Головной убор', shoes: 'Обувь' };
export function defaultItems(d) {
  const base = [{ name: 'Пиджак', kind: 'jacket' }, { name: 'Рубашка', kind: 'shirt', color: d.shirt || '#efe6cf' }, { name: 'Брюки', kind: 'pants' }, { name: 'Галстук', kind: 'tie', color: d.accent }];
  if (/ресторан|хаускип/i.test(d.name)) base[3] = { name: 'Фартук', kind: 'apron', color: d.accent };
  if (/сигар/i.test(d.name)) base[0] = { name: 'Жилет', kind: 'vest' };
  if (/бассейн/i.test(d.name)) { base[0] = { name: 'Поло', kind: 'shirt' }; base[1] = { name: 'Кепка', kind: 'hat', color: d.accent }; base[3] = { name: 'Шорты', kind: 'pants', color: '#f2eee6' }; base.splice(2, 1); }
  return base;
}
const shade = (hex, k) => { const n = parseInt(String(hex || '#777').slice(1), 16); let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; const f = v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };

function path(g, kind, back) {
  const P = new Path2D();
  if (kind === 'jacket' || kind === 'vest') {
    P.moveTo(-40, -95); P.lineTo(-12, -100); P.lineTo(0, -80); P.lineTo(12, -100); P.lineTo(40, -95); P.lineTo(66, -80);
    if (kind === 'jacket') { P.lineTo(84, 40); P.lineTo(64, 44); P.lineTo(54, -40); } else P.lineTo(50, -40);
    P.lineTo(56, 100); P.lineTo(-56, 100);
    if (kind === 'jacket') { P.lineTo(-54, -40); P.lineTo(-64, 44); P.lineTo(-84, 40); } else P.lineTo(-50, -40);
    P.lineTo(-66, -80); P.closePath();
  } else if (kind === 'shirt') {
    P.moveTo(-34, -96); P.lineTo(-12, -102); P.lineTo(0, -88); P.lineTo(12, -102); P.lineTo(34, -96); P.lineTo(78, -66); P.lineTo(66, -30); P.lineTo(46, -44); P.lineTo(48, 96); P.lineTo(-48, 96); P.lineTo(-46, -44); P.lineTo(-66, -30); P.lineTo(-78, -66); P.closePath();
  } else if (kind === 'pants') {
    P.moveTo(-46, -100); P.lineTo(46, -100); P.lineTo(54, 100); P.lineTo(12, 100); P.lineTo(0, -30); P.lineTo(-12, 100); P.lineTo(-54, 100); P.closePath();
  } else if (kind === 'tie') {
    P.moveTo(-10, -100); P.lineTo(10, -100); P.lineTo(14, -84); P.lineTo(6, -76); P.lineTo(26, 70); P.lineTo(0, 100); P.lineTo(-26, 70); P.lineTo(-6, -76); P.lineTo(-14, -84); P.closePath();
  } else if (kind === 'apron') {
    P.moveTo(-36, -100); P.lineTo(36, -100); P.lineTo(40, -30); P.lineTo(62, -24); P.lineTo(58, 100); P.lineTo(-58, 100); P.lineTo(-62, -24); P.lineTo(-40, -30); P.closePath();
  } else if (kind === 'hat') {
    P.moveTo(-60, 30); P.bezierCurveTo(-60, -60, 60, -60, 60, 30); P.lineTo(96, 40); P.lineTo(92, 52); P.lineTo(-60, 46); P.closePath();
  } else {
    P.moveTo(-70, 40); P.bezierCurveTo(-70, -10, -20, -20, 10, -10); P.lineTo(70, 10); P.lineTo(76, 40); P.closePath();
  }
  return P;
}
function details(g, kind, c, accent, back) {
  g.lineWidth = 2;
  if ((kind === 'jacket' || kind === 'vest') && !back) {
    g.fillStyle = shade(accent, 0); g.beginPath(); g.moveTo(-12, -100); g.lineTo(0, -80); g.lineTo(-6, 10); g.lineTo(-30, -60); g.closePath(); g.fill(); g.beginPath(); g.moveTo(12, -100); g.lineTo(0, -80); g.lineTo(6, 10); g.lineTo(30, -60); g.closePath(); g.fill();
    g.fillStyle = shade(accent, 0.2); [20, 46].forEach(y => { g.beginPath(); g.arc(10, y, 3.5, 0, 7); g.fill(); });
    g.strokeStyle = shade(c, -0.3); g.beginPath(); g.moveTo(-40, 50); g.lineTo(-18, 50); g.moveTo(18, 50); g.lineTo(40, 50); g.stroke();
  }
  if (kind === 'shirt' && !back) { g.strokeStyle = shade(c, -0.25); g.beginPath(); g.moveTo(0, -88); g.lineTo(0, 96); g.stroke(); g.fillStyle = shade(c, -0.35); for (let y = -60; y < 90; y += 26) { g.beginPath(); g.arc(4, y, 2.5, 0, 7); g.fill(); } }
  if (kind === 'pants') { g.fillStyle = shade(c, -0.25); g.fillRect(-46, -100, 92, 12); g.strokeStyle = shade(c, -0.3); g.beginPath(); g.moveTo(-30, -88); g.lineTo(-34, 100); g.moveTo(30, -88); g.lineTo(34, 100); g.stroke(); }
  if (kind === 'tie' && !back) { g.strokeStyle = shade(c, 0.3); g.globalAlpha = .5; for (let y = -60; y < 80; y += 14) { g.beginPath(); g.moveTo(-20, y + 10); g.lineTo(20, y - 6); g.stroke(); } g.globalAlpha = 1; }
  if (kind === 'apron') { g.strokeStyle = shade(c, -0.25); g.strokeRect(-30, 20, 60, 36); g.beginPath(); g.moveTo(0, 20); g.lineTo(0, 56); g.stroke(); }
  if (kind === 'hat') { g.fillStyle = shade(c, -0.3); g.fillRect(-60, 22, 120, 10); }
}
export function drawGarment(cv, item, ang) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height, c = item.color, a = item.accent;
  g.clearRect(0, 0, w, h);
  const cos = Math.cos(ang), back = cos < 0, sx = Math.max(0.16, Math.abs(cos)) * (back ? -1 : 1);
  const dark = (() => { const n = parseInt(String(c || '#777').slice(1), 16); return ((n >> 16 & 255) * .3 + (n >> 8 & 255) * .59 + (n & 255) * .11) < 60; })();
  g.save(); g.translate(w / 2, h / 2); const s = Math.min(w, h) / 240; g.scale(s, s);
  // тень на подиуме
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(0, 112, 70 * Math.max(.35, Math.abs(cos)), 8, 0, 0, 7); g.fill();
  g.save(); g.scale(sx, 1);
  const P = path(g, item.kind, back);
  const gr = g.createLinearGradient(-90, 0, 90, 0), l = 0.1 * Math.sin(ang);
  gr.addColorStop(0, shade(c, -0.28 + l)); gr.addColorStop(0.5, shade(c, 0.06)); gr.addColorStop(1, shade(c, -0.22 - l));
  g.shadowColor = dark ? 'rgba(244,234,208,.25)' : 'rgba(0,0,0,.35)'; g.shadowBlur = 18; g.fillStyle = gr; g.fill(P); g.shadowBlur = 0; g.strokeStyle = dark ? shade(c, 0.35) : shade(c, -0.45); g.lineWidth = 2; g.stroke(P);
  g.save(); g.clip(P); details(g, item.kind, c, a, back);
  g.globalAlpha = .06; for (let i = -120; i < 120; i += 6) { g.fillStyle = i % 12 ? '#fff' : '#000'; g.fillRect(i, -110, 2, 220); } g.globalAlpha = 1; g.restore();
  g.restore(); g.restore();
}

// карточка 360°: перетаскивание вращает, без касания — медленно крутится
export function turntable(cv, item) {
  let ang = 0, t0 = Math.random() * 6, vel = 0.012, drag = null, free = false, raf = 0, frames = null, visible = true, idx = 0;
  if (item.frames?.length) { frames = item.frames.map(u => { const im = new Image(); im.decoding = 'async'; im.src = u; return im; }); }
  const dpr = Math.min(devicePixelRatio, 2);
  const size = () => { cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; };
  size(); new ResizeObserver(size).observe(cv);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) go(); }).observe(cv);
  const draw = () => {
    if (frames) { const n = frames.length; idx = ((Math.round(ang / (Math.PI * 2) * n) % n) + n) % n; const im = frames[idx]; const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); if (im.complete && im.naturalWidth) { const s = Math.min(cv.width / im.naturalWidth, cv.height / im.naturalHeight); g.drawImage(im, (cv.width - im.naturalWidth * s) / 2, (cv.height - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s); } }
    else drawGarment(cv, item, ang);
  };
  const loop = t => { raf = 0; if (!document.body.contains(cv)) return; if (!drag) { if (free) { ang += vel; } else ang = Math.sin(t / 1600 + t0) * 1.05; } draw(); if (visible) raf = requestAnimationFrame(loop); };
  const go = () => { if (!raf) raf = requestAnimationFrame(loop); };
  cv.addEventListener('pointerdown', e => { free = true; drag = { x: e.clientX, a: ang }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (drag) { ang = drag.a + (e.clientX - drag.x) * 0.018; } });
  cv.addEventListener('pointerup', () => { drag = null; });
  go();
}
