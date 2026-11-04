// Схема Discord-сервера Mile High Club: роли, категории, каналы и доступ.
// Чистые данные без discord.js, поэтому схема и план проверяются тестами без сети.
// Ключи старой схемы (main, rooms, staffBookings, catTickets…) сохранены: на них уже завязаны настройки.

export const TEXT = 0, VOICE = 2, CATEGORY = 4;

const hex = s => parseInt(String(s).replace('#', ''), 16);
const lum = c => { const r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255; return (.2126 * r + .7152 * g + .0722 * b) / 255; };
const lighten = (c, k) => { const m = v => Math.round(v + (255 - v) * k); return m(c >> 16 & 255) << 16 | m(c >> 8 & 255) << 8 | m(c & 255); };

// Цвет роли должен читаться на тёмной теме Discord: в сиде есть почти чёрные цвета формы
export function roleColor(dept) {
  const opts = [dept.accent, dept.color].filter(Boolean).map(hex);
  const good = opts.find(c => lum(c) > .22 && lum(c) < .92);
  return good ?? lighten(opts[0] ?? 0x808080, .55);
}

export const slug = s => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 90);

// Группы доступа. Владелец и управляющие видят всё; остальное открывается ролью.
const MGMT = ['owner', 'gm', 'deputy', 'admin'];
const STAFF = [...MGMT, 'mod', 'staff', 'head', 'employee', 'intern'];
const GUESTS = ['guest', 'resident', 'cigarMember', 'press', ...STAFF];

// access: кто видит (view: 'all' или ключи ролей) и кто пишет (write: 'none' — только бот, 'view' — все, кто видит)
const ACCESS = {
  lobby: { view: 'all', write: MGMT },
  board: { view: GUESTS, write: MGMT },
  news: { view: GUESTS, write: ['press', ...MGMT] },
  lounge: { view: GUESTS, write: 'view', threads: true },
  voice: { view: GUESTS, write: 'view' },
  residents: { view: ['resident', ...STAFF], write: 'view', threads: true },
  cigar: { view: ['cigarMember', ...MGMT], write: 'view', threads: true },
  desk: { view: GUESTS, write: MGMT },
  staff: { view: STAFF, write: 'view', threads: true },
  staffFeed: { view: STAFF, write: 'none' },
  mgmt: { view: MGMT, write: 'view', threads: true },
  mgmtFeed: { view: MGMT, write: 'none' },
  press: { view: ['press', ...MGMT], write: 'view', threads: true },
  tickets: { view: STAFF, write: 'view' }
};

const ROLES = [
  // старые роли: на них опирается вход на сайт
  ['admin', 'MHC Администратор', 0xF0177A, true],
  ['mod', 'MHC Модератор', 0xF7B50A, true],
  ['staff', 'MHC Персонал', 0x3FD3C6, true],
  // руководство и персонал
  ['owner', 'Владелец', 0xF6E8D2, true],
  ['gm', 'Управляющий', 0xF7B50A, true],
  ['deputy', 'Зам. управляющего', 0xE0A83A, true],
  ['head', 'Руководитель отдела', 0xC9A24A, true],
  ['employee', 'Сотрудник', 0xB98A57, true],
  ['intern', 'Стажёр', 0x9A8A78, false],
  ['onShift', 'На смене', 0x3FD3C6, true],
  // гости
  ['guest', 'Гость отеля', 0xD8C7AE, false],
  ['resident', 'Постоялец', 0xF0177A, true],
  ['cigarMember', 'Член сигарного клуба', 0x9C6B3F, true],
  ['press', 'Пресса', 0x8FB8DE, false],
  // подписки: их упоминает бот, цвет не нужен
  ['subNews', 'Подписка: анонсы', 0, false],
  ['subParty', 'Подписка: вечеринки', 0, false],
  ['subCigar', 'Подписка: сигары', 0, false],
  ['subCiel', 'Подписка: Le Ciel', 0, false],
  ['subJournal', 'Подписка: журнал', 0, false]
];
export const SUBSCRIPTIONS = [['subNews', 'Анонсы'], ['subParty', 'Вечеринки'], ['subCigar', 'Сигары'], ['subCiel', 'Le Ciel'], ['subJournal', 'Журнал']];

