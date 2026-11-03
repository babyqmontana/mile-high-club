import { S, $, $$, esc, money, when, plural, I, bg, toast, fail, modal, confirmBox } from './ui.js';
import { api, upload, DEMO } from './api.js';
import { play } from './sound.js';
import { ROOM_STATUS, BOOKING_STATUS, ORDER_STATUS, TICKET_STATUS, CIGAR_SHAPES, venueState } from './core.js';

const SECTIONS = [
  ['', [['overview', 'Обзор', 'mod']]],
  ['Работа', [['bookings', 'Брони', 'mod'], ['board', 'Доска номеров', 'mod'], ['tickets', 'Обращения', 'mod'], ['orders', 'Заказы', 'mod']]],
  ['Контент', [['events', 'События', 'mod'], ['journal', 'Журнал', 'mod'], ['offers', 'Предложения', 'admin'], ['faq', 'Вопросы и ответы', 'admin'], ['media', 'Картинки', 'mod']]],
  ['Отель', [['structure', 'Этажи и номера', 'admin'], ['types', 'Типы и цены', 'admin'], ['venues', 'Площадки', 'admin'], ['menu', 'Меню Le Ciel', 'admin'], ['cigars', 'Сигары', 'admin'], ['team', 'Анкеты сотрудников', 'admin'], ['depts', 'Униформа отделов', 'admin']]],
  ['Система', [['discord', 'Discord', 'mod'], ['settings', 'Настройки', 'admin'], ['danger', 'Сброс данных', 'admin']]]
];
const BUILTIN_IMG = ['img/atrium-night.webp', 'img/atrium-day.webp', 'img/reception.webp', 'img/library.webp', ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `img/journal/p${n}.webp`)];
const CH_LABELS = { main: '#главная', announcements: '#анонсы', rooms: '#свободные-номера', journal: '#журнал', chat: '#общение', staffBookings: '#брони', staffOrders: '#заказы', staffTickets: '#обращения', staffGeneral: '#стафф-общий' };
const BCHIP = { new: 'p', confirmed: 'ok', checkedin: 'v', done: 'm', cancelled: 'bad' };
let A = null, root = null, sec = 'overview', ctx = {}, sel = {}, bFilter = 'active', bq = '', aTicket = null;
const isAdmin = () => S.me?.role === 'admin';
const can = r => r === 'mod' || isAdmin();

