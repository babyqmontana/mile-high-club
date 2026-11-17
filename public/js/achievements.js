// Секреты отеля: скрытые достижения со всплывашкой как в Steam.
// Прогресс хранится в браузере гостя. Открытые — с ироничной подписью, закрытые — с намёком.
import { pref } from './api.js';
import { esc, modal } from './ui.js';
import { play } from './sound.js';

const P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ic = d => `<svg viewBox="0 0 24 24" ${P}>${d}</svg>`;
export const LIST = [
  { id: 'logo', r: 1, t: 'Фанат бренда', d: 'Семь кликов по логотипу. Маркетологи плачут от счастья.', h: 'Логотип любит внимание. Много внимания.', i: ic('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>') },
  { id: 'konami', r: 2, t: 'Олдскул', d: 'Код Konami в 2026 году. Уважаем, дедушка.', h: 'Старые коды всё ещё открывают двери. Стрелки — в самом низу страницы, их можно и нажать.', i: ic('<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M8 10v4M6 12h4M15.5 11h.01M17.5 13h.01"/>') },
  { id: 'hesoyam', r: 2, t: 'HESOYAM', d: 'Здоровье, броня и $250 000. Деньги, к сожалению, не настоящие.', h: 'Лос-Сантос помнит чит-коды. Наберите один — хоть на клавиатуре, хоть в любом поле на сайте.', i: ic('<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M12 9v6M9 12h6"/>') },
  { id: 'night', r: 3, t: 'Ночной портье', d: 'Заглянули в отель под утро. Night Pool уже закрыт, но мы не осуждаем.', h: 'Приходите, когда закроется Night Pool.', i: ic('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>') },
  { id: 'lost', r: 1, t: 'Потерялся в коридоре', d: 'Номера 404 не существует. Как и вашей брони на него.', h: 'В отеле есть номер, которого нет. Попробуйте зайти в него по адресу.', i: ic('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M9.5 9.5l3 3M12.5 9.5l-3 3"/>') },
  { id: 'lid', r: 1, t: 'Хлоп-хлоп', d: 'Шесть раз хлопнули крышкой хьюмидора. Сигары свежее не стали.', h: 'Хьюмидор не любит, когда им хлопают.', i: ic('<rect x="3" y="11" width="18" height="8" rx="1.5"/><path d="M4 11l3-5h10l3 5M10 15h4"/>') },
  { id: 'reader', r: 2, t: 'Дочитали', d: 'Вы первый, кто дошёл до последней страницы. Редакция в шоке.', h: 'Журнал стоит дочитать до конца.', i: ic('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20"/>') },
  { id: 'dizzy', r: 1, t: 'Головокружение', d: 'Три оборота вокруг башни. Пилоты вертолётов LSPD обеспокоены.', h: 'Облетите башню. Не один раз.', i: ic('<path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/>') },
  { id: 'glutton', r: 2, t: 'Шведский стол', d: 'Пятнадцать позиций в одном заказе. Шеф Le Ciel вызвал подкрепление.', h: 'Le Ciel не ограничивает аппетит.', i: ic('<path d="M3 13h18M5 13a7 7 0 0 1 14 0M12 6V4M4 17h16"/>') },
  { id: 'team', r: 2, t: 'Отдел кадров', d: 'Изучили анкеты всех сотрудников. Вас уже ждут на собеседовании.', h: 'Познакомьтесь с каждым в команде.', i: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>') },
  { id: 'regular', r: 2, t: 'Постоялец', d: 'Пятнадцать минут на сайте. Пора оплачивать проживание.', h: 'Задержитесь в отеле подольше.', i: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') },
  { id: 'bell', r: 1, t: 'Позовите менеджера', d: 'Шесть звонков подряд. Портье уже бежит, но, кажется, не к вам.', h: 'На стойке ресепшена есть звонок. Он не любит спешку.', i: ic('<path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 9V7M10 7h4"/>') },
  { id: 'dj', r: 1, t: 'Диджей на минималках', d: 'Звук включён и выключен восемь раз. Диджей Sky Pool нервно курит.', h: 'Кнопку звука можно не только включать.', i: ic('<path d="M4 10v4h4l5 4V6L8 10zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/>') },
  { id: 'scratch', r: 1, t: 'Скрэтч-мастер', d: 'Поцарапали пластинку Sky Pool. Её стоимость вычтут из депозита.', h: 'Пластинку у бассейна можно потрогать руками.', i: ic('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3a9 9 0 0 1 9 9"/>') },
  { id: 'chef', r: 1, t: 'Сюрприз от шефа', d: 'Заглянули под клош. Шеф обижен, но улыбается.', h: 'В Le Ciel под серебряной крышкой что-то есть.', i: ic('<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 8V6"/>') },
  { id: 'snow', r: 3, season: true, t: 'Снеговик', d: 'Вы увидели снег над Лос-Сантосом. Синоптики увольняются.', h: 'Сезонное: зимой над отелем идёт то, чего в Лос-Сантосе не бывает.', i: ic('<path d="M12 2v20M4 6.5l16 11M4 17.5l16-11"/>') },
  { id: 'explorer', r: 2, t: 'Экскурсия', d: 'Обошли весь отель: от лобби до заявки управляющим. Консьерж предлагает вам работу.', h: 'Загляните в каждый раздел отеля.', i: ic('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>') },
  { id: 'floors', r: 2, t: 'Лифтёр', d: 'Побывали на каждом этаже с номерами. Лифтёр просит вернуть ему фуражку.', h: 'Лифт в «Номерах» возит не только на один этаж.', i: ic('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M12 3v18M8.5 9l1.5-2 1.5 2M12.5 15l1.5 2 1.5-2"/>') },
  { id: 'privacy', r: 3, t: 'Мелкий шрифт', d: 'Дочитали политику конфиденциальности до конца. Таких в Лос-Сантосе двое: вы и юрист отеля.', h: 'На сайте есть документ, который никто не читает до конца.', i: ic('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 15h5M10 18h3"/>') },
  { id: 'passport', r: 1, t: 'Паспорт гостя', d: 'Заполнили профиль гостя. Портье наконец знает, как к вам обращаться.', h: 'Кабинету не хватает пары слов о вас.', i: ic('<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8.5 17a3.5 3.5 0 0 1 7 0"/>') },
  { id: 'lifex', r: 2, t: 'Светская хроника', d: 'Привязали LifeX. Папарацци у входа теперь знают вас в лицо.', h: 'У отеля есть друзья в игровой соцсети.', i: ic('<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>') },
  { id: 'concierge', r: 2, t: 'Личный консьерж', d: 'Прочитали ответ управляющего. Вас обслуживают лично, без очереди.', h: 'Напишите управляющим и дождитесь ответа.', i: ic('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>') },
  { id: 'again', r: 1, t: 'Как обычно', d: 'Повторили прошлый заказ. Официант Le Ciel уже знает ваш вкус.', h: 'В кабинете можно не выбирать блюда заново.', i: ic('<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>') },
  { id: 'loyal', r: 3, t: 'Свой человек', d: 'Получили статус гостя. Ресепшен узнаёт вас по походке.', h: 'Отель помнит тех, кто возвращается.', i: ic('<path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4l-4.8 2.5.9-5.4L4.2 8.7l5.4-.8z"/><path d="M8 21h8"/>') },
  { id: 'platinum', r: 3, t: 'Платиновый гость', d: 'Собраны все секреты отеля. Ключ от пентхауса не прилагается.', h: 'Соберите все остальные секреты.', i: ic('<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 18 3-18"/>') }
];
const KEY = 'mhc-ach';
const RARITY = { 1: 'Обычное', 2: 'Редкое', 3: 'Легендарное' };
let got = {}; try { got = JSON.parse(pref.get(KEY) || '{}') || {}; } catch { got = {}; }
const save = () => { try { pref.set(KEY, JSON.stringify(got)); } catch { } };
const listeners = new Set();
export const has = id => !!got[id];
export const count = () => LIST.filter(a => got[a.id]).length;
export const onChange = fn => listeners.add(fn);
export const ids = () => Object.keys(got).filter(id => LIST.some(a => a.id === id));
// найденные на другом устройстве секреты приходят из аккаунта: добавляем без всплывашек
export function merge(list) { let n = 0; for (const id of list || []) if (!got[id] && LIST.some(a => a.id === id)) { got[id] = Date.now(); n++; } if (n) { save(); listeners.forEach(f => f()); } return n; }

let queue = [], showing = false;
export function unlock(id) {
  if (got[id] || !LIST.some(a => a.id === id)) return false;
  got[id] = Date.now(); save(); queue.push(id); next(); listeners.forEach(f => f());
  if (id !== 'platinum' && LIST.every(a => a.id === 'platinum' || a.season || got[a.id])) setTimeout(() => unlock('platinum'), 1800);
  return true;
}
function next() {
  if (showing || !queue.length) return; showing = true;
  const qid = queue.shift(), a = LIST.find(x => x.id === qid);
  let host = document.getElementById('achs'); if (!host) { host = document.createElement('div'); host.id = 'achs'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  const el = document.createElement('button'); el.className = 'ach' + (a.id === 'platinum' ? ' plat' : ''); el.type = 'button'; el.dataset.sfx = '';
  el.dataset.r = a.r || 1; el.innerHTML = `<span class="ai">${a.i}</span><span class="at"><small>${RARITY[a.r || 1]} · достижение получено</small><b>${esc(a.t)}</b><span>${esc(a.d)}</span></span>`;
  el.onclick = () => openCabinet();
  host.append(el); play('achievement');
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => { el.remove(); showing = false; next(); }, 450); }, 5600);
}
export function openCabinet() {
  const n = count();
  modal(`<div class="cab"><div><span class="eyebrow">Секреты отеля</span><h3>${n} из ${LIST.length}</h3><div class="cbar"><i style="width:${n / LIST.length * 100}%"></i></div><p class="note">Секреты спрятаны по всему сайту, у каждого своя редкость. Прогресс хранится в этом браузере, а после входа через Discord — и в аккаунте. Сезонные для «Платинового гостя» не нужны.</p></div>
    <div class="clist">${LIST.map(a => got[a.id] ? `<div class="ci on" data-r="${a.r || 1}"><span class="ai">${a.i}</span><span><b>${esc(a.t)}</b><em class="rar">${RARITY[a.r || 1]}${a.season ? ' · сезонное' : ''}</em><small>${esc(a.d)}</small></span><time>${new Date(got[a.id]).toLocaleDateString('ru-RU')}</time></div>`
      : `<div class="ci" data-r="${a.r || 1}"><span class="ai">?</span><span><b>Скрытое достижение</b><em class="rar">${RARITY[a.r || 1]}${a.season ? ' · сезонное' : ''}</em><small>${esc(a.h)}</small></span></div>`).join('')}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn sm ghost" data-close="">Закрыть</button></div></div>`, { wide: true });
}

