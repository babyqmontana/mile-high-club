// Сухой прогон: сравнивает схему с сервером и говорит, что изменится. Без сети, чистая функция.
// Ничего не удаляет. Чужие роли и каналы не трогает, чужие права в каналах оставляет как есть.
import { overwritesFor, CATEGORY } from './layout.js';

const sortOw = list => [...list].map(o => ({ id: o.id, allow: [...o.allow].sort(), deny: [...o.deny].sort() })).sort((a, b) => a.id.localeCompare(b.id));
const sameOw = (a, b) => JSON.stringify(sortOw(a)) === JSON.stringify(sortOw(b));

// Наши права заменяем, чужие оставляем
export function mergeOverwrites(current, desired, managedIds) {
  const want = new Set(desired.map(o => o.id));
  return [...desired, ...current.filter(o => !want.has(o.id) && !managedIds.has(o.id))];
}

/**
 * snapshot: { roles: [{id,name,color}], channels: [{id,name,type,parentId,topic,overwrites}],
 *             saved: { roleIds, channels }, everyoneId, botId }
 * Возвращает actions (по порядку выполнения), ids (ключ → id там, где он уже известен) и summary.
 */
export function planSetup(blueprint, snapshot) {
  const { roles = [], channels = [], saved = {}, everyoneId, botId } = snapshot;
  const actions = [], roleIds = {}, chanIds = {};
  const pendingId = key => 'new:' + key;

  for (const spec of blueprint.roles) {
    const found = roles.find(r => r.id === saved.roleIds?.[spec.key]) || roles.find(r => r.name === spec.name);
    if (!found) { actions.push({ op: 'createRole', key: spec.key, spec }); roleIds[spec.key] = pendingId(spec.key); continue; }
    roleIds[spec.key] = found.id;
    actions.push({ op: 'bindRole', key: spec.key, id: found.id });
  }
  const managedIds = new Set([...Object.values(roleIds), everyoneId, botId].filter(Boolean));

  const findChannel = spec => {
    const byId = channels.find(c => c.id === saved.channels?.[spec.key]);
    if (byId) return byId;
    const names = [spec.name, ...spec.legacy];
    return channels.find(c => c.type === spec.type && names.includes(c.name));
  };
  const place = spec => {
    const found = findChannel(spec), want = overwritesFor(spec, roleIds, everyoneId, botId);
    const parent = spec.type === CATEGORY ? null : chanIds[spec.parent];
    if (!found) { actions.push({ op: 'createChannel', key: spec.key, spec }); chanIds[spec.key] = pendingId(spec.key); return; }
    chanIds[spec.key] = found.id;
    actions.push({ op: 'bindChannel', key: spec.key, id: found.id });
    const patch = {};
    if (found.name !== spec.name) patch.name = spec.name;
    if (spec.type !== CATEGORY && parent !== found.parentId) patch.parent = spec.parent;
    if (spec.topic && (found.topic || '') !== spec.topic) patch.topic = spec.topic;
    const merged = mergeOverwrites(found.overwrites || [], want, managedIds);
    if (!sameOw(found.overwrites || [], merged)) patch.access = true;
    if (Object.keys(patch).length) actions.push({ op: 'updateChannel', key: spec.key, id: found.id, spec, patch });
  };
  blueprint.categories.forEach(place);
  blueprint.channels.forEach(place);

  const count = op => actions.filter(a => a.op === op).length;
  return {
    actions, roleIds, channelIds: chanIds, managedIds: [...managedIds],
    summary: { createRoles: count('createRole'), createChannels: count('createChannel'), updateChannels: count('updateChannel'), keep: count('bindRole') + count('bindChannel') },
    lines: actions.filter(a => !a.op.startsWith('bind')).map(describe)
  };
}

function describe(a) {
  if (a.op === 'createRole') return `Создать роль «${a.spec.name}»`;
  if (a.op === 'createChannel') return `Создать ${a.spec.type === CATEGORY ? 'категорию' : 'канал'} «${a.spec.name}»`;
  const what = [a.patch.name && `переименовать в «${a.patch.name}»`, a.patch.parent && 'перенести в новую категорию', a.patch.topic && 'обновить описание', a.patch.access && 'обновить доступ'].filter(Boolean).join(', ');
  return `«${a.spec.name}»: ${what}`;
}

// Снимок реального сервера для planSetup
export function snapshotGuild(guild, saved, botId) {
  return {
    everyoneId: guild.roles.everyone.id, botId, saved,
    roles: [...guild.roles.cache.values()].filter(r => r.id !== guild.roles.everyone.id && !r.managed).map(r => ({ id: r.id, name: r.name, color: r.color })),
    channels: [...guild.channels.cache.values()].map(c => ({
      id: c.id, name: c.name, type: c.type, parentId: c.parentId ?? null, topic: c.topic ?? '',
      overwrites: [...(c.permissionOverwrites?.cache?.values() ?? [])].map(o => ({ id: o.id, allow: o.allow.toArray(), deny: o.deny.toArray() }))
    }))
  };
}

// Выполняет план. Возвращает итоговые id и список сделанного.
export async function applyPlan(guild, plan, blueprint, { everyoneId, botId, reason = 'Mile High Club: структура сервера' }) {
  const ow = overwritesFor;
  const roleIds = {}, chanIds = {}, made = [], updated = [];
  for (const a of plan.actions) {
    if (a.op === 'bindRole') roleIds[a.key] = a.id;
    if (a.op === 'createRole') {
      const r = await guild.roles.create({ name: a.spec.name, color: a.spec.color, hoist: a.spec.hoist, mentionable: a.spec.mentionable, reason });
      roleIds[a.key] = r.id; made.push('роль ' + a.spec.name);
    }
  }
  const managed = new Set([...Object.values(roleIds), everyoneId, botId].filter(Boolean));
  for (const a of plan.actions) {
    if (a.op === 'bindChannel') chanIds[a.key] = a.id;
    if (a.op === 'createChannel') {
      const s = a.spec;
      const c = await guild.channels.create({ name: s.name, type: s.type, parent: s.type === CATEGORY ? undefined : chanIds[s.parent], topic: s.topic || undefined, permissionOverwrites: ow(s, roleIds, everyoneId, botId), reason });
      chanIds[a.key] = c.id; made.push((s.type === CATEGORY ? 'категория ' : '#') + s.name);
    }
    if (a.op === 'updateChannel') {
      const c = await guild.channels.fetch(a.id), s = a.spec, edit = { reason };
      if (a.patch.name) edit.name = a.patch.name;
      if (a.patch.parent) { edit.parent = chanIds[s.parent]; edit.lockPermissions = false; }
      if (a.patch.topic) edit.topic = s.topic;
      if (a.patch.access) {
        const current = [...(c.permissionOverwrites?.cache?.values() ?? [])].map(o => ({ id: o.id, type: o.type, allow: o.allow.toArray(), deny: o.deny.toArray() }));
        edit.permissionOverwrites = mergeOverwrites(current, ow(s, roleIds, everyoneId, botId), managed);
      }
      await c.edit(edit); updated.push(s.name);
    }
  }
  return { roleIds, channels: chanIds, made, updated };
}
