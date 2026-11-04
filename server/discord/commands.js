// Слэш-команды, кнопки и модальные окна. Вся бизнес-логика остаётся в core: сюда приходит только разбор ввода.
import { roomsBoard, venuesBoard, menuBoard, eventsBoard, money } from './embeds.js';
import { SUBSCRIPTIONS } from './layout.js';

const STR = 3, code = { type: STR, name: 'код', description: 'Код брони, например MHC-AB12', required: true };

export function buildCommands(types = []) {
  return [
    { name: 'номера', description: 'Свободные номера и цены' },
    { name: 'площадки', description: 'Что сейчас открыто в отеле' },
    { name: 'меню', description: 'Меню Le Ciel' },
    { name: 'афиша', description: 'Ближайшие события' },
    { name: 'бронь', description: 'Забронировать номер', options: [{ type: STR, name: 'тип', description: 'Тип номера', required: true, choices: types.slice(0, 25).map(t => ({ name: `${t.name} · ${money(t.price)}`, value: t.id })) }] },
    { name: 'мои-брони', description: 'Ваши брони в отеле' },
    { name: 'обращение', description: 'Написать управляющим' },
    { name: 'подтвердить', description: 'Персонал: подтвердить бронь', options: [code, { type: STR, name: 'номер', description: 'Номер комнаты. Без него возьмём первый свободный', required: false }] },
    { name: 'заселить', description: 'Персонал: заселить гостя', options: [code] },
    { name: 'выселить', description: 'Персонал: выселить гостя', options: [code] },
    { name: 'смена', description: 'Персонал: начать или закончить смену' }
  ];
}

const input = (custom_id, label, opts = {}) => ({ type: 1, components: [{ type: 4, custom_id, label, style: opts.long ? 2 : 1, required: opts.required ?? true, max_length: opts.max ?? (opts.long ? 1000 : 60), ...(opts.placeholder ? { placeholder: opts.placeholder } : {}), ...(opts.value ? { value: opts.value } : {}) }] });

const bookingModal = (type, name) => ({
  custom_id: 'mhc:book:' + type, title: 'Бронь номера',
  components: [input('name', 'Имя персонажа', { value: name }), input('date', 'Дата заезда', { placeholder: 'ГГГГ-ММ-ДД', max: 10 }), input('nights', 'Ночей', { value: '1', max: 2 }), input('guests', 'Гостей', { value: '1', max: 2 }), input('note', 'Пожелания', { long: true, required: false })]
});
const ticketModal = (id, title, topicLabel) => ({ custom_id: id, title, components: [input('name', 'Имя персонажа'), input('topic', topicLabel, { max: 60 }), input('text', 'Сообщение', { long: true })] });

