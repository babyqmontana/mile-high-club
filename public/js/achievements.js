// Секреты отеля: скрытые достижения со всплывашкой как в Steam.
// Прогресс хранится в браузере гостя. Открытые — с ироничной подписью, закрытые — с намёком.
import { pref } from './api.js';
import { esc, modal } from './ui.js';
import { play } from './sound.js';

const P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ic = d => `<svg viewBox="0 0 24 24" ${P}>${d}</svg>`;
export const LIST = [
  { id: 'logo', t: 'Фанат бренда', d: 'Семь кликов по логотипу. Маркетологи плачут от счастья.', h: 'Логотип любит внимание. Много внимания.', i: ic('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>') },
  { id: 'konami', t: 'Олдскул', d: 'Код Konami в 2026 году. Уважаем, дедушка.', h: 'Старые коды всё ещё открывают двери. Стрелки — в самом низу страницы.', i: ic('<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M8 10v4M6 12h4M15.5 11h.01M17.5 13h.01"/>') },
  { id: 'hesoyam', t: 'HESOYAM', d: 'Здоровье, броня и $250 000. Деньги, к сожалению, не настоящие.', h: 'Лос-Сантос помнит чит-коды. Просто наберите один на клавиатуре.', i: ic('<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M12 9v6M9 12h6"/>') },
  { id: 'night', t: 'Ночной портье', d: 'Заглянули в отель под утро. Night Pool уже закрыт, но мы не осуждаем.', h: 'Приходите, когда закроется Night Pool.', i: ic('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>') },
  { id: 'lost', t: 'Потерялся в коридоре', d: 'Номера 404 не существует. Как и вашей брони на него.', h: 'В отеле есть номер, которого нет. Попробуйте зайти в него по адресу.', i: ic('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M9.5 9.5l3 3M12.5 9.5l-3 3"/>') },
  { id: 'lid', t: 'Хлоп-хлоп', d: 'Шесть раз хлопнули крышкой хьюмидора. Сигары свежее не стали.', h: 'Хьюмидор не любит, когда им хлопают.', i: ic('<rect x="3" y="11" width="18" height="8" rx="1.5"/><path d="M4 11l3-5h10l3 5M10 15h4"/>') },
  { id: 'reader', t: 'Дочитали', d: 'Вы первый, кто дошёл до последней страницы. Редакция в шоке.', h: 'Журнал стоит дочитать до конца.', i: ic('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20"/>') },
  { id: 'dizzy', t: 'Головокружение', d: 'Три оборота вокруг башни. Пилоты вертолётов LSPD обеспокоены.', h: 'Облетите башню. Не один раз.', i: ic('<path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/>') },
  { id: 'sunmoon', t: 'Сам себе солнце', d: 'Шесть рассветов за минуту. Персонал уже не понимает, завтрак сейчас или ужин.', h: 'Время в отеле — понятие гибкое.', i: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>') },
  { id: 'glutton', t: 'Шведский стол', d: 'Пятнадцать позиций в одном заказе. Шеф Le Ciel вызвал подкрепление.', h: 'Le Ciel не ограничивает аппетит.', i: ic('<path d="M3 13h18M5 13a7 7 0 0 1 14 0M12 6V4M4 17h16"/>') },
  { id: 'team', t: 'Отдел кадров', d: 'Изучили анкеты всех сотрудников. Вас уже ждут на собеседовании.', h: 'Познакомьтесь с каждым в команде.', i: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>') },
  { id: 'regular', t: 'Постоялец', d: 'Пятнадцать минут на сайте. Пора оплачивать проживание.', h: 'Задержитесь в отеле подольше.', i: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') },
  { id: 'bell', t: 'Позовите менеджера', d: 'Шесть звонков подряд. Портье уже бежит, но, кажется, не к вам.', h: 'На стойке ресепшена есть звонок. Он не любит спешку.', i: ic('<path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 9V7M10 7h4"/>') },
  { id: 'dj', t: 'Диджей на минималках', d: 'Звук включён и выключен восемь раз. Диджей Sky Pool нервно курит.', h: 'Кнопку звука можно не только включать.', i: ic('<path d="M4 10v4h4l5 4V6L8 10zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/>') },
  { id: 'scratch', t: 'Скрэтч-мастер', d: 'Поцарапали пластинку Sky Pool. Её стоимость вычтут из депозита.', h: 'Пластинку у бассейна можно потрогать руками.', i: ic('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3a9 9 0 0 1 9 9"/>') },
  { id: 'chef', t: 'Сюрприз от шефа', d: 'Заглянули под клош. Шеф обижен, но улыбается.', h: 'В Le Ciel под серебряной крышкой что-то есть.', i: ic('<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 8V6"/>') },
  { id: 'snow', t: 'Снеговик', d: 'Вы увидели снег над Лос-Сантосом. Синоптики увольняются.', h: 'Иногда над отелем идёт то, чего в Лос-Сантосе не бывает.', i: ic('<path d="M12 2v20M4 6.5l16 11M4 17.5l16-11"/>') },
  { id: 'platinum', t: 'Платиновый гость', d: 'Собраны все секреты отеля. Ключ от пентхауса не прилагается.', h: 'Соберите все остальные секреты.', i: ic('<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 18 3-18"/>') }
];
const KEY = 'mhc-ach';
let got = {}; try { got = JSON.parse(pref.get(KEY) || '{}') || {}; } catch { got = {}; }
const save = () => { try { pref.set(KEY, JSON.stringify(got)); } catch { } };
const listeners = new Set();
export const has = id => !!got[id];
export const count = () => LIST.filter(a => got[a.id]).length;
export const onChange = fn => listeners.add(fn);

let queue = [], showing = false;
export function unlock(id) {
  if (got[id] || !LIST.some(a => a.id === id)) return false;
  got[id] = Date.now(); save(); queue.push(id); next(); listeners.forEach(f => f());
  if (id !== 'platinum' && LIST.every(a => a.id === 'platinum' || got[a.id])) setTimeout(() => unlock('platinum'), 1800);
  return true;
}
function next() {
  if (showing || !queue.length) return; showing = true;
  const qid = queue.shift(), a = LIST.find(x => x.id === qid);
  let host = document.getElementById('achs'); if (!host) { host = document.createElement('div'); host.id = 'achs'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  const el = document.createElement('button'); el.className = 'ach' + (a.id === 'platinum' ? ' plat' : ''); el.type = 'button'; el.dataset.sfx = '';
  el.innerHTML = `<span class="ai">${a.i}</span><span class="at"><small>Достижение получено</small><b>${esc(a.t)}</b><span>${esc(a.d)}</span></span>`;
  el.onclick = () => openCabinet();
  host.append(el); play('achievement');
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => { el.remove(); showing = false; next(); }, 450); }, 5600);
}
export function openCabinet() {
  const n = count();
  modal(`<div class="cab"><div><span class="eyebrow">Секреты отеля</span><h3>${n} из ${LIST.length}</h3><div class="cbar"><i style="width:${n / LIST.length * 100}%"></i></div><p class="note">Секреты спрятаны по всему сайту. Прогресс хранится в этом браузере.</p></div>
    <div class="clist">${LIST.map(a => got[a.id] ? `<div class="ci on"><span class="ai">${a.i}</span><span><b>${esc(a.t)}</b><small>${esc(a.d)}</small></span><time>${new Date(got[a.id]).toLocaleDateString('ru-RU')}</time></div>`
      : `<div class="ci"><span class="ai">?</span><span><b>Скрытое достижение</b><small>${esc(a.h)}</small></span></div>`).join('')}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn sm ghost" data-close="">Закрыть</button></div></div>`, { wide: true });
}

// ---------- ловушки, которые не привязаны к конкретной странице ----------
let keys = '';
const KONAMI = 'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a';
addEventListener('keydown', e => {
  if (e.target.closest?.('input,textarea,select,[contenteditable]')) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys = (keys + ',' + k).split(',').slice(-12).join(',');
  if (keys.endsWith(KONAMI)) unlock('konami');
  const letters = keys.split(',').filter(x => x.length === 1).join('');
  // и латиница, и та же клавиша в русской раскладке
  if (/hesoyam$/.test(letters) || /руыщнфь$/.test(letters)) unlock('hesoyam');
});
{ const h = new Date(Date.now() + 3 * 3600e3).getUTCHours(); if (h >= 4 && h < 6) unlock('night'); }
// время на сайте считается только пока вкладка открыта и видна
{ let secs = +(pref.get('mhc-time') || 0); setInterval(() => { if (document.visibilityState !== 'visible') return; secs += 5; if (secs % 30 === 0) pref.set('mhc-time', String(secs)); if (secs >= 900) unlock('regular'); }, 5000); }

// простой счётчик «N раз за T секунд»
const hits = {};
export function burst(id, need, windowMs) { const now = Date.now(); hits[id] = (hits[id] || []).filter(t => now - t < windowMs); hits[id].push(now); if (hits[id].length >= need) { hits[id] = []; return unlock(id); } return false; }
