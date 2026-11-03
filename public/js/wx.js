// Погода поверх сцены: дождь, снег, туман или золотая пыль в солнечном воздухе.
// Лёгкий 2D-канвас, частиц немного, анимация на паузе, когда вкладка скрыта или блок не виден.
export function mountWeather(canvas, { strength = 1, wind = 0.25 } = {}) {
  const g = canvas.getContext('2d'); if (!g) return { set() {}, destroy() {} };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, kind = 'clear', day = 1, P = [], raf = 0, last = 0, visible = true, fogT = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function size() { dpr = Math.min(devicePixelRatio || 1, 1.5); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); seed(); kick(); }
  function make(init) {
    if (kind === 'rain') return { x: rnd(-H * .3, W), y: init ? rnd(-H, H) : rnd(-60, -10), l: rnd(10, 22), v: rnd(700, 1000), a: rnd(.12, .32) };
    if (kind === 'snow') return { x: rnd(0, W), y: init ? rnd(-H, H) : rnd(-20, -4), r: rnd(.7, 2.6), v: rnd(22, 60), ph: rnd(0, 6.28), sw: rnd(10, 30), a: rnd(.4, .9) };
    if (kind === 'fog') return { x: rnd(-W * .3, W), y: rnd(H * .2, H * 1.05), r: rnd(W * .18, W * .42), v: rnd(4, 14) * (Math.random() < .5 ? 1 : -1), a: rnd(.05, .11) };
    return { x: rnd(0, W), y: rnd(0, H), r: rnd(.6, 1.8), v: rnd(4, 12), ph: rnd(0, 6.28), a: rnd(.15, .5) }; // солнечная пыль
  }
  function seed() {
    const area = W * H / 10000;
    const n = { rain: area * 1.6, snow: area * 1.1, fog: 7, clear: day ? area * .25 : 0 }[kind] * (kind === 'fog' ? 1 : strength);
    P = Array.from({ length: Math.min(500, Math.round(n)) }, () => make(true));
  }
  let skip = 0;
  function frame(t) {
    raf = 0;
    // фон страницы обновляем через кадр: глазу незаметно, а нагрузки вдвое меньше
    if (strength < 1 && (skip ^= 1)) { if (!reduce && visible && P.length && document.visibilityState === 'visible') raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(.05, last ? (t - last) / 1000 : .016); last = t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (kind === 'rain') {
      g.lineCap = 'round'; g.lineWidth = 1;
      for (const p of P) { p.y += p.v * dt; p.x += p.v * wind * dt; if (p.y > H + 20) Object.assign(p, make(false));
        g.strokeStyle = `rgba(232,224,210,${p.a * strength})`; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.l * wind, p.y - p.l); g.stroke(); }
    } else if (kind === 'snow') {
      g.fillStyle = '#fff8ea';
      for (const p of P) { p.ph += dt * 1.2; p.y += p.v * dt; p.x += (Math.sin(p.ph) * p.sw * .6 + wind * 30) * dt; if (p.y > H + 6) Object.assign(p, make(false)); if (p.x > W + 6) p.x = -6; if (p.x < -6) p.x = W + 6;
        g.globalAlpha = p.a * strength; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill(); }
      g.globalAlpha = 1;
    } else if (kind === 'fog') {
      fogT += dt;
      for (const p of P) { p.x += p.v * dt; if (p.x - p.r > W) p.x = -p.r; if (p.x + p.r < 0) p.x = W + p.r;
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); const c = day ? '247,236,214' : '120,92,96';
        gr.addColorStop(0, `rgba(${c},${p.a * (1 + .25 * Math.sin(fogT * .3 + p.r)) * Math.min(1, strength * 1.4)})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
    } else if (P.length) {
      for (const p of P) { p.ph += dt * .6; p.y -= p.v * dt * .3; p.x += Math.sin(p.ph) * 6 * dt; if (p.y < -4) { p.y = H + 4; p.x = rnd(0, W); }
        g.fillStyle = `rgba(247,200,110,${p.a * (.5 + .5 * Math.sin(p.ph * 2)) * strength})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill(); }
    }
    if (!reduce && visible && P.length && document.visibilityState === 'visible') raf = requestAnimationFrame(frame); else last = 0;
  }
  function kick() { if (!raf && W) raf = requestAnimationFrame(frame); }
  const ro = new ResizeObserver(size); ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }); io.observe(canvas);
  document.addEventListener('visibilitychange', kick);
  size();
  return {
    set(k, isDay) { if (k === kind && +!!isDay === day) return; kind = k; day = isDay ? 1 : 0; seed(); kick(); },
    // при пересборке главного экрана: остановить цикл и отпустить наблюдатели и обработчики
    destroy() { cancelAnimationFrame(raf); raf = 0; P = []; ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', kick); }
  };
}
