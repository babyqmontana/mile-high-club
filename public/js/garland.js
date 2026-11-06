// Новогодняя гирлянда под шапкой: тонкая нить с тёплыми огоньками, как в лобби отеля.
// Огни зажигаются от центра, по нити бежит мягкая волна света, нить покачивается от прокрутки,
// а рядом с курсором лампочки разгораются и отклоняются. Без анимации рисуется один спокойный кадр.
const SPAN = 190, SAG = 17, STEP = 27, HEIGHT = 46, TOP = 3;
const WARM = [255, 226, 168], GOLD = [247, 181, 10], ROSE = [255, 170, 190];

function sprite(rgb) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32), [a, b, d] = rgb;
  r.addColorStop(0, `rgba(255,250,235,1)`); r.addColorStop(.1, `rgba(${a},${b},${d},.9)`); r.addColorStop(.32, `rgba(${a},${b},${d},.22)`); r.addColorStop(1, `rgba(${a},${b},${d},0)`);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c;
}

export function mountGarland(host) {
  const cv = document.createElement('canvas'); cv.className = 'garland'; cv.setAttribute('aria-hidden', 'true'); host.append(cv);
  const g = cv.getContext('2d'), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const glow = [sprite(WARM), sprite(GOLD), sprite(ROSE)];
  let W = 0, dpr = 1, lamps = [], spans = 1, span = SPAN, raf = 0, t0 = 0, last = 0, mx = -999, swing = 0, swingV = 0, lastY = scrollY, alive = true;

  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = host.clientWidth;
    cv.width = W * dpr; cv.height = HEIGHT * dpr; cv.style.height = HEIGHT + 'px';
    spans = Math.max(2, Math.round(W / SPAN)); span = W / spans;
    const per = Math.max(4, Math.round(span / STEP)); lamps = [];
    for (let s = 0; s < spans; s++) for (let k = 1; k < per; k++) {
      const n = lamps.length, tone = n % 11 === 5 ? 2 : n % 4 === 1 ? 1 : 0, u = k / per;
      lamps.push({ s, u, x: (s + u) * span, tone, ph: (n * 2.399) % 6.283, size: tone ? 13 : 15, lift: 0 });
    }
    draw(performance.now());
  }
  const yAt = (s, u, time) => { const sway = still ? 0 : Math.sin(time * .9 + s * 1.3) * 1.1 + swing; return TOP + 4 * u * (1 - u) * (SAG + sway); };

  function draw(now) {
    const time = (now - t0) / 1000, mid = W / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, HEIGHT);
    g.lineWidth = 1; g.strokeStyle = 'rgba(249,237,199,.32)'; g.beginPath();
    for (let s = 0; s < spans; s++) { const x = s * span, y = 2 * yAt(s, .5, time) - TOP; g.moveTo(x, TOP); g.quadraticCurveTo(x + span / 2, y, x + span, TOP); }
    g.stroke();
    g.fillStyle = 'rgba(247,214,150,.75)'; for (let s = 0; s <= spans; s++) { g.beginPath(); g.arc(s * span, TOP, 1.6, 0, 6.283); g.fill(); }
    g.globalCompositeOperation = 'lighter';
    for (const l of lamps) {
      const on = still ? 1 : Math.min(1, Math.max(0, (time - .25 - Math.abs(l.x - mid) / W * 1.5) / .5));
      if (!on) continue;
      const wave = Math.pow(Math.max(0, Math.cos(l.x / W * 9.42 - time * .75)), 4), twinkle = .5 + .5 * Math.sin(time * 1.4 + l.ph);
      const near = Math.max(0, 1 - Math.abs(l.x - mx) / 110);
      l.lift += (near * 5 - l.lift) * .15;
      const bright = still ? .75 : Math.min(1, .42 + twinkle * .14 + wave * .55 + near * .6) * on, size = l.size * (1 + wave * .3 + near * .55) * (.7 + on * .3);
      const x = l.x + (still ? 0 : Math.sin(time * .9 + l.ph) * .5), y = yAt(l.s, l.u, time) + 3 + l.lift;
      g.globalAlpha = bright; g.drawImage(glow[l.tone], x - size, y - size, size * 2, size * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  function frame(now) {
    raf = 0; if (!alive) return;
    if (document.visibilityState === 'visible') {
      if (now - last > 30) { // 30 кадров хватает: движение медленное
        last = now; const dy = scrollY - lastY; lastY = scrollY;
        swingV += (-swing * .08 + Math.max(-6, Math.min(6, dy * .1))) * .3; swingV *= .86; swing += swingV;
        draw(now);
      }
    }
    raf = requestAnimationFrame(frame);
  }
  const move = e => { mx = e.clientY < host.getBoundingClientRect().bottom + 70 ? e.clientX - host.getBoundingClientRect().left : -999; };
  const leave = () => { mx = -999; };
  const ro = new ResizeObserver(layout); ro.observe(host);
  addEventListener('pointermove', move, { passive: true }); document.addEventListener('pointerleave', leave);
  t0 = performance.now(); layout(); if (!still) raf = requestAnimationFrame(frame);
  return { destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); cv.remove(); } };
}
