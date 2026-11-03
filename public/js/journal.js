import { esc } from './ui.js';
import { play } from './sound.js';
import { unlock } from './achievements.js';
// Листаемый журнал на page-flip (как на ONE): обложка, развороты, загиб страницы, звук листания.
export function mountBook(wrap, el, issue, ctl) {
  const pages = issue.pages || [];
  if (!pages.length) { el.innerHTML = '<div class="empty">В выпуске пока нет страниц.</div>'; return { destroy() {} }; }
  el.innerHTML = pages.map(p => {
    if (p.kind === 'image' || (!p.kind && p.image)) return `<div class="pg" data-density="soft"><img src="${esc(p.image)}" alt="${esc(p.title || '')}" loading="lazy" draggable="false"></div>`;
    if (p.kind === 'quote') return `<div class="pg quote">“${esc(p.text)}”</div>`;
    return `<div class="pg txt">${p.cat ? `<span class="c">${esc(p.cat)}</span>` : ''}${p.title ? `<h3>${esc(p.title)}</h3>` : ''}${p.image ? `<img src="${esc(p.image)}" alt="" style="height:auto;max-height:45%;object-fit:cover;border-radius:2px">` : ''}${String(p.text || '').split(/\n\s*\n/).map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
  }).join('');
  const PF = window.St?.PageFlip;
  if (!PF) { el.style.display = 'grid'; el.style.gap = '12px'; el.style.gridTemplateColumns = 'repeat(auto-fill,minmax(220px,1fr))'; ctl.num.textContent = `${pages.length} стр.`; return { destroy() {} }; }
  const fitW = () => { const fs = wrap.classList.contains('fs'), vh = innerHeight - (fs ? 90 : 210), port = innerWidth < 700; const w = Math.max(280, Math.min(wrap.clientWidth - 8, fs ? 1600 : 1100, Math.round((port ? 1 : 2) * vh / 1.414))); el.parentElement.style.width = w + 'px'; };
  fitW(); addEventListener('resize', fitW);
  const book = new PF(el, { width: 550, height: 778, size: 'stretch', minWidth: 260, maxWidth: 1000, minHeight: 368, maxHeight: 1414, showCover: true, usePortrait: true, mobileScrollSupport: true, flippingTime: 750, maxShadowOpacity: 0.45, drawShadow: true, autoSize: true });
  book.loadFromHTML(el.querySelectorAll('.pg'));
  const num = () => { const i = book.getCurrentPageIndex(), n = book.getPageCount(); const two = book.getOrientation() === 'landscape' && i > 0 && i < n - 1; ctl.num.textContent = two ? `${i + 1}–${Math.min(n, i + 2)} из ${n}` : `${i + 1} из ${n}`; ctl.prev.disabled = i === 0; ctl.next.disabled = i >= n - (book.getOrientation() === 'landscape' && i > 0 ? 2 : 1); };
  let lastSnd = 0;
  book.on('changeState', e => { if (e.data === 'flipping' && performance.now() - lastSnd > 250) { lastSnd = performance.now(); play('page'); } });
  book.on('flip', () => { num(); if (book.getPageCount() > 3 && book.getCurrentPageIndex() >= book.getPageCount() - 2) unlock('reader'); }); book.on('changeOrientation', num); num();
  ctl.prev.onclick = () => book.flipPrev('top'); ctl.next.onclick = () => book.flipNext('top');
  if (ctl.fsPrev) { ctl.fsPrev.onclick = () => book.flipPrev('top'); ctl.fsNext.onclick = () => book.flipNext('top'); }
  const key = e => { if (e.target.closest('input,textarea,select')) return; if (e.key === 'ArrowLeft') book.flipPrev('top'); if (e.key === 'ArrowRight') book.flipNext('top'); if (e.key === 'Escape' && wrap.classList.contains('fs')) toggleFs(false); };
  addEventListener('keydown', key);
  const refit = () => setTimeout(() => { fitW(); dispatchEvent(new Event('resize')); book.update?.(); }, 60);
  function toggleFs(on = !wrap.classList.contains('fs')) {
    wrap.classList.toggle('fs', on); document.body.style.overflow = on ? 'hidden' : '';
    const phone = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
    if (on && !phone) wrap.requestFullscreen?.().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    if (on) history.pushState({ mhcFs: 1 }, ''); 
    play(on ? 'open' : 'close'); refit();
  }
  const onPop = () => { if (wrap.classList.contains('fs')) { wrap.classList.remove('fs'); document.body.style.overflow = ''; refit(); } };
  addEventListener('popstate', onPop);
  const fsChange = () => { if (!document.fullscreenElement && wrap.classList.contains('fs')) { wrap.classList.remove('fs'); document.body.style.overflow = ''; refit(); } };
  document.addEventListener('fullscreenchange', fsChange);
  ctl.fs.onclick = () => toggleFs(); ctl.fsx.onclick = () => { toggleFs(false); if (history.state?.mhcFs) history.back(); };
  return { destroy() { removeEventListener('popstate', onPop); wrap.classList.remove('fs'); removeEventListener('keydown', key); removeEventListener('resize', fitW); document.removeEventListener('fullscreenchange', fsChange); document.body.style.overflow = ''; try { book.destroy(); } catch { } }, active() {} };
}
