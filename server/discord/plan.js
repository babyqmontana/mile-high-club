// Сухой прогон: сравнивает схему с сервером и говорит, что изменится. Без сети, чистая функция.
// planSetup ничего не удаляет. Удаление есть только в planCleanup и касается лишь того, что создал сам бот.
import { overwritesFor, CATEGORY } from './layout.js';

const sortOw = list => [...list].map(o => ({ id: o.id, allow: [...o.allow].sort(), deny: [...o.deny].sort() })).sort((a, b) => a.id.localeCompare(b.id));
const sameOw = (a, b) => JSON.stringify(sortOw(a)) === JSON.stringify(sortOw(b));

// Наши права заменяем, чужие оставляем
export function mergeOverwrites(current, desired, managedIds) {
  const want = new Set(desired.map(o => o.id));
  return [...desired, ...current.filter(o => !want.has(o.id) && !managedIds.has(o.id))];
}

/**
 * snapshot: { channels: [{id,name,type,parentId,topic,overwrites}], saved: { roleIds, channels }, staffIds, everyoneId, botId }
 * Возвращает actions (по порядку выполнения), channelIds и summary.
 */
export function planSetup(blueprint, snapshot) {
  const { channels = [], saved = {}, staffIds = [], everyoneId, botId } = snapshot;
  const actions = [], chanIds = {};
  // права старых ролей бота и снятых ролей персонала тоже наши: они убираются при обновлении
  const managedIds = new Set([...Object.values(saved.roleIds || {}), ...(saved.staffRoles || []), ...staffIds, everyoneId, botId].filter(Boolean));

  const place = spec => {
    const found = channels.find(c => c.id === saved.channels?.[spec.key]) || channels.find(c => c.type === spec.type && c.name === spec.name);
    const want = overwritesFor(spec, staffIds, everyoneId, botId);
    if (!found) { actions.push({ op: 'createChannel', key: spec.key, spec }); chanIds[spec.key] = 'new:' + spec.key; return; }
    chanIds[spec.key] = found.id;
    actions.push({ op: 'bindChannel', key: spec.key, id: found.id });
    const patch = {};
    if (found.name !== spec.name) patch.name = spec.name;
    if (spec.type !== CATEGORY && chanIds[spec.parent] !== found.parentId) patch.parent = spec.parent;
    if (spec.topic && (found.topic || '') !== spec.topic) patch.topic = spec.topic;
    if (!sameOw(found.overwrites || [], mergeOverwrites(found.overwrites || [], want, managedIds))) patch.access = true;
    if (Object.keys(patch).length) actions.push({ op: 'updateChannel', key: spec.key, id: found.id, spec, patch });
  };
  blueprint.categories.forEach(place);
  blueprint.channels.forEach(place);

  for (const r of blueprint.renames || []) {
    const c = channels.find(x => x.type === r.type && x.name === r.from);
    if (c && !channels.some(x => x.type === r.type && x.name === r.to)) actions.push({ op: 'rename', id: c.id, from: r.from, to: r.to });
  }

  const count = op => actions.filter(a => a.op === op).length;
  return {
    actions, channelIds: chanIds, managedIds: [...managedIds],
    summary: { createChannels: count('createChannel'), updateChannels: count('updateChannel'), renames: count('rename'), keep: count('bindChannel') },
    lines: actions.filter(a => !a.op.startsWith('bind')).map(describe)
  };
}

function describe(a) {
  if (a.op === 'rename') return `Переименовать «${a.from}» в «${a.to}»`;
  if (a.op === 'createChannel') return `Создать ${a.spec.type === CATEGORY ? 'категорию' : 'канал'} «${a.spec.name}»`;
  const what = [a.patch.name && 'переименовать', a.patch.parent && 'перенести', a.patch.topic && 'обновить описание', a.patch.access && 'обновить доступ'].filter(Boolean).join(', ');
  return `«${a.spec.name}»: ${what}`;
}

