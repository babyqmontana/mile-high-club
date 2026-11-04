// Живые карточки сервера: чистые функции из данных сайта в эмбеды Discord.
// Тексты отеля написаны от лица отеля (IC), правила сервера — отдельно (OOC).
import { venueState } from '../../public/js/core.js';
import { SUBSCRIPTIONS } from './layout.js';

export const WINE = 0x7A1E26, CREAM = 0xF6E8D2, GOLD = 0xF7B50A, PINK = 0xF0177A, TEAL = 0x3FD3C6;
const STATE = { live: '🔴 Сейчас идёт', event: '🎉 Событие', open: '🟢 Открыто', calm: '🟡 Тихий режим', closed: '⚫ Закрыто', soon: '⏳ Скоро' };
const LIMIT = { desc: 4000, field: 1000, fields: 25, embeds: 10 };
export const money = n => '$' + Number(n || 0).toLocaleString('en-US');
const color = s => (s ? parseInt(String(s).replace('#', ''), 16) : WINE);
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const when = ms => `<t:${Math.floor(ms / 1000)}:f>`;
const fromNow = ms => `<t:${Math.floor(ms / 1000)}:R>`;
const link = (site, label, hash = '') => (site ? { type: 2, style: 5, label, url: `${site}/${hash ? '#' + hash : ''}` } : null);
const row = (...buttons) => { const components = buttons.filter(Boolean); return components.length ? [{ type: 1, components }] : []; };
const btn = (custom_id, label, style = 2, emoji) => ({ type: 2, style, label, custom_id, ...(emoji ? { emoji: { name: emoji } } : {}) });

export function roomsBoard(d, site) {
  const free = id => d.rooms.filter(r => r.type === id && r.status === 'free').length;
  const total = id => d.rooms.filter(r => r.type === id).length;
  const all = d.rooms.filter(r => r.status === 'free').length;
  return {
    embeds: [{
      title: `Свободно ${all} из ${d.rooms.length}`, color: all ? TEAL : PINK, description: 'Заезд с 14:00, выезд до 12:00.',
      fields: d.types.map(t => ({ name: `${t.name} · ${money(t.price)} за ночь`, value: cut(`**${free(t.id)} из ${total(t.id)}** свободно\n${t.desc}`, LIMIT.field) })),
      footer: { text: 'Обновляется автоматически' }
    }],
    components: row(link(site, 'Забронировать на сайте', 'stay'))
  };
}

export function venuesBoard(d, site, now = Date.now()) {
  return {
    embeds: d.venues.slice(0, LIMIT.embeds).map(v => {
      const st = venueState(v, d.events, now), sch = (v.schedule || []).filter(s => s.state !== 'closed');
      return { title: v.name, color: color(v.accent), description: cut(`**${STATE[st.state] || STATE.open}**${st.label ? ' · ' + st.label : ''}\n${v.desc || ''}`, LIMIT.desc), fields: [{ name: 'Где', value: v.floor || '—', inline: true }, ...(sch.length ? [{ name: 'Расписание', value: cut(sch.map(s => `${s.from}–${s.to} ${s.label}`).join('\n'), LIMIT.field), inline: true }] : [])] };
    }),
    components: row(link(site, 'Подробнее на сайте', 'leisure'))
  };
}

export function menuBoard(d, site) {
  const cats = [...new Set(d.menu.map(m => m.cat))];
  return {
    embeds: [{
      title: 'Le Ciel', color: GOLD, description: 'Французская кухня на 30 этаже и доставка в номер.',
      fields: cats.slice(0, LIMIT.fields).map(c => ({ name: c, value: cut(d.menu.filter(m => m.cat === c).map(m => `**${m.name}** · ${money(m.price)}\n${m.desc}`).join('\n'), LIMIT.field) }))
    }],
    components: row(link(site, 'Заказать в номер', 'dining'))
  };
}

