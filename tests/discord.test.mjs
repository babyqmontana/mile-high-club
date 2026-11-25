// Discord без сети: схема, план, очистка, посты с сайта, доступ и обращения на имитации сервера.
// Запуск: npm run test:discord
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlueprint, overwritesFor, TEXT, VOICE, CATEGORY, ANNOUNCEMENT } from '../server/discord/layout.js';
import { planSetup, snapshotGuild, applyPlan, planCleanup } from '../server/discord/plan.js';
import { helpdeskBoard, postPayload, eventAnnouncement, transcriptHtml, feedCard } from '../server/discord/embeds.js';
import { buildCommands, createInteractions } from '../server/discord/commands.js';
import { syncBoard } from '../server/discord/board.js';
import { createCore, seed, roomGameFloor, weatherNow } from '../public/js/core.js';

const EVERYONE = 'everyone', BOT = 'bot-user', STAFF = ['role-staff'], TIERS = { admin: ['role-admin'], director: ['role-dir'], staff: STAFF, dev: ['role-dev'] };

function memoryStore() {
  const data = {}, col = c => (data[c] ??= {});
  return { all: c => Object.values(col(c)).map(x => structuredClone(x)), get: (c, id) => (col(c)[id] ? structuredClone(col(c)[id]) : null), put: (c, id, d) => { col(c)[id] = structuredClone(d); }, del: (c, id) => { delete col(c)[id]; }, clear: c => { data[c] = {}; } };
}
function makeCore(hooks = {}) { const store = memoryStore(); seed(store); return { store, hooks, core: createCore(store, hooks) }; }

function fakeGuild() {
  let n = 1;
  const perms = list => ({ toArray: () => [...list] });
  const setOw = (ch, list) => { ch.permissionOverwrites = { cache: new Map((list || []).map(o => [o.id, { id: o.id, type: o.type, allow: perms(o.allow || []), deny: perms(o.deny || []) }])) }; };
  const channels = new Map(), log = { deleted: 0 };
  const makeChannel = o => {
    const ch = { id: 'id' + n++, name: o.name, type: o.type, parentId: o.parent ?? null, topic: o.topic ?? '' };
    setOw(ch, o.permissionOverwrites);
    ch.edit = async e => { if (e.name) ch.name = e.name; if (e.parent) ch.parentId = e.parent; if (e.topic) ch.topic = e.topic; if (e.permissionOverwrites) setOw(ch, e.permissionOverwrites); return ch; };
    channels.set(ch.id, ch); return ch;
  };
  return { log, roles: { everyone: { id: EVERYONE }, cache: new Map() }, channels: { cache: channels, create: async o => makeChannel(o), fetch: async id => channels.get(id) } };
}
const opts = { everyoneId: EVERYONE, botId: BOT, tiers: TIERS };
const plan = (g, saved = {}) => planSetup(buildBlueprint(), snapshotGuild(g, saved, BOT, TIERS));
const deploy = async (g, saved = {}) => { const p = plan(g, saved); return { plan: p, ...await applyPlan(g, p, opts) }; };
const byName = (g, name) => [...g.channels.cache.values()].find(c => c.name === name);
const ow = (ch, id) => { const o = ch.permissionOverwrites.cache.get(id); return { allow: o?.allow.toArray() ?? [], deny: o?.deny.toArray() ?? [] }; };

test('схема лёгкая: один голосовой, тестовый канал и архив на месте', () => {
  const bp = buildBlueprint();
  assert.equal(bp.categories.length, 4);
  assert.equal(bp.channels.length, 6);
  assert.equal(bp.channels.filter(c => c.type === VOICE).length, 1);
});

test('имена со значком и подходят Discord', () => {
  const bp = buildBlueprint();
  for (const c of [...bp.categories, ...bp.channels]) { assert.match(c.name, /\p{Extended_Pictographic}/u, c.name); assert.ok(c.name.length <= 100); }
  for (const r of bp.renames) assert.match(r.to, /\p{Extended_Pictographic}/u, r.to);
});

test('повторный запуск ничего не создаёт и не меняет', async () => {
  const g = fakeGuild(), first = await deploy(g);
  assert.equal(first.made.length, 10);
  const again = plan(g, { channels: first.channels });
  assert.deepEqual(again.lines, []);
});

test('без сохранённых id находит всё по именам', async () => {
  const g = fakeGuild(); await deploy(g);
  assert.equal(plan(g).summary.createChannels, 0);
});

test('панель обращений видна всем, писать может только бот', async () => {
  const g = fakeGuild(); await deploy(g);
  const c = byName(g, '🎫・написать-нам');
  assert.ok(ow(c, EVERYONE).allow.includes('ViewChannel'));
  assert.ok(ow(c, EVERYONE).deny.includes('SendMessages'));
  assert.ok(ow(c, BOT).allow.includes('SendMessages'));
});

