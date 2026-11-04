// Discord без сети: схема, план, права, карточки и команды на имитации сервера.
// Запуск: npm run test:discord
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlueprint, overwritesFor, slug, TEXT, CATEGORY, VOICE } from '../server/discord/layout.js';
import { planSetup, snapshotGuild, applyPlan } from '../server/discord/plan.js';
import { BOARDS } from '../server/discord/embeds.js';
import { buildCommands, createInteractions } from '../server/discord/commands.js';
import { createCore, seed } from '../public/js/core.js';

const EVERYONE = 'everyone', BOT = 'bot-user';

function memoryStore() {
  const db = new Map(), col = c => db.get(c) || db.set(c, new Map()).get(c);
  return { get: (c, id) => col(c).get(id) ?? null, put: (c, id, d) => { col(c).set(id, d); }, del: (c, id) => { col(c).delete(id); }, all: c => [...col(c).values()] };
}
function makeCore() { const store = memoryStore(); seed(store); return { store, core: createCore(store, {}) }; }

function fakeGuild() {
  let n = 1; const next = () => 'id' + n++;
  const perms = list => ({ toArray: () => [...list] });
  const wrap = o => ({ id: o.id, type: o.type, allow: perms(o.allow || []), deny: perms(o.deny || []) });
  const setOw = (ch, list) => { ch.permissionOverwrites = { cache: new Map((list || []).map(o => [o.id, wrap(o)])) }; };
  const channels = new Map(), roles = new Map([[EVERYONE, { id: EVERYONE, name: '@everyone' }]]);
  const log = { deleted: 0 };
  const makeChannel = o => {
    const ch = { id: next(), name: o.name, type: o.type, parentId: o.parent ?? null, topic: o.topic ?? '' };
    setOw(ch, o.permissionOverwrites);
    ch.edit = async e => { if (e.name) ch.name = e.name; if (e.parent) ch.parentId = e.parent; if (e.topic) ch.topic = e.topic; if (e.permissionOverwrites) setOw(ch, e.permissionOverwrites); return ch; };
    ch.delete = async () => { log.deleted++; channels.delete(ch.id); };
    channels.set(ch.id, ch); return ch;
  };
  return {
    log,
    roles: { everyone: roles.get(EVERYONE), cache: roles, create: async o => { const r = { id: next(), ...o }; roles.set(r.id, r); return r; } },
    channels: { cache: channels, create: async o => makeChannel(o), fetch: async id => channels.get(id) }
  };
}

const depts = () => makeCore().core.publicData().depts;
async function deploy(guild, saved = {}, ds = depts()) {
  const bp = buildBlueprint({ depts: ds });
  const plan = planSetup(bp, snapshotGuild(guild, saved, BOT));
  const r = await applyPlan(guild, plan, bp, { everyoneId: EVERYONE, botId: BOT });
  return { bp, plan, ...r };
}

// Как Discord считает права: @everyone, затем все роли (deny, потом allow)
function can(ch, roleIds, perm) {
  const ow = ch.permissionOverwrites.cache;
  let ok = perm === 'ViewChannel' || perm === 'SendMessages';
  const e = ow.get(EVERYONE);
  if (e?.deny.toArray().includes(perm)) ok = false;
  if (e?.allow.toArray().includes(perm)) ok = true;
  const mine = roleIds.map(id => ow.get(id)).filter(Boolean);
  if (mine.some(o => o.deny.toArray().includes(perm))) ok = false;
  if (mine.some(o => o.allow.toArray().includes(perm))) ok = true;
  return ok;
}
const byName = (g, name) => [...g.channels.cache.values()].find(c => c.name === name);

test('повторный запуск ничего не создаёт и не меняет', async () => {
  const g = fakeGuild(), first = await deploy(g);
  assert.ok(first.made.length > 40);
  const saved = { roleIds: first.roleIds, channels: first.channels };
  const again = planSetup(first.bp, snapshotGuild(g, saved, BOT));
  assert.deepEqual(again.summary, { createRoles: 0, createChannels: 0, updateChannels: 0, keep: again.summary.keep });
  assert.equal(again.lines.length, 0);
});

test('без сохранённых id находит всё по именам', async () => {
  const g = fakeGuild(); await deploy(g);
  const again = planSetup(buildBlueprint({ depts: depts() }), snapshotGuild(g, {}, BOT));
  assert.equal(again.summary.createRoles + again.summary.createChannels + again.summary.updateChannels, 0);
});

