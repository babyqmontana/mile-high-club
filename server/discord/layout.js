// Схема Discord-сервера: только то, чего нет на сайте. Всё остальное живёт на сайте.
// Бот добавляет одну категорию с двумя каналами и не создаёт ролей: доступ строится на ролях, выбранных в панели.
// Чистые данные без discord.js, поэтому схема и план проверяются тестами без сети.

export const TEXT = 0, VOICE = 2, CATEGORY = 4, ANNOUNCEMENT = 5;

const CATEGORIES = [['catDesk', '🎫・ОБРАЩЕНИЯ', 'public']];

const CHANNELS = [
  ['helpdesk', '🎫・написать-нам', 'catDesk', 'public', 'Вопрос или заявка на работу: откроется закрытый канал только для вас и персонала'],
  ['staffTickets', '🛎️・лента-сайта', 'catDesk', 'staff', 'Брони, заказы и обращения с сайта']
];

// Каналы сервера в одном стиле: значок и точка, как в разделах ПЕРСОНАЛ и РАЗРАБОТКА
const RENAMES = [
  ['правила', '📜・правила', TEXT],
  ['о-нас', '🏨・о-нас', TEXT],
  ['анонсы', '📣・анонсы', ANNOUNCEMENT],
  ['welcome-lobby👋', '👋・добро-пожаловать', TEXT],
  ['・общий-чат', '💬・общий-чат', TEXT],
  ['・медиа', '📸・медиа', TEXT],
  ['Lobby', '🛋️・LOBBY', CATEGORY],
  ['Voice', '🔊・лобби', VOICE]
];

export function buildBlueprint() {
  return {
    categories: CATEGORIES.map(([key, name, access]) => ({ key, name, type: CATEGORY, access })),
    channels: CHANNELS.map(([key, name, parent, access, topic]) => ({ key, name, parent, type: TEXT, access, topic })),
    renames: RENAMES.map(([from, to, type]) => ({ from, to, type }))
  };
}

const VIEW = ['ViewChannel', 'ReadMessageHistory'];
const CLOSED = ['SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads'];
// Discord не даёт закрыть для всех право, которого нет у самого бота: всё из CLOSED держим у него открытым
const BOT = [...new Set(['ViewChannel', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles', 'ManageChannels', 'ManageWebhooks', ...CLOSED])];

// public: все читают, пишет только бот. staff: читают роли персонала, выбранные в панели.
export function overwritesFor(spec, staffIds, everyoneId, botId) {
  const open = spec.access === 'public';
  return [
    { id: everyoneId, allow: open ? VIEW : [], deny: open ? CLOSED : ['ViewChannel'] },
    ...(open ? [] : staffIds.map(id => ({ id, allow: VIEW, deny: CLOSED }))),
    { id: botId, allow: BOT, deny: [] }
  ];
}
