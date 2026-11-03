// Лифт вместо 3D-башни: латунная стрелка-указатель этажей в стиле ар-деко, двери и кнопки.
// Чистый HTML/CSS/SVG — лёгкий и одинаково чёткий на телефоне и на 4K.
import { esc } from './ui.js';
import { play } from './sound.js';

const STATUS_COLOR = { free: 'var(--gold)', booked: 'var(--pink)', occupied: 'var(--violet)', cleaning: 'var(--mut)', repair: 'var(--mut)' };

export function mountLift(host, { onPick }) {
  host.innerHTML = `<div class="lift">
    <div class="dial" aria-hidden="true"><svg viewBox="-6 -10 212 122"><defs><linearGradient id="lbr" x1="0" x2="1"><stop offset="0" stop-color="#8a6a2a"/><stop offset=".5" stop-color="#f4d9a0"/><stop offset="1" stop-color="#8a6a2a"/></linearGradient></defs>
      <path d="M14 104 A86 86 0 0 1 186 104" fill="none" stroke="url(#lbr)" stroke-width="2"/><path d="M26 104 A74 74 0 0 1 174 104" fill="none" stroke="rgba(244,217,160,.18)" stroke-width="1"/>
      <g class="ticks"></g><g class="needle"><path d="M100 104 L98 36 L100 24 L102 36 Z" fill="url(#lbr)"/><circle cx="100" cy="104" r="7" fill="url(#lbr)"/><circle cx="100" cy="104" r="2.5" fill="#0d0809"/></g></svg>
      <div class="dread"><b class="num" id="lfNum">—</b><small id="lfSub"></small></div></div>
    <div class="doors" id="lfDoors"><div class="lview" id="lfView"></div><div class="vinfo" id="lfInfo"></div><i class="door l"></i><i class="door r"></i></div>
    <div class="lbtns" id="lfBtns" role="group" aria-label="Этаж"></div></div>`;
  const doors = host.querySelector('#lfDoors'), needle = host.querySelector('.needle'), ticks = host.querySelector('.ticks');
  let floors = [], cur = null, timer = 0, first = true, sig = '';
  const ang = f => { const i = floors.indexOf(f), n = floors.length; return n < 2 ? 0 : -72 + (i / (n - 1)) * 144; };
  function paintTicks() {
    const n = floors.length, every = n > 12 ? Math.ceil(n / 10) : 1;
    ticks.innerHTML = floors.map((f, i) => { const a = (ang(f) - 90) * Math.PI / 180, x1 = 100 + Math.cos(a) * 80, y1 = 104 + Math.sin(a) * 80, x2 = 100 + Math.cos(a) * 72, y2 = 104 + Math.sin(a) * 72, xt = 100 + Math.cos(a) * 97, yt = 104 + Math.sin(a) * 97;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(244,217,160,.6)" stroke-width="1.2"/>${i % every === 0 || i === n - 1 ? `<text x="${xt}" y="${yt + 3}" text-anchor="middle" data-f="${f}">${f}</text>` : ''}`; }).join('');
  }
  function update(rooms, sel, types) {
    const fl = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b);
    if (fl.join() !== floors.join()) { floors = fl; paintTicks(); }
    const T = Object.fromEntries((types || []).map(t => [t.id, t]));
    const s = JSON.stringify([rooms.map(r => r.status + r.floor), sel]);
    host.querySelector('#lfBtns').innerHTML = [...floors].reverse().map(f => { const fr = rooms.filter(r => r.floor === f), free = fr.filter(r => r.status === 'free').length;
      return `<button data-f="${f}" aria-pressed="${f === sel}" class="${free ? 'has' : ''}" aria-label="${f} этаж, свободно ${free} из ${fr.length}"><b class="num">${f}</b><small>${free}/${fr.length}</small></button>`; }).join('');
    host.querySelectorAll('#lfBtns [data-f]').forEach(b => b.onclick = () => { if (+b.dataset.f !== cur) onPick?.(+b.dataset.f); });
    ticks.querySelectorAll('text').forEach(t => t.classList.toggle('on', +t.dataset.f === sel));
    if (s === sig) return; sig = s;
    const fr = rooms.filter(r => r.floor === sel), free = fr.filter(r => r.status === 'free').length;
    // картинка «за дверями»: тип номера, которого на этаже больше всего
    const cnt = {}; fr.forEach(r => cnt[r.type] = (cnt[r.type] || 0) + 1); const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0]; const t = T[top];
    const paintView = () => {
      const v = host.querySelector('#lfView'); v.style.backgroundImage = `url('${(t?.image || 'img/reception.webp').replace(/'/g, '%27')}')`;
      host.querySelector('#lfInfo').innerHTML = sel == null ? '' : `<b>${sel} этаж</b><span>${esc(t?.name || '')}${Object.keys(cnt).length > 1 ? ' и другие' : ''}</span><span class="dots">${fr.map(r => `<i style="background:${STATUS_COLOR[r.status] || 'var(--mut)'}"></i>`).join('')}</span>`;
      host.querySelector('#lfNum').textContent = sel ?? '—'; host.querySelector('#lfSub').textContent = sel == null ? '' : `свободно ${free} из ${fr.length}`;
    };
    if (sel === cur) { paintView(); return; }
    const moving = cur !== null && !first; cur = sel; first = false;
    needle.style.transform = `rotate(${ang(sel)}deg)`;
    clearTimeout(timer);
    if (!moving || matchMedia('(prefers-reduced-motion: reduce)').matches) { paintView(); doors.classList.add('open'); return; }
    doors.classList.remove('open'); play('whoosh');
    timer = setTimeout(() => { paintView(); doors.classList.add('open'); play('ding'); }, 750);
  }
  return { update, active() { }, relight() { } };
}
