// В Discord остаются только обращения. Брони, меню, афиша и управление живут на сайте.

export const buildCommands = () => [{ name: 'обращение', description: 'Написать отелю: откроется закрытый канал' }];

const input = (custom_id, label, opts = {}) => ({ type: 1, components: [{ type: 4, custom_id, label, style: opts.long ? 2 : 1, required: true, max_length: opts.long ? 1000 : 60 }] });
const ticketModal = (id, title, topicLabel) => ({ custom_id: id, title, components: [input('name', 'Имя персонажа'), input('topic', topicLabel), input('text', 'Сообщение', { long: true })] });

/** ctx: { core, resolveRole } */
export function createInteractions({ core, resolveRole }) {
  const say = (i, content) => (i.deferred || i.replied ? i.editReply({ content }) : i.reply({ content, ephemeral: true }));
  const openTicket = async (i, topic) => {
    await i.deferReply({ ephemeral: true });
    const user = { id: i.user.id, username: i.user.username, role: await resolveRole(i.user.id) };
    const { ticket } = await core.handle('POST', '/tickets', { user, body: { name: i.fields.getTextInputValue('name'), topic, text: i.fields.getTextInputValue('text') } });
    const r = await core.handle('POST', `/tickets/${ticket.id}/mode`, { user, body: { mode: 'discord' } });
    return say(i, r.ticket.channel ? `Обращение открыто: <#${r.ticket.channel}>` : 'Обращение принято, управляющие ответят.');
  };

  return async function handle(i) {
    try {
      if (i.isChatInputCommand() && i.commandName === 'обращение') return await i.showModal(ticketModal('mhc:ticket:send', 'Обращение', 'Тема'));
      if (i.isButton() && i.customId === 'mhc:ticket') return await i.showModal(ticketModal('mhc:ticket:send', 'Обращение', 'Тема'));
      if (i.isButton() && i.customId === 'mhc:job') return await i.showModal(ticketModal('mhc:job:send', 'Заявка на работу', 'Желаемая должность'));
      if (i.isModalSubmit() && i.customId === 'mhc:ticket:send') return await openTicket(i, i.fields.getTextInputValue('topic'));
      if (i.isModalSubmit() && i.customId === 'mhc:job:send') return await openTicket(i, 'Трудоустройство: ' + i.fields.getTextInputValue('topic'));
    } catch (e) {
      console.error('Discord interaction:', e.message);
      return say(i, e.message || 'Не получилось. Попробуйте ещё раз.').catch(() => {});
    }
  };
}