test('ленту сайта видят только роли персонала и бот', async () => {
  const g = fakeGuild(); await deploy(g);
  const c = byName(g, '🛎️・лента-сайта');
  assert.ok(ow(c, EVERYONE).deny.includes('ViewChannel'));
  assert.ok(ow(c, STAFF[0]).allow.includes('ViewChannel'));
  assert.ok(ow(c, STAFF[0]).deny.includes('SendMessages'));
  assert.ok(ow(c, BOT).allow.includes('ViewChannel'));
});

test('смена ролей персонала убирает доступ у снятой роли', async () => {
  const g = fakeGuild(), first = await deploy(g), feed = byName(g, '🛎️・лента-сайта');
  const p = planSetup(buildBlueprint(), snapshotGuild(g, { channels: first.channels, staffRoles: STAFF }, BOT, { ...TIERS, staff: ['role-new'] }));
  await applyPlan(g, p, { ...opts, tiers: { ...TIERS, staff: ['role-new'] } });
  assert.equal(feed.permissionOverwrites.cache.has(STAFF[0]), false);
  assert.ok(ow(feed, 'role-new').allow.includes('ViewChannel'));
});

test('прошлая схема: каналы бота переименовываются и переезжают, чужие права на месте', async () => {
  const g = fakeGuild();
  const cat = await g.channels.create({ name: 'ОБРАЩЕНИЯ', type: CATEGORY }), oldCat = await g.channels.create({ name: 'СЛУЖЕБНОЕ', type: CATEGORY });
  const desk = await g.channels.create({ name: 'обращение', type: TEXT, parent: cat.id, permissionOverwrites: [{ id: 'friends', allow: ['ViewChannel'], deny: [] }] });
  const feed = await g.channels.create({ name: 'обращения', type: TEXT, parent: oldCat.id, permissionOverwrites: [{ id: 'old-role', allow: ['ViewChannel'], deny: [] }] });
  const r = await deploy(g, { channels: { catDesk: cat.id, helpdesk: desk.id, staffTickets: feed.id }, roleIds: { guest: 'old-role' } });
  assert.equal(r.made.length, 7, 'новые только служебные разделы с каналами');
  assert.equal(cat.name, '🎫・ОБРАЩЕНИЯ');
  assert.equal(desk.name, '🎫・написать-нам');
  assert.equal(feed.parentId, byName(g, '👥・ПЕРСОНАЛ').id);
  assert.ok(desk.permissionOverwrites.cache.has('friends'), 'чужие права остаются');
  assert.equal(feed.permissionOverwrites.cache.has('old-role'), false, 'права старой роли бота убраны');
});

test('каналы сервера получают значки, тип учитывается, повтор не нужен', async () => {
  const g = fakeGuild();
  const news = await g.channels.create({ name: 'анонсы', type: ANNOUNCEMENT }), mine = await g.channels.create({ name: 'анонсы', type: TEXT });
  const voice = await g.channels.create({ name: '🔊・лобби', type: VOICE }), other = await g.channels.create({ name: 'мемы', type: TEXT });
  await deploy(g);
  assert.equal(news.name, '📣・анонсы');
  assert.equal(mine.name, 'анонсы');
  assert.equal(voice.name, '🔊・голосовой');
  assert.equal(other.name, 'мемы');
  assert.equal(plan(g).summary.renames, 0);
});

test('канал, который бот не может изменить, пропускается, остальное выполняется', async () => {
  const g = fakeGuild(), rules = await g.channels.create({ name: 'правила', type: TEXT });
  rules.edit = async () => { throw Object.assign(new Error('Missing Permissions'), { code: 50013 }); };
  const r = await deploy(g);
  assert.deepEqual(r.skipped, ['📜・правила']);
  assert.ok(byName(g, '🎫・написать-нам'));
});

test('очистка: только своё, чужое и занятое остаётся', () => {
  const saved = { channels: { helpdesk: 'keep', rooms: 'c1', chat: 'c2', catMain: 'k1', catLounge: 'k2' }, roleIds: { guest: 'r1', subNews: 'r2' } };
  const snap = {
    channels: [{ id: 'keep', type: TEXT, parentId: null }, { id: 'c1', name: 'номера', type: TEXT, parentId: 'k1' }, { id: 'c2', name: 'общение', type: TEXT, parentId: 'k2' }, { id: 'k1', name: 'ОТЕЛЬ', type: CATEGORY, parentId: null }, { id: 'k2', name: 'ГОСТИНАЯ', type: CATEGORY, parentId: null }, { id: 'mine', name: 'мемы', type: TEXT, parentId: 'k1' }],
    roles: [{ id: 'r1', name: 'Гость отеля' }, { id: 'r2', name: 'Подписка' }, { id: 'foreign', name: 'Dev' }]
  };
  const c = planCleanup(buildBlueprint(), saved, snap, new Set(['c2']), ['r2']);
  assert.deepEqual(c.channels.map(x => x.id), ['c1']);
  assert.deepEqual(c.kept.map(x => x.id), ['c2']);
  assert.deepEqual(c.categories, [], 'в ОТЕЛЕ лежит чужой канал, в ГОСТИНОЙ остаётся занятый');
  assert.deepEqual(c.roles.map(x => x.id), ['r1']);
});