/** ctx: { core, store, site, resolveRole, roleId, post } */
export function createInteractions(ctx) {
  const { core, store } = ctx;
  const say = (i, content) => (i.deferred || i.replied ? i.editReply({ content }) : i.reply({ content, ephemeral: true }));
  const card = (i, payload) => i.reply({ ...payload, ephemeral: true });
  const userOf = async i => ({ id: i.user.id, username: i.user.username, role: await ctx.resolveRole(i.user.id) });
  const byCode = c => { const b = store.all('bookings').find(x => x.code === String(c).trim().toUpperCase()); if (!b) throw new Error('Бронь с таким кодом не найдена'); return b; };
  const act = async (i, act, extra = {}) => {
    const b = byCode(i.options.getString('код'));
    await i.deferReply({ ephemeral: true });
    const r = await core.handle('POST', `/admin/bookings/${b.id}/action`, { user: await userOf(i), body: { act, ...extra(b) } });
    return say(i, `Бронь **${r.booking.code}**: готово${r.booking.room ? `, номер ${r.booking.room}` : ''}.`);
  };
  const freeRoom = b => {
    const want = b.preferredRoom && store.get('rooms', b.preferredRoom);
    if (want?.status === 'free') return want.id;
    return store.all('rooms').find(r => r.type === b.type && r.status === 'free')?.id;
  };
  const toggleRole = async (i, key) => {
    const id = ctx.roleId(key); if (!id) throw new Error('Роль ещё не создана. Попросите управляющих развернуть структуру сервера.');
    const has = i.member.roles.cache.has(id);
    await (has ? i.member.roles.remove(id) : i.member.roles.add(id));
    return !has;
  };
  const openTicket = async (i, topic) => {
    await i.deferReply({ ephemeral: true });
    const user = await userOf(i);
    const { ticket } = await core.handle('POST', '/tickets', { user, body: { name: i.fields.getTextInputValue('name'), topic, text: i.fields.getTextInputValue('text') } });
    const r = await core.handle('POST', `/tickets/${ticket.id}/mode`, { user, body: { mode: 'discord' } });
    return say(i, r.ticket.channel ? `Обращение открыто: <#${r.ticket.channel}>` : 'Обращение принято, управляющие ответят.');
  };

  const slash = {
    'номера': i => card(i, roomsBoard(core.publicData(), ctx.site)),
    'площадки': i => card(i, venuesBoard(core.publicData(), ctx.site)),
    'меню': i => card(i, menuBoard(core.publicData(), ctx.site)),
    'афиша': i => card(i, eventsBoard(core.publicData(), ctx.site)),
    'бронь': i => i.showModal(bookingModal(i.options.getString('тип'), i.member?.displayName?.slice(0, 60))),
    'мои-брони': i => {
      const mine = store.all('bookings').filter(b => b.discordId === i.user.id || b.owner === 'd:' + i.user.id || b.discord === i.user.username).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
      const status = { new: 'ждёт подтверждения', confirmed: 'подтверждена', checkedin: 'заселение', done: 'завершена', cancelled: 'отменена' };
      return say(i, mine.length ? mine.map(b => `**${b.code}** · ${b.typeName} · ${b.date}, ${b.nights} ноч. · ${status[b.status] || b.status}${b.room ? ` · номер ${b.room}` : ''}`).join('\n') : 'У вас пока нет броней.');
    },
    'обращение': i => i.showModal(ticketModal('mhc:ticket:send', 'Обращение', 'Тема')),
    'подтвердить': i => act(i, 'confirm', b => { const room = i.options.getString('номер') || freeRoom(b); if (!room) throw new Error('Нет свободного номера этого типа'); return { room }; }),
    'заселить': i => act(i, 'checkin', () => ({})),
    'выселить': i => act(i, 'checkout', () => ({})),
    'смена': async i => {
      const role = await ctx.resolveRole(i.user.id);
      if (role === 'guest') return say(i, 'Команда только для персонала.');
      const on = await toggleRole(i, 'onShift');
      await ctx.post('shifts', { content: `${on ? '🟢' : '⚫'} <@${i.user.id}> ${on ? 'вышел(ла) на смену' : 'закончил(а) смену'}`, allowedMentions: { parse: [] } }, 'manager');
      return say(i, on ? 'Смена начата.' : 'Смена закончена.');
    }
  };

  async function button(i) {
    const id = i.customId;
    if (id === 'mhc:accept') {
      const role = ctx.roleId('guest'); if (!role) throw new Error('Роль ещё не создана');
      if (i.member.roles.cache.has(role)) return say(i, 'Вы уже гость отеля.');
      await i.member.roles.add(role);
      return say(i, 'Добро пожаловать. Каналы отеля открыты.');
    }
    if (id.startsWith('mhc:sub:')) {
      const key = id.slice(8), sub = SUBSCRIPTIONS.find(s => s[0] === key); if (!sub) return say(i, 'Такой подписки нет.');
      return say(i, (await toggleRole(i, key)) ? `Подписка «${sub[1]}» включена.` : `Подписка «${sub[1]}» снята.`);
    }
    if (id === 'mhc:ticket') return i.showModal(ticketModal('mhc:ticket:send', 'Обращение', 'Тема'));
    if (id === 'mhc:job') return i.showModal(ticketModal('mhc:job:send', 'Заявка на работу', 'Желаемая должность'));
  }

  async function modal(i) {
    const id = i.customId;
    if (id.startsWith('mhc:book:')) {
      await i.deferReply({ ephemeral: true });
      const f = n => i.fields.getTextInputValue(n);
      const r = await core.handle('POST', '/bookings', { user: await userOf(i), body: { type: id.slice(9), name: f('name'), date: f('date'), nights: f('nights'), guests: f('guests'), note: f('note') } });
      return say(i, `Заявка принята, код брони **${r.booking?.code || ''}**. Управляющий подтвердит её, а бот напишет вам.`);
    }
    if (id === 'mhc:ticket:send') return openTicket(i, i.fields.getTextInputValue('topic'));
    if (id === 'mhc:job:send') return openTicket(i, 'Трудоустройство: ' + i.fields.getTextInputValue('topic'));
  }

  return async function handle(i) {
    try {
      if (i.isChatInputCommand()) return await slash[i.commandName]?.(i);
      if (i.isButton()) return await button(i);
      if (i.isModalSubmit()) return await modal(i);
    } catch (e) {
      console.error('Discord interaction:', e.message);
      return say(i, e.message || 'Не получилось. Попробуйте ещё раз.').catch(() => {});
    }
  };
}