const CATEGORIES = [
  ['catLobby', 'ЛОББИ', 'lobby'],
  ['catMain', 'ОТЕЛЬ', 'board', ['MILE HIGH CLUB']],
  ['catLounge', 'ГОСТИНАЯ', 'lounge'],
  ['catResidents', 'ПОСТОЯЛЬЦЫ', 'residents'],
  ['catCigar', 'СИГАРНЫЙ КЛУБ', 'cigar'],
  ['catDesk', 'ОБРАЩЕНИЯ', 'desk'],
  ['catStaff', 'СЛУЖЕБНОЕ', 'staff', ['СТАФФ']],
  ['catDepts', 'ОТДЕЛЫ', 'staff'],
  ['catMgmt', 'РУКОВОДСТВО', 'mgmt'],
  ['catPress', 'РЕДАКЦИЯ', 'press'],
  ['catTickets', 'ТИКЕТЫ', 'tickets']
];

const CHANNELS = [
  // ЛОББИ
  ['welcome', 'добро-пожаловать', 'catLobby', 'lobby', 'Вход в отель: примите правила и получите роль гостя'],
  ['rules', 'правила', 'catLobby', 'lobby', 'Правила сервера (OOC)'],
  ['about', 'о-отеле', 'catLobby', 'lobby', 'Mile High Club, отель над Лос-Сантосом'],
  ['main', 'главная', 'catLobby', 'lobby', 'Сайт отеля и всё главное'],
  ['rolesInfo', 'роли', 'catLobby', 'lobby', 'Подписки на новости отеля'],
  // ОТЕЛЬ: живые эмбеды из базы сайта
  ['announcements', 'анонсы', 'catMain', 'news', 'Анонсы и события'],
  ['rooms', 'номера', 'catMain', 'board', 'Свободные номера и цены, обновляется автоматически', ['свободные-номера']],
  ['venues', 'площадки', 'catMain', 'board', 'Что сейчас открыто и расписание'],
  ['menu', 'меню-le-ciel', 'catMain', 'board', 'Меню Le Ciel и доставка в номер'],
  ['cigars', 'сигары', 'catMain', 'board', 'Хьюмидор сигарного клуба'],
  ['offers', 'предложения', 'catMain', 'board', 'Пакеты и предложения отеля'],
  ['events', 'афиша', 'catMain', 'board', 'Ближайшие события'],
  ['journal', 'журнал', 'catMain', 'news', 'Новые выпуски журнала «Высота»'],
  ['team', 'персонал', 'catMain', 'board', 'Кто работает в отеле'],
  ['faq', 'faq', 'catMain', 'board', 'Частые вопросы'],
  // ГОСТИНАЯ
  ['chat', 'общение', 'catLounge', 'lounge', 'Общий чат гостей'],
  ['photos', 'фото', 'catLounge', 'lounge', 'Снимки из отеля'],
  ['vLobby', 'Лобби', 'catLounge', 'voice', '', [], VOICE],
  ['vBar', 'The Hot Times', 'catLounge', 'voice', '', [], VOICE],
  ['vPool', 'Night Pool', 'catLounge', 'voice', '', [], VOICE],
  ['vCiel', 'Le Ciel', 'catLounge', 'voice', '', [], VOICE],
  // ПОСТОЯЛЬЦЫ
  ['residentsChat', 'постояльцы', 'catResidents', 'residents', 'Для тех, кто сейчас живёт в отеле'],
  // СИГАРНЫЙ КЛУБ
  ['cigarChat', 'курительная', 'catCigar', 'cigar', 'Двенадцать кресел и правило про телефоны'],
  ['vCigar', 'Кожаная комната', 'catCigar', 'cigar', '', [], VOICE],
  // ОБРАЩЕНИЯ
  ['helpdesk', 'обращение', 'catDesk', 'desk', 'Написать управляющим'],
  ['jobs', 'трудоустройство', 'catDesk', 'desk', 'Заявка на работу в отеле'],
  // СЛУЖЕБНОЕ
  ['staffGeneral', 'стафф-общий', 'catStaff', 'staff', 'Общение персонала'],
  ['staffBookings', 'брони', 'catStaff', 'staffFeed', 'Новые брони с сайта'],
  ['staffOrders', 'заказы', 'catStaff', 'staffFeed', 'Заказы в номер'],
  ['staffTickets', 'обращения', 'catStaff', 'staffFeed', 'Заявки и чаты с сайта'],
  ['shifts', 'смены', 'catStaff', 'staffFeed', 'Кто вышел на смену'],
  // РУКОВОДСТВО
  ['mgmtChat', 'руководство', 'catMgmt', 'mgmt', 'Закрытый канал руководства'],
  ['auditLog', 'журнал-действий', 'catMgmt', 'mgmtFeed', 'Действия персонала на сайте'],
  // РЕДАКЦИЯ
  ['pressRoom', 'редакция', 'catPress', 'press', 'Журнал «Высота»: материалы и выпуски']
];