test('очистка удаляет пустую категорию бота', () => {
  const c = planCleanup(buildBlueprint(), { channels: { rooms: 'c1', catMain: 'k1' } }, { channels: [{ id: 'c1', type: TEXT, parentId: 'k1' }, { id: 'k1', type: CATEGORY, parentId: null }], roles: [] });
  assert.deepEqual(c.categories.map(x => x.id), ['k1']);
});

test('уровни: персонал не видит дирекцию, директора видят оба раздела, админ всё', async () => {
  const g = fakeGuild(); await deploy(g);
  const board = byName(g, '💼・дирекция'), feed = byName(g, '🛎️・лента-сайта'), sees = (c, id) => ow(c, id).allow.includes('ViewChannel');
  assert.ok(ow(board, EVERYONE).deny.includes('ViewChannel'));
  assert.equal(sees(board, 'role-staff'), false);
  assert.ok(sees(board, 'role-dir') && sees(board, 'role-admin'));
  assert.ok(sees(feed, 'role-staff') && sees(feed, 'role-dir') && sees(feed, 'role-admin'));
});

test('каналы в разделе персонала получают директоров, прежние права ролей сохраняются', async () => {
  const g = fakeGuild(), cat = await g.channels.create({ name: '👥・ПЕРСОНАЛ', type: CATEGORY, permissionOverwrites: [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: 'role-staff', allow: ['ViewChannel', 'ManageMessages'] }] });
  const chat = await g.channels.create({ name: '🔒・staff-chat', type: TEXT, parent: cat.id, permissionOverwrites: [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: 'role-staff', allow: ['ViewChannel', 'ManageMessages'] }] });
  const voice = await g.channels.create({ name: '🔊・staff-voice-1', type: VOICE, parent: cat.id });
  await deploy(g);
  assert.ok(ow(chat, 'role-dir').allow.includes('ViewChannel'));
  assert.ok(ow(chat, 'role-staff').allow.includes('ManageMessages'));
  assert.ok(ow(voice, 'role-dir').allow.includes('Connect'));
  assert.deepEqual(plan(g, {}).lines, []);
});

test('раздел разработки схема не трогает', async () => {
  const g = fakeGuild(), cat = await g.channels.create({ name: '🛠️・РАЗРАБОТКА', type: CATEGORY, permissionOverwrites: [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: 'role-dev', allow: ['ViewChannel'] }] });
  await deploy(g);
  assert.equal(cat.permissionOverwrites.cache.has('role-dir'), false);
});

test('очистка включает лишний голосовой, если он пуст', () => {
  const ch = [{ id: 'v2', name: '🔊・staff-voice-2', type: VOICE, parentId: null }];
  assert.deepEqual(planCleanup(buildBlueprint(), {}, { channels: ch, roles: [] }).channels.map(c => c.id), ['v2']);
  assert.deepEqual(planCleanup(buildBlueprint(), {}, { channels: ch, roles: [] }, new Set(['v2'])).channels, []);
});

test('права бота есть во всех новых каналах', () => {
  const bp = buildBlueprint();
  for (const s of [...bp.categories, ...bp.channels]) assert.ok(overwritesFor(s, TIERS, EVERYONE, BOT).some(o => o.id === BOT), s.name);
});

test('в Discord осталась только команда обращения', () => {
  assert.deepEqual(buildCommands().map(c => c.name), ['обращение']);
  const { components } = helpdeskBoard();
  assert.deepEqual(components[0].components.map(b => b.custom_id), ['mhc:ticket', 'mhc:job']);
});

test('пост с сайта собирается в эмбед и не упоминает никого', () => {
  const p = postPayload({ content: '@everyone привет', title: 'Заголовок', description: 'Текст', color: '#F0177A', image: 'uploads/a.png', footer: 'Отель', fields: [{ name: 'Когда', value: 'Сегодня', inline: true }], button: { label: 'Сайт', url: 'https://mhc.example.com' } }, 'https://mhc.example.com');
  assert.equal(p.embeds[0].color, 0xF0177A);
  assert.equal(p.embeds[0].image.url, 'https://mhc.example.com/uploads/a.png');
  assert.equal(p.components[0].components[0].url, 'https://mhc.example.com');
  assert.deepEqual(p.allowedMentions, { parse: [] });
});

