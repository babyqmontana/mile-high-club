import { Client, GatewayIntentBits, Events, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Discord-бот: события сервера → сайт, уведомления персоналу, тикеты, проверка ролей, счётчик свободных номеров.
const PINK = 0xff2e88, GOLD = 0xffb400, TEAL = 0x3fd3c6;
const EVENT_STATUS = { 1: 'scheduled', 2: 'active', 3: 'completed', 4: 'cancelled' };
const money = n => '$' + Number(n || 0).toLocaleString('ru-RU');

// Структура сервера, которую бот создаёт кнопкой «Развернуть структуру» в панели
const LAYOUT = {
  roles: [['admin', 'MHC Администратор', 0xff2e88, true], ['mod', 'MHC Модератор', 0xffb400, true], ['staff', 'MHC Персонал', 0x3fd3c6, true]],
  categories: [['catMain', 'MILE HIGH CLUB', 'public'], ['catStaff', 'СТАФФ', 'staff'], ['catTickets', 'ТИКЕТЫ', 'staff']],
  channels: [
    ['main', 'главная', 'catMain', 'readonly', 'Сайт отеля и всё главное'], ['announcements', 'анонсы', 'catMain', 'readonly', 'Анонсы и события'],
    ['rooms', 'свободные-номера', 'catMain', 'readonly', 'Бот обновляет свободные номера в реальном времени'], ['journal', 'журнал', 'catMain', 'readonly', 'Новые выпуски Mile High Journal'],
    ['chat', 'общение', 'catMain', 'public', 'Общий чат'],
    ['staffBookings', 'брони', 'catStaff', 'staff', 'Новые брони с сайта'], ['staffOrders', 'заказы', 'catStaff', 'staff', 'Заказы в номер'],
    ['staffTickets', 'обращения', 'catStaff', 'staff', 'Заявки и чаты с сайта'], ['staffGeneral', 'стафф-общий', 'catStaff', 'staff', 'Общение персонала']]
};
export const CHANNEL_LABELS = Object.fromEntries(LAYOUT.channels.map(c => [c[0], '#' + c[1]]));

export async function startBot({ core, store, env, hooks }) {
  if (!env.DISCORD_BOT_TOKEN || !env.GUILD_ID) return null;
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildScheduledEvents] });
  let guild = null;
  const site = (env.PUBLIC_URL || '').replace(/\/$/, '');
  const S = () => core.settings();
  const save = patch => store.put('settings', 'main', { ...S(), ...patch });
  const channel = async key => {
    const id = S().channels?.[key];
    if (id) { const c = await guild.channels.fetch(id).catch(() => null); if (c) return c; }
    const name = (CHANNEL_LABELS[key] || key).replace(/^#/, '');
    return guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name) || null;
  };
  const roleIds = () => { const r = S().roleIds || {}; return { admin: [r.admin, ...(env.ADMIN_ROLE_IDS || '').split(',')].map(s => (s || '').trim()).filter(Boolean), mod: [r.mod, r.staff, ...(env.MOD_ROLE_IDS || '').split(',')].map(s => (s || '').trim()).filter(Boolean) }; };
  const staffOverwrites = () => { const ids = [...roleIds().admin, ...roleIds().mod]; return [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, ...ids.filter(id => guild.roles.cache.has(id)).map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))]; };
  const siteRow = (label = 'Открыть сайт', hash = '') => site ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(site + '/' + (hash ? '#' + hash : '')))] : [];
  const send = async (key, payload) => { const c = await channel(key); if (!c) return null; return c.send(payload).catch(e => { console.error('Discord send:', e.message); return null; }); };

  hooks.status = () => ({ connected: !!guild, guild: guild?.name || null, members: guild?.memberCount || 0, bot: client.user?.tag || null });

  hooks.resolveRole = async userId => {
    const m = await guild.members.fetch(userId).catch(() => null); if (!m) return 'guest';
    const ids = roleIds(), names = S().roles || {};
    const byName = n => n && m.roles.cache.some(r => r.name.toLowerCase().includes(String(n).toLowerCase()));
    if (m.permissions.has(PermissionFlagsBits.Administrator) || ids.admin.some(id => m.roles.cache.has(id)) || byName(names.admin)) return 'admin';
    if (ids.mod.some(id => m.roles.cache.has(id)) || byName(names.mod)) return 'mod';
    return 'guest';
  };

  async function findMember(name, id) {
    if (id) { const m = await guild.members.fetch(id).catch(() => null); if (m) return m; }
    const q = String(name || '').replace(/^@/, '').split('#')[0].trim(); if (!q) return null;
    const res = await guild.members.search({ query: q, limit: 10 }).catch(() => null);
    return res?.find(m => [m.user.username, m.user.globalName, m.nickname].filter(Boolean).some(x => x.toLowerCase() === q.toLowerCase())) || null;
  }
  hooks.checkMember = async (name, id) => !!(await findMember(name, id));

  hooks.createTicketChannel = async t => {
    const m = await findMember(t.discord, t.discordId); if (!m) return null;
    const cat = await channel('catTickets');
    const ch = await guild.channels.create({ name: `тикет-${(m.user.username || 'гость').slice(0, 20)}-${t.id.slice(-4)}`, type: ChannelType.GuildText, parent: cat?.id, permissionOverwrites: [...staffOverwrites(), { id: m.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }] });
    await ch.send({ content: `<@${m.id}>, управляющие скоро ответят.`, embeds: [new EmbedBuilder().setColor(PINK).setTitle(t.topic).setDescription(t.text.slice(0, 3900)).addFields({ name: 'Имя', value: t.name || '—', inline: true }, { name: 'Discord', value: t.discord, inline: true }).setFooter({ text: 'Заявка с сайта Mile High Club' })] });
    return ch.id;
  };

  hooks.notify = async (kind, d) => {
    if (kind === 'booking') {
      await send('staffBookings', { embeds: [new EmbedBuilder().setColor(PINK).setTitle(`Новая бронь ${d.code}`).addFields({ name: 'Номер', value: d.typeName + (d.preferredRoom ? ` (просит ${d.preferredRoom})` : ''), inline: true }, { name: 'Заезд', value: `${d.date}, ${d.nights} ноч.`, inline: true }, { name: 'Гостей', value: String(d.guests), inline: true }, { name: 'Гость', value: d.name, inline: true }, { name: 'Discord', value: d.discord, inline: true }, { name: 'Сумма', value: money(d.total), inline: true }, ...(d.note ? [{ name: 'Пожелания', value: d.note.slice(0, 1000) }] : [])).setTimestamp()], components: siteRow('Открыть в панели', 'admin') });
    }
    if (kind === 'booking_status') {
      const text = { confirmed: `Бронь ${d.code} подтверждена. Ваш номер ${d.room}, заезд ${d.date}.`, cancelled: `Бронь ${d.code} отменена. Если это ошибка, напишите управляющим.`, checkedin: `Добро пожаловать в Mile High Club! Номер ${d.room}.`, done: `Спасибо, что остановились у нас. Ждём снова.` }[d.status];
      const m = text && await findMember(d.discord, d.discordId); if (m) m.send(text).catch(() => {});
      await send('staffBookings', { content: `Бронь **${d.code}** → ${{ confirmed: 'подтверждена', cancelled: 'отменена', checkedin: 'заселение', done: 'выезд' }[d.status] || d.status}${d.room ? `, номер ${d.room}` : ''} (${d.handledBy || 'персонал'})` });
    }
    if (kind === 'order') await send('staffOrders', { embeds: [new EmbedBuilder().setColor(GOLD).setTitle(`Заказ в номер ${d.room}`).setDescription(d.items.map(i => `${i.name} × ${i.qty}`).join('\n')).addFields({ name: 'Сумма', value: money(d.total), inline: true }, { name: 'Гость', value: d.name || '—', inline: true }, { name: 'Discord', value: d.discord || '—', inline: true }).setTimestamp()] });
    if (kind === 'order_status' && d.status === 'delivering') { const m = await findMember(d.discord); if (m) m.send(`Ваш заказ уже несут в номер ${d.room}.`).catch(() => {}); }
    if (kind === 'ticket_site') await send('staffTickets', { embeds: [new EmbedBuilder().setColor(TEAL).setTitle('Новое обращение на сайте').setDescription(d.text.slice(0, 3900)).addFields({ name: 'Тема', value: d.topic, inline: true }, { name: 'Discord', value: d.discord, inline: true })], components: siteRow('Ответить в панели', 'admin') });
    if (kind === 'ticket_discord') await send('staffTickets', { content: `Открыт тикет для **${d.discord}**: ${d.topic}${d.channel ? ` → <#${d.channel}>` : ' (пользователь не найден на сервере)'}` });
    if (kind === 'ticket_message') await send('staffTickets', { content: `Новое сообщение от **${d.discord}** в чате на сайте: «${d.messages.at(-1)?.text.slice(0, 300)}»` });
  };

  hooks.post = async (key, text, by) => !!(await send(key, { embeds: [new EmbedBuilder().setColor(PINK).setDescription(text).setFooter({ text: `Mile High Club · ${by}` })], components: siteRow() }));

  // свободные номера: одно сообщение, бот его редактирует
  let roomsT = null;
  hooks.roomsChanged = sum => { clearTimeout(roomsT); roomsT = setTimeout(() => updateRooms(sum).catch(e => console.error('rooms msg:', e.message)), 2500); };
  async function updateRooms(sum = core.freeSummary()) {
    const c = await channel('rooms'); if (!c) return;
    const embed = new EmbedBuilder().setColor(sum.free ? TEAL : PINK).setTitle(`Свободно ${sum.free} из ${sum.total}`).setDescription(sum.byType.map(t => `**${t.name}** — ${t.free} из ${t.total}`).join('\n')).setFooter({ text: 'Обновляется автоматически' }).setTimestamp();
    const id = S().roomsMessageId; const msg = id && await c.messages.fetch(id).catch(() => null);
    if (msg) await msg.edit({ embeds: [embed], components: siteRow('Забронировать', 'stay') });
    else { const m = await c.send({ embeds: [embed], components: siteRow('Забронировать', 'stay') }); save({ roomsMessageId: m.id }); }
    client.user?.setActivity(`Свободно ${sum.free}/${sum.total}`, { type: 3 });
  }

  // события сервера → сайт
  const mapEvent = ev => ({ id: 'dc-' + ev.id, name: ev.name, desc: ev.description || '', start: ev.scheduledStartTimestamp, end: ev.scheduledEndTimestamp || null, location: ev.entityMetadata?.location || ev.channel?.name || '', image: ev.coverImageURL?.({ size: 1024 }) || '', status: EVENT_STATUS[ev.status] || 'scheduled', url: ev.url });
  hooks.syncEvents = async () => {
    const evs = await guild.scheduledEvents.fetch({ withUserCount: false });
    const seen = new Set(); for (const ev of evs.values()) { const d = mapEvent(ev); seen.add(d.id); core.upsertEvent(d); }
    store.all('events').filter(e => e.source === 'discord' && !seen.has(e.id)).forEach(e => core.removeEvent(e.id));
    return evs.size;
  };
  client.on(Events.GuildScheduledEventCreate, ev => ev.guildId === env.GUILD_ID && core.upsertEvent(mapEvent(ev)));
  client.on(Events.GuildScheduledEventUpdate, (o, ev) => ev.guildId === env.GUILD_ID && core.upsertEvent(mapEvent(ev)));
  client.on(Events.GuildScheduledEventDelete, ev => ev.guildId === env.GUILD_ID && core.removeEvent('dc-' + ev.id));

  // развернуть структуру сервера
  hooks.setupGuild = async () => {
    await guild.roles.fetch(); await guild.channels.fetch();
    const s = S(), roleIdsSaved = { ...(s.roleIds || {}) }, chans = { ...(s.channels || {}) }, made = [];
    for (const [key, name, color, hoist] of LAYOUT.roles) {
      let r = guild.roles.cache.get(roleIdsSaved[key]) || guild.roles.cache.find(x => x.name === name);
      if (!r) { r = await guild.roles.create({ name, color, hoist, mentionable: true, reason: 'Mile High Club: структура сервера' }); made.push('роль ' + name); }
      roleIdsSaved[key] = r.id;
    }
    save({ roleIds: roleIdsSaved });
    const staffIds = [roleIdsSaved.admin, roleIdsSaved.mod, roleIdsSaved.staff];
    const perms = mode => mode === 'public' ? [] : mode === 'readonly' ? [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] }, ...staffIds.map(id => ({ id, allow: [PermissionFlagsBits.SendMessages] }))] : [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, ...staffIds.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))];
    for (const [key, name, mode] of LAYOUT.categories) {
      let c = guild.channels.cache.get(chans[key]) || guild.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name === name);
      if (!c) { c = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: perms(mode) }); made.push('категория ' + name); }
      chans[key] = c.id;
    }
    for (const [key, name, parent, mode, topic] of LAYOUT.channels) {
      let c = guild.channels.cache.get(chans[key]) || guild.channels.cache.find(x => x.type === ChannelType.GuildText && x.name === name);
      if (!c) { c = await guild.channels.create({ name, type: ChannelType.GuildText, parent: chans[parent], topic, permissionOverwrites: perms(mode) }); made.push('#' + name); }
      chans[key] = c.id;
    }
    save({ channels: chans });
    if (made.includes('#главная')) await send('main', { embeds: [new EmbedBuilder().setColor(PINK).setTitle('Mile High Club').setDescription('Бронь номеров, меню Le Ciel, сигарный клуб, журнал и заявки — на сайте отеля. Здесь общаемся и следим за анонсами.')], components: siteRow() });
    await updateRooms();
    return { made, channels: Object.keys(chans).length, roles: Object.keys(roleIdsSaved).length };
  };

  await new Promise((resolve, reject) => { client.once(Events.ClientReady, resolve); client.login(env.DISCORD_BOT_TOKEN).catch(reject); });
  guild = await client.guilds.fetch(env.GUILD_ID);
  await guild.roles.fetch().catch(() => {});
  console.log(`Discord: бот ${client.user.tag} подключён к «${guild.name}»`);
  hooks.syncEvents().catch(e => console.error('events sync:', e.message));
  setInterval(() => hooks.syncEvents().catch(() => {}), 5 * 60e3);
  updateRooms().catch(() => {});
  return client;
}