// Снимок реального сервера для planSetup
export function snapshotGuild(guild, saved, botId, staffIds = []) {
  return {
    everyoneId: guild.roles.everyone.id, botId, saved, staffIds,
    channels: [...guild.channels.cache.values()].map(c => ({
      id: c.id, name: c.name, type: c.type, parentId: c.parentId ?? null, topic: c.topic ?? '',
      overwrites: [...(c.permissionOverwrites?.cache?.values() ?? [])].map(o => ({ id: o.id, allow: o.allow.toArray(), deny: o.deny.toArray() }))
    }))
  };
}

// Выполняет план. Возвращает итоговые id и список сделанного.
export async function applyPlan(guild, plan, { everyoneId, botId, staffIds = [], reason = 'Mile High Club: структура сервера' }) {
  const chanIds = {}, made = [], updated = [], skipped = [], managed = new Set(plan.managedIds);
  const tryEdit = async (c, edit, label, key) => {
    // Канал с запретами, которые боту не снять, остаётся как есть: бот в него не пишет, остальное выполняется
    try { await c.edit(edit); updated.push(label); }
    catch (e) { if (e.code !== 50013) throw e; if (key) delete chanIds[key]; skipped.push(label); }
  };
  for (const a of plan.actions) {
    if (a.op === 'bindChannel') chanIds[a.key] = a.id;
    if (a.op === 'createChannel') {
      const s = a.spec;
      const c = await guild.channels.create({ name: s.name, type: s.type, parent: s.type === CATEGORY ? undefined : chanIds[s.parent], topic: s.topic || undefined, permissionOverwrites: overwritesFor(s, staffIds, everyoneId, botId), reason });
      chanIds[a.key] = c.id; made.push((s.type === CATEGORY ? 'категория ' : '#') + s.name);
    }
    if (a.op === 'updateChannel') {
      const c = await guild.channels.fetch(a.id), s = a.spec, edit = { reason };
      if (a.patch.name) edit.name = s.name;
      if (a.patch.parent) { edit.parent = chanIds[s.parent]; edit.lockPermissions = false; }
      if (a.patch.topic) edit.topic = s.topic;
      if (a.patch.access || a.patch.parent) {
        const current = [...(c.permissionOverwrites?.cache?.values() ?? [])].map(o => ({ id: o.id, type: o.type, allow: o.allow.toArray(), deny: o.deny.toArray() }));
        edit.permissionOverwrites = mergeOverwrites(current, overwritesFor(s, staffIds, everyoneId, botId), managed);
      }
      await tryEdit(c, edit, s.name, a.key);
    }
    if (a.op === 'rename') await tryEdit(await guild.channels.fetch(a.id), { name: a.to, reason }, a.to);
  }
  return { channels: chanIds, made, updated, skipped };
}

/**
 * Что можно убрать: только каналы и роли, которые бот сохранил как свои и которых больше нет в схеме.
 * occupied — id каналов, где писали люди или кто-то сидит в голосовом: они остаются.
 * Категория удаляется, только если в ней не остаётся ничего.
 */
export function planCleanup(blueprint, saved, snapshot, occupied = new Set(), keepRoles = []) {
  const { channels = [], roles = [] } = snapshot;
  const keep = new Set([...blueprint.categories, ...blueprint.channels].map(s => s.key));
  const mine = Object.entries(saved.channels || {}).filter(([k]) => !keep.has(k)).map(([key, id]) => ({ key, ...channels.find(c => c.id === id) })).filter(c => c.id);
  const plain = mine.filter(c => c.type !== CATEGORY && !occupied.has(c.id));
  const gone = new Set(plain.map(c => c.id));
  const cats = mine.filter(c => c.type === CATEGORY && channels.every(x => x.parentId !== c.id || gone.has(x.id)));
  return {
    channels: plain, categories: cats,
    kept: mine.filter(c => occupied.has(c.id)),
    roles: Object.entries(saved.roleIds || {}).map(([key, id]) => ({ key, ...roles.find(r => r.id === id) })).filter(r => r.id && !keepRoles.includes(r.id))
  };
}

export const snapshotRoles = guild => [...guild.roles.cache.values()].filter(r => r.id !== guild.roles.everyone.id && !r.managed).map(r => ({ id: r.id, name: r.name, color: r.color, position: r.position }));
