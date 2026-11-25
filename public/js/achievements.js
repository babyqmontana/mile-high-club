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
  { id: 'vice', r: 2, t: 'Горячий тур', d: 'Улетели в Вайс-Сити, не выходя из отеля. Загар за счёт заведения.', h: 'В подвале сайта продают горячие туры. Говорят, без визы и чемоданов.', i: ic('<path d="M12 21c-.4-4.6-.8-9.2.6-14"/><path d="M12.6 7C10.4 4.8 7.2 4.6 5 6.6"/><path d="M12.6 7c.6-2.8 2.8-4.6 5.6-4.4"/><path d="M12.6 7c2.6-.6 5.2.6 6.4 3.2"/><path d="M12.6 7C10 7.4 8 9.4 7.6 12"/><path d="M3 21h18"/>') },
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
// коллекция из аккаунта — главная: найденное на другом устройстве и выданное администратором добавляется, снятое — убирается
let off = new Set(), linked = false, queue = [], showing = false;
const full = () => LIST.every(a => a.id === 'platinum' || a.season || got[a.id]);
export function merge(list, removed) {
  off = new Set(removed || []); let n = 0; const fresh = [];
  for (const id of off) if (got[id]) { delete got[id]; n++; }
  for (const id of list || []) if (!got[id] && !off.has(id) && LIST.some(a => a.id === id)) { got[id] = Date.now(); fresh.push(id); n++; }
  if (n) save();
  if (linked && fresh.length && fresh.length <= 3) { queue.push(...fresh); next(); }   // пришло при открытом сайте — покажем, как обычную находку
  linked = true; if (n) listeners.forEach(f => f());
  if (fresh.length && full()) unlock('platinum');
  return n;
}
// знак коллекционера: растёт вместе с коллекцией — металл, лучи, звёзды, лавр, самоцвет, корона
const RANKS = [[1, 'Наблюдатель'], [5, 'Знаток'], [10, 'Исследователь'], [16, 'Хранитель'], [21, 'Посвящённый'], [25, 'Легенда отеля']];
const METAL = [['#4a4148', '#2b252b', '#8d828b'], ['#d08a52', '#7a4218', '#f3c79b'], ['#dfe4ec', '#7d8694', '#ffffff'], ['#f7c948', '#9a6411', '#fff0b8'], ['#f7b50a', '#8a3f12', '#ffe7a6'], ['#b98cff', '#4a1f8a', '#efe2ff'], ['#ff5fae', '#f7b50a', '#fff3dc']];
let eN = 0;
export function emblem(list = ids(), big = false) {
  const set = new Set(list), n = LIST.filter(a => set.has(a.id)).length, top = set.has('platinum') || n >= LIST.length, lv = top ? RANKS.length : Math.min(RANKS.length - 1, RANKS.filter(r => n >= r[0]).length), nx = RANKS[lv] || null;
  const [c1, c2, c3] = METAL[lv], id = 'em' + (++eN), P = (r, a) => `${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`, T = Math.PI * 2;
  const pet = 8 + lv * 3, scallop = Array.from({ length: pet * 2 }, (_, k) => P(k % 2 ? 33 : 33 + 2 + lv * .9, k / (pet * 2) * T - Math.PI / 2)).join('L');
  const rays = lv >= 4 ? `<g class="em-rays">${Array.from({ length: lv >= 6 ? 24 : lv >= 5 ? 16 : 12 }, (_, k, m) => k).map((k, _, m) => { const a = k / m.length * T; return `<path d="M${P(39, a - .03)}L${P(k % 2 ? 46 : 49, a)}L${P(39, a + .03)}z"/>`; }).join('')}</g>` : '';
  const laurel = lv >= 4 ? `<g fill="${c3}" opacity=".9">${[-1, 1].map(s => [0, 1, 2, 3, 4].map(k => { const a = Math.PI / 2 + s * (.35 + k * .34), x = 50 + Math.cos(a) * 27, y = 50 + Math.sin(a) * 27; return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.4" ry="1.8" transform="rotate(${(a * 180 / Math.PI + 90 - s * 28).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; }).join('')).join('')}</g>` : '';
  const star = (x, y, r) => `<path d="M${Array.from({ length: 10 }, (_, k) => { const a = k / 10 * T - Math.PI / 2, q = k % 2 ? r * .45 : r; return `${(x + Math.cos(a) * q).toFixed(1)} ${(y + Math.sin(a) * q).toFixed(1)}`; }).join('L')}z"/>`;
  const stars = lv >= 2 && lv < 6 ? `<g fill="${c3}">${Array.from({ length: Math.min(3, lv - 1) }, (_, k, m) => k).map((k, _, m) => star(50 + (k - (m.length - 1) / 2) * 11, 31 + Math.abs(k - (m.length - 1) / 2) * 2.4, 3.6)).join('')}</g>` : '';
  const crown = lv >= 6 ? `<path d="M34 34l3-14 7 7 6-11 6 11 7-7 3 14z" fill="${c3}" stroke="${c2}" stroke-width="1.2" stroke-linejoin="round"/>` : '';
  const core = lv >= 5 ? `<path d="M50 40l10 9-10 16-10-16z" fill="${c3}"/><path d="M40 49h20M50 40l-4 9 4 16 4-16z" fill="none" stroke="${c2}" stroke-width="1.3" stroke-linejoin="round"/>` : `<g fill="none" stroke="${lv ? c2 : c3}" stroke-width="3.4" stroke-linecap="round"><circle cx="50" cy="46" r="6.2"/><path d="M50 52.5v13M50 60h5M50 65.5h4"/></g>`;
  const name = lv ? RANKS[lv - 1][1] : 'Новичок';
  return { lv, n, name, next: nx && !top ? { name: nx[1], left: lv === RANKS.length - 1 ? null : nx[0] - n } : null,
    svg: `<svg class="emb${big ? ' big' : ''}" data-lv="${lv}" viewBox="0 0 100 100" role="img" aria-label="Знак коллекционера: ${name}"><title>${name} · секретов отеля: ${n}</title><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c3}"/><stop offset=".35" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><g fill="${c1}">${rays}</g><path d="M${scallop}z" fill="url(#${id})"/><circle cx="50" cy="50" r="29.5" fill="${lv ? `url(#${id})` : c2}" stroke="${c3}" stroke-opacity=".7" stroke-width="1.4"/>${lv >= 3 ? `<circle cx="50" cy="50" r="25.5" fill="none" stroke="${c2}" stroke-opacity=".55" stroke-width="1" stroke-dasharray="1.5 2.5"/>` : ''}${laurel}${stars}${core}${crown}</svg>` };
}

export function unlock(id) {
  if (got[id] || off.has(id) || !LIST.some(a => a.id === id)) return false;
  got[id] = Date.now(); save(); queue.push(id); next(); listeners.forEach(f => f());
  if (id !== 'platinum' && full()) setTimeout(() => unlock('platinum'), 1800);
  return true;
}
function next() {
  if (showing || !queue.length) return; showing = true;
  const qid = queue.shift(), a = LIST.find(x => x.id === qid);
  let host = document.getElementById('achs'); if (!host) { host = document.createElement('div'); host.id = 'achs'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  const el = document.createElement('button'); el.className = 'ach' + (a.id === 'platinum' ? ' plat' : ''); el.type = 'button'; el.dataset.sfx = '';
  const r = a.r || 1, n = LIST.filter(x => got[x.id] && got[x.id] <= got[qid]).length;
  el.dataset.r = r; el.innerHTML = `<span class="gl" aria-hidden="true"></span><span class="aw" aria-hidden="true"><span class="rays"></span><span class="burst">${sparks(r === 3 ? 16 : r === 2 ? 12 : 9)}</span><span class="ai">${a.i}</span></span>
    <span class="at"><small>${RARITY[r]} · достижение получено</small><b>${esc(a.t)}</b><span>${esc(a.d)}</span><span class="ap">${bar(n, LIST.length, n - 1, 'sm')}<em class="num">${n}/${LIST.length}</em></span></span>`;
  el.onclick = () => openCabinet();
  host.append(el); play('achievement');
  requestAnimationFrame(() => { el.classList.add('in'); setTimeout(() => grow(el), 450); });
  if (r === 3 || a.id === 'platinum') confetti(a.id === 'platinum' ? 70 : 36);
  setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => { el.remove(); showing = false; next(); }, 450); }, 5600);
}
// ---------- эффекты ----------
const reduce = () => document.documentElement.classList.contains('calm');
const rnd = (a, b) => a + Math.random() * (b - a);
function sparks(n) {
  return Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2 + rnd(-.25, .25), d = rnd(52, 96);
    return `<i style="--x:${(Math.cos(t) * d).toFixed(1)}px;--y:${(Math.sin(t) * d).toFixed(1)}px;--d:${rnd(0, .18).toFixed(2)}s;--s:${rnd(.55, 1.15).toFixed(2)}"></i>`; }).join('');
}
function confetti(n) {
  if (reduce()) return;
  const fx = document.createElement('div'); fx.className = 'achfx'; fx.setAttribute('aria-hidden', 'true');
  const C = ['#f7b50a', '#ffe0a0', '#f0177a', '#ef5617', '#fff3dc'];
  fx.innerHTML = Array.from({ length: n }, () => `<i style="left:${rnd(0, 100).toFixed(1)}%;--c:${C[Math.floor(Math.random() * C.length)]};--x:${rnd(-14, 14).toFixed(1)}vw;--r:${rnd(-540, 540).toFixed(0)}deg;--t:${rnd(1.8, 3.2).toFixed(2)}s;--d:${rnd(0, .6).toFixed(2)}s;--w:${rnd(.35, .7).toFixed(2)}rem"></i>`).join('');
  document.body.append(fx); setTimeout(() => fx.remove(), 4200);
}
// полоса прогресса: заполняется от прежнего значения к новому, с бегущим бликом и делениями
export function bar(n, total, from = n, size = '') {
  const pc = v => (Math.max(0, Math.min(total, v)) / total * 100).toFixed(2);
  return `<span class="xbar ${size}" style="--n:${total}" data-to="${pc(n)}" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${n}" aria-label="Найдено секретов: ${n} из ${total}"><i style="width:${pc(from)}%"></i><span class="tk"></span></span>`;
}
export function grow(root) {
  root.querySelectorAll('.xbar[data-to]').forEach(b => { const i = b.firstElementChild; requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = b.dataset.to + '%'; b.classList.add('go'); })); });
  root.querySelectorAll('[data-count]').forEach(el => { const to = +el.dataset.count, from = +(el.dataset.from || 0); if (reduce() || to === from) { el.textContent = to; return; }
    const t0 = performance.now(), D = 900; const step = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
}
// что гость уже видел в коллекции: новое подсвечивается, полоса растёт от прошлого значения
const SEEN = 'mhc-ach-seen';
export const seenCount = () => { try { return (JSON.parse(pref.get(SEEN) || '[]') || []).filter(id => got[id]).length; } catch { return 0; } };
const seenSet = () => { try { return new Set(JSON.parse(pref.get(SEEN) || '[]') || []); } catch { return new Set(); } };
export function markSeen() { try { pref.set(SEEN, JSON.stringify(ids())); } catch { } }
export function rarityStats() { return [1, 2, 3].map(r => { const all = LIST.filter(a => (a.r || 1) === r); return { r, name: ({ 1: 'Обычные', 2: 'Редкие', 3: 'Легендарные' })[r], got: all.filter(a => got[a.id]).length, total: all.length }; }); }
export const rarityChips = () => `<div class="rchips">${rarityStats().map(s => `<span class="rchip" data-r="${s.r}"><i></i>${s.name}<b class="num">${s.got}/${s.total}</b></span>`).join('')}</div>`;

// знак и подпись «что дальше»; новая ступень один раз красиво проявляется
export function emblemBlock(plain) {
  const e = emblem(ids(), true); let up = false; if (!plain) { let was = 0; try { was = +(pref.get('mhc-emb') || 0); } catch { } up = e.lv > was; if (e.lv !== was) pref.set('mhc-emb', String(e.lv)); }
  return `<div class="embrow${up ? ' up' : ''}">${e.svg}<span><b>${e.name}</b><small>${!e.next ? 'Высшая ступень коллекции' : e.next.left === null ? `Соберите все секреты: «${e.next.name}»` : `До «${e.next.name}»: ещё ${e.next.left}`}</small></span></div>`;
}
export function openCabinet() {
  const n = count(), was = seenCount(), seen = seenSet();
  let k = 0; const order = [...LIST].sort((a, b) => (!!got[b.id] - !!got[a.id]) || ((got[b.id] || 0) - (got[a.id] || 0)));
  modal(`<div class="cab"><div>${emblemBlock(true)}<span class="eyebrow">Секреты отеля</span><h3><span class="num" data-count="${n}" data-from="${was}">${was}</span> из ${LIST.length}${n > was ? ` <span class="newn">+${n - was}</span>` : ''}</h3>${bar(n, LIST.length, was)}${rarityChips()}<p class="note">Секреты спрятаны по всему сайту, у каждого своя редкость. Прогресс хранится в этом браузере, а после входа через Discord — и в аккаунте. Сезонные для «Платинового гостя» не нужны.</p></div>
    <div class="clist">${order.map(a => got[a.id] ? `<div class="ci on${seen.has(a.id) ? '' : ' fresh'}" data-r="${a.r || 1}" style="--i:${k++}"><span class="ai">${a.i}</span><span><b>${esc(a.t)}${seen.has(a.id) ? '' : ' <em class="newtag">Новое</em>'}</b><em class="rar">${RARITY[a.r || 1]}${a.season ? ' · сезонное' : ''}</em><small>${esc(a.d)}</small></span><time>${new Date(got[a.id]).toLocaleDateString('ru-RU')}</time></div>`
      : `<div class="ci" data-r="${a.r || 1}" style="--i:${k++}"><span class="ai">?</span><span><b>Скрытое достижение</b><em class="rar">${RARITY[a.r || 1]}${a.season ? ' · сезонное' : ''}</em><small>${esc(a.h)}</small></span></div>`).join('')}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn sm ghost" data-close="">Закрыть</button></div></div>`, { wide: true, onMount: box => { grow(box); markSeen(); listeners.forEach(f => f()); } });
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
