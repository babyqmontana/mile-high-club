// В Discord остаются только обращения. Брони, меню, афиша и управление живут на сайте.

export const buildCommands = () => [{ name: 'обращение', description: 'Написать отелю: откроется закрытый канал' }];

const input = (custom_id, label, opts = {}) => ({ type: 1, components: [{ type: 4, custom_id, label, style: opts.long ? 2 : 1, required: true, max_length: opts.long ? 1000 : 60 }] });
const ticketModal = (id, title, topicLabel) => ({ custom_id: id, title, components: [input('name', 'Имя персонажа'), input('topic', topicLabel), input('text', 'Сообщение', { long: true })] });

/** ctx: { core, resolveRole } */
export function createInteractions({ core, resolveRole }) {
  const EPH = 64; // MessageFlags.Ephemeral: видно только нажавшему (вместо устаревшего ephemeral: true)
  const say = (i, content) => (i.deferred || i.replied ? i.editReply({ content }) : i.reply({ content, flags: EPH }));
  // защита от спама: не чаще раза в 2 минуты и не больше 3 открытых обращений на человека
  const lastAt = new Map();
  const openTicket = async (i, topic) => {
    const now = Date.now(), open = core.store.all('tickets').filter(t => t.discordId === i.user.id && t.status !== 'closed').length;
    if (open >= 3) return i.reply({ content: 'У вас уже три открытых обращения — дождитесь ответа по ним.', flags: EPH });
    if (now - (lastAt.get(i.user.id) || 0) < 120e3) return i.reply({ content: 'Новое обращение можно открыть через пару минут.', flags: EPH });
    lastAt.set(i.user.id, now);
    await i.deferReply({ flags: EPH });
    const user = { id: i.user.id, username: i.user.username, role: await resolveRole(i.user.id) };
    const { ticket } = await core.handle('POST', '/tickets', { user, body: { name: i.fields.getTextInputValue('name'), topic, text: i.fields.getTextInputValue('text') } });
    const r = await core.handle('POST', `/tickets/${ticket.id}/mode`, { user, body: { mode: 'discord' } });
    return say(i, r.ticket.channel ? `Обращение открыто: <#${r.ticket.channel}>` : 'Обращение принято, управляющие ответят.');
  };

  // закрывает только администрация: транскрипт и удаление канала делает core через бота
  const closeTicket = async i => {
    const role = await resolveRole(i.user.id);
    if (role === 'guest') return i.reply({ content: 'Закрыть обращение может только администрация.', flags: EPH });
    const t = core.store.all('tickets').find(x => x.channel === i.channelId && x.status !== 'closed');
    if (!t) return i.reply({ content: 'Это обращение уже закрыто.', flags: EPH });
    await i.deferReply({ flags: EPH });
    await core.handle('POST', `/admin/tickets/${t.id}/close`, { user: { id: i.user.id, username: i.member?.displayName || i.user.username, role } });
  };

  return async function handle(i) {
    try {
      if (i.isButton() && i.customId === 'mhc:close') return await closeTicket(i);
      if (i.isChatInputCommand() && i.commandName === 'обращение') return await i.showModal(ticketModal('mhc:ticket:send', 'Обращение', 'Тема'));
      if (i.isButton() && i.customId === 'mhc:ticket') return await i.showModal(ticketModal('mhc:ticket:send', 'Обращение', 'Тема'));
      if (i.isButton() && i.customId === 'mhc:job') return await i.showModal(ticketModal('mhc:job:send', 'Заявка на работу', 'Желаемая должность'));
      if (i.isModalSubmit() && i.customId === 'mhc:ticket:send') return await openTicket(i, i.fields.getTextInputValue('topic'));
      if (i.isModalSubmit() && i.customId === 'mhc:job:send') return await openTicket(i, 'Трудоустройство: ' + i.fields.getTextInputValue('topic'));
    } catch (e) {
      console.error('Discord interaction:', e);
      // причина видна персоналу в панели («Последние действия»), а не только в консоли сервера
      try { core.log?.(`Discord: кнопка «${i.customId || i.commandName || '?'}» не сработала у ${i.user?.username || '?'} — ${e.message}`, 'error'); } catch { }
      return say(i, e.message || 'Не получилось. Попробуйте ещё раз.').catch(() => {});
    }
  };
}