export function cigarsBoard(d, site) {
  return {
    embeds: [{
      title: 'Хьюмидор', color: 0xC9A24A, description: 'Двенадцать кресел, кожаная стена и правило про телефоны.',
      fields: d.cigars.slice(0, LIMIT.fields).map(c => ({ name: `${c.name} · ${money(c.price)}`, value: cut(`${c.origin} · крепость ${'●'.repeat(c.strength || 0)}${'○'.repeat(Math.max(0, 5 - (c.strength || 0)))}\n${(c.notes || []).join(', ')}`, LIMIT.field), inline: true }))
    }],
    components: row(link(site, 'Открыть хьюмидор', 'cigars'))
  };
}

export function offersBoard(d, site) {
  if (!d.offers.length) return { embeds: [{ title: 'Предложения', color: GOLD, description: 'Сейчас специальных предложений нет.' }] };
  return {
    embeds: d.offers.slice(0, LIMIT.embeds).map(o => ({ title: o.title, color: GOLD, description: cut(o.desc, LIMIT.desc), fields: [{ name: o.tag || 'Предложение', value: o.price || '—', inline: true }] })),
    components: row(link(site, 'Забронировать', 'stay'))
  };
}

export function eventsBoard(d, site) {
  const list = d.events.slice(0, LIMIT.embeds);
  if (!list.length) return { embeds: [{ title: 'Афиша', color: PINK, description: 'Ближайших событий пока нет. Следите за анонсами.' }] };
  return {
    embeds: list.map(e => ({ title: e.name, color: PINK, description: cut(`${when(e.start)} (${fromNow(e.start)})${e.location ? '\n' + e.location : ''}${e.desc ? '\n\n' + e.desc : ''}`, LIMIT.desc), ...(e.url ? { url: e.url } : {}) })),
    components: row(link(site, 'Вся афиша', 'home'))
  };
}

export function journalBoard(d, site) {
  if (!d.issues.length) return { embeds: [{ title: 'Журнал «Высота»', color: PINK, description: 'Первый выпуск скоро.' }] };
  const abs = u => (site && u && !/^https?:/.test(u) ? `${site}/${u}` : u);
  return {
    embeds: d.issues.slice(0, 3).map(i => ({ title: `${i.title} ${i.number || ''}`.trim(), color: color(i.accent), description: cut(i.desc, LIMIT.desc), ...(site && /^https:/.test(abs(i.cover) || '') ? { image: { url: abs(i.cover) } } : {}), footer: { text: i.publisher || 'Mile High Media' } })),
    components: row(link(site, 'Читать на сайте', 'journal'))
  };
}

export function teamBoard(d, site) {
  const shown = d.team.filter(t => !t.example);
  if (!shown.length) return { embeds: [{ title: 'Персонал', color: WINE, description: 'Анкеты сотрудников появятся здесь, когда их заполнят в панели сайта.' }], components: row(link(site, 'Форма персонала', 'staff')) };
  return {
    embeds: d.depts.filter(x => shown.some(t => t.dept === x.id)).slice(0, LIMIT.embeds).map(x => ({ title: x.name, color: color(x.accent), description: cut(shown.filter(t => t.dept === x.id).map(t => `**${t.name}** · ${t.position}${t.discord ? ` · ${t.discord}` : ''}`).join('\n'), LIMIT.desc) })),
    components: row(link(site, 'Весь персонал', 'staff'))
  };
}

export function faqBoard(d) {
  return { embeds: [{ title: 'Частые вопросы', color: CREAM, fields: d.faq.slice(0, LIMIT.fields).map(q => ({ name: cut(q.q, 256), value: cut(q.a, LIMIT.field) })) }] };
}

