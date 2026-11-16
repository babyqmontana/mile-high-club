import { Client, GatewayIntentBits, Events, Options, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } from 'discord.js';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlueprint, allTiers, DIRECTOR_ROLE } from './discord/layout.js';
import { planSetup, snapshotGuild, snapshotRoles, applyPlan, planCleanup } from './discord/plan.js';
import { helpdeskBoard, postPayload, eventAnnouncement, ticketOpened, archiveCard, transcriptHtml, feedCard } from './discord/embeds.js';
import { applyProfile } from './discord/profile.js';
import { buildCommands, createInteractions } from './discord/commands.js';

// Discord-бот обслуживает сайт: вход и роли, тикеты, уведомления персоналу, посты из панели, события сервера → сайт.
const EVENT_STATUS = { 1: 'scheduled', 2: 'active', 3: 'completed', 4: 'cancelled' };
const FEED = 'staffTickets';
const money = n => '$' + Number(n || 0).toLocaleString('ru-RU');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function startBot({ core, store, env, hooks }) {
  if (!env.DISCORD_BOT_TOKEN || !env.GUILD_ID) return null;
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildScheduledEvents, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] , 
    // Кэш discord.js по умолчанию хранит всё подряд. Боту нужны роли, каналы и участники для проверки прав,
    // а сообщения, реакции, эмодзи, голосовые состояния и прочее — нет: держим минимум и регулярно чистим.
    // по умолчанию бот никого не упоминает массово: текст гостя с @everyone или @роль не разбудит сервер
    allowedMentions: { parse: ['users'], repliedUser: false },
    makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 25, ReactionManager: 0, ReactionUserManager: 0, PresenceManager: 0, VoiceStateManager: 0,
      GuildEmojiManager: 0, GuildStickerManager: 0, GuildInviteManager: 0, GuildBanManager: 0, StageInstanceManager: 0, ThreadMemberManager: 0, AutoModerationRuleManager: 0, ApplicationCommandManager: 0 }),
    sweepers: { ...Options.DefaultSweeperSettings,
      messages: { interval: 900, lifetime: 1800 },
      users: { interval: 3600, filter: () => u => u.id !== u.client.user.id },
      guildMembers: { interval: 3600, filter: () => m => m.id !== m.client.user.id } } });
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
  const known = list => list.filter(id => guild.roles.cache.has(id));
  const tiers = () => ({ admin: known(listIds(S().adminRoles, env.ADMIN_ROLE_IDS)), director: known(listIds(S().directorRoles)), staff: known(listIds(S().modRoles, env.MOD_ROLE_IDS)), dev: known(S().devRoles?.length ? S().devRoles : guild.roles.cache.filter(r => r.name === 'Dev').map(r => r.id)) });
  const staffIds = () => allTiers(tiers());
  const staffOverwrites = () => [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, ...staffIds().map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))];
  const links = list => { const b = list.filter(([, url]) => url).map(([label, url]) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url)); return b.length ? [new ActionRowBuilder().addComponents(b)] : []; };
  const send = async (key, payload) => { const c = await channel(key); return c ? c.send(payload).catch(e => { console.error('Discord send:', e.message); return null; }) : null; };

  hooks.status = () => ({ connected: !!guild, guild: guild?.name || null, members: guild?.memberCount || 0, bot: client.user?.tag || null });
  // «Гостей в отеле»: сколько участников сервера сейчас в сети. Discord отдаёт это число вместе с данными сервера (with_counts),
  // без привилегированного интента присутствия. Обновляем раз в минуту, сайту сообщаем только при изменении.
  let guests = null;
  const pollGuests = async () => {
    const g = guild && await client.guilds.fetch({ guild: guild.id, withCounts: true, force: true }).catch(() => null); if (!g) return;
    const next = { online: g.approximatePresenceCount ?? 0, total: g.approximateMemberCount ?? guild.memberCount ?? 0, at: Date.now() };
    const moved = !guests || next.online !== guests.online || next.total !== guests.total; guests = next; if (moved) hooks.changed?.(['guests']);
  };
  hooks.guests = () => guests;

  hooks.resolveRole = async userId => {
    if (userId === guild.ownerId) return 'admin';
    const m = await guild.members.fetch(userId).catch(() => null); if (!m) return 'guest';
    const t = tiers(), has = list => list.some(id => m.roles.cache.has(id));
    return has(t.admin) ? 'admin' : has(t.director) || has(t.staff) ? 'mod' : 'guest';
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
    t.discordId = m.id; // сообщения из канала разделяются на гостя и персонал по этому id
    const ch = await guild.channels.create({ name: `🎫・${(m.user.username || 'гость').slice(0, 20)}-${t.id.slice(-4)}`, type: ChannelType.GuildText, parent: cat?.id, permissionOverwrites: [...staffOverwrites(), { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }, { id: m.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }] });
    await ch.send(ticketOpened(t, m.id));
    return ch.id;
  };

  async function allMessages(c) {
    const out = []; let before;
    for (let n = 0; n < 20; n++) { const page = await c.messages.fetch({ limit: 100, before }); if (!page.size) break; out.push(...page.values()); before = page.last().id; if (page.size < 100) break; }
    return out.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  }
  const textOf = m => [m.content, ...m.embeds.map(e => [e.title, e.description].filter(Boolean).join(': '))].filter(Boolean).join('\n');
  const fromSite = m => m.author.id === client.user.id && /^\*\*(.+?)\*\* \(с сайта\): ([\s\S]*)$/.exec(m.content);
  const authorKind = (t, m) => (fromSite(m) ? 'staff' : m.author.bot ? 'bot' : m.author.id === t.discordId ? 'guest' : 'staff');
  // Закрытие: сначала архив, потом удаление канала. Не сохранился транскрипт — канал остаётся.
  hooks.closeTicketChannel = async (t, by) => {
    const c = await guild.channels.fetch(t.channel).catch(() => null); if (!c) return [];
    const log = (await allMessages(c)).filter(m => !m.system).map(m => ({ from: authorKind(t, m), by: fromSite(m)?.[1] || m.member?.displayName || m.author.username, text: fromSite(m)?.[2] || textOf(m), files: [...m.attachments.values()].map(a => a.url), at: m.createdTimestamp }));
    const sent = await send('ticketArchive', { ...archiveCard(t, log, by, t.discordId), files: [{ attachment: Buffer.from(transcriptHtml(t, log, by), 'utf8'), name: `ticket-${t.id}.html` }] });
    if (!sent) throw new Error('не удалось сохранить транскрипт');
    const m = t.discordId && await guild.members.fetch(t.discordId).catch(() => null);
    if (m) m.send(`Ваше обращение «${t.topic}» закрыто. Если вопрос остался, откройте новое.`).catch(() => {});
    await c.delete(`Обращение закрыл ${by}`);
    return log;
  };
  // ответ из панели сайта уходит в тикет-канал
  hooks.ticketReply = async (t, text, by) => { const c = await guild.channels.fetch(t.channel).catch(() => null); if (!c) throw new Error('канал тикета не найден'); await c.send({ content: `**${by}** (с сайта): ${text}`, allowedMentions: { parse: [] } }); };
  // канал → открытый тикет; пересобирается, только когда тикеты менялись
  let tIdx = null, tRev = -1;
  const ticketByChannel = ch => { const r = store.rev ? store.rev(['tickets']) : NaN; if (!tIdx || r !== tRev) { tIdx = new Map(store.all('tickets').filter(x => x.channel && x.status !== 'closed').map(x => [x.channel, x])); tRev = r; } return tIdx.get(ch) || null; };
  client.on(Events.MessageCreate, m => {
    if (m.guildId !== env.GUILD_ID || m.author.bot || m.system) return;
    const t = ticketByChannel(m.channelId);
    if (t) core.ticketMessage(t.id, { from: authorKind(t, m), by: m.member?.displayName || m.author.username, text: textOf(m) || 'вложение', at: m.createdTimestamp });
  });

  // уведомления персоналу: одна лента. Гость на сервере — кликабельный профиль, иначе только имя
  const who = async d => { const m = await findMember(d.discord, d.discordId); return m ? { text: `<@${m.id}> · ${m.user.username}`, url: `https://discord.com/users/${m.id}` } : { text: `${d.discord || '—'} · нет на сервере`, url: null }; };
  const panel = site ? site + '/#admin' : null;
  // Лента без спама: одна карточка на заявку. Новые сообщения и смена статуса правят её, а не пишут заново.
  async function writeCard(key, kind, d) {
    const c = await channel(FEED); if (!c) return;
    const w = await who(d), card = feedCard(kind, d, w.text);
    const payload = { ...card.message, components: card.done ? [] : links([['Открыть в панели', panel], ['Профиль в Discord', w.url]]), allowedMentions: { parse: [] } };
    const rec = store.get('feedcards', key), old = rec && await c.messages.fetch(rec.message).catch(() => null);
    if (old) { await old.edit(payload); return; }
    const m = await c.send(payload);
    store.put('feedcards', key, { id: key, message: m.id });
  }
  // серия сообщений подряд даёт одну правку
  const cardQueue = new Map();
  const card = (key, kind, d) => { clearTimeout(cardQueue.get(key)); cardQueue.set(key, setTimeout(() => { cardQueue.delete(key); writeCard(key, kind, d).catch(e => console.error('Discord feed:', e.message)); }, 1500)); };
  hooks.notify = async (kind, d) => {
    if (kind === 'booking' || kind === 'booking_status') card('b:' + d.id, 'booking', d);
    if (kind === 'order' || kind === 'order_status') card('o:' + d.id, 'order', d);
    if (kind.startsWith('ticket')) card('t:' + d.id, 'ticket', d);
    if (kind === 'booking_status') {
      const text = { confirmed: `Бронь ${d.code} подтверждена. Ваш номер ${d.room}, заезд ${d.date}.`, cancelled: `Бронь ${d.code} отменена. Если это ошибка, напишите управляющим.`, checkedin: `Добро пожаловать в Mile High Club! Номер ${d.room}.`, done: `Спасибо, что остановились у нас. Ждём снова.` }[d.status];
      const m = await findMember(d.discord, d.discordId); if (m && text) m.send(text).catch(() => {});
    }
    if (kind === 'order_status' && d.status === 'delivering') { const m = await findMember(d.discord); if (m) m.send(`Ваш заказ уже несут в номер ${d.room}.`).catch(() => {}); }
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
    await guild.channels.fetch().catch(e => console.error('Discord channels:', e.message)); await guild.roles.fetch().catch(() => {});
    const me = await guild.members.fetchMe();
    // показываем все текстовые каналы, которые бот видит; где писать через вебхук нельзя — помечаем причиной, а не прячем
    const list = [...guild.channels.cache.values()].filter(c => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) && c.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel)).sort((a, b) => (a.parent?.position ?? -1) - (b.parent?.position ?? -1) || a.position - b.position);
    return {
      channels: list.map(c => ({ id: c.id, name: c.name, parent: c.parent?.name || '', canPost: c.permissionsFor(me).has(PermissionFlagsBits.ManageWebhooks) })),
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
    return planSetup(buildBlueprint(), snapshotGuild(guild, savedState(), client.user.id, tiers()));
  };
  // роль директоров создаётся один раз. Дальше её можно заменить в панели
  async function ensureDirector() {
    if (S().directorRoles?.length) return;
    await guild.roles.fetch();
    const r = guild.roles.cache.find(x => x.name === DIRECTOR_ROLE.name) || await guild.roles.create({ ...DIRECTOR_ROLE, reason: 'Mile High Club: уровень доступа' });
    save({ directorRoles: [r.id] });
  }
  hooks.planGuild = async () => { await ensureDirector(); const p = await plan(); return { summary: p.summary, lines: p.lines }; };
  hooks.setupGuild = async () => {
    await ensureDirector();
    const p = await plan();
    const r = await applyPlan(guild, p, { everyoneId: guild.roles.everyone.id, botId: client.user.id, tiers: tiers() });
    save({ channels: { ...(S().channels || {}), ...r.channels }, staffRolesApplied: staffIds() });
    await publishHelpdesk();
    return { made: r.made, updated: r.updated, skipped: r.skipped };
  };

  // лишнее от прошлой схемы: показываем список, удаляем только по кнопке администратора
  let membersAt = 0;
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
    // роль, выданную людям, не трогаем: значит, ей пользуются
    // Discord не отвечает на частые запросы всех участников: второй подряд берёт уже загруженных. Нет списка — роли не трогаем
    const fresh = Date.now() - membersAt < 5 * 60e3, members = fresh ? guild.members.cache : await guild.members.fetch({ time: 60e3 }).catch(() => null);
    if (members && !fresh) membersAt = Date.now();
    const inUse = snap.roles.filter(r => !members || members.some(m => !m.user.bot && m.roles.cache.has(r.id))).map(r => r.id);
    return planCleanup(bp, saved, snap, occupied, [...staffIds(), ...inUse]);
  }
  // Следы проверок: сообщения бота с пометкой 🧪, история тестового канала и старые сообщения ленты. Живые карточки остаются.
  hooks.clearTestTraces = async () => {
    await guild.channels.fetch(); let removed = 0;
    const lab = S().channels?.testLab, feedId = S().channels?.[FEED], live = new Set(store.all('feedcards').map(c => c.message));
    const isTest = m => (m.author.id === client.user.id || m.webhookId) && (m.channelId === lab || (m.channelId === feedId && !live.has(m.id)) || [m.content, ...m.embeds.map(e => e.title)].some(x => x?.includes('🧪')));
    for (const c of guild.channels.cache.values()) {
      if (!c.isTextBased?.() || c.isThread() || c.type === ChannelType.GuildVoice) continue;
      const list = await c.messages.fetch({ limit: 100 }).catch(() => null);
      for (const m of list?.values() ?? []) if (isTest(m) && await m.delete().then(() => true).catch(() => false)) removed++;
    }
    return removed;
  };
  hooks.applyProfile = () => applyProfile({ guild, client, root: ROOT });
  hooks.planCleanup = async () => { const c = await cleanup(); return { channels: c.channels.map(x => x.name), categories: c.categories.map(x => x.name), roles: c.roles.map(x => x.name), kept: c.kept.map(x => x.name) }; };
  hooks.cleanupGuild = async () => {
    const c = await cleanup(), reason = 'Mile High Club: лишнее от прошлой схемы', channels = { ...(S().channels || {}) }, roles = { ...(S().roleIds || {}) };
    for (const x of [...c.channels, ...c.categories]) { await guild.channels.cache.get(x.id)?.delete(reason); delete channels[x.key]; }
    for (const x of c.roles) { await guild.roles.cache.get(x.id)?.delete(reason); delete roles[x.key]; }
    save({ channels, roleIds: roles });
    return { channels: c.channels.length, categories: c.categories.length, roles: c.roles.length, kept: c.kept.length };
  };

  // функции берём сразу, а не через общий объект hooks: его может изменить сервер, а кнопки должны работать всегда
  const resolveRole = hooks.resolveRole;
  const interact = createInteractions({ core, resolveRole });
  client.on(Events.InteractionCreate, i => { if (i.guildId === env.GUILD_ID) interact(i); });

  // Если бот не смог подключиться к серверу, клиент гасим: иначе он продолжал бы принимать нажатия кнопок,
  // а сайт уже считал бы его выключенным и убрал его функции («hooks.resolveRole is not a function»).
  try {
    await new Promise((resolve, reject) => { client.once(Events.ClientReady, resolve); client.login(env.DISCORD_BOT_TOKEN).catch(reject); });
    guild = await client.guilds.fetch(env.GUILD_ID);
  } catch (e) { guild = null; try { await client.destroy(); } catch { } throw e; }
  await guild.roles.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});
  console.log(`Discord: бот ${client.user.tag} подключён к «${guild.name}»`);
  hooks.syncEvents().catch(e => console.error('events sync:', e.message));
  // события приходят от Discord сразу; опрос — лишь страховка от пропущенных, поэтому раз в 15 минут
  const syncEvents = hooks.syncEvents;
  setInterval(() => syncEvents().catch(() => {}), 15 * 60e3).unref();
  pollGuests(); setInterval(() => pollGuests().catch(() => {}), 60e3).unref();
  // заявки, которые не дошли, пока бот был выключен (необязательный шаг: его сбой не выключает подключённого бота)
  for (const t of store.all('tickets').filter(x => x.status === 'open' && x.mode === 'discord' && !x.channel)) {
    const channelId = await hooks.createTicketChannel(t).catch(e => { console.error('Discord ticket:', e.message); return null; });
    if (channelId) { const doc = { ...t, channel: channelId }; store.put('tickets', t.id, doc); hooks.notify('ticket_update', doc).catch(() => {}); }
  }
  await guild.commands.set(buildCommands()).catch(e => console.error('Discord commands:', e.message));
  try { client.user.setActivity(site && /^https:/.test(site) ? site.replace(/^https:\/\//, '') : 'Отель над Лос-Сантосом', { type: ActivityType.Watching }); } catch (e) { console.error('Discord activity:', e.message); }
  return client;
}
