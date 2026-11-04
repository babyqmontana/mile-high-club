import { Client, GatewayIntentBits, Events, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } from 'discord.js';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlueprint } from './discord/layout.js';
import { planSetup, snapshotGuild, snapshotRoles, applyPlan, planCleanup } from './discord/plan.js';
import { helpdeskBoard, postPayload, eventAnnouncement } from './discord/embeds.js';
import { buildCommands, createInteractions } from './discord/commands.js';

// Discord-бот обслуживает сайт: вход и роли, тикеты, уведомления персоналу, посты из панели, события сервера → сайт.
const PINK = 0xF0177A, GOLD = 0xF7B50A, TEAL = 0x3FD3C6;
const EVENT_STATUS = { 1: 'scheduled', 2: 'active', 3: 'completed', 4: 'cancelled' };
const FEED = 'staffTickets';
const money = n => '$' + Number(n || 0).toLocaleString('ru-RU');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
    const bp = buildBlueprint(), spec = [...bp.categories, ...bp.channels].find(c => c.key === key); if (!spec) return null;
    return guild.channels.cache.find(c => c.type === spec.type && c.name === spec.name) || null;
  };
  // Права на сайте дают только роли, выбранные в панели (или в .env). Владелец сервера всегда админ: иначе роли некому выбрать.
  const listIds = (list, extra) => [...(list || []), ...(extra || '').split(',')].map(s => String(s).trim()).filter(Boolean);
  const roleIds = () => ({ admin: listIds(S().adminRoles, env.ADMIN_ROLE_IDS), mod: listIds(S().modRoles, env.MOD_ROLE_IDS) });
  const staffIds = () => { const r = roleIds(); return [...new Set([...r.admin, ...r.mod])].filter(id => guild.roles.cache.has(id)); };
  const staffOverwrites = () => [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, ...staffIds().map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))];
  const siteRow = (label = 'Открыть сайт', hash = '') => site ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(site + '/' + (hash ? '#' + hash : '')))] : [];
  const send = async (key, payload) => { const c = await channel(key); return c ? c.send(payload).catch(e => { console.error('Discord send:', e.message); return null; }) : null; };

  hooks.status = () => ({ connected: !!guild, guild: guild?.name || null, members: guild?.memberCount || 0, bot: client.user?.tag || null });

  hooks.resolveRole = async userId => {
    if (userId === guild.ownerId) return 'admin';
    const m = await guild.members.fetch(userId).catch(() => null); if (!m) return 'guest';
    const ids = roleIds(), has = list => list.some(id => m.roles.cache.has(id));
    return has(ids.admin) ? 'admin' : has(ids.mod) ? 'mod' : 'guest';
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
    const cat = await channel('catDesk');
    const ch = await guild.channels.create({ name: `🎫・${(m.user.username || 'гость').slice(0, 20)}-${t.id.slice(-4)}`, type: ChannelType.GuildText, parent: cat?.id, permissionOverwrites: [...staffOverwrites(), { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }, { id: m.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }] });
    await ch.send({ content: `<@${m.id}>, управляющие скоро ответят.`, embeds: [new EmbedBuilder().setColor(PINK).setTitle(t.topic).setDescription(t.text.slice(0, 3900)).addFields({ name: 'Имя', value: t.name || '—', inline: true }, { name: 'Discord', value: t.discord, inline: true }).setFooter({ text: 'Mile High Club' })] });
    return ch.id;
  };

  // уведомления персоналу: одна лента, подробности в панели сайта
  hooks.notify = async (kind, d) => {
    if (kind === 'booking') await send(FEED, { embeds: [new EmbedBuilder().setColor(PINK).setTitle(`🛏️ Новая бронь ${d.code}`).setDescription(`${d.typeName}, ${d.date}, ${d.nights} ноч. · ${d.name} (${d.discord}) · ${money(d.total)}`)], components: siteRow('Открыть в панели', 'admin') });
    if (kind === 'booking_status') {
      const text = { confirmed: `Бронь ${d.code} подтверждена. Ваш номер ${d.room}, заезд ${d.date}.`, cancelled: `Бронь ${d.code} отменена. Если это ошибка, напишите управляющим.`, checkedin: `Добро пожаловать в Mile High Club! Номер ${d.room}.`, done: `Спасибо, что остановились у нас. Ждём снова.` }[d.status];
      const m = await findMember(d.discord, d.discordId); if (m && text) m.send(text).catch(() => {});
    }
    if (kind === 'order') await send(FEED, { embeds: [new EmbedBuilder().setColor(GOLD).setTitle(`🍽️ Заказ в номер ${d.room}`).setDescription(`${d.items.map(i => `${i.name} × ${i.qty}`).join(', ')} · ${money(d.total)}`)], components: siteRow('Открыть в панели', 'admin') });
    if (kind === 'order_status' && d.status === 'delivering') { const m = await findMember(d.discord); if (m) m.send(`Ваш заказ уже несут в номер ${d.room}.`).catch(() => {}); }
    if (kind === 'ticket_site') await send(FEED, { embeds: [new EmbedBuilder().setColor(TEAL).setTitle('✉️ Новое обращение на сайте').setDescription(`**${d.topic}** · ${d.discord}\n${d.text.slice(0, 500)}`)], components: siteRow('Ответить в панели', 'admin') });
    if (kind === 'ticket_discord') await send(FEED, { content: `🎫 Тикет для **${d.discord}**: ${d.topic}${d.channel ? ` → <#${d.channel}>` : ' (пользователя нет на сервере)'}`, allowedMentions: { parse: [] } });
    if (kind === 'ticket_message') await send(FEED, { content: `💬 **${d.discord}** в чате на сайте: «${d.messages.at(-1)?.text.slice(0, 300)}»`, allowedMentions: { parse: [] } });
  };

  // посты с сайта: вебхук канала с именем и аватаркой отправителя из панели
  const hookCache = new Map();
  const avatarOf = a => { if (!a) return undefined; if (/^https?:/.test(a)) return a; const p = a.replace(/^\//, ''); return p.startsWith('uploads/') ? path.resolve(ROOT, env.DATA_DIR || 'data', p) : path.join(ROOT, 'public', p); };
  async function senderHook(c, sender) {
    const k = [c.id, sender.id, sender.name, sender.avatar].join(':'); if (hookCache.has(k)) return hookCache.get(k);
    const avatar = avatarOf(sender.avatar), reason = 'Mile High Club: отправитель из панели';
    let h = (await c.fetchWebhooks()).find(w => w.owner?.id === client.user.id && w.name === sender.name);
    if (!h) h = await c.createWebhook({ name: sender.name, avatar, reason });
    else if (avatar) await h.edit({ avatar, reason }).catch(e => console.error('Discord avatar:', e.message));
    hookCache.set(k, h); return h;
  }
  hooks.sendPost = async ({ channel: id, sender, post, messageId }) => {
    const c = await guild.channels.fetch(id).catch(() => null); if (!c) throw new Error('канал не найден');
    const hook = await senderHook(c, sender), payload = postPayload(post, site);
    if (messageId) { await hook.editMessage(messageId, payload); return { messageId, channelName: c.name }; }
    const m = await hook.send(payload);
    return { messageId: m.id, channelName: c.name };
  };

  // что показать в панели: куда можно писать и какие роли есть
  hooks.guildMeta = async () => {
    await guild.channels.fetch(); await guild.roles.fetch();
    const me = await guild.members.fetchMe(), need = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageWebhooks];
    const list = [...guild.channels.cache.values()].filter(c => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) && c.permissionsFor(me).has(need)).sort((a, b) => (a.parent?.position ?? -1) - (b.parent?.position ?? -1) || a.position - b.position);
    return {
      channels: list.map(c => ({ id: c.id, name: c.name, parent: c.parent?.name || '' })),
      roles: snapshotRoles(guild).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name, color: r.color ? '#' + r.color.toString(16).padStart(6, '0') : '' }))
    };
  };

  // панель обращений: одно сообщение, правится только при изменении
  async function publishHelpdesk() {
    const payload = helpdeskBoard(), hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex'), rec = S().helpdeskBoard;
    if (rec?.hash === hash) return;
    const c = await channel('helpdesk'); if (!c) return;
    if (rec?.id) { const m = await c.messages.fetch(rec.id).catch(() => null); if (m) { await m.edit(payload); save({ helpdeskBoard: { id: m.id, hash } }); return; } }
    const old = S().boards?.helpdesk; // карточка прошлой версии: её отправлял вебхук, им и удаляем
    if (old?.id) { const h = (await c.fetchWebhooks().catch(() => null))?.find(w => w.owner?.id === client.user.id); await h?.deleteMessage(old.id).catch(() => {}); }
    const m = await c.send(payload);
    save({ helpdeskBoard: { id: m.id, hash } });
  }

  // события сервера → сайт и анонс в канал
  const mapEvent = ev => ({ id: 'dc-' + ev.id, name: ev.name, desc: ev.description || '', start: ev.scheduledStartTimestamp, end: ev.scheduledEndTimestamp || null, location: ev.entityMetadata?.location || ev.channel?.name || '', image: ev.coverImageURL?.({ size: 1024 }) || '', status: EVENT_STATUS[ev.status] || 'scheduled', url: ev.url });
  const announceChannel = async () => {
    const id = S().announceChannel, c = id && await guild.channels.fetch(id).catch(() => null);
    return c || guild.channels.cache.find(x => x.type === ChannelType.GuildAnnouncement) || null;
  };
  async function announceNew() {
    const fresh = store.all('events').filter(e => e.source === 'discord' && !e.announced);
    const c = S().eventsAnnounceOn ? await announceChannel() : null;
    for (const e of fresh) {
      const due = c && e.status === 'scheduled' && e.start > Date.now();
      if (due) await c.send(eventAnnouncement(e, site)).catch(err => console.error('Discord announce:', err.message));
      store.put('events', e.id, { ...e, announced: true });
    }
    if (!S().eventsAnnounceOn) save({ eventsAnnounceOn: true }); // события, созданные до включения анонсов, не объявляем
  }
  hooks.syncEvents = async () => {
    const evs = await guild.scheduledEvents.fetch({ withUserCount: false });
    const seen = new Set(); for (const ev of evs.values()) { const d = mapEvent(ev); seen.add(d.id); core.upsertEvent(d); }
    store.all('events').filter(e => e.source === 'discord' && !seen.has(e.id)).forEach(e => core.removeEvent(e.id));
    await announceNew();
    return evs.size;
  };
  client.on(Events.GuildScheduledEventCreate, ev => { if (ev.guildId === env.GUILD_ID) { core.upsertEvent(mapEvent(ev)); announceNew().catch(e => console.error('Discord announce:', e.message)); } });
  client.on(Events.GuildScheduledEventUpdate, (o, ev) => ev.guildId === env.GUILD_ID && core.upsertEvent(mapEvent(ev)));
  client.on(Events.GuildScheduledEventDelete, ev => ev.guildId === env.GUILD_ID && core.removeEvent('dc-' + ev.id));

  // структура сервера: сначала план, потом выполнение
  const savedState = () => { const s = S(); return { roleIds: s.roleIds || {}, channels: s.channels || {}, staffRoles: s.staffRolesApplied || [] }; };
  const plan = async () => {
    await guild.roles.fetch(); await guild.channels.fetch();
    return planSetup(buildBlueprint(), snapshotGuild(guild, savedState(), client.user.id, staffIds()));
  };
  hooks.planGuild = async () => { const p = await plan(); return { summary: p.summary, lines: p.lines }; };
  hooks.setupGuild = async () => {
    const p = await plan();
    const r = await applyPlan(guild, p, { everyoneId: guild.roles.everyone.id, botId: client.user.id, staffIds: staffIds() });
    save({ channels: { ...(S().channels || {}), ...r.channels }, staffRolesApplied: staffIds() });
    await publishHelpdesk();
    return { made: r.made, updated: r.updated, skipped: r.skipped };
  };

  // лишнее от прошлой схемы: показываем список, удаляем только по кнопке администратора
  async function cleanup() {
    await guild.roles.fetch(); await guild.channels.fetch();
    const snap = { channels: snapshotGuild(guild, {}, client.user.id).channels, roles: snapshotRoles(guild) }, bp = buildBlueprint(), saved = savedState();
    const occupied = new Set();
    for (const { id } of planCleanup(bp, saved, snap).channels) {
      const c = guild.channels.cache.get(id);
      if (c.members?.size && c.type === ChannelType.GuildVoice) { occupied.add(id); continue; }
      if (!c.messages) continue;
      const list = await c.messages.fetch({ limit: 50 }).catch(() => null);
      if (!list || list.some(m => !m.author.bot && !m.webhookId && !m.system)) occupied.add(id);
    }
    return planCleanup(bp, saved, snap, occupied, [...roleIds().admin, ...roleIds().mod]);
  }
  hooks.planCleanup = async () => { const c = await cleanup(); return { channels: c.channels.map(x => x.name), categories: c.categories.map(x => x.name), roles: c.roles.map(x => x.name), kept: c.kept.map(x => x.name) }; };
  hooks.cleanupGuild = async () => {
    const c = await cleanup(), reason = 'Mile High Club: лишнее от прошлой схемы', channels = { ...(S().channels || {}) }, roles = { ...(S().roleIds || {}) };
    for (const x of [...c.channels, ...c.categories]) { await guild.channels.cache.get(x.id)?.delete(reason); delete channels[x.key]; }
    for (const x of c.roles) { await guild.roles.cache.get(x.id)?.delete(reason); delete roles[x.key]; }
    save({ channels, roleIds: roles });
    return { channels: c.channels.length, categories: c.categories.length, roles: c.roles.length, kept: c.kept.length };
  };

  const interact = createInteractions({ core, resolveRole: id => hooks.resolveRole(id) });
  client.on(Events.InteractionCreate, i => { if (i.guildId === env.GUILD_ID) interact(i); });

  await new Promise((resolve, reject) => { client.once(Events.ClientReady, resolve); client.login(env.DISCORD_BOT_TOKEN).catch(reject); });
  guild = await client.guilds.fetch(env.GUILD_ID);
  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});
  console.log(`Discord: бот ${client.user.tag} подключён к «${guild.name}»`);
  hooks.syncEvents().catch(e => console.error('events sync:', e.message));
  setInterval(() => hooks.syncEvents().catch(() => {}), 5 * 60e3);
  await guild.commands.set(buildCommands()).catch(e => console.error('Discord commands:', e.message));
  client.user.setActivity(site && /^https:/.test(site) ? site.replace(/^https:\/\//, '') : 'Отель над Лос-Сантосом', { type: ActivityType.Watching });
  return client;
}
