// Пасхалка «Горячие туры»: турагентство отеля продаёт рейс Лос-Сантос → Вайс-Сити.
// После «вылета» сайт переодевается в закатный неон Вайс-Сити (пальмы, ретро-солнце, градиентные заголовки),
// гость получает секрет «Горячий тур». Обратный рейс — той же кнопкой в подвале. Выбор помнится в браузере.
import { S, $, esc, modal, toast } from './ui.js';
import { unlock } from './achievements.js';
import { play } from './sound.js';

const KEY = 'mhc-vice', root = document.documentElement;
export const isOn = () => root.classList.contains('vice');
const calm = () => root.classList.contains('calm');

const PALM = `<svg viewBox="0 0 140 240" fill="currentColor" aria-hidden="true"><path d="M70 240c-3-52-9-104 4-160l7 2c-11 54-5 106-3 158z"/><path d="M76 80C52 54 22 52 2 74c26-12 50-8 72 10z"/><path d="M76 80C58 40 30 26 8 30c30 6 52 22 66 52z"/><path d="M76 80c4-38-8-62-28-78 22 22 26 46 24 78z"/><path d="M76 80c22-34 48-42 64-34-24 0-44 12-60 38z"/><path d="M76 80c34-6 56 10 62 40-12-22-34-34-60-34z"/><path d="M76 80C56 90 42 108 34 136c14-24 28-40 46-50z"/></svg>`;
const PLANE = `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M60 30.5c0-2-1.6-3.5-3.6-3.5H41L26 5h-6l7 22H14l-5-7H4l3 12-3 12h5l5-7h13l-7 22h6l15-22h15.4c2 0 3.6-1.5 3.6-3.5z"/></svg>`;

// небо Вайс-Сити: свечение у горизонта, ретро-солнце в полоску и две пальмы по краям — за содержимым страницы
export function mount() {
  if (!document.getElementById('viceSky')) {
    const sky = document.createElement('div'); sky.id = 'viceSky'; sky.setAttribute('aria-hidden', 'true');
    sky.innerHTML = `<i class="photo"></i><i class="glow"></i><i class="sun"></i><span class="palm l">${PALM}</span><span class="palm r">${PALM}</span>`;
    document.body.prepend(sky);
  }
  label();
}
function label() {
  const b = $('#viceBtn'); if (!b) return;
  b.textContent = isOn() ? 'Обратный рейс в Лос-Сантос' : 'Горячие туры';
  b.setAttribute('aria-pressed', isOn());
}
function apply(on) {
  root.classList.toggle('vice', on);
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { }
  mount();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', on ? '#0C0717' : '#0D0809');
  // вернулся домой — рейс использован, кнопка больше не появится (секрет остаётся)
  if (!on) try { localStorage.setItem('mhc-vice-done', '1'); } catch { }
  document.dispatchEvent(new Event('mhc-vice'));
}
// перелёт: закатная шторка с самолётом; тема меняется, пока экран закрыт
function fly(on) {
  if (calm()) { apply(on); return Promise.resolve(); }
  const o = document.createElement('div'); o.className = 'vfly' + (on ? '' : ' back'); o.setAttribute('aria-hidden', 'true');
  o.innerHTML = `<span class="pl">${PLANE}</span><div><b>${on ? 'Лос-Сантос → Вайс-Сити' : 'Вайс-Сити → Лос-Сантос'}</b><small>Рейс MHC 306 · ${on ? 'без пересадок' : 'посадка в пентхаусе'}</small></div>`;
  document.body.append(o);
  return new Promise(res => {
    setTimeout(() => apply(on), 900);
    setTimeout(() => { o.remove(); res(); }, 2050);
  });
}

const hhmm = () => new Date(Date.now() + 15 * 60e3).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
export async function open() {
  const staff = ['admin', 'mod'].includes(S.me?.role), on = isOn(), name = String(S.items?.profile?.name || '').trim() || 'Гость отеля';
  const from = on ? ['VC', 'Вайс-Сити'] : ['LS', 'Лос-Сантос'], to = on ? ['LS', 'Лос-Сантос'] : ['VC', 'Вайс-Сити'];
  const r = await modal(`<div class="vt">
    <div><span class="eyebrow">Турагентство Mile High Club</span><h2 style="margin-top:.4rem">${on ? 'Обратный рейс' : 'Горячие туры'}</h2>
    <p class="note" style="margin:.5rem 0 0">${on ? (staff ? 'Загар не смывается, а номер в пентхаусе ждёт. Персоналу рейс открыт всегда — можно вернуться сюда в любой момент.' : 'Загар не смывается, а номер в пентхаусе ждёт. Билет в одну сторону: обратно в Вайс-Сити этот рейс уже не полетит.') : 'Последние места на прямой рейс к океану: неон, пальмы и вечный закат уже в стоимости. Виза не нужна, чемодан — тоже.'}</p></div>
    <div class="vt-pass" role="group" aria-label="Посадочный талон">
      <div class="vt-route"><div><small>Откуда</small><b>${from[0]}</b><span>${from[1]}</span></div><span class="vt-plane">${PLANE}</span><div><small>Куда</small><b>${to[0]}</b><span>${to[1]}</span></div></div>
      <div class="vt-grid"><div><small>Пассажир</small><b>${esc(name)}</b></div><div><small>Рейс</small><b>MHC 306</b></div><div><small>Вылет</small><b class="num">${hhmm()}</b></div><div><small>Выход</small><b>40</b></div><div><small>Место</small><b>1A</b></div><div><small>Класс</small><b>Пентхаус</b></div></div>
      <div class="vt-bar"></div>
    </div>
    <div class="row" style="gap:.5rem;flex-wrap:wrap"><button class="btn" data-close="go" data-sfx="secret">${on ? 'Домой, в Лос-Сантос' : 'Вылетаем'}</button><button class="btn ghost" data-close="">${on ? 'Ещё побуду' : 'Остаться в Лос-Сантосе'}</button></div>
  </div>`);
  if (r !== 'go') return;
  play('secret');
  await fly(!on);
  if (!on) { unlock('vice'); toast('Добро пожаловать в Вайс-Сити! Обратный рейс — в подвале сайта'); }
  else toast('С возвращением в Лос-Сантос! Секрет «Горячий тур» остаётся с вами');
}