export async function mountAdmin(v, c) {
  ctx = c; root = v;
  const allowed = SECTIONS.flatMap(([, it]) => it).filter(([, , r]) => can(r)).map(x => x[0]);
  let h = null; try { h = sessionStorage.getItem('mhc-sec'); } catch { } // хранилище может быть заблокировано браузером
  if (h && allowed.includes(h)) sec = h;
  root.innerHTML = `<div class="admin"><aside class="aside" id="aside"></aside><div class="amain" id="amain"><div class="empty">Загружаем панель…</div></div></div>`;
  await load(); paintAside(); paint();
}
export function unmount() { root = null; }
async function load() { try { A = await api('GET', '/admin/all'); } catch (e) { fail(e); if (e.status === 401 || e.status === 403) ctx.openLogin?.(); } }
export async function refresh(cols) {
  if (!root || !document.body.contains(root)) return;
  await load(); paintAside();
  const m = $('#amain'); if (m && m.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { if (sec === 'tickets') paintChat(); return; }
  if (sec === 'tickets' && cols.every(c => c === 'tickets')) { paintTicketList(); paintChat(); return; }
  paint();
}
function badges() { if (!A) return {}; return { bookings: A.bookings.filter(b => b.status === 'new').length, tickets: A.tickets.filter(t => t.status === 'open' && t.mode === 'site' && t.lastFrom === 'guest').length, orders: A.orders.filter(o => ['new', 'cooking'].includes(o.status)).length }; }
function paintAside() {
  const b = badges(), u = S.me;
  $('#aside').innerHTML = `<div class="who">${u.avatar ? `<img class="avatar" src="${esc(u.avatar)}" alt="">` : `<span class="avatar">${esc(u.username[0])}</span>`}<div class="grow"><b style="font-size:.88rem">${esc(u.username)}</b><div class="note">${u.role === 'admin' ? 'Администратор' : 'Модератор'}${u.demo ? ' · демо' : ''}</div></div><button class="ibtn" id="aOut" aria-label="Выйти">${I.out}</button></div>` +
    SECTIONS.map(([g, items]) => { const vis = items.filter(([, , r]) => can(r)); return vis.length ? (g ? `<span class="grp">${g}</span>` : '') + vis.map(([k, n]) => `<button data-s="${k}" aria-pressed="${k === sec}" data-sfx="soft"><span>${n}</span>${b[k] ? `<span class="badge">${b[k]}</span>` : ''}</button>`).join('') : ''; }).join('');
  if (innerWidth <= 900) { const on = $('#aside [aria-pressed="true"]'), as = $('#aside'); if (on && as) as.scrollTo({ left: on.offsetLeft - as.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' }); }
  $$('#aside [data-s]').forEach(x => x.onclick = () => { sec = x.dataset.s; try { sessionStorage.setItem('mhc-sec', sec); } catch { } paintAside(); paint(); scrollTo({ top: 0 }); });
  $('#aOut').onclick = () => ctx.logout();
}
function head(title, actions = '', sub = '') { return `<div class="atop"><div class="stack" style="gap:.3rem"><h2>${title}</h2>${sub ? `<p class="note">${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`; }
function paint() {
  const m = $('#amain'); if (!m || !A) return;
  try { ({ overview, bookings, board, tickets, orders, events, journal, media, structure, types, venues, menu, cigars, depts, team, offers, faq, discord, settings, danger }[sec] || overview)(m); }
  catch (e) { console.error(e); m.innerHTML = `<div class="empty">Ошибка раздела: ${esc(e.message)}</div>`; }
}
const run = async (fn, ok) => { try { const r = await fn(); if (ok) { toast(ok); play('success'); } return r; } catch (e) { fail(e); return null; } };

/* ---------- обзор ---------- */
function overview(m) {
  const b = badges(), s = A.summary, dc = A.discord || {};
  m.innerHTML = head('Обзор', `<a class="btn ghost sm" href="#home">${I.arrow} На сайт</a>`) + `
    <div class="kpis"><div class="kpi"><b class="num">${s.free}<small class="mut" style="font-size:.9rem">/${s.total}</small></b><span>свободно номеров</span></div><div class="kpi"><b class="num">${b.bookings}</b><span>новых броней</span></div><div class="kpi"><b class="num">${b.tickets}</b><span>ждут ответа в чате</span></div><div class="kpi"><b class="num">${b.orders}</b><span>заказов в работе</span></div>
      <div class="kpi"><b style="font-size:1rem;color:${dc.connected ? 'var(--ok)' : 'var(--mut)'}">${dc.connected ? 'Бот онлайн' : DEMO || dc.demo ? 'Демо-режим' : 'Бот не подключён'}</b><span>${dc.connected ? esc(dc.guild) + ' · ' + dc.members + ' участников' : 'Discord'}</span></div></div>
    <div class="g2" style="margin-top:1.2rem;align-items:start">
      <div class="card pad stack"><h3 style="font-size:1rem">Свободно по типам</h3>${s.byType.map(t => `<div class="row" style="justify-content:space-between"><span>${esc(t.name)}</span><span class="num"><b>${t.free}</b> / ${t.total}</span></div><div class="timeline" style="height:6px"><i class="open" style="left:0;width:${t.total ? t.free / t.total * 100 : 0}%"></i></div>`).join('')}
        <div class="row"><button class="btn sm" data-go="bookings">Брони</button><button class="btn sm ghost" data-go="board">Доска номеров</button></div></div>
      <div class="card pad stack"><h3 style="font-size:1rem">Последние действия</h3><div class="list" style="max-height:380px;overflow:auto">${A.log.slice(0, 40).map(l => `<div class="row" style="justify-content:space-between;font-size:.86rem;border-bottom:1px solid var(--line);padding-bottom:.4rem"><span class="grow">${esc(l.text)}</span><span class="note num">${when(l.at)}</span></div>`).join('') || '<p class="note">Пока пусто.</p>'}</div></div></div>`;
  $$('#amain [data-go]').forEach(x => x.onclick = () => { sec = x.dataset.go; paintAside(); paint(); });
}

/* ---------- брони ---------- */
function bookings(m) {
  const list = A.bookings.filter(b => (bFilter === 'new' ? b.status === 'new' : bFilter === 'active' ? ['new', 'confirmed', 'checkedin'].includes(b.status) : true) && (!bq || [b.code, b.name, b.discord, b.room].join(' ').toLowerCase().includes(bq.toLowerCase())));
  m.innerHTML = head('Брони', `<div class="seg"><button data-f="new" aria-pressed="${bFilter === 'new'}">Новые</button><button data-f="active" aria-pressed="${bFilter === 'active'}">Активные</button><button data-f="all" aria-pressed="${bFilter === 'all'}">Все</button></div><input class="inp" id="bq" placeholder="Код, имя, Discord, номер" value="${esc(bq)}" style="width:220px">`) +
    (list.length ? `<div class="list">${list.map(b => { const free = A.rooms.filter(r => r.type === b.type && r.status === 'free');
      return `<div class="item"><div class="top"><span class="row"><b class="num">${esc(b.code)}</b><span>${esc(b.typeName)}${b.room ? ' · <b>номер ' + esc(b.room) + '</b>' : b.preferredRoom ? ` · просит ${esc(b.preferredRoom)}` : ''}</span></span><span class="chip ${BCHIP[b.status]}">${BOOKING_STATUS[b.status]}</span></div>
      <span class="note">${esc(b.name)} · Discord <b>${esc(b.discord)}</b>${b.phone ? ' · тел. ' + esc(b.phone) : ''} · заезд ${esc(b.date)}, ${b.nights} ноч., ${b.guests} гост. · ${money(b.total)} · ${when(b.createdAt)}${b.handledBy ? ' · ' + esc(b.handledBy) : ''}</span>${b.note ? `<span>${esc(b.note)}</span>` : ''}
      <div class="acts" data-id="${esc(b.id)}">${b.status === 'new' ? `<select aria-label="Номер"><option value="">Назначить номер…</option>${free.map(r => `<option ${r.id === b.preferredRoom ? 'selected' : ''}>${esc(r.id)}</option>`).join('')}</select><button class="btn sm" data-a="confirm">Подтвердить</button><button class="btn sm ghost" data-a="cancel">Отклонить</button>` : ''}${b.status === 'confirmed' ? '<button class="btn sm" data-a="checkin">Заселить</button><button class="btn sm ghost" data-a="cancel">Отменить</button>' : ''}${b.status === 'checkedin' ? '<button class="btn sm" data-a="checkout">Выселить</button>' : ''}</div></div>`; }).join('')}</div>` : '<div class="empty">Броней нет.</div>');
  $$('#amain [data-f]').forEach(x => x.onclick = () => { bFilter = x.dataset.f; paint(); });
  $('#bq').oninput = e => { bq = e.target.value; clearTimeout(bookings.t); bookings.t = setTimeout(() => { paint(); $('#bq').focus(); $('#bq').setSelectionRange(bq.length, bq.length); }, 250); };
  $$('#amain .acts').forEach(a => a.querySelectorAll('[data-a]').forEach(btn => btn.onclick = async () => {
    if (btn.dataset.a === 'cancel' && !await confirmBox('Отменить бронь?', 'Гость получит уведомление в Discord, номер освободится.', 'Отменить бронь', true)) return;
    run(() => api('POST', `/admin/bookings/${a.dataset.id}/action`, { act: btn.dataset.a, room: a.querySelector('select')?.value }), 'Готово');
  }));
}

/* ---------- доска номеров ---------- */
function board(m) {
  const T = Object.fromEntries(A.types.map(t => [t.id, t.name])); let ft = sel.boardType || '';
  const rooms = A.rooms.filter(r => !ft || r.type === ft);
  m.innerHTML = head('Доска номеров', `<select class="inp" id="bt" style="width:200px"><option value="">Все типы</option>${A.types.map(t => `<option value="${esc(t.id)}" ${t.id === ft ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`, 'Перетащите карточку в другую колонку или смените статус в списке. Бот в Discord сразу обновит свободные номера.') +
    `<div class="kanban">${Object.entries(ROOM_STATUS).map(([k, n]) => { const rs = rooms.filter(r => r.status === k); return `<div class="col" data-col="${k}"><h4><span>${n}</span><span class="num">${rs.length}</span></h4>${rs.map(r => `<div class="rc" draggable="true" data-id="${esc(r.id)}"><div class="row" style="justify-content:space-between"><b class="num">${esc(r.id)}</b><span class="note">${r.floor} эт.</span></div><span class="mut">${esc(T[r.type] || r.type)}</span>${r.guest ? `<span>${esc(r.guest)}${r.discord ? ' · ' + esc(r.discord) : ''}</span>` : ''}<select class="inp" style="min-height:32px;padding:.2rem .4rem;font-size:.78rem" data-id="${esc(r.id)}" aria-label="Статус ${esc(r.id)}">${Object.entries(ROOM_STATUS).map(([s, l]) => `<option value="${s}" ${s === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}</div>`; }).join('')}</div>`;
  $('#bt').onchange = e => { sel.boardType = e.target.value; paint(); };
  const set = (id, st) => run(() => api('POST', `/admin/rooms/${encodeURIComponent(id)}/status`, { status: st })).then(r => r && play('wood'));
  $$('.rc select').forEach(s => s.onchange = () => set(s.dataset.id, s.value));
  $$('.rc').forEach(c => { c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('drag'); }; c.ondragend = () => c.classList.remove('drag'); });
  $$('.col').forEach(c => { c.ondragover = e => { e.preventDefault(); c.classList.add('over'); }; c.ondragleave = () => c.classList.remove('over'); c.ondrop = e => { e.preventDefault(); c.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); const r = A.rooms.find(x => x.id === id); if (r && r.status !== c.dataset.col) set(id, c.dataset.col); }; });
}

/* ---------- обращения ---------- */
function tickets(m) {
  m.innerHTML = head('Обращения', '', 'Чаты с сайта отвечаются здесь. Тикеты в Discord ведутся в их каналах.') + `<div class="split"><div class="tlist" id="tl"></div><div id="tc"></div></div>`;
  paintTicketList(); paintChat();
}
function paintTicketList() {
  const el = $('#tl'); if (!el) return;
  el.innerHTML = A.tickets.length ? A.tickets.map(t => `<button data-id="${esc(t.id)}" aria-pressed="${t.id === aTicket}"><span class="row" style="justify-content:space-between"><b>${esc(t.discord)}</b><span class="chip ${t.status === 'open' ? 'ok' : t.status === 'checking' ? 'warn' : 'm'}">${TICKET_STATUS[t.status]}</span></span><span>${esc(t.topic)}</span><span class="note">${t.mode === 'discord' ? 'Тикет в Discord' : t.mode === 'site' ? 'Чат на сайте' : 'Не выбрал канал'} · ${when(t.lastAt)}${t.lastFrom === 'guest' && t.mode === 'site' && t.status === 'open' ? ' · <b style="color:var(--pink)">ждёт ответа</b>' : ''}</span></button>`).join('') : '<div class="empty">Обращений пока нет.</div>';
  $$('#tl button').forEach(b => b.onclick = () => { aTicket = b.dataset.id; paintTicketList(); paintChat(true); });
}
function paintChat(force) {
  const el = $('#tc'); if (!el) return; const t = A.tickets.find(x => x.id === aTicket);
  if (!t) { el.innerHTML = '<div class="empty">Выберите обращение слева.</div>'; return; }
  const draft = $('#acIn')?.value || '', focused = el.contains(document.activeElement);
  const msgs = t.mode === 'site' ? t.messages : [{ from: 'guest', text: t.text, at: t.createdAt }];
  el.innerHTML = `<div class="chat"><header><div><b>${esc(t.discord)} · ${esc(t.topic)}</b><div class="note">${esc(t.name || 'Без имени')} · ${t.mode === 'discord' ? (t.channel ? 'тикет-канал создан в Discord' : 'тикет в Discord') : 'чат на сайте'}</div></div>${t.status !== 'closed' ? `<button class="btn sm ghost" id="acClose">Закрыть</button>` : '<span class="chip m">Закрыто</span>'}</header>
    <div class="msgs" id="acMsgs">${msgs.map(x => `<div class="msg ${x.from === 'staff' ? 'me' : ''}">${esc(x.text)}<small>${x.from === 'staff' ? esc(x.by || 'Персонал') : 'Гость'} · ${when(x.at)}</small></div>`).join('')}</div>
    ${t.mode === 'site' && t.status !== 'closed' ? `<form class="compose" id="acF"><input id="acIn" placeholder="Ответ гостю" autocomplete="off" aria-label="Ответ гостю"><button class="btn sm" data-sfx="">Ответить</button></form>` : '<div class="compose note">Ответить можно только в чате на сайте.</div>'}</div>`;
  if ($('#acIn')) { $('#acIn').value = draft; if (focused || force) $('#acIn').focus(); }
  $('#acMsgs').scrollTop = 1e6;
  $('#acF') && ($('#acF').onsubmit = async e => { e.preventDefault(); const inp = $('#acIn'), text = inp.value.trim(); if (!text) return; inp.value = ''; const r = await run(() => api('POST', `/tickets/${t.id}/messages`, { text })); if (r) { play('soft'); await load(); paintTicketList(); paintChat(true); } else inp.value = text; });
  $('#acClose') && ($('#acClose').onclick = () => run(() => api('POST', `/admin/tickets/${t.id}/close`), 'Обращение закрыто'));
}

/* ---------- заказы ---------- */
function orders(m) {
  m.innerHTML = head('Заказы в номер') + (A.orders.length ? `<div class="list">${A.orders.map(o => `<div class="item"><div class="top"><b>Номер ${esc(o.room)} · ${money(o.total)}</b><span class="chip ${o.status === 'done' ? 'ok' : o.status === 'cancelled' ? 'bad' : o.status === 'new' ? 'p' : 'warn'}">${ORDER_STATUS[o.status]}</span></div><span>${o.items.map(i => esc(i.name) + ' × ' + i.qty).join(', ')}</span><span class="note">${esc(o.name || 'Без имени')}${o.discord ? ' · Discord ' + esc(o.discord) : ''} · ${when(o.createdAt)}</span><div class="acts">${Object.entries(ORDER_STATUS).map(([k, v]) => `<button class="btn sm ${k === o.status ? '' : 'ghost'}" data-o="${esc(o.id)}" data-s="${k}">${v}</button>`).join('')}</div></div>`).join('')}</div>` : '<div class="empty">Заказов пока нет.</div>');
  $$('#amain [data-o]').forEach(b => b.onclick = () => run(() => api('POST', `/admin/orders/${b.dataset.o}/status`, { status: b.dataset.s }), 'Статус обновлён'));
}

/* ---------- универсальный редактор ---------- */
function field(f, val) {
  const id = 'f_' + f.k, v = val ?? f.def ?? '';
  if (f.type === 'textarea') return `<label class="field" style="grid-column:1/-1"><span>${f.label}</span><textarea id="${id}">${esc(v)}</textarea></label>`;
  if (f.type === 'select') return `<label class="field"><span>${f.label}</span><select id="${id}">${f.options.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  if (f.type === 'check') return `<label class="check" style="grid-column:1/-1"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}>${f.label}</label>`;
  if (f.type === 'color') return `<label class="field"><span>${f.label}</span><input type="color" id="${id}" value="${esc(v || '#888888')}"></label>`;
  if (f.type === 'image') return `<div class="field" style="grid-column:1/-1"><span>${f.label}</span><div class="imgpick"><div id="${id}_pv" ${bg(v, '', '#F0177A', '#F7B50A', 'pv')}></div><input type="hidden" id="${id}" value="${esc(v)}"><button type="button" class="btn sm ghost" data-pick="${id}">Выбрать</button><button type="button" class="btn sm ghost" data-clear="${id}">Убрать</button></div></div>`;
  if (f.type === 'model') return `<div class="field" style="grid-column:1/-1"><span>${f.label}</span><div class="row"><input class="inp grow" id="${id}" value="${esc(v)}" placeholder="Модель не загружена — показан манекен"><label class="btn sm ghost">Загрузить .glb<input type="file" accept=".glb" hidden data-glb="${id}"></label></div></div>`;
  if (f.type === 'tags') return `<label class="field" style="grid-column:1/-1"><span>${f.label}</span><input id="${id}" value="${esc((v || []).join(', '))}" placeholder="через запятую"></label>`;
  return `<label class="field"><span>${f.label}</span><input id="${id}" type="${f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text'}" value="${esc(f.type === 'datetime' && v ? toLocal(v) : v)}" ${f.step ? `step="${f.step}"` : ''}></label>`;
}
const toLocal = t => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
function readFields(fields) { const o = {}; for (const f of fields) { const el = $('#f_' + f.k); if (!el) continue; o[f.k] = f.type === 'check' ? el.checked : f.type === 'number' ? Number(el.value) : f.type === 'tags' ? el.value.split(',').map(s => s.trim()).filter(Boolean) : f.type === 'datetime' ? (el.value ? new Date(el.value).getTime() : 0) : el.value; } return o; }
function wirePickers(scope = document) {
  $$('[data-pick]', scope).forEach(b => b.onclick = async () => { const url = await pickImage(); if (url === null) return; $('#' + b.dataset.pick).value = url; const pv = $('#' + b.dataset.pick + '_pv'); pv.className = 'pv cover'; pv.style.backgroundImage = `url('${url}')`; });
  $$('[data-clear]', scope).forEach(b => b.onclick = () => { $('#' + b.dataset.clear).value = ''; const pv = $('#' + b.dataset.clear + '_pv'); pv.className = 'pv ph'; pv.style.backgroundImage = ''; });
  $$('[data-glb]', scope).forEach(inp => inp.onchange = async () => { if (!inp.files[0]) return; if (DEMO) { toast('В демо-версии модели не загружаются. На сервере это работает.', 'err'); return; } const r = await run(() => upload([inp.files[0]]), 'Модель загружена'); if (r?.[0]) $('#' + inp.dataset.glb).value = r[0].url; });
}
function crud(m, { col, title, sub, items, fields, label, extra, after, newDefaults = {}, readOnly }) {
  const cur = sel[col] === 'new' ? { ...newDefaults } : items.find(x => x.id === sel[col]) || null;
  m.innerHTML = head(title, `<button class="btn sm" id="cNew">${I.plus} Добавить</button>`, sub) + `<div class="split"><div class="tlist">${items.map(x => `<button data-id="${esc(x.id)}" aria-pressed="${x.id === sel[col]}">${label(x)}</button>`).join('') || '<div class="empty">Пусто.</div>'}</div>
    <div>${cur ? `<form class="card pad stack" id="cForm"><div class="g2">${fields.map(f => field(f, cur[f.k])).join('')}</div>${extra ? extra(cur) : ''}<div class="row" style="justify-content:space-between"><div class="row"><button class="btn" type="submit" ${readOnly?.(cur) ? 'disabled' : ''}>Сохранить</button>${sel[col] !== 'new' ? `<button class="btn ghost" type="button" id="cDel">${I.trash} Удалить</button>` : ''}</div><span class="note">${readOnly?.(cur) || ''}</span></div></form>` : '<div class="empty">Выберите запись слева или добавьте новую.</div>'}</div></div>`;
  $$('#amain .tlist [data-id]').forEach(b => b.onclick = () => { sel[col] = b.dataset.id; paint(); });
  $('#cNew').onclick = () => { sel[col] = 'new'; paint(); };
  if (!cur) return; wirePickers($('#cForm')); after?.(cur);
  $('#cForm').onsubmit = async e => { e.preventDefault(); const body = { ...readFields(fields), ...(extra?.read?.() || {}) }; if (extra?.collect) Object.assign(body, extra.collect()); const r = await run(() => api('PUT', `/admin/${col}/${sel[col] === 'new' ? 'new' : encodeURIComponent(sel[col])}`, body), 'Сохранено'); if (r) { sel[col] = r.doc.id; await load(); paint(); ctx.reloadPublic?.(); } };
  $('#cDel') && ($('#cDel').onclick = async () => { if (!await confirmBox('Удалить?', `${label(cur).replace(/<[^>]+>/g, ' ')} будет удалено.`, 'Удалить', true)) return; const r = await run(() => api('DELETE', `/admin/${col}/${encodeURIComponent(sel[col])}`), 'Удалено'); if (r) { sel[col] = null; await load(); paint(); } });
}

/* ---------- контент ---------- */
function events(m) {
  const vOpts = [['', 'Определить по месту'], ...A.venues.map(v => [v.id, v.name])];
  crud(m, { col: 'events', title: 'События', sub: 'События из Discord подтягиваются сами (раз в 5 минут и сразу при изменении). Место события связывается с площадкой по ключевым словам.', items: A.events,
    label: e => `<b>${esc(e.name)}</b><span class="note">${when(e.start)} · ${e.source === 'discord' ? 'Discord' : 'вручную'}${e.status === 'cancelled' ? ' · отменено' : ''}</span>`,
    fields: [{ k: 'name', label: 'Название' }, { k: 'location', label: 'Место' }, { k: 'start', label: 'Начало', type: 'datetime' }, { k: 'end', label: 'Конец', type: 'datetime' }, { k: 'venueId', label: 'Площадка', type: 'select', options: vOpts }, { k: 'status', label: 'Статус', type: 'select', options: [['scheduled', 'Запланировано'], ['active', 'Идёт'], ['completed', 'Завершено'], ['cancelled', 'Отменено']] }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'image', label: 'Обложка', type: 'image' }],
    newDefaults: { start: Date.now() + 3600e3, end: Date.now() + 4 * 3600e3, status: 'scheduled' },
    readOnly: e => e.source === 'discord' ? 'Событие из Discord: правки перезапишутся при синхронизации, меняйте его в Discord. Площадку можно закрепить здесь.' : '' });
  $('.atop .row').insertAdjacentHTML('afterbegin', `<button class="btn sm ghost" id="evSync">${I.sync} Синхронизировать</button>`);
  $('#evSync').onclick = async () => { const r = await run(() => api('POST', '/admin/events/sync')); if (r) toast(r.connected ? `Синхронизировано событий: ${r.synced}` : 'Бот не подключён: события из Discord появятся после запуска бота'); };
  const f = $('#cForm'); if (f && A.events.find(e => e.id === sel.events)?.source === 'discord') { f.querySelector('button[type=submit]').disabled = false; }
}
function journal(m) {
  const items = A.issues, cur = sel.issue === 'new' ? { title: '', number: '', desc: '', publisher: 'Mile High Media', published: false, pages: [], date: Date.now() } : items.find(x => x.id === sel.issue);
  if (cur) sel.pages = sel.pagesFor === (sel.issue) ? sel.pages : structuredClone(cur.pages || []), sel.pagesFor = sel.issue;
  m.innerHTML = head('Журнал', `<button class="btn sm" id="iNew">${I.plus} Добавить выпуск</button>`, 'Страницы — картинки (как в журнале ONE). Загрузите сразу все страницы по порядку, потом поправьте порядок стрелками.') +
    `<div class="split"><div class="tlist">${items.map(x => `<button data-id="${esc(x.id)}" aria-pressed="${x.id === sel.issue}"><span class="row" style="flex-wrap:nowrap"><span style="width:38px;aspect-ratio:1/1.414;border-radius:3px;flex:none;background:center/cover url('${esc(x.cover || x.pages?.[0]?.image || '')}')"></span><span class="grow"><b>${esc(x.title || 'Без названия')}</b><br><span class="note">${esc(x.number || '')} · ${(x.pages || []).length} стр. · ${x.published ? 'опубликован' : 'черновик'}</span></span></span></button>`).join('') || '<div class="empty">Выпусков нет.</div>'}</div><div id="iEd">${cur ? '' : '<div class="empty">Выберите выпуск или добавьте новый.</div>'}</div></div>`;
  $$('#amain .tlist [data-id]').forEach(b => b.onclick = () => { sel.issue = b.dataset.id; paint(); });
  $('#iNew').onclick = () => { sel.issue = 'new'; sel.pagesFor = null; paint(); };
  if (!cur) return;
  const F = [{ k: 'title', label: 'Название' }, { k: 'number', label: 'Номер выпуска' }, { k: 'publisher', label: 'Издатель' }, { k: 'date', label: 'Дата', type: 'datetime' }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'cover', label: 'Обложка (если пусто — первая страница)', type: 'image' }, { k: 'published', label: 'Опубликован на сайте', type: 'check' }];
  $('#iEd').innerHTML = `<form class="card pad stack" id="iForm"><div class="g2">${F.map(f => field(f, cur[f.k])).join('')}</div>
    <div class="stack"><div class="row" style="justify-content:space-between"><span class="lbl">Страницы (${sel.pages.length})</span><div class="row"><label class="btn sm">${I.plus} Загрузить страницы<input type="file" accept="image/*" multiple hidden id="pUp"></label><button type="button" class="btn sm ghost" id="pLib">Из картинок</button><button type="button" class="btn sm ghost" id="pTxt">Текстовая страница</button></div></div>
      <div class="drop" id="pDrop">Перетащите сюда картинки страниц</div><div class="pages" id="pGrid"></div></div>
    <div class="row"><button class="btn" type="submit">Сохранить выпуск</button>${sel.issue !== 'new' ? `<a class="btn ghost" href="#issue-${esc(cur.id)}">Открыть на сайте</a><button type="button" class="btn ghost" id="iDel">${I.trash} Удалить</button>` : ''}</div></form>`;
  wirePickers($('#iForm'));
  const grid = () => { $('#pGrid').innerHTML = sel.pages.map((p, i) => `<div class="p" ${p.image ? `style="background-image:url('${esc(p.image)}')"` : `style="background:var(--card2);display:grid;place-items:center;padding:8px;font-size:.7rem;text-align:center"`}>${p.image ? '' : esc(p.title || p.text?.slice(0, 60) || 'Текст')}<span class="n">${i + 1}</span><div class="tools"><button type="button" data-u="${i}" aria-label="Раньше">‹</button><button type="button" data-d="${i}" aria-label="Позже">›</button>${p.kind !== 'image' ? `<button type="button" data-e="${i}" aria-label="Изменить">✎</button>` : ''}<button type="button" data-x="${i}" aria-label="Удалить">×</button></div></div>`).join('') || '<p class="note">Страниц пока нет.</p>';
    $$('#pGrid [data-u]').forEach(b => b.onclick = () => { const i = +b.dataset.u; if (i > 0) [sel.pages[i - 1], sel.pages[i]] = [sel.pages[i], sel.pages[i - 1]]; grid(); });
    $$('#pGrid [data-d]').forEach(b => b.onclick = () => { const i = +b.dataset.d; if (i < sel.pages.length - 1) [sel.pages[i + 1], sel.pages[i]] = [sel.pages[i], sel.pages[i + 1]]; grid(); });
    $$('#pGrid [data-x]').forEach(b => b.onclick = () => { sel.pages.splice(+b.dataset.x, 1); grid(); });
    $$('#pGrid [data-e]').forEach(b => b.onclick = async () => { const i = +b.dataset.e; const p = await textPage(sel.pages[i]); if (p) { sel.pages[i] = p; grid(); } });
    $('.lbl', $('#iForm')).textContent = `Страницы (${sel.pages.length})`; };
  grid();
  const addFiles = async files => { const r = await run(() => upload([...files].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true })))); if (r?.length) { r.forEach(f => sel.pages.push({ kind: 'image', image: f.url })); grid(); toast(`Добавлено страниц: ${r.length}`); } };
  $('#pUp').onchange = e => addFiles(e.target.files);
  const d = $('#pDrop'); d.ondragover = e => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over'); d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); addFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))); };
  $('#pLib').onclick = async () => { const u = await pickImage(); if (u) { sel.pages.push({ kind: 'image', image: u }); grid(); } };
  $('#pTxt').onclick = async () => { const p = await textPage({ kind: 'text' }); if (p) { sel.pages.push(p); grid(); } };
  $('#iForm').onsubmit = async e => { e.preventDefault(); const body = { ...readFields(F), pages: sel.pages }; const r = await run(() => api('PUT', `/admin/issues/${sel.issue === 'new' ? 'new' : encodeURIComponent(sel.issue)}`, body), 'Выпуск сохранён'); if (r) { sel.issue = r.doc.id; sel.pagesFor = null; await load(); paint(); ctx.reloadPublic?.(); } };
  $('#iDel') && ($('#iDel').onclick = async () => { if (!await confirmBox('Удалить выпуск?', `«${cur.title}» исчезнет с сайта.`, 'Удалить', true)) return; const r = await run(() => api('DELETE', `/admin/issues/${encodeURIComponent(sel.issue)}`), 'Удалено'); if (r) { sel.issue = null; await load(); paint(); } });
}
async function textPage(p) {
  let out = null;
  await modal(`<h3>Текстовая страница</h3><div class="stack"><label class="field"><span>Вид</span><select id="tpK"><option value="text" ${p.kind !== 'quote' ? 'selected' : ''}>Статья</option><option value="quote" ${p.kind === 'quote' ? 'selected' : ''}>Цитата</option></select></label><label class="field"><span>Рубрика</span><input id="tpC" value="${esc(p.cat || '')}"></label><label class="field"><span>Заголовок</span><input id="tpT" value="${esc(p.title || '')}"></label><label class="field"><span>Текст (абзацы через пустую строку)</span><textarea id="tpX" style="min-height:180px">${esc(p.text || '')}</textarea></label></div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Отмена</button><button class="btn" id="tpOk">Готово</button></div>`,
    { onMount: (box, close) => { $('#tpOk', box).onclick = () => { out = { kind: $('#tpK').value, cat: $('#tpC').value, title: $('#tpT').value, text: $('#tpX').value, image: p.image || '' }; close('ok'); }; } });
  return out;
}
export async function pickImage() {
  let chosen = null;
  const media = (A?.media || []).filter(x => !/\.glb$/i.test(x.url));
  await modal(`<div class="row" style="justify-content:space-between"><h3>Картинки</h3><label class="btn sm">${I.plus} Загрузить<input type="file" accept="image/*" multiple hidden id="miUp"></label></div>
    <span class="lbl">Загруженные</span><div class="mgrid" id="miGrid">${media.map(x => `<button type="button" data-u="${esc(x.url)}" style="background-image:url('${esc(x.url)}')" aria-label="Выбрать"></button>`).join('') || '<p class="note">Пока ничего не загружено.</p>'}</div>
    <span class="lbl">Встроенные</span><div class="mgrid">${BUILTIN_IMG.map(u => `<button type="button" data-u="${u}" style="background-image:url('${u}')" aria-label="Выбрать"></button>`).join('')}</div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Отмена</button></div>`,
    { wide: true, onMount: (box, close) => {
      box.addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (b) { chosen = b.dataset.u; close('ok'); } });
      $('#miUp', box).onchange = async e => { const r = await run(() => upload(e.target.files)); if (r?.length) { chosen = r[0].url; close('ok'); load(); } };
    } });
  return chosen;
}
function media(m) {
  const list = (A.media || []);
  m.innerHTML = head('Картинки', `<label class="btn sm">${I.plus} Загрузить<input type="file" accept="image/*" multiple hidden id="mUp"></label>`, 'Сюда загружаются обложки, фото номеров и страницы журнала. Заглушки на сайте меняются на эти картинки в нужных разделах.') +
    `<div class="drop" id="mDrop" style="margin-bottom:1rem">Перетащите картинки сюда</div><div class="mgrid">${list.map(x => `<div style="position:relative"><button type="button" style="background-image:url('${esc(x.url)}');width:100%" data-copy="${esc(x.url)}" aria-label="Скопировать ссылку"></button><button class="ibtn" style="position:absolute;top:6px;right:6px;background:var(--bg)" data-del="${esc(x.id)}" aria-label="Удалить">${I.trash}</button></div>`).join('') || '<p class="note">Пока пусто.</p>'}</div>`;
  const add = async files => { const r = await run(() => upload(files)); if (r?.length) { toast(`Загружено: ${r.length}`); await load(); paint(); } };
  $('#mUp').onchange = e => add(e.target.files);
  const d = $('#mDrop'); d.ondragover = e => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over'); d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); add(e.dataTransfer.files); };
  $$('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Ссылка скопирована'); } catch { toast(b.dataset.copy.slice(0, 80)); } });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!await confirmBox('Удалить картинку?', 'Там, где она стоит, появится заглушка.', 'Удалить', true)) return; if (await run(() => api('DELETE', `/admin/media/${b.dataset.del}`), 'Удалено')) { await load(); paint(); } });
}

/* ---------- отель ---------- */
function structure(m) {
  const floors = [...new Set(A.rooms.map(r => r.floor))].sort((a, b) => b - a), T = A.types;
  const tOpt = v => T.map(t => `<option value="${esc(t.id)}" ${t.id === v ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  m.innerHTML = head('Этажи и номера', '', `${A.rooms.length} ${plural(A.rooms.length, 'номер', 'номера', 'номеров')} на ${floors.length} ${plural(floors.length, 'этаже', 'этажах', 'этажах')}. Номер комнаты, этаж и тип можно поменять у каждого номера.`) +
    `<div class="g2" style="align-items:start;margin-bottom:1.2rem"><form class="card pad stack" id="flF"><h3 style="font-size:1rem">Добавить этаж</h3><div class="g3"><label class="field"><span>Этаж</span><input id="flN" type="number" value="${(floors[0] ?? 19) + 1}"></label><label class="field"><span>Номеров</span><input id="flC" type="number" min="1" max="40" value="6"></label><label class="field"><span>Первый номер</span><input id="flS" type="number" placeholder="авто"></label></div><label class="field"><span>Тип номеров</span><select id="flT">${tOpt(T[0]?.id)}</select></label><button class="btn">Добавить этаж</button></form>
      <form class="card pad stack" id="rmF"><h3 style="font-size:1rem">Добавить один номер</h3><div class="g3"><label class="field"><span>Номер</span><input id="rmN" placeholder="2109"></label><label class="field"><span>Этаж</span><input id="rmFl" type="number"></label></div><label class="field"><span>Тип</span><select id="rmT">${tOpt(T[0]?.id)}</select></label><button class="btn ghost">Добавить номер</button></form></div>
    <div class="stack">${floors.map(f => { const rs = A.rooms.filter(r => r.floor === f); return `<div class="card pad stack"><div class="row" style="justify-content:space-between"><h3 style="font-size:1.05rem">${f} этаж <span class="note">· ${rs.length} ${plural(rs.length, 'номер', 'номера', 'номеров')}</span></h3><button class="btn sm ghost" data-delf="${f}">${I.trash} Удалить этаж</button></div>
      <div class="scroll"><table class="tbl"><thead><tr><th>Номер</th><th>Этаж</th><th>Тип</th><th>Статус</th><th></th></tr></thead><tbody>${rs.map(r => `<tr data-id="${esc(r.id)}"><td><input value="${esc(r.id)}" data-k="id" style="width:90px"></td><td><input type="number" value="${r.floor}" data-k="floor" style="width:80px"></td><td><select data-k="type">${tOpt(r.type)}</select></td><td><span class="chip ${r.status === 'free' ? 'ok' : 'm'}">${ROOM_STATUS[r.status]}</span></td><td style="white-space:nowrap"><button class="btn sm" data-save>Сохранить</button> <button class="btn sm ghost icon" data-delr aria-label="Удалить номер">${I.trash}</button></td></tr>`).join('')}</tbody></table></div></div>`; }).join('')}</div>`;
  $('#flF').onsubmit = async e => { e.preventDefault(); const r = await run(() => api('POST', '/admin/floors', { floor: $('#flN').value, count: $('#flC').value, start: $('#flS').value || undefined, type: $('#flT').value })); if (r) { toast(`Добавлено номеров: ${r.made.length}`); play('success'); await load(); paint(); } };
  $('#rmF').onsubmit = async e => { e.preventDefault(); if (await run(() => api('POST', '/admin/rooms', { id: $('#rmN').value, floor: $('#rmFl').value, type: $('#rmT').value }), 'Номер добавлен')) { await load(); paint(); } };
  $$('#amain tr[data-id]').forEach(tr => {
    tr.querySelector('[data-save]').onclick = async () => { const body = Object.fromEntries([...tr.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value])); if (await run(() => api('PUT', `/admin/rooms/${encodeURIComponent(tr.dataset.id)}`, body), 'Номер сохранён')) { await load(); paint(); } };
    tr.querySelector('[data-delr]').onclick = async () => { if (!await confirmBox(`Удалить номер ${tr.dataset.id}?`, 'Номер исчезнет с сайта и с доски.', 'Удалить', true)) return; if (await run(() => api('DELETE', `/admin/rooms/${encodeURIComponent(tr.dataset.id)}`), 'Удалено')) { await load(); paint(); } };
  });
  $$('[data-delf]').forEach(b => b.onclick = async () => { if (!await confirmBox(`Удалить ${b.dataset.delf} этаж?`, 'Все номера этажа будут удалены.', 'Удалить этаж', true)) return; if (await run(() => api('DELETE', `/admin/floors/${b.dataset.delf}`), 'Этаж удалён')) { await load(); paint(); } });
}
function types(m) {
  crud(m, { col: 'types', title: 'Типы номеров и цены', items: A.types, label: t => `<b>${esc(t.name)}</b><span class="note">${money(t.price)} · ${A.rooms.filter(r => r.type === t.id).length} номеров</span>`,
    fields: [{ k: 'name', label: 'Название' }, { k: 'price', label: 'Цена за ночь, $', type: 'number' }, { k: 'capacity', label: 'Гостей', type: 'number' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'features', label: 'Особенности', type: 'tags' }, { k: 'image', label: 'Фото', type: 'image' }], newDefaults: { price: 3000, capacity: 2, order: A.types.length } });
}
function venues(m) {
  const cur = sel.venues === 'new' ? { schedule: [] } : A.venues.find(v => v.id === sel.venues);
  if (cur) sel.sched = sel.schedFor === sel.venues ? sel.sched : structuredClone(cur.schedule || []), sel.schedFor = sel.venues;
  crud(m, { col: 'venues', title: 'Площадки и расписание', sub: 'Статусы «Live», «Открыто», «Тихо», «Закрыто» на главной считаются по этому расписанию. События из Discord с ключевыми словами площадки перекрывают расписание.', items: A.venues,
    label: v => { const st = venueState(v, A.events); return `<b>${esc(v.name)}</b><span class="note">${esc(st.label)}</span>`; },
    fields: [{ k: 'name', label: 'Название' }, { k: 'kind', label: 'Тип', type: 'select', options: [['pool', 'Бассейн'], ['bar', 'Бар'], ['restaurant', 'Ресторан'], ['club', 'Клуб'], ['spa', 'Спа']] }, { k: 'floor', label: 'Этаж / место' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'accent', label: 'Цвет', type: 'color' }, { k: 'keywords', label: 'Ключевые слова для событий Discord' }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'image', label: 'Фото (у бассейнов без фото — анимация воды)', type: 'image' }, { k: 'comingSoon', label: 'Скоро открытие (скрыть расписание)', type: 'check' }],
    extra: () => `<div class="stack"><div class="row" style="justify-content:space-between"><span class="lbl">Расписание</span><button type="button" class="btn sm ghost" id="scAdd">${I.plus} Интервал</button></div><div id="scRows" class="stack" style="gap:.5rem"></div></div>`,
    after: () => { const rows = () => { $('#scRows').innerHTML = sel.sched.map((s, i) => `<div class="row" data-i="${i}" style="flex-wrap:nowrap"><input class="inp" type="time" value="${esc(s.from)}" data-k="from" style="width:110px"><span>–</span><input class="inp" type="time" value="${esc(s.to)}" data-k="to" style="width:110px"><select class="inp" data-k="state" style="width:130px">${[['live', 'Live'], ['open', 'Открыто'], ['calm', 'Тихо'], ['closed', 'Закрыто']].map(([k, l]) => `<option value="${k}" ${k === s.state ? 'selected' : ''}>${l}</option>`).join('')}</select><input class="inp grow" value="${esc(s.label)}" data-k="label" placeholder="Что происходит"><button type="button" class="ibtn" data-x="${i}" aria-label="Удалить">${I.x}</button></div>`).join('') || '<p class="note">Интервалов нет — площадка считается закрытой.</p>';
      $$('#scRows [data-k]').forEach(inp => inp.oninput = () => { sel.sched[+inp.closest('[data-i]').dataset.i][inp.dataset.k] = inp.value; }); $$('#scRows [data-x]').forEach(b => b.onclick = () => { sel.sched.splice(+b.dataset.x, 1); rows(); }); };
      rows(); $('#scAdd').onclick = () => { sel.sched.push({ from: '10:00', to: '18:00', state: 'open', label: '' }); rows(); }; },
    newDefaults: { kind: 'pool', accent: '#F7B50A', order: A.venues.length, schedule: [] } });
  // расписание уходит вместе с формой
  const f = $('#cForm'); if (f) { const orig = f.onsubmit; f.onsubmit = async e => { e.preventDefault(); const body = { ...readFields([{ k: 'name' }, { k: 'kind' }, { k: 'floor' }, { k: 'order', type: 'number' }, { k: 'accent' }, { k: 'keywords' }, { k: 'desc' }, { k: 'image' }, { k: 'comingSoon', type: 'check' }]), schedule: sel.sched }; const r = await run(() => api('PUT', `/admin/venues/${sel.venues === 'new' ? 'new' : encodeURIComponent(sel.venues)}`, body), 'Сохранено'); if (r) { sel.venues = r.doc.id; sel.schedFor = null; await load(); paint(); } }; }
}
function menu(m) {
  const cats = [...new Set(A.menu.map(i => i.cat))];
  crud(m, { col: 'menu', title: 'Меню Le Ciel', items: A.menu, label: i => `<b>${esc(i.name)}</b><span class="note">${esc(i.cat)} · ${money(i.price)}</span>`,
    fields: [{ k: 'name', label: 'Блюдо' }, { k: 'cat', label: 'Раздел' }, { k: 'price', label: 'Цена, $', type: 'number' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'desc', label: 'Описание', type: 'textarea' }], newDefaults: { cat: cats[0] || 'Основные', price: 100, order: A.menu.length },
    after: () => { $('#f_cat').setAttribute('list', 'catList'); $('#f_cat').insertAdjacentHTML('afterend', `<datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`); } });
}
let prevR = null;
function cigars(m) {
  crud(m, { col: 'cigars', title: 'Сигары в хьюмидоре', sub: 'Каждая сигара строится в 3D из формата, размера и цветов. Предпросмотр справа обновляется сразу.', items: A.cigars, label: c => `<span class="row" style="flex-wrap:nowrap"><i style="width:10px;height:10px;border-radius:50%;background:${esc(c.band)}"></i><b>${esc(c.name)}</b></span><span class="note">${esc(CIGAR_SHAPES[c.shape])} · ${money(c.price)}</span>`,
    fields: [{ k: 'name', label: 'Название' }, { k: 'origin', label: 'Страна' }, { k: 'shape', label: 'Формат', type: 'select', options: Object.entries(CIGAR_SHAPES) }, { k: 'price', label: 'Цена, $', type: 'number' }, { k: 'length', label: 'Длина, мм', type: 'number' }, { k: 'ring', label: 'Ринг (диаметр в 1/64")', type: 'number' }, { k: 'strength', label: 'Крепость 1–5', type: 'number' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'wrapper', label: 'Цвет покровного листа', type: 'color' }, { k: 'band', label: 'Цвет кольца', type: 'color' }, { k: 'band2', label: 'Второй цвет кольца', type: 'color' }, { k: 'bandStyle', label: 'Дизайн кольца', type: 'select', options: [['classic', 'Классика'], ['medallion', 'Медальон'], ['double', 'Двойное кольцо'], ['foot', 'Кольцо у ножки'], ['stripe', 'Полоса с печатью']] }, { k: 'bandText', label: 'Надпись на кольце' }, { k: 'bandText2', label: 'Надпись на втором кольце' }, { k: 'notes', label: 'Ноты вкуса', type: 'tags' }, { k: 'desc', label: 'Описание', type: 'textarea' }],
    newDefaults: { shape: 'robusto', length: 130, ring: 50, wrapper: '#7a4a28', band: '#c9a24a', band2: '#1a1a1a', bandStyle: 'classic', strength: 3, price: 120, order: A.cigars.length },
    extra: () => `<div class="hum" id="cPrev" style="height:220px"></div>`,
    after: () => { import('./humidor3d.js').then(mod => preview(mod)); } });
}
async function preview(mod) {
  const host = $('#cPrev'); if (!host) return; const THREE = await import('three');
  prevR?.dispose?.(); const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.outputColorSpace = THREE.SRGBColorSpace; host.append(r.domElement);
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 0.6, 5); cam.lookAt(0, 0, 0);
  sc.add(new THREE.HemisphereLight(0xffe6c4, 0x2a160a, 1.6)); const k = new THREE.DirectionalLight(0xffe2b8, 2.4); k.position.set(2, 4, 3); sc.add(k);
  let obj = null, mats = [], raf = 0;
  const build = () => { if (obj) { sc.remove(obj); mats.forEach(x => x.dispose?.()); mats = []; } const c = { id: sel.cigars, ...readFields([{ k: 'name' }, { k: 'shape' }, { k: 'length', type: 'number' }, { k: 'ring', type: 'number' }, { k: 'wrapper' }, { k: 'band' }, { k: 'band2' }, { k: 'bandStyle' }, { k: 'bandText' }, { k: 'bandText2' }]) }; obj = mod.buildCigar(c, mats); obj.rotation.y = Math.PI / 2; sc.add(obj); };
  const size = () => { const w = host.clientWidth, h = host.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  build(); size(); ['shape', 'length', 'ring', 'wrapper', 'band', 'band2', 'bandStyle', 'bandText', 'bandText2'].forEach(k => $('#f_' + k)?.addEventListener('input', build));
  const loop = t => { if (!document.body.contains(host)) { r.dispose(); return; } if (obj) { obj.rotation.x = Math.sin(t / 1400) * 0.3; obj.children[0].rotation.y = t / 1600; } r.render(sc, cam); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop); prevR = r;
}
function depts(m) {
  const cur = sel.depts === 'new' ? {} : A.depts.find(d => d.id === sel.depts);
  if (cur) { if (sel.itemsFor !== sel.depts) { sel.items = structuredClone(cur.items || []); sel.itemsFor = sel.depts; } }
  const KINDS = { jacket: 'Пиджак', shirt: 'Рубашка/поло', pants: 'Брюки/шорты', tie: 'Галстук', apron: 'Фартук', vest: 'Жилет', hat: 'Головной убор', shoes: 'Обувь' };
  const F = [{ k: 'name', label: 'Отдел' }, { k: 'gender', label: 'Манекен по умолчанию', type: 'select', options: [['male', 'Мужской'], ['female', 'Женский']] }, { k: 'color', label: 'Основной цвет формы', type: 'color' }, { k: 'accent', label: 'Акцент', type: 'color' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'desc', label: 'Описание формы', type: 'textarea' }, ...(isAdmin() ? [{ k: 'model', label: 'Модель формы для 3D-манекена (.glb)', type: 'model' }] : [])];
  crud(m, { col: 'depts', title: 'Отделы и униформа', sub: 'Вещи аутфита крутятся на сайте на 360°. Загрузите для вещи серию фото по кругу (24–36 кадров по порядку) — карточка будет листать их. Пока фото нет, показана заглушка в цветах отдела.', items: A.depts, label: d => `<span class="row" style="flex-wrap:nowrap"><i style="width:12px;height:12px;border-radius:50%;background:${esc(d.color)};box-shadow:inset 0 0 0 3px ${esc(d.accent)}"></i><b>${esc(d.name)}</b></span>`,
    fields: F, newDefaults: { color: '#222222', accent: '#C9A24A', gender: 'male', order: A.depts.length },
    extra: () => `<div class="stack"><div class="row" style="justify-content:space-between"><span class="lbl">Вещи аутфита</span><button type="button" class="btn sm ghost" id="itAdd">${I.plus} Вещь</button></div><div id="itRows" class="stack" style="gap:.5rem"></div></div>`,
    after: () => {
      const rows = () => { $('#itRows').innerHTML = sel.items.map((it, i) => `<div class="row" data-i="${i}" style="flex-wrap:wrap"><input class="inp" data-k="name" value="${esc(it.name)}" placeholder="Название" style="width:150px"><select class="inp" data-k="kind" style="width:150px">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${k === it.kind ? 'selected' : ''}>${l}</option>`).join('')}</select><input type="color" class="inp" data-k="color" value="${esc(it.color || '#222222')}" style="width:56px;padding:4px"><span class="note">${(it.frames || []).length} фото</span><label class="btn sm ghost">Фото 360°<input type="file" accept="image/*" multiple hidden data-up="${i}"></label>${(it.frames || []).length ? `<button type="button" class="btn sm ghost" data-clr="${i}">Убрать фото</button>` : ''}<button type="button" class="ibtn" data-x="${i}" aria-label="Удалить">${I.x}</button></div>`).join('') || '<p class="note">Вещей нет — на сайте показан стандартный набор для отдела.</p>';
        $$('#itRows [data-k]').forEach(inp => inp.oninput = () => { sel.items[+inp.closest('[data-i]').dataset.i][inp.dataset.k] = inp.value; });
        $$('#itRows [data-x]').forEach(b => b.onclick = () => { sel.items.splice(+b.dataset.x, 1); rows(); });
        $$('#itRows [data-clr]').forEach(b => b.onclick = () => { sel.items[+b.dataset.clr].frames = []; rows(); });
        $$('#itRows [data-up]').forEach(inp => inp.onchange = async () => { const files = [...inp.files].sort((x, y) => x.name.localeCompare(y.name, 'ru', { numeric: true })); const r = await run(() => upload(files)); if (r?.length) { sel.items[+inp.dataset.up].frames = r.map(f => f.url); toast(`Кадров: ${r.length}`); rows(); } }); };
      rows(); $('#itAdd').onclick = () => { sel.items.push({ name: 'Пиджак', kind: 'jacket', color: $('#f_color')?.value || '#222222', frames: [] }); rows(); };
    } });
  const f = $('#cForm'); if (f) f.onsubmit = async e => { e.preventDefault(); const body = { ...readFields(F), items: sel.items }; const r = await run(() => api('PUT', `/admin/depts/${sel.depts === 'new' ? 'new' : encodeURIComponent(sel.depts)}`, body), 'Сохранено'); if (r) { sel.depts = r.doc.id; sel.itemsFor = null; await load(); paint(); ctx.reloadPublic?.(); } };
}

function team(m) {
  const dOpts = [['', 'Без отдела'], ...A.depts.map(d => [d.id, d.name])];
  crud(m, { col: 'team', title: 'Анкеты сотрудников', sub: 'Карточки на странице «Персонал». Фото лучше вертикальное (3:4). Отметка «Пример» показывает на сайте плашку, что это заглушка — снимите её, когда заполните настоящие данные.', items: A.team,
    label: t => `<span class="row" style="flex-wrap:nowrap"><span style="width:28px;height:28px;border-radius:50%;flex:none;background:var(--card2) center/cover ${t.photo ? `url('${esc(t.photo)}')` : ''}"></span><span><b>${esc(t.name || 'Без имени')}</b><br><span class="note">${esc(t.position || '')}${t.hidden ? ' · скрыт' : ''}${t.example ? ' · пример' : ''}</span></span></span>`,
    fields: [{ k: 'name', label: 'Имя (как в игре)' }, { k: 'position', label: 'Должность' }, { k: 'dept', label: 'Отдел', type: 'select', options: dOpts }, { k: 'since', label: 'В отеле с' }, { k: 'discord', label: 'Discord' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'quote', label: 'Цитата (необязательно)' }, { k: 'bio', label: 'О сотруднике', type: 'textarea' }, { k: 'photo', label: 'Фото', type: 'image' }, { k: 'example', label: 'Пример (заглушка)', type: 'check' }, { k: 'hidden', label: 'Скрыть с сайта', type: 'check' }],
    newDefaults: { order: A.team.length } });
}
function offers(m) {
  crud(m, { col: 'offers', title: 'Специальные предложения', sub: 'Пакеты и акции на главной. Неактивные не показываются.', items: A.offers,
    label: o => `<b>${esc(o.title || 'Без названия')}</b><span class="note">${esc(o.tag || '')}${o.price ? ' · ' + esc(o.price) : ''}${o.active === false ? ' · выключено' : ''}</span>`,
    fields: [{ k: 'title', label: 'Название' }, { k: 'tag', label: 'Метка (Пакет, Ресторан…)' }, { k: 'price', label: 'Цена (текстом, например «от $2 400»)' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'cta', label: 'Текст кнопки' }, { k: 'link', label: 'Куда ведёт (#stay, #dining, #cigars, #contact)' }, { k: 'desc', label: 'Описание', type: 'textarea' }, { k: 'image', label: 'Картинка', type: 'image' }, { k: 'active', label: 'Показывать на сайте', type: 'check' }],
    newDefaults: { active: true, cta: 'Забронировать', link: '#stay', order: A.offers.length } });
}
function faq(m) {
  crud(m, { col: 'faq', title: 'Вопросы и ответы', sub: 'Блок «Частые вопросы» на странице заявки.', items: A.faq,
    label: q => `<b>${esc(q.q || 'Вопрос')}</b>`,
    fields: [{ k: 'q', label: 'Вопрос' }, { k: 'order', label: 'Порядок', type: 'number' }, { k: 'a', label: 'Ответ', type: 'textarea' }],
    newDefaults: { order: A.faq.length } });
}

/* ---------- система ---------- */
function discord(m) {
  const dc = A.discord || {}, s = A.settingsFull || {}, ch = s.channels || {};
  m.innerHTML = head('Discord', '', 'Сайт и сервер связаны ботом: события, свободные номера, уведомления о бронях и заказах, тикеты, проверка ролей при входе.') + `
    <div class="g2" style="align-items:start">
      <div class="card pad stack"><h3 style="font-size:1rem">Состояние</h3><div class="row"><span class="chip ${dc.connected ? 'ok' : 'm'}"><span class="d"></span>${dc.connected ? 'Бот онлайн' : 'Бот не подключён'}</span>${dc.connected ? `<span class="note">${esc(dc.bot || '')} · ${esc(dc.guild || '')}</span>` : ''}</div>
        ${dc.connected ? '' : `<p class="note">${DEMO || dc.demo ? 'Это демо-версия: бот работает только на вашем сервере.' : 'Укажите DISCORD_BOT_TOKEN и GUILD_ID в файле .env на сервере и перезапустите сайт.'}</p>`}
        ${isAdmin() ? `<div class="stack" style="gap:.4rem"><button class="btn" id="dSetup" ${dc.connected ? '' : 'disabled'}>Развернуть структуру сервера</button><p class="note">Бот создаст роли «MHC Администратор», «MHC Модератор», «MHC Персонал», категории и каналы: главная, анонсы, свободные-номера, журнал, общение, а также закрытые стафф-каналы и категорию тикетов. Уже существующие не трогает.</p></div>` : ''}
        ${Object.keys(ch).length ? `<div class="stack" style="gap:.3rem"><span class="lbl">Каналы</span>${Object.entries(CH_LABELS).filter(([k]) => ch[k]).map(([k, l]) => `<div class="row" style="justify-content:space-between;font-size:.86rem"><span>${l}</span><span class="note num">${esc(ch[k])}</span></div>`).join('')}</div>` : ''}</div>
      <form class="card pad stack" id="dPost"><h3 style="font-size:1rem">Пост в Discord</h3><label class="field"><span>Канал</span><select id="dCh">${Object.entries(CH_LABELS).map(([k, l]) => `<option value="${k}" ${k === 'announcements' ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Текст</span><textarea id="dText" placeholder="Сегодня в Night Pool резидент The Hot Times с 22:00"></textarea></label><button class="btn" ${dc.connected ? '' : 'disabled'}>Опубликовать</button>${dc.connected ? '' : '<p class="note">Публикация заработает, когда бот будет подключён.</p>'}</form></div>`;
  $('#dSetup') && ($('#dSetup').onclick = async () => { if (!await confirmBox('Развернуть структуру?', 'Бот создаст недостающие роли, категории и каналы на сервере.', 'Развернуть')) return; const r = await run(() => api('POST', '/admin/discord/setup')); if (r) { toast(r.made.length ? `Создано: ${r.made.join(', ')}` : 'Всё уже на месте'); play('success'); await load(); paint(); } });
  $('#dPost').onsubmit = async e => { e.preventDefault(); const r = await run(() => api('POST', '/admin/discord/post', { channel: $('#dCh').value, text: $('#dText').value })); if (r) { toast(r.ok ? 'Опубликовано' : 'Бот не смог отправить пост', r.ok ? '' : 'err'); if (r.ok) $('#dText').value = ''; } };
}
function settings(m) {
  const s = A.settingsFull || {};
  const F = [{ k: 'weather', label: 'Погода над отелем', type: 'select', options: [['auto', 'Авто (смена каждые 3 ч)'], ['clear', 'Ясно'], ['rain', 'Дождь'], ['fog', 'Туман'], ['snow', 'Снег']] }, { k: 'theme', label: 'Тема сайта', type: 'select', options: [['none', 'Обычная'], ['newyear', 'Новогодняя']] }, { k: 'dayStart', label: 'День с (час, МСК)', type: 'number' }, { k: 'nightStart', label: 'Ночь с (час, МСК)', type: 'number' }, { k: 'hotelName', label: 'Название отеля' }, { k: 'tagline', label: 'Слоган на главной' }, { k: 'discordInvite', label: 'Ссылка на Discord-сервер' }, { k: 'address', label: 'Адрес' }, { k: 'footer', label: 'Подвал сайта' }, { k: 'heroDay', label: 'Главная картинка днём', type: 'image' }, { k: 'heroNight', label: 'Главная картинка ночью', type: 'image' }];
  m.innerHTML = head('Настройки') + `<form class="card pad stack" id="sF"><div class="g2">${F.map(f => field(f, s[f.k])).join('')}</div>
    <div class="g2"><label class="field"><span>Роль администратора в Discord (часть названия)</span><input id="rA" value="${esc(s.roles?.admin || '')}"></label><label class="field"><span>Роль модератора в Discord (часть названия)</span><input id="rM" value="${esc(s.roles?.mod || '')}"></label></div>
    <p class="note">Полный доступ получают участники с правом «Администратор» на сервере или с ролью, в названии которой есть указанный текст. Модераторы видят брони, доску, обращения, заказы, события и журнал.</p><div><button class="btn">Сохранить</button></div></form>`;
  wirePickers($('#sF'));
  $('#sF').onsubmit = async e => { e.preventDefault(); const body = { ...readFields(F), roles: { admin: $('#rA').value, mod: $('#rM').value } }; if (await run(() => api('PUT', '/admin/settings/main', body), 'Настройки сохранены')) { await load(); ctx.reloadPublic?.(); } };
}
function danger(m) {
  m.innerHTML = head('Сброс данных', '', 'Используйте, чтобы начать с чистого листа: например, после тестов.') + `<div class="danger"><h3 style="font-size:1.05rem;color:var(--bad)">Сбросить статистику</h3>
    <div class="stack" style="gap:.5rem">${[['rooms', 'Статусы всех номеров → «Свободен»'], ['bookings', 'Все брони'], ['orders', 'Все заказы в номер'], ['tickets', 'Все обращения и чаты'], ['log', 'Журнал действий']].map(([k, l]) => `<label class="check"><input type="checkbox" value="${k}" checked>${l}</label>`).join('')}</div>
    <label class="field"><span>Для подтверждения введите СБРОСИТЬ</span><input id="rsIn" autocomplete="off" placeholder="СБРОСИТЬ"></label><div><button class="btn danger" id="rsBtn" disabled>Сбросить выбранное</button></div><p class="note">Номера, типы, цены, меню, сигары, журнал и настройки не удаляются.</p></div>`;
  $('#rsIn').oninput = e => $('#rsBtn').disabled = e.target.value.trim() !== 'СБРОСИТЬ';
  $('#rsBtn').onclick = async () => {
    const scope = $$('.danger input[type=checkbox]:checked').map(i => i.value); if (!scope.length) { toast('Отметьте, что сбросить', 'err'); return; }
    if (!await confirmBox('Точно сбросить?', 'Это действие нельзя отменить. Выбранные данные будут удалены для всех.', 'Да, сбросить', true)) return;
    const r = await run(() => api('POST', '/admin/reset', { confirm: 'СБРОСИТЬ', scope }), 'Сброшено'); if (r) { await load(); paint(); }
  };
}