export function aboutBoard(d, site) {
  const s = d.settings || {};
  return {
    embeds: [{
      title: s.hotelName || 'Mile High Club', color: WINE, description: `${s.tagline || 'Отель над Лос-Сантосом'}.\n\n${s.address ? `**Адрес:** ${s.address}\n` : ''}**Номера:** ${d.types.map(t => t.name).join(', ')}.\n**Площадки:** ${d.venues.filter(v => !v.comingSoon).map(v => v.name).join(', ')}.`,
      ...(site && /^https:/.test(site) ? { thumbnail: { url: `${site}/img/emblem.webp` } } : {})
    }],
    components: row(link(site, 'Сайт отеля'))
  };
}

export function mainBoard(d, site) {
  return { embeds: [{ title: 'Mile High Club', color: WINE, description: 'Бронь номеров, меню Le Ciel, сигарный клуб, журнал и заявки на сайте отеля. Здесь общаемся и следим за анонсами.' }], components: row(link(site, 'Открыть сайт')) };
}

export function welcomeBoard(d) {
  return {
    embeds: [{ title: 'Добро пожаловать в Mile High Club', color: WINE, description: 'Двери отеля открыты. Прочитайте правила и нажмите кнопку: вы получите роль «Гость отеля», и откроются номера, площадки, меню и гостиная.' }],
    components: row(btn('mhc:accept', 'Принимаю правила, войти', 3, '🛎️'))
  };
}

export function rulesBoard() {
  return {
    embeds: [{
      title: 'Правила сервера', color: CREAM, description: 'Это OOC-раздел: правила обращены к игрокам, а не к персонажам.',
      fields: [
        ['IC и OOC', 'Отель существует в игровом мире. Всё вне игры пишите в скобках ((так)) и не переносите знания игрока на персонажа.'],
        ['Уважение', 'Без оскорблений, травли и дискриминации игроков.'],
        ['Контент', 'Без NSFW, спама и рекламы сторонних проектов.'],
        ['Брони и заказы', 'Брони и заказы проходят через сайт отеля или команды бота. Спорные случаи решают управляющие.'],
        ['Персонал', 'Решения персонала в роли оспариваются через #обращение, а не в общем чате.']
      ].map(([name, value]) => ({ name, value }))
    }]
  };
}

export function rolesBoard() {
  return {
    embeds: [{ title: 'Подписки', color: GOLD, description: 'Выберите, о чём вам сообщать. Повторное нажатие снимает подписку.' }],
    components: [{ type: 1, components: SUBSCRIPTIONS.map(([key, label]) => btn('mhc:sub:' + key, label)) }]
  };
}

export function helpdeskBoard() {
  return { embeds: [{ title: 'Написать управляющим', color: TEAL, description: 'Нажмите кнопку и опишите вопрос. Откроется закрытый канал только для вас и персонала.' }], components: row(btn('mhc:ticket', 'Открыть обращение', 1, '✉️')) };
}

export function jobsBoard() {
  return { embeds: [{ title: 'Работа в отеле', color: TEAL, description: 'Ресепшен, Le Ciel, бар, бассейны, хаускипинг, охрана и сигарный клуб. Оставьте заявку, управляющие ответят в закрытом канале.' }], components: row(btn('mhc:job', 'Подать заявку', 1, '🧾')) };
}

// Канал → персона и карточка
export const BOARDS = {
  welcome: ['concierge', welcomeBoard], rules: ['security', rulesBoard], about: ['concierge', aboutBoard], main: ['concierge', mainBoard], rolesInfo: ['concierge', rolesBoard],
  rooms: ['reception', roomsBoard], venues: ['concierge', venuesBoard], menu: ['ciel', menuBoard], cigars: ['cigar', cigarsBoard], offers: ['concierge', offersBoard],
  events: ['concierge', eventsBoard], team: ['manager', teamBoard], faq: ['concierge', faqBoard], helpdesk: ['concierge', helpdeskBoard], jobs: ['manager', jobsBoard]
};
// Журнал не карточка: новые выпуски публикуются постами, но витрина тоже держится актуальной
BOARDS.journal = ['journal', journalBoard];