test('пост без карточки и локальная картинка не ломают сообщение', () => {
  assert.deepEqual(postPayload({ content: 'Просто текст' }).embeds, []);
  assert.equal(postPayload({ title: 'x', image: 'uploads/a.png' }, 'http://localhost:3000').embeds[0].image, undefined);
});

test('анонс события содержит время и ссылку', () => {
  const p = eventAnnouncement({ name: 'Neon Night', start: 1800000000000, location: 'Night Pool', desc: 'Вечеринка', url: 'https://discord.com/events/1/2' }, 'https://mhc.example.com');
  assert.match(p.embeds[0].description, /<t:1800000000:f>/);
  assert.equal(p.embeds[0].url, 'https://discord.com/events/1/2');
  assert.ok(p.components.length);
});

const admin = { id: 'a1', username: 'admin', role: 'admin' }, mod = { id: 'm1', username: 'mod', role: 'mod' };

test('панель отправляет пост через вебхук и правит то же сообщение', async () => {
  const sent = [], { core, store } = makeCore({ sendPost: async a => { sent.push(a); return { messageId: a.messageId || 'msg1', channelName: '📣・анонсы' }; } });
  await core.handle('GET', '/admin/all', { user: mod });
  const { doc } = await core.handle('POST', '/admin/discord/send', { user: mod, body: { channel: '123', sender: 'reception', post: { title: 'Открытие' } } });
  assert.match(sent[0].sender.name, /Ресепшен/);
  assert.equal(doc.messageId, 'msg1');
  await core.handle('POST', '/admin/discord/send', { user: mod, body: { id: doc.id, post: { title: 'Открытие сезона' } } });
  assert.equal(sent[1].messageId, 'msg1');
  assert.equal(sent[1].channel, '123');
  assert.equal(store.all('posts').length, 1);
  assert.equal(store.get('posts', doc.id).post.title, 'Открытие сезона');
});

test('пустой пост и гость не проходят', async () => {
  const { core } = makeCore({ sendPost: async () => ({ messageId: '1', channelName: 'x' }) });
  await assert.rejects(core.handle('POST', '/admin/discord/send', { user: mod, body: { channel: '123', post: {} } }), /Заполните/);
  await assert.rejects(core.handle('POST', '/admin/discord/send', { user: { id: 'g', username: 'g', role: 'guest' }, body: { channel: '123', post: { title: 'x' } } }), /прав/);
});

test('доступ к панели меняет только администратор', async () => {
  let setups = 0; const { core } = makeCore({ setupGuild: async () => { setups++; return {}; } });
  await assert.rejects(core.handle('POST', '/admin/discord/access', { user: mod, body: { admin: ['1'] } }), /прав/);
  await core.handle('POST', '/admin/discord/access', { user: admin, body: { admin: ['111', 'bad'], mod: ['222'], announceChannel: '333' } });
  const s = core.settings();
  assert.deepEqual(s.adminRoles, ['111']);
  assert.deepEqual(s.modRoles, ['222']);
  assert.equal(s.announceChannel, '333');
  assert.equal(setups, 1);
});

test('событие из Discord попадает в афишу сайта и исчезает при удалении', () => {
  const { core } = makeCore();
  core.upsertEvent({ id: 'dc-1', name: 'Вечер в Night Pool', desc: '', start: Date.now() + 3600e3, end: null, location: 'Night Pool', status: 'scheduled', image: '', url: 'https://discord.com/events/1/1' });
  const ev = core.publicData().events.find(e => e.id === 'dc-1');
  assert.equal(ev.source, 'discord');
  assert.ok(ev.venueId);
  core.removeEvent('dc-1');
  assert.equal(core.publicData().events.some(e => e.id === 'dc-1'), false);
});

function fakeModal(customId, fields) {
  const i = { customId, user: { id: 'u1', username: 'guest1' }, replies: [], isChatInputCommand: () => false, isButton: () => false, isModalSubmit: () => true, fields: { getTextInputValue: k => fields[k] ?? '' } };
  i.deferReply = async () => { i.deferred = true; }; i.editReply = async p => { i.replies.push(p); }; i.reply = async p => { i.replies.push(p); };
  return i;
}

test('тестовый канал видят только администраторы и разработчики', async () => {
  const g = fakeGuild(); await deploy(g);
  const c = byName(g, '🧪・тест-бота');
  assert.ok(ow(c, EVERYONE).deny.includes('ViewChannel'));
  assert.ok(ow(c, 'role-admin').allow.includes('ViewChannel') && ow(c, 'role-dev').allow.includes('ViewChannel'));
  assert.equal(c.permissionOverwrites.cache.has('role-dir'), false);
  assert.equal(c.permissionOverwrites.cache.has(STAFF[0]), false);
});