test('@everyone видит только лобби', async () => {
  const g = fakeGuild(), { bp } = await deploy(g);
  for (const c of bp.channels) {
    const ch = byName(g, c.name), lobby = c.parent === 'catLobby';
    assert.equal(can(ch, [], 'ViewChannel'), lobby, c.name);
    if (lobby) assert.equal(can(ch, [], 'SendMessages'), false, c.name);
  }
});

test('гость видит отель и гостиную, но не служебное и не отделы', async () => {
  const g = fakeGuild(), { roleIds, bp } = await deploy(g), guest = [roleIds.guest];
  assert.ok(can(byName(g, 'номера'), guest, 'ViewChannel'));
  assert.equal(can(byName(g, 'номера'), guest, 'SendMessages'), false);
  assert.ok(can(byName(g, 'общение'), guest, 'SendMessages'));
  for (const c of bp.channels.filter(x => ['catStaff', 'catDepts', 'catMgmt', 'catPress', 'catResidents', 'catCigar'].includes(x.parent)))
    assert.equal(can(byName(g, c.name), guest, 'ViewChannel'), false, c.name);
});

test('отдел видит только свой канал, стажёр не видит руководство', async () => {
  const ds = depts(), g = fakeGuild(), { roleIds } = await deploy(g, {}, ds);
  const [a, b] = ds, chA = byName(g, slug(a.name)), chB = byName(g, slug(b.name));
  assert.ok(can(chA, [roleIds['dept_' + a.id]], 'SendMessages'));
  assert.equal(can(chB, [roleIds['dept_' + a.id]], 'ViewChannel'), false);
  assert.equal(can(byName(g, 'руководство'), [roleIds.intern], 'ViewChannel'), false);
  assert.ok(can(byName(g, 'стафф-общий'), [roleIds.intern], 'SendMessages'));
  assert.ok(can(byName(g, 'руководство'), [roleIds.gm], 'SendMessages'));
});

test('лента только для бота: персонал читает, но не пишет', async () => {
  const g = fakeGuild(), { roleIds } = await deploy(g), ch = byName(g, 'брони');
  assert.ok(can(ch, [roleIds.employee], 'ViewChannel'));
  assert.equal(can(ch, [roleIds.employee], 'SendMessages'), false);
  assert.ok(can(ch, [BOT], 'SendMessages'));
});

test('постоялец и член клуба получают свои разделы; сотрудник клуба тоже', async () => {
  const ds = depts(), g = fakeGuild(), { roleIds } = await deploy(g, {}, ds), club = ds.find(d => /сигар/i.test(d.name));
  assert.ok(can(byName(g, 'постояльцы'), [roleIds.resident], 'SendMessages'));
  assert.ok(can(byName(g, 'курительная'), [roleIds.cigarMember], 'SendMessages'));
  assert.ok(can(byName(g, 'курительная'), [roleIds['dept_' + club.id]], 'ViewChannel'));
  assert.equal(can(byName(g, 'курительная'), [roleIds.resident], 'ViewChannel'), false);
});

test('старый сервер: каналы привязываются, переезжают, ничего не удаляется, чужое на месте', async () => {
  const g = fakeGuild();
  const foreignRole = await g.roles.create({ name: 'Друзья' });
  const oldCat = await g.channels.create({ name: 'MILE HIGH CLUB', type: CATEGORY });
  const oldRooms = await g.channels.create({ name: 'свободные-номера', type: TEXT, parent: oldCat.id, permissionOverwrites: [{ id: foreignRole.id, allow: ['ViewChannel'], deny: [] }] });
  const foreign = await g.channels.create({ name: 'мемы', type: TEXT });
  const r = await deploy(g, { channels: { rooms: oldRooms.id, catMain: oldCat.id } });
  assert.equal(r.channels.rooms, oldRooms.id);
  assert.equal(oldRooms.name, 'номера');
  assert.equal(oldCat.name, 'ОТЕЛЬ');
  assert.ok(oldRooms.permissionOverwrites.cache.has(foreignRole.id), 'чужие права остаются');
  assert.equal(foreign.name, 'мемы');
  assert.equal(g.channels.cache.get(foreign.id).parentId, null);
  assert.equal(g.log.deleted, 0);
  assert.ok(g.roles.cache.has(foreignRole.id));
});

test('старый канал без прав на правку пропускается, остальное создаётся', async () => {
  const g = fakeGuild();
  const rules = await g.channels.create({ name: 'правила', type: TEXT });
  rules.edit = async () => { throw Object.assign(new Error('Missing Permissions'), { code: 50013 }); };
  const r = await deploy(g);
  assert.deepEqual(r.skipped, ['правила']);
  assert.equal(r.channels.rules, undefined, 'бот не пишет в пропущенный канал');
  assert.ok(byName(g, 'номера'));
  assert.equal(g.log.deleted, 0);
});

