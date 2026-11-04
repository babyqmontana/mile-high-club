// Лицо сервера и бота: описание, экран приветствия, адаптация, аватар, баннер, цвет роли.
// Каждый шаг независим: ошибка одного не мешает остальным и попадает в отчёт.
import fs from 'node:fs';
import path from 'node:path';
import { PALETTE } from './embeds.js';

const SERVER_DESCRIPTION = 'Отель Mile High Club над Лос-Сантосом: брони, меню, журнал и афиша на сайте, здесь общение, анонсы и обращения.';
const BOT_DESCRIPTION = 'Консьерж отеля Mile High Club. Связывает сервер с сайтом: обращения и транскрипты, лента брони и заказов для персонала, анонсы событий.';

const BOT_ROLE = '🤖 Бот отеля';

const dataUri = file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

export async function applyProfile({ guild, client, root, channelId }) {
  const report = {}, step = async (name, fn) => { try { await fn(); report[name] = 'ok'; } catch (e) { report[name] = (e.rawError?.errors ? JSON.stringify(e.rawError.errors) : String(e.message)).slice(0, 300); } };
  const id = name => guild.channels.cache.find(c => c.name === name)?.id;
  const rest = client.rest, base = `/guilds/${guild.id}`;

  await step('описание', () => guild.edit({ description: SERVER_DESCRIPTION, reason: 'Mile High Club: профиль сервера' }));

  await step('экран приветствия', () => guild.editWelcomeScreen({
    enabled: true, description: 'Добро пожаловать в Mile High Club. Вот с чего начать.',
    welcomeChannels: [
      ['📜・правила', 'Правила сервера', '📜'], ['📣・анонсы', 'Новости и события отеля', '📣'], ['💬・общий-чат', 'Общение гостей', '💬'], ['🎫・написать-нам', 'Вопрос или заявка на работу', '🎫']
    ].filter(([n]) => id(n)).map(([n, description, emoji]) => ({ channel: id(n), description, emoji }))
  }));

  await step('адаптация', async () => {
    const list = ['👋・добро-пожаловать', '📜・правила', '🏨・о-нас', '📣・анонсы', '🎫・написать-нам', '💬・общий-чат', '📸・медиа', '🔊・голосовой'].map(id).filter(Boolean);
    let n = 0; const snowflake = () => String(((BigInt(Date.now()) - 1420070400000n) << 22n) + BigInt(++n));
    const option = (title, description, emoji, names) => ({ id: snowflake(), title, description, emoji_name: emoji, channel_ids: names.map(id).filter(Boolean), role_ids: [] });
    await rest.put(`${base}/onboarding`, { body: {
      enabled: true, mode: 0, default_channel_ids: list,
      prompts: [{ id: snowflake(), type: 0, title: 'Зачем вы в отеле?', single_select: false, required: false, in_onboarding: true, options: [
        option('Общаться', 'Чат гостей и голосовой канал', '💬', ['💬・общий-чат', '🔊・голосовой']),
        option('Следить за событиями', 'Анонсы и новости отеля', '📣', ['📣・анонсы']),
        option('Работать в отеле', 'Заявка на работу и вопросы', '🎫', ['🎫・написать-нам'])
      ] }]
    } });
  });

  await step('аватар и баннер бота', () => rest.patch('/users/@me', { body: { avatar: dataUri(path.join(root, 'brand', 'emblem-dark.png')), banner: dataUri(path.join(root, 'brand', 'bot-banner.png')) } }));
  await step('описание бота', () => rest.patch('/applications/@me', { body: { description: BOT_DESCRIPTION } }));
  // Своя роль без прав: только цвет и отдельная группа в списке участников
  await step('роль бота', async () => {
    await guild.roles.fetch();
    const role = guild.roles.cache.find(r => r.name === BOT_ROLE) || await guild.roles.create({ name: BOT_ROLE, color: PALETTE.pink, hoist: true, permissions: [], reason: 'Mile High Club: бот выделяется в списке' });
    const me = await guild.members.fetchMe();
    if (!me.roles.cache.has(role.id)) await me.roles.add(role, 'Mile High Club: роль бота');
    const top = me.roles.highest.position;
    if (role.position < top - 1) await role.setPosition(top - 1).catch(() => {});
  });
  return report;
}