test('архив тикетов не виден персоналу и закрыт для записи', async () => {
  const g = fakeGuild(); await deploy(g);
  const c = byName(g, '🗄️・архив-тикетов');
  assert.equal(c.permissionOverwrites.cache.has(STAFF[0]), false);
  assert.ok(ow(c, 'role-dir').deny.includes('SendMessages'));
});

const ticket = async (core, hooks = {}) => { const { ticket: t } = await core.handle('POST', '/tickets', { user: { id: 'u1', username: 'guest1', role: 'guest' }, body: { name: 'Джон', topic: 'Вопрос', text: 'Помогите' } }); await core.handle('POST', `/tickets/${t.id}/mode`, { user: { id: 'u1', username: 'guest1', role: 'guest' }, body: { mode: 'discord' } }); return t; };

function fakeButton(channelId, userId = 'u1') {
  const i = { customId: 'mhc:close', channelId, user: { id: userId, username: 'x' }, replies: [], isChatInputCommand: () => false, isButton: () => true, isModalSubmit: () => false };
  i.deferReply = async () => { i.deferred = true; }; i.editReply = async p => { i.replies.push(p); }; i.reply = async p => { i.replies.push(p); };
  return i;
}

test('кнопку закрытия отклоняет чужой гость и принимает администрация', async () => {
  let closed = 0; const { core, store } = makeCore({ checkMember: async () => true, createTicketChannel: async () => 'chan1', closeTicketChannel: async () => { closed++; return [{ from: 'guest', by: 'Джон', text: 'Привет', at: 1 }, { from: 'bot', by: 'бот', text: 'карточка', at: 2 }]; } });
  const t = await ticket(core);
  const guest = fakeButton('chan1', 'stranger'); await createInteractions({ core, resolveRole: async () => 'guest' })(guest);
  assert.equal(closed, 0);
  assert.match(guest.replies[0].content, /автор или администрация/);
  await createInteractions({ core, resolveRole: async () => 'mod' })(fakeButton('chan1', 'staff1'));
  const doc = store.get('tickets', t.id);
  assert.equal(closed, 1);
  assert.equal(doc.status, 'closed');
  assert.equal(doc.channel, null);
  assert.deepEqual(doc.messages.map(m => m.text), ['Помогите', 'Привет'], 'история сохранена на сайте без служебных карточек');
});

test('если транскрипт не сохранился, обращение не закрывается', async () => {
  const { core, store } = makeCore({ checkMember: async () => true, createTicketChannel: async () => 'chan1', closeTicketChannel: async () => { throw new Error('нет архива'); } });
  const t = await ticket(core);
  await assert.rejects(core.handle('POST', `/admin/tickets/${t.id}/close`, { user: mod }), /нет архива/);
  assert.equal(store.get('tickets', t.id).status, 'open');
  assert.equal(store.get('tickets', t.id).channel, 'chan1');
});

test('сообщения тикета видны в панели, ответ из панели уходит в канал', async () => {
  const sent = [], { core, store } = makeCore({ checkMember: async () => true, createTicketChannel: async () => 'chan1', ticketReply: async (t, text, by, ooc) => { sent.push([text, by, ooc]); } });
  const t = await ticket(core);
  core.ticketMessage(t.id, { from: 'guest', by: 'Джон', text: 'Есть кто?', at: 5 });
  // без игрового имени сотрудник писать не может: 428 — сайт ведёт в профиль
  await assert.rejects(core.handle('POST', `/tickets/${t.id}/messages`, { user: mod, body: { text: 'Да, слушаю' } }), e => e.status === 428);
  await core.handle('PUT', '/me/profile', { user: mod, body: { name: 'Лиам Картер' } });
  await core.handle('POST', `/tickets/${t.id}/messages`, { user: mod, body: { text: 'Да, слушаю' } });
  await core.handle('POST', `/tickets/${t.id}/messages`, { user: mod, body: { text: 'сорри, лагнуло', ooc: true } });
  const ms = store.get('tickets', t.id).messages;
  assert.deepEqual(ms.map(m => m.text), ['Есть кто?', 'Да, слушаю', 'сорри, лагнуло']);
  assert.equal(ms[1].by, 'Лиам Картер', 'подпись — игровое имя, не ник Discord');
  assert.deepEqual(ms.map(m => !!m.ooc), [false, false, true]);
  assert.deepEqual(sent, [['Да, слушаю', 'Лиам Картер', false], ['сорри, лагнуло', 'Лиам Картер', true]]);
  assert.equal(core.icOf('m1'), 'Лиам Картер');
});

test('удалить можно только закрытые обращения и только администратору', async () => {
  const { core, store } = makeCore({ checkMember: async () => true, createTicketChannel: async () => null });
  const t = await ticket(core);
  await assert.rejects(core.handle('DELETE', `/admin/tickets/${t.id}`, { user: admin }), /Сначала закройте/);
  await core.handle('POST', `/admin/tickets/${t.id}/close`, { user: mod });
  await assert.rejects(core.handle('DELETE', `/admin/tickets/${t.id}`, { user: mod }), /прав/);
  const open = await ticket(core);
  assert.equal((await core.handle('POST', '/admin/tickets/purge', { user: admin })).deleted, 1);
  assert.deepEqual(store.all('tickets').map(x => x.id), [open.id]);
});