test('ключи старой схемы сохранены', () => {
  const bp = buildBlueprint({ depts: [] }), keys = [...bp.channels, ...bp.categories].map(c => c.key), roles = bp.roles.map(r => r.key);
  for (const k of ['main', 'announcements', 'rooms', 'journal', 'chat', 'staffBookings', 'staffOrders', 'staffTickets', 'staffGeneral', 'catMain', 'catStaff', 'catTickets']) assert.ok(keys.includes(k), k);
  for (const k of ['admin', 'mod', 'staff']) assert.ok(roles.includes(k), k);
});

test('имена уникальны и подходят Discord', () => {
  const bp = buildBlueprint({ depts: depts() });
  const names = bp.channels.filter(c => c.type === TEXT).map(c => c.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.match(n, /^[\p{L}\p{N}-]{1,100}$/u);
  assert.equal(new Set(bp.roles.map(r => r.name)).size, bp.roles.length);
  assert.ok(bp.channels.filter(c => c.parent === 'catLounge').length <= 50);
  assert.ok(bp.channels.some(c => c.type === VOICE));
  assert.ok(bp.roles.every(r => r.color >= 0 && r.color <= 0xFFFFFF));
});

test('бот есть в правах каждого канала', () => {
  const bp = buildBlueprint({ depts: depts() }), ids = Object.fromEntries(bp.roles.map(r => [r.key, 'r-' + r.key]));
  for (const c of [...bp.categories, ...bp.channels]) assert.ok(overwritesFor(c, ids, EVERYONE, BOT).some(o => o.id === BOT && o.allow.includes('SendMessages')), c.name);
});

function validPayload(key, p) {
  assert.ok((p.embeds?.length ?? 0) <= 10, key);
  let total = 0;
  for (const e of p.embeds || []) {
    assert.ok((e.title?.length ?? 0) <= 256, key);
    assert.ok((e.description?.length ?? 0) <= 4096, key);
    assert.ok((e.fields?.length ?? 0) <= 25, key);
    total += (e.title?.length ?? 0) + (e.description?.length ?? 0);
    for (const f of e.fields || []) { assert.ok(f.name && f.name.length <= 256, key + ' name'); assert.ok(f.value && f.value.length <= 1024, key + ' value: ' + f.name); total += f.name.length + f.value.length; }
  }
  assert.ok(total <= 6000, key + ' total ' + total);
  for (const r of p.components || []) { assert.equal(r.type, 1); assert.ok(r.components.length >= 1 && r.components.length <= 5, key); }
}

test('все карточки укладываются в лимиты Discord', () => {
  const { core } = makeCore(), d = core.publicData();
  for (const [key, [, build]] of Object.entries(BOARDS)) { validPayload(key, build(d, 'https://mhc.example.com')); validPayload(key, build(d, '')); }
});

test('карточки не падают на пустых данных', () => {
  const d = { settings: {}, types: [], rooms: [], venues: [], menu: [], cigars: [], depts: [], team: [], offers: [], faq: [], issues: [], events: [] };
  for (const [key, [, build]] of Object.entries(BOARDS)) assert.doesNotThrow(() => build(d, ''), key);
});

test('схема команд подходит Discord', () => {
  const { core } = makeCore(), list = buildCommands(core.publicData().types);
  assert.ok(list.length <= 100);
  for (const c of list) { assert.match(c.name, /^[-_\p{Ll}\p{N}]{1,32}$/u); assert.ok(c.description.length >= 1 && c.description.length <= 100); }
  assert.ok(list.find(c => c.name === 'бронь').options[0].choices.length >= 1);
});

function fakeInteraction({ command, button, modal, options = {}, fields = {}, user = { id: 'u1', username: 'guest1' }, roles = new Set() }) {
  const i = {
    user, commandName: command, customId: button || modal, replies: [], modals: [], deferred: false, replied: false,
    member: { displayName: 'Тони', roles: { cache: { has: id => roles.has(id) }, add: async id => { roles.add(id); }, remove: async id => { roles.delete(id); } } },
    options: { getString: n => options[n] ?? null }, fields: { getTextInputValue: n => fields[n] ?? '' },
    isChatInputCommand: () => !!command, isButton: () => !!button, isModalSubmit: () => !!modal,
    reply: async p => { i.replied = true; i.replies.push(p); }, editReply: async p => { i.replies.push(p); }, deferReply: async () => { i.deferred = true; }, showModal: async m => { i.modals.push(m); }
  };
  return i;
}
const text = i => i.replies.at(-1)?.content ?? '';

function interactions(role = 'guest') {
  const { core, store } = makeCore(), posts = [];
  const handle = createInteractions({ core, store, site: '', resolveRole: async () => role, roleId: k => 'role-' + k, post: async (...a) => posts.push(a) });
  return { core, store, handle, posts };
}

test('/бронь: модалка создаёт бронь в core', async () => {
  const { store, handle } = interactions();
  const open = fakeInteraction({ command: 'бронь', options: { 'тип': 'std' } });
  await handle(open);
  assert.equal(open.modals[0].components.length, 5);
  const send = fakeInteraction({ modal: open.modals[0].custom_id, fields: { name: 'Тони', date: '2026-12-01', nights: '2', guests: '2', note: '' } });
  await handle(send);
  const b = store.all('bookings')[0];
  assert.equal(b.type, 'std');
  assert.equal(b.discordId, 'u1');
  assert.ok(text(send).includes(b.code));
});

test('неверная дата в модалке возвращает понятную ошибку', async () => {
  const { handle } = interactions();
  const i = fakeInteraction({ modal: 'mhc:book:std', fields: { name: 'Тони', date: 'завтра', nights: '1', guests: '1' } });
  await handle(i);
  assert.match(text(i), /дату заезда/);
});

test('гость не может подтвердить бронь, персонал может и номер выбирается сам', async () => {
  const guest = interactions('guest');
  await guest.core.handle('POST', '/bookings', { body: { type: 'std', name: 'Тони', discord: 'tony', date: '2026-12-01' } });
  const c = guest.store.all('bookings')[0].code;
  const denied = fakeInteraction({ command: 'подтвердить', options: { 'код': c } });
  await guest.handle(denied);
  assert.match(text(denied), /Недостаточно прав/);
  assert.equal(guest.store.all('bookings')[0].status, 'new');

  const staff = interactions('mod');
  await staff.core.handle('POST', '/bookings', { body: { type: 'std', name: 'Тони', discord: 'tony', date: '2026-12-01' } });
  const code = staff.store.all('bookings')[0].code.toLowerCase();
  const ok = fakeInteraction({ command: 'подтвердить', options: { 'код': code } });
  await staff.handle(ok);
  const b = staff.store.all('bookings')[0];
  assert.equal(b.status, 'confirmed');
  assert.ok(b.room);
  const inn = fakeInteraction({ command: 'заселить', options: { 'код': code } });
  await staff.handle(inn);
  assert.equal(staff.store.all('bookings')[0].status, 'checkedin');
  await staff.handle(fakeInteraction({ command: 'выселить', options: { 'код': code } }));
  assert.equal(staff.store.all('bookings')[0].status, 'done');
});

test('кнопка входа выдаёт роль гостя один раз', async () => {
  const { handle } = interactions(), roles = new Set();
  const a = fakeInteraction({ button: 'mhc:accept', roles });
  await handle(a);
  assert.ok(roles.has('role-guest'));
  const b = fakeInteraction({ button: 'mhc:accept', roles });
  await handle(b);
  assert.match(text(b), /уже гость/);
});

test('подписка включается и снимается', async () => {
  const { handle } = interactions(), roles = new Set();
  await handle(fakeInteraction({ button: 'mhc:sub:subParty', roles }));
  assert.ok(roles.has('role-subParty'));
  await handle(fakeInteraction({ button: 'mhc:sub:subParty', roles }));
  assert.equal(roles.has('role-subParty'), false);
  const bad = fakeInteraction({ button: 'mhc:sub:admin', roles });
  await handle(bad);
  assert.equal(roles.has('role-admin'), false, 'через кнопку нельзя получить служебную роль');
});

test('/смена только для персонала', async () => {
  const g = interactions('guest'), gi = fakeInteraction({ command: 'смена' });
  await g.handle(gi);
  assert.match(text(gi), /только для персонала/);
  const s = interactions('mod'), roles = new Set();
  await s.handle(fakeInteraction({ command: 'смена', roles }));
  assert.ok(roles.has('role-onShift'));
  assert.equal(s.posts[0][0], 'shifts');
});

test('обращение открывает тикет через core', async () => {
  const { store, handle } = interactions();
  const i = fakeInteraction({ modal: 'mhc:job:send', fields: { name: 'Тони', topic: 'Бармен', text: 'Хочу работать' } });
  await handle(i);
  const t = store.all('tickets')[0];
  assert.equal(t.topic, 'Трудоустройство: Бармен');
  assert.equal(t.mode, 'discord');
  assert.equal(t.status, 'open');
});
