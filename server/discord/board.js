// Сообщение с кнопками обращений. Кнопки работают только у бота, который их отправил: после смены приложения старые нажатия уходят в никуда.
import crypto from 'node:crypto';

const hasTicketButtons = m => (m.components || []).some(r => (r.components || []).some(c => /^mhc:(ticket|job)$/.test(c.customId || '')));

/** В канале остаётся одно сообщение, и оно от текущего бота. Возвращает { id, hash } и что сделано. */
export async function syncBoard(channel, botId, payload, rec) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  const found = new Map([...(await channel.messages.fetch({ limit: 50 })).values()].filter(m => m.author.bot && hasTicketButtons(m)).map(m => [m.id, m]));
  if (rec?.id && !found.has(rec.id)) { const m = await channel.messages.fetch(rec.id).catch(() => null); if (m) found.set(m.id, m); }
  const mine = [...found.values()].filter(m => m.author.id === botId), keep = mine.find(m => m.id === rec?.id) || mine[0];
  let id = keep?.id, action = 'ok';
  if (!keep) { id = (await channel.send(payload)).id; action = 'sent'; }
  else if (rec?.id !== keep.id || rec.hash !== hash) { await keep.edit(payload); action = 'edited'; }
  // чужие и лишние убираем, только когда рабочее сообщение уже на месте
  let stale = 0;
  for (const m of found.values()) if (m.id !== id) await m.delete().catch(() => { stale++; });
  return { id, hash, action, stale };
}