test('демо-событий нет у гостей, этажи номеров совпадают с лифтом', () => {
  const { core } = makeCore();
  assert.equal(core.publicData().events.some(e => e.id.startsWith('e-demo')), false);
  const rooms = [20, 21, 22, 23, 24, 25, 26].map(floor => ({ floor }));
  assert.equal(roomGameFloor(rooms, 20), 'Rooms Floor 1');
  assert.equal(roomGameFloor(rooms, 25), 'Rooms Floor 6');
  assert.equal(roomGameFloor(rooms, 26), 'Rooms Floor 6');
});

test('если канал не создался, обращение уходит в чат на сайте', async () => {
  const { core, store } = makeCore({ checkMember: async () => null, createTicketChannel: async () => { throw new Error('бот недоступен'); } });
  const { ticket: t } = await core.handle('POST', '/tickets', { user: { id: 'u1', username: 'g', role: 'guest' }, body: { topic: 'Вопрос', text: 'Помогите' } });
  const r = await core.handle('POST', `/tickets/${t.id}/mode`, { user: { id: 'u1', username: 'g', role: 'guest' }, body: { mode: 'discord' } });
  assert.equal(r.fallback, true);
  assert.equal(store.get('tickets', t.id).mode, 'site');
  assert.deepEqual(store.get('tickets', t.id).messages.map(m => m.text), ['Помогите']);
});

test('карточка ленты показывает, кто ждёт ответа, и сжимается по завершении', () => {
  const t = { id: 't1', topic: 'Вопрос', text: 'Помогите', status: 'open', lastFrom: 'guest', messages: [{ text: 'Помогите' }] };
  assert.match(feedCard('ticket', t, 'гость').message.embeds[0].title, /Ждёт ответа/);
  const answered = feedCard('ticket', { ...t, lastFrom: 'staff', messages: [{ text: 'a' }, { text: 'Отвечаем' }] }, 'гость').message.embeds[0];
  assert.match(answered.title, /Отвечено/);
  assert.match(answered.description, /Отвечаем/);
  const closed = feedCard('ticket', { ...t, status: 'closed', closedBy: 'admin' }, 'гость');
  assert.equal(closed.done, true);
  assert.equal(closed.message.embeds[0].fields, undefined);
  assert.match(feedCard('booking', { code: 'MHC-1', status: 'confirmed', typeName: 'Люкс', date: '2026-12-01', nights: 2, total: 100, room: '2001' }, 'гость').message.embeds[0].title, /Подтверждена/);
  assert.equal(feedCard('order', { room: '2001', status: 'done', items: [], total: 1 }, 'гость').done, true);
});

test('переписка и закрытие обновляют одну карточку заявки', async () => {
  const kinds = [], { core } = makeCore({ checkMember: async () => true, createTicketChannel: async () => null, notify: async k => { kinds.push(k); } });
  const t = await ticket(core);
  await core.handle('POST', `/tickets/${t.id}/messages`, { user: { id: 'u1', username: 'guest1', role: 'guest' }, body: { text: 'ещё вопрос' } });
  await core.handle('PUT', '/me/profile', { user: mod, body: { name: 'Лиам Картер' } });
  await core.handle('POST', `/tickets/${t.id}/messages`, { user: mod, body: { text: 'ответ' } });
  await core.handle('POST', `/admin/tickets/${t.id}/close`, { user: mod });
  // все виды «ticket*» правят одну карточку; ответ персонала и закрытие дополнительно пишут гостю в личку
  assert.deepEqual(kinds, ['ticket_site', 'ticket_update', 'ticket_reply', 'ticket_closed']);
});

test('гость отключил личные сообщения — бот получает пометку quiet', async () => {
  const got = [], { core, store } = makeCore({ checkMember: async () => true, createTicketChannel: async () => null, notify: async (k, d) => { got.push([k, d.quiet, d.discordId]); } });
  const g = { id: 'u1', username: 'guest1', role: 'guest' };
  await core.handle('PUT', '/me/profile', { user: g, body: { dm: false } });
  const t = await ticket(core);
  await core.handle('PUT', '/me/profile', { user: mod, body: { name: 'Лиам Картер' } });
  await core.handle('POST', `/tickets/${t.id}/messages`, { user: mod, body: { text: 'ответ' } });
  assert.deepEqual(got.find(x => x[0] === 'ticket_reply'), ['ticket_reply', true, 'u1']);
  assert.equal(store.get('profiles', 'd:u1').dm, false);
});

