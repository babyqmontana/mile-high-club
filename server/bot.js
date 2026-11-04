import { Client, GatewayIntentBits, Events, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } from 'discord.js';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlueprint, PERSONAS, SITE_ROLES } from './discord/layout.js';
import { planSetup, snapshotGuild, applyPlan } from './discord/plan.js';
import { BOARDS } from './discord/embeds.js';
import { buildCommands, createInteractions } from './discord/commands.js';
import { venueState } from '../public/js/core.js';

// Discord-бот: события сервера → сайт, уведомления персоналу, тикеты, проверка ролей, живые карточки, персоны, слэш-команды.
const PINK = 0xF0177A, GOLD = 0xF7B50A, TEAL = 0x3FD3C6;
const EVENT_STATUS = { 1: 'scheduled', 2: 'active', 3: 'completed', 4: 'cancelled' };
const money = n => '$' + Number(n || 0).toLocaleString('ru-RU');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AVATARS = path.join(ROOT, 'public', 'img', 'discord');
const EMBLEM = path.join(ROOT, 'brand', 'emblem-dark.png');

export async function startBot({ core, store, env, hooks }) {
  if (!env.DISCORD_BOT_TOKEN || !env.GUILD_ID) return null;
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildScheduledEvents] });
  let guild = null;
  const site = (env.PUBLIC_URL || '').replace(/\/$/, '');
  const S = () => core.settings();
  const blueprint = () => buildBlueprint({ depts: core.publicData().depts });
  const save = patch => store.put('settings', 'main', { ...S(), ...patch });
  const channel = async key => {
    const id = S().channels?.[key];
    if (id) { const c = await guild.channels.fetch(id).catch(() => null); if (c) return c; }
    const spec = blueprint().channels.find(c => c.key === key); if (!spec) return null;
    return guild.channels.cache.find(c => c.type === ChannelType.GuildText && [spec.name, ...spec.legacy].includes(c.name)) || null;
  };
  const roleIds = () => { const r = S().roleIds || {}, ids = (keys, extra) => [...keys.map(k => r[k]), ...(extra || '').split(',')].map(s => (s || '').trim()).filter(Boolean); return { admin: ids(SITE_ROLES.admin, env.ADMIN_ROLE_IDS), mod: ids(SITE_ROLES.mod, env.MOD_ROLE_IDS) }; };
  const staffOverwrites = () => { const ids = [...roleIds().admin, ...roleIds().mod]; return [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, ...ids.filter(id => guild.roles.cache.has(id)).map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))]; };
  const siteRow = (label = 'Открыть сайт', hash = '') => site ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(site + '/' + (hash ? '#' + hash : '')))] : [];
  // персона: вебхук канала со своим именем и аватаркой. Нет прав на вебхуки — пишет сам бот.
  const hookCache = new Map();
  async function personaHook(c, persona) {
    const k = c.id + ':' + persona; if (hookCache.has(k)) return hookCache.get(k);
    const name = PERSONAS[persona], list = await c.fetchWebhooks();
    const h = list.find(w => w.name === name && w.owner?.id === client.user.id) || await c.createWebhook({ name, avatar: path.join(AVATARS, persona + '.png'), reason: 'Mile High Club: персона' });
    hookCache.set(k, h); return h;
  }
  const send = async (key, payload, persona) => {
    const c = await channel(key); if (!c) return null;
    const hook = persona && await personaHook(c, persona).catch(e => { console.error('Discord persona:', e.message); return null; });
    return (hook ? hook.send(payload) : c.send(payload)).catch(e => { console.error('Discord send:', e.message); return null; });
  };

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
      await send('staffBookings', { embeds: [new EmbedBuilder().setColor(PINK).setTitle(`Новая бронь ${d.code}`).addFields({ name: 'Номер', value: d.typeName + (d.preferredRoom ? ` (просит ${d.preferredRoom})` : ''), inline: true }, { name: 'Заезд', value: `${d.date}, ${d.nights} ноч.`, inline: true }, { name: 'Гостей', value: String(d.guests), inline: true }, { name: 'Гость', value: d.name, inline: true }, { name: 'Discord', value: d.discord, inline: true }, { name: 'Сумма', value: money(d.total), inline: true }, ...(d.note ? [{ name: 'Пожелания', value: d.note.slice(0, 1000) }] : [])).setTimestamp()], components: siteRow('Открыть в панели', 'admin') }, 'reception');
    }
    if (kind === 'booking_status') {
      const text = { confirmed: `Бронь ${d.code} подтверждена. Ваш номер ${d.room}, заезд ${d.date}.`, cancelled: `Бронь ${d.code} отменена. Если это ошибка, напишите управляющим.`, checkedin: `Добро пожаловать в Mile High Club! Номер ${d.room}.`, done: `Спасибо, что остановились у нас. Ждём снова.` }[d.status];
      const m = await findMember(d.discord, d.discordId); if (m && text) m.send(text).catch(() => {});
      const resident = S().roleIds?.resident; // постоялец: роль живёт ровно столько, сколько гость в отеле
      if (m && resident) { if (d.status === 'checkedin') m.roles.add(resident).catch(() => {}); if (['done', 'cancelled'].includes(d.status)) m.roles.remove(resident).catch(() => {}); }
      await send('staffBookings', { content: `Бронь **${d.code}** → ${{ confirmed: 'подтверждена', cancelled: 'отменена', checkedin: 'заселение', done: 'выезд' }[d.status] || d.status}${d.room ? `, номер ${d.room}` : ''} (${d.handledBy || 'персонал'})` }, 'reception');
    }
    if (kind === 'order') await send('staffOrders', { embeds: [new EmbedBuilder().setColor(GOLD).setTitle(`Заказ в номер ${d.room}`).setDescription(d.items.map(i => `${i.name} × ${i.qty}`).join('\n')).addFields({ name: 'Сумма', value: money(d.total), inline: true }, { name: 'Гость', value: d.name || '—', inline: true }, { name: 'Discord', value: d.discord || '—', inline: true }).setTimestamp()] }, 'ciel');
    if (kind === 'order_status' && d.status === 'delivering') { const m = await findMember(d.discord); if (m) m.send(`Ваш заказ уже несут в номер ${d.room}.`).catch(() => {}); }
    if (kind === 'ticket_site') await send('staffTickets', { embeds: [new EmbedBuilder().setColor(TEAL).setTitle('Новое обращение на сайте').setDescription(d.text.slice(0, 3900)).addFields({ name: 'Тема', value: d.topic, inline: true }, { name: 'Discord', value: d.discord, inline: true })], components: siteRow('Ответить в панели', 'admin') }, 'concierge');
    if (kind === 'ticket_discord') await send('staffTickets', { content: `Открыт тикет для **${d.discord}**: ${d.topic}${d.channel ? ` → <#${d.channel}>` : ' (пользователь не найден на сервере)'}` });
    if (kind === 'ticket_message') await send('staffTickets', { content: `Новое сообщение от **${d.discord}** в чате на сайте: «${d.messages.at(-1)?.text.slice(0, 300)}»` });
  };

  hooks.post = async (key, text, by) => !!(await send(key, { embeds: [new EmbedBuilder().setColor(PINK).setDescription(text).setFooter({ text: `Mile High Club · ${by}` })], components: siteRow() }, 'concierge'));

  // живые карточки: одно сообщение на канал, правится только при изменении данных
  const saveBoard = (key, rec) => save({ boards: { ...(S().boards || {}), [key]: rec } });
  async function publishBoard(key) {
    const [persona, build] = BOARDS[key], payload = build(core.publicData(), site);
    const hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex'), rec = S().boards?.[key];
    if (rec?.hash === hash) return false;
    const c = await channel(key); if (!c) return false;
    const hook = await personaHook(c, persona).catch(() => null);
    if (rec?.id) {
      try { if (rec.via === 'hook' && hook) await hook.editMessage(rec.id, payload); else await (await c.messages.fetch(rec.id)).edit(payload); saveBoard(key, { ...rec, hash }); return true; }
      catch { /* сообщение удалили: отправим заново */ }
    }
    const m = await (hook ? hook.send(payload) : c.send(payload));
    saveBoard(key, { id: m.id, via: hook ? 'hook' : 'bot', hash }); return true;
  }
  async function refreshBoards(keys = Object.keys(BOARDS)) { let n = 0; for (const k of keys) { try { if (await publishBoard(k)) n++; } catch (e) { console.error(`Discord board ${k}:`, e.message); } } return n; }
  const BOARD_COLS = { rooms: ['rooms'], types: ['rooms'], venues: ['venues'], events: ['venues', 'events'], menu: ['menu'], cigars: ['cigars'], offers: ['offers'], issues: ['journal'], team: ['team'], depts: ['team'], faq: ['faq'], settings: ['about'] };
  let dirty = new Set(), boardT = null;
  const touch = keys => { keys.forEach(k => dirty.add(k)); clearTimeout(boardT); boardT = setTimeout(() => { const list = [...dirty]; dirty = new Set(); refreshBoards(list); }, 2500); };
  hooks.roomsChanged = () => touch(['rooms']);
  const changed = hooks.changed; // сайт сообщает, какие коллекции поменялись
  hooks.changed = cols => { changed?.(cols); if (guild) touch(cols.flatMap(c => BOARD_COLS[c] || [])); if (guild && cols.includes('log')) flushAudit(); };

  // журнал действий персонала → канал руководства
  let auditT = null;
  function flushAudit() {
    clearTimeout(auditT);
    auditT = setTimeout(async () => {
      const since = S().auditAt || Date.now(), fresh = store.all('log').filter(l => l.at > since && l.by).sort((a, b) => a.at - b.at).slice(0, 10);
      if (!fresh.length) return;
      save({ auditAt: fresh.at(-1).at });
      await send('auditLog', { content: fresh.map(l => `**${l.by}** ${l.text}`).join('\n').slice(0, 1900), allowedMentions: { parse: [] } }, 'security');
    }, 4000);
  }

  // статус бота: свободные номера, что открыто, подсказка
  let statusN = 0;
  function rotateStatus() {
    const sum = core.freeSummary(), d = core.publicData(), open = d.venues.filter(v => ['open', 'live', 'event'].includes(venueState(v, d.events).state));
    const list = [`Свободно ${sum.free} из ${sum.total}`, open.length ? `Открыто: ${open.slice(0, 3).map(v => v.name).join(', ')}` : 'Отель над Лос-Сантосом', 'Команды: /номера /бронь /меню'];
    client.user?.setActivity(list[statusN++ % list.length], { type: ActivityType.Watching });
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

  // структура сервера: сначала план, потом выполнение. Ничего не удаляется.
  const plan = async () => {
    await guild.roles.fetch(); await guild.channels.fetch();
    const s = S(), bp = blueprint();
    return { bp, plan: planSetup(bp, snapshotGuild(guild, { roleIds: s.roleIds || {}, channels: s.channels || {} }, client.user.id)) };
  };
  hooks.planGuild = async () => { const { plan: p } = await plan(); return { summary: p.summary, lines: p.lines }; };
  hooks.setupGuild = async ({ branding = false } = {}) => {
    const { bp, plan: p } = await plan();
    const r = await applyPlan(guild, p, bp, { everyoneId: guild.roles.everyone.id, botId: client.user.id });
    save({ roleIds: { ...(S().roleIds || {}), ...r.roleIds }, channels: { ...(S().channels || {}), ...r.channels } });
    if (branding) {
      await guild.setIcon(EMBLEM, 'Mile High Club: иконка сервера').catch(e => console.error('Discord icon:', e.message));
      await client.user.setAvatar(EMBLEM).catch(e => console.error('Discord avatar:', e.message));
    }
    await refreshBoards();
    return { made: r.made, updated: r.updated, channels: Object.keys(r.channels).length, roles: Object.keys(r.roleIds).length };
  };

  const interact = createInteractions({ core, store, site, resolveRole: id => hooks.resolveRole(id), roleId: k => S().roleIds?.[k], post: send });
  client.on(Events.InteractionCreate, i => { if (i.guildId === env.GUILD_ID) interact(i); });

  await new Promise((resolve, reject) => { client.once(Events.ClientReady, resolve); client.login(env.DISCORD_BOT_TOKEN).catch(reject); });
  guild = await client.guilds.fetch(env.GUILD_ID);
  if (!S().auditAt) save({ auditAt: Date.now() });
  await guild.roles.fetch().catch(() => {});
  console.log(`Discord: бот ${client.user.tag} подключён к «${guild.name}»`);
  hooks.syncEvents().catch(e => console.error('events sync:', e.message));
  setInterval(() => hooks.syncEvents().catch(() => {}), 5 * 60e3);
  await guild.commands.set(buildCommands(core.publicData().types)).catch(e => console.error('Discord commands:', e.message));
  refreshBoards().catch(() => {});
  setInterval(() => refreshBoards(['venues', 'events']).catch(() => {}), 5 * 60e3);
  rotateStatus(); setInterval(rotateStatus, 60e3);
  return client;
}