// Персоны: говорят в каналах через вебхуки со своими аватарками (public/img/discord/<key>.png)
export const PERSONAS = {
  concierge: 'Консьерж', reception: 'Ресепшен', ciel: 'Le Ciel', hot: 'The Hot Times', pools: 'Бассейны',
  cigar: 'Сигарный клуб', journal: 'Журнал «Высота»', security: 'Охрана', manager: 'Управляющий'
};

export function buildBlueprint({ depts = [] } = {}) {
  const deptRoles = depts.map(d => ({ key: 'dept_' + d.id, name: d.name, color: roleColor(d), hoist: false, mentionable: true }));
  const roles = [...ROLES.map(([key, name, color, hoist]) => ({ key, name, color, hoist, mentionable: true })), ...deptRoles];
  const categories = CATEGORIES.map(([key, name, access, legacy = []]) => ({ key, name, type: CATEGORY, access: ACCESS[access], legacy }));
  const channels = CHANNELS.map(([key, name, parent, access, topic, legacy = [], type = TEXT]) => ({ key, name, parent, type, topic, access: ACCESS[access], legacy }));
  for (const d of depts) channels.push({ key: 'dept_' + d.id, name: slug(d.name), parent: 'catDepts', type: TEXT, topic: `Рабочий канал отдела: ${d.name}`, access: { view: ['dept_' + d.id, ...MGMT], write: 'view', threads: true }, legacy: [] });
  // сотрудники клуба заходят в свою категорию без членской роли
  const club = depts.find(d => /сигар/i.test(d.name));
  if (club) for (const c of [...categories, ...channels]) if (c.access === ACCESS.cigar) c.access = { ...c.access, view: [...c.access.view, 'dept_' + club.id] };
  return { roles, categories, channels };
}

const VIEW = ['ViewChannel', 'ReadMessageHistory'];
const WRITE = ['SendMessages', 'SendMessagesInThreads', 'AddReactions'];
const THREADS = ['CreatePublicThreads'];
const VOICE_PERMS = ['Connect', 'Speak', 'Stream'];
const CLOSED = ['SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads'];
const BOT = ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ManageChannels', 'ManageWebhooks'];

// Права канала: ids — ключ роли → её id
export function overwritesFor(spec, ids, everyoneId, botId) {
  const { access, type } = spec, out = new Map();
  const add = (id, allow = [], deny = []) => { if (!id) return; const o = out.get(id) || { id, allow: [], deny: [] }; o.allow = [...new Set([...o.allow, ...allow])]; o.deny = [...new Set([...o.deny, ...deny])]; out.set(id, o); };
  const open = access.view === 'all', writers = access.write === 'view' ? (open ? [] : access.view) : access.write === 'none' ? [] : access.write;
  add(everyoneId, open ? VIEW : [], open ? (access.write === 'view' ? [] : CLOSED) : ['ViewChannel']);
  if (!open) for (const k of access.view) add(ids[k], type === VOICE ? [...VIEW, ...VOICE_PERMS] : VIEW);
  if (!open && access.write !== 'view') for (const k of access.view) add(ids[k], [], CLOSED);
  for (const k of writers) { const o = ids[k] && out.get(ids[k]); if (o) o.deny = o.deny.filter(p => !CLOSED.includes(p)); add(ids[k], [...VIEW, ...WRITE, ...(access.threads ? THREADS : [])]); }
  if (access.write === 'view' && access.threads && !open) for (const k of access.view) add(ids[k], THREADS);
  add(botId, BOT);
  return [...out.values()];
}

// Какую роль сайта даёт роль Discord
export const SITE_ROLES = { admin: ['admin', 'owner', 'gm'], mod: ['mod', 'staff', 'deputy', 'head', 'employee'] };