test('гость сам закрывает своё обращение, чужое — нет; персоналу уходит пометка без личного сообщения', async () => {
  const sent = [], closed = [], { core, store } = makeCore({ checkMember: async () => true, createTicketChannel: async () => 'chan9', closeTicketChannel: async (t, by, byGuest) => { closed.push([by, byGuest]); return []; }, notify: async (k, d) => { sent.push([k, d.quiet]); } });
  const t = await ticket(core);
  await assert.rejects(core.handle('POST', `/tickets/${t.id}/close`, { user: { id: 'u2', username: 'other', role: 'guest' } }), /не найдено/);
  await core.handle('POST', `/tickets/${t.id}/close`, { user: { id: 'u1', username: 'guest1', role: 'guest' } });
  const after = store.get('tickets', t.id);
  assert.equal(after.status, 'closed'); assert.equal(after.closedByGuest, true); assert.equal(after.closedBy, 'Джон');
  assert.deepEqual(closed, [['Джон', true]], 'канал закрыт с пометкой «гость сам»');
  assert.deepEqual(sent.find(x => x[0] === 'ticket_closed'), ['ticket_closed', true]);
});

test('снег только в новогодней теме', () => {
  const jan = Date.UTC(2027, 0, 1), kinds = new Set();
  for (let h = 0; h < 24 * 90; h += 3) kinds.add(weatherNow({ weather: 'auto', theme: 'none' }, jan + h * 3600e3).kind);
  assert.equal(kinds.has('snow'), false);
  assert.notEqual(weatherNow({ weather: 'snow', theme: 'none' }, jan).kind, 'snow');
  assert.equal(weatherNow({ weather: 'clear', theme: 'newyear' }, jan).kind, 'snow');
});

test('музыка вертушки: только свои треки, ссылки YouTube и униформы на сайте больше нет', async () => {
  const { core } = makeCore();
  await core.handle('PUT', '/admin/settings/main', { user: admin, body: { deckUrl: 'https://youtu.be/abcdefghijk', deckTracks: [{ url: '/uploads/0123456789abcdef.mp3', title: 'Лаунж' }, { url: 'https://evil/x.mp3', title: 'чужой' }] } });
  const s = core.publicData().settings;
  assert.equal(s.deckUrl, undefined); assert.equal(s.staffExtras, undefined);
  assert.deepEqual(s.deckTracks, [{ url: '/uploads/0123456789abcdef.mp3', title: 'Лаунж' }]);
});

test('транскрипт экранирует разметку и содержит переписку', () => {
  const h = transcriptHtml({ id: 't1', topic: 'Тема', discord: 'guest1', createdAt: 1 }, [{ from: 'guest', by: 'Джон', text: '<script>x</script>', files: ['https://cdn/a.png?x=1'], at: 2 }], 'admin');
  assert.ok(!h.includes('<script>'));
  assert.ok(h.includes('&lt;script&gt;') && h.includes('a.png'));
});

test('завершённое событие исчезает с сайта сразу', () => {
  const { core } = makeCore();
  const ev = { id: 'dc-2', name: 'Вечер', desc: '', start: Date.now() - 600e3, end: Date.now() + 3600e3, location: '', status: 'active', image: '', url: '' };
  core.upsertEvent(ev);
  assert.ok(core.publicData().events.some(e => e.id === 'dc-2'));
  core.upsertEvent({ ...ev, status: 'completed' });
  assert.equal(core.publicData().events.some(e => e.id === 'dc-2'), false);
});

test('служебный этаж скрыт на сайте и виден в панели, этажи лифта на месте', async () => {
  const { core } = makeCore();
  const pub = core.publicData().venues, all = (await core.handle('GET', '/admin/all', { user: mod })).venues;
  assert.equal(pub.some(v => v.id === 'yusuf'), false);
  assert.ok(all.some(v => v.id === 'yusuf' && v.gameFloor === "Yusuf's Office"));
  assert.ok(pub.some(v => v.id === 'assmosphere'));
  assert.equal(pub.find(v => v.id === 'ciel').gameFloor, 'French Restaurant');
});

test('обращение открывает тикет через core', async () => {
  const { core, store } = makeCore({ checkMember: async () => true, createTicketChannel: async () => 'chan1' });
  await createInteractions({ core, resolveRole: async () => 'guest' })(fakeModal('mhc:ticket:send', { name: 'Джон', topic: 'Вопрос', text: 'Помогите' }));
  assert.equal(store.all('tickets')[0].channel, 'chan1');
});