// ---------- ловушки, которые не привязаны к конкретной странице ----------
let keys = '';
const KONAMI = 'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a';
export function feed(key) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  keys = (keys + ',' + k).split(',').slice(-12).join(',');
  if (keys.endsWith(KONAMI)) unlock('konami');
  const letters = keys.split(',').filter(x => x.length === 1).join('');
  // и латиница, и та же клавиша в русской раскладке
  if (/hesoyam$/.test(letters) || /руыщнфь$/.test(letters)) unlock('hesoyam');
}
addEventListener('keydown', e => { if (!e.target.closest?.('input,textarea,select,[contenteditable]')) feed(e.key); });
addEventListener('input', e => { const v = String(e.target?.value || '').toLowerCase(); if (/(hesoyam|руыщнфь)$/.test(v)) unlock('hesoyam'); });
{ const h = new Date(Date.now() + 3 * 3600e3).getUTCHours(); if (h >= 4 && h < 6) unlock('night'); }
// время на сайте считается только пока вкладка открыта и видна
{ let secs = +(pref.get('mhc-time') || 0); setInterval(() => { if (document.visibilityState !== 'visible') return; secs += 5; if (secs % 30 === 0) pref.set('mhc-time', String(secs)); if (secs >= 900) unlock('regular'); }, 5000); }

// простой счётчик «N раз за T секунд»
const hits = {};
export function burst(id, need, windowMs) { const now = Date.now(); hits[id] = (hits[id] || []).filter(t => now - t < windowMs); hits[id].push(now); if (hits[id].length >= need) { hits[id] = []; return unlock(id); } return false; }
