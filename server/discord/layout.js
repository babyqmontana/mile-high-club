// Схема Discord-сервера: только то, чего нет на сайте. Всё остальное живёт на сайте.
// Уровни доступа: администраторы видят всё, директора видят дирекцию и персонал, персонал только своё.
// РАЗРАБОТКА не входит в схему: её видят роль Dev и обладатели права «Администратор», директорам она закрыта.
// Чистые данные без discord.js, поэтому схема и план проверяются тестами без сети.

export const TEXT = 0, VOICE = 2, CATEGORY = 4, ANNOUNCEMENT = 5;

export const DIRECTOR_ROLE = { name: '💼 Директор', color: 0xF7B50A, hoist: true, mentionable: true };

// ключ, имя, доступ. area: доступ распространяется на все каналы внутри категории
const CATEGORIES = [
  ['catDesk', '🎫・ОБРАЩЕНИЯ', 'public'],
  ['catTeam', '👥・ПЕРСОНАЛ', 'staff', true],
  ['catBoard', '👑・ДИРЕКЦИЯ', 'directors', true]
];

const CHANNELS = [
  ['helpdesk', '🎫・написать-нам', 'catDesk', 'public', 'Вопрос или заявка на работу: откроется закрытый канал только для вас и персонала'],
  ['staffTickets', '🛎️・лента-сайта', 'catTeam', 'feed', 'Брони, заказы и обращения с сайта'],
  ['boardChat', '💼・дирекция', 'catBoard', 'directors', 'Закрытый канал директоров'],
  ['boardVoice', '🔊・дирекция', 'catBoard', 'directors', '', VOICE]
];

// Все каналы сервера в одном стиле: значок и точка
const RENAMES = [
  ['правила', '📜・правила', TEXT],
  ['о-нас', '🏨・о-нас', TEXT],
  ['анонсы', '📣・анонсы', ANNOUNCEMENT],
  ['welcome-lobby👋', '👋・добро-пожаловать', TEXT],
  ['・общий-чат', '💬・общий-чат', TEXT],
  ['・медиа', '📸・медиа', TEXT],
  ['🛋️・LOBBY', '💬・ОБЩЕНИЕ', CATEGORY],
  ['🔊・лобби', '🔊・голосовой', VOICE]
];

// Каналы сервера, которые больше не нужны. Удаляются только вместе с очисткой и только пустые.
const REMOVE = [['🔊・staff-voice-2', VOICE]];

export function buildBlueprint() {
  return {
    categories: CATEGORIES.map(([key, name, access, area = false]) => ({ key, name, type: CATEGORY, access, area })),
    channels: CHANNELS.map(([key, name, parent, access, topic, type = TEXT]) => ({ key, name, parent, type, access, topic })),
    renames: RENAMES.map(([from, to, type]) => ({ from, to, type })),
    remove: REMOVE.map(([name, type]) => ({ name, type }))
  };
}

const VIEW = ['ViewChannel', 'ReadMessageHistory'];
const CLOSED = ['SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads'];
// Discord не даёт закрыть для всех право, которого нет у самого бота: всё из CLOSED держим у него открытым
const BOT = [...new Set(['ViewChannel', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles', 'ManageChannels', 'ManageWebhooks', ...CLOSED])];

const VOICE_PERMS = ['Connect', 'Speak', 'Stream'];

export const allTiers = t => [...new Set([...(t.admin || []), ...(t.director || []), ...(t.staff || [])])];
const viewers = (access, t) => (access === 'directors' ? [...new Set([...(t.admin || []), ...(t.director || [])])] : allTiers(t));

// public: все читают, пишет бот. feed: персонал читает, пишет бот. staff и directors: закрытые разделы своего уровня и выше.
export function overwritesFor(spec, tiers, everyoneId, botId) {
  const open = spec.access === 'public', feed = spec.access === 'feed';
  const allow = spec.type === VOICE ? [...VIEW, ...VOICE_PERMS] : VIEW;
  return [
    { id: everyoneId, allow: open ? VIEW : [], deny: open ? CLOSED : ['ViewChannel'] },
    ...(open ? [] : viewers(spec.access, tiers).map(id => ({ id, allow, deny: feed ? CLOSED : [] }))),
    { id: botId, allow: BOT, deny: [] }
  ];
}