test('заявка на работу помечена темой', async () => {
  const { core, store } = makeCore({ checkMember: async () => true, createTicketChannel: async () => 'chan2' });
  const i = fakeModal('mhc:job:send', { name: 'Джон', topic: 'Бармен', text: 'Хочу работать' });
  await createInteractions({ core, resolveRole: async () => 'guest' })(i);
  assert.match(store.all('tickets')[0].topic, /Трудоустройство: Бармен/);
  assert.match(i.replies[0].content, /<#chan2>/);
});

test('бот, не подключившийся к серверу, гасится целиком — нет «живого» клиента без функций сайта', async () => {
  const { Client } = await import('discord.js'); const { startBot } = await import('../server/bot.js');
  const login = Client.prototype.login, destroy = Client.prototype.destroy; let destroyed = 0;
  Client.prototype.login = async function () { setImmediate(() => this.emit('clientReady', this)); return 'ok'; };
  Client.prototype.destroy = async function () { destroyed++; };
  try {
    const { store, core, hooks } = makeCore(); hooks.changed = () => {};
    // сервер (guild) недоступен: без сети запрос к Discord падает
    await assert.rejects(startBot({ core, store, hooks, env: { DISCORD_BOT_TOKEN: 'x', GUILD_ID: '1' } }));
    assert.equal(destroyed, 1, 'клиент закрыт, кнопки в Discord не обрабатываются «полуживым» ботом');
  } finally { Client.prototype.login = login; Client.prototype.destroy = destroy; }
});

test('роли для отметки при отзыве и отклике сохраняются, мусор отбрасывается', async () => {
  const { core } = makeCore({ setupGuild: async () => ({}) });
  await core.handle('POST', '/admin/discord/access', { user: admin, body: { reviewRole: '444', jobRole: '<@&1>' } });
  assert.equal(core.settings().reviewRole, '444');
  assert.equal(core.settings().jobRole, '');
});

test('отклик на вакансию из Discord уходит персоналу с темой «Трудоустройство»', async () => {
  const got = [], { core } = makeCore({ checkMember: async () => true, createTicketChannel: async () => 'chan3', notify: async (k, d) => { got.push([k, d.topic]); } });
  await createInteractions({ core, resolveRole: async () => 'guest' })(fakeModal('mhc:job:send', { name: 'Джон', topic: 'Повар', text: 'Опыт три года' }));
  assert.ok(got.some(([k, t]) => k === 'ticket_discord' && /^Трудоустройство: Повар/.test(t)));
});

// --- кнопки обращений после смены бота ---
function boardChannel(list) {
  const all = new Map(), sent = []; let n = 1;
  const add = (author, ids) => { const id = 'm' + n++; const m = { id, author: { id: author, bot: author !== 'human' }, edits: 0, components: ids.length ? [{ components: ids.map(customId => ({ customId })) }] : [], edit: async () => { if (author !== 'new-bot') throw Object.assign(new Error('Cannot edit'), { code: 50005 }); m.edits++; }, delete: async () => { all.delete(id); } }; all.set(id, m); return m; };
  list.forEach(([a, ids]) => add(a, ids));
  return { all, sent, messages: { fetch: async q => { if (typeof q !== 'string') return all; if (!all.has(q)) throw new Error('Unknown Message'); return all.get(q); } }, send: async p => { sent.push(p); return add('new-bot', ['mhc:ticket', 'mhc:job']); } };
}
test('кнопки от прежнего бота заменяются, даже если база хранит их как свои', async () => {
  const B = ['mhc:ticket', 'mhc:job'], c = boardChannel([['old-bot', B], ['human', []]]), p = helpdeskBoard();
  const first = await syncBoard(boardChannel([]), 'old-bot', p, null); // хеш прежнего бота совпадает с нынешним
  const r = await syncBoard(c, 'new-bot', p, { id: 'm1', hash: first.hash });
  assert.equal(r.action, 'sent'); assert.equal(c.sent.length, 1); assert.deepEqual([...c.all.keys()], ['m2', r.id]);
  const again = await syncBoard(c, 'new-bot', p, r); assert.equal(again.action, 'ok'); assert.equal(c.sent.length, 1);
  c.all.delete(r.id); assert.equal((await syncBoard(c, 'new-bot', p, r)).action, 'sent');
});
test('кнопки: своё сообщение находится без записи в базе, дубль убирается', async () => {
  const B = ['mhc:ticket', 'mhc:job'], c = boardChannel([['new-bot', B], ['new-bot', B], ['new-bot', ['mhc:close']]]);
  const r = await syncBoard(c, 'new-bot', helpdeskBoard(), null);
  assert.equal(r.action, 'edited'); assert.equal(c.sent.length, 0); assert.equal(c.all.size, 2);
});
test('закрытие: Discord получает ответ до проверки прав', async () => {
  const { core } = makeCore({}); const order = [];
  const b = { ...fakeButton('nochan', 'u1') }, d = b.deferReply; b.deferReply = async x => { order.push('defer'); b.deferred = true; return d?.(x); };
  await createInteractions({ core, resolveRole: async () => { order.push('role'); return 'guest'; } })(b);
  assert.deepEqual(order, ['defer', 'role']);
});
