// Сообщения бота: чистые функции. Содержимое постов задаётся на сайте, здесь только сборка под формат Discord.

// Палитра сайта (public/css/app.css): у каждого типа сообщений свой цвет
export const PALETTE = { wine: 0x59161E, pink: 0xF0177A, gold: 0xF7B50A, flame: 0xEF5617, sand: 0xF4D9A0, cream: 0xF9EDC7 };
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const btn = (custom_id, label, style, emoji) => ({ type: 2, style, label, custom_id, emoji: { name: emoji } });
const linkRow = (label, url) => (/^https?:\/\//.test(url || '') ? [{ type: 1, components: [{ type: 2, style: 5, label, url }] }] : []);

// Картинки из панели лежат на сайте. Discord показывает только публичные https-адреса.
const publicUrl = (u, site) => { const url = /^https?:/.test(u || '') ? u : u && site ? `${site}/${String(u).replace(/^\//, '')}` : ''; return /^https:/.test(url) ? url : ''; };

// Панель обращений: единственная постоянная карточка на сервере
export function helpdeskBoard() {
  return {
    embeds: [{ title: '🎫 Написать отелю', color: PALETTE.gold, description: 'Вопрос к управляющим или заявка на работу. Нажмите кнопку, и откроется закрытый канал только для вас и персонала.' }],
    components: [{ type: 1, components: [btn('mhc:ticket', 'Обращение', 1, '✉️'), btn('mhc:job', 'Работа в отеле', 2, '🧾')] }]
  };
}

// Первое сообщение тикета: кнопка закрытия работает только у администрации
export function ticketOpened(t, memberId) {
  return {
    content: `<@${memberId}>, управляющие скоро ответят.`,
    embeds: [{ title: `🎫 ${cut(t.topic, 240)}`, color: PALETTE.gold, description: cut(t.text, 3900), fields: [{ name: 'Имя', value: t.name || '—', inline: true }, { name: 'Discord', value: t.discord, inline: true }], footer: { text: 'Закрыть обращение может только администрация. История сохранится.' } }],
    components: [{ type: 1, components: [btn('mhc:close', 'Закрыть обращение', 4, '🔒')] }]
  };
}

// Карточка в архиве: кто, о чём, кто закрыл. Файл с перепиской прикладывается отдельно.
export function archiveCard(t, log, by, memberId) {
  return {
    embeds: [{ title: `🗄️ ${cut(t.topic, 240)}`, color: PALETTE.flame, fields: [{ name: 'Гость', value: memberId ? `<@${memberId}> · ${t.discord}` : t.discord, inline: true }, { name: 'Закрыл', value: by, inline: true }, { name: 'Сообщений', value: String(log.length), inline: true }, { name: 'Открыто', value: `<t:${Math.floor(t.createdAt / 1000)}:f>`, inline: true }], footer: { text: `Обращение ${t.id}` } }],
    allowedMentions: { parse: [] }
  };
}

const html = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stamp = t => new Date(t).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

// Транскрипт: один html-файл без внешних зависимостей, открывается в любом браузере
export function transcriptHtml(t, log, by) {
  const rows = log.map(m => `<article class="${m.from}"><header><b>${html(m.by)}</b><time>${stamp(m.at)}</time></header><p>${html(m.text) || '<i>без текста</i>'}</p>${(m.files || []).map(f => `<a href="${html(f)}">${html(f.split('/').pop().split('?')[0])}</a>`).join(' ')}</article>`).join('\n');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Обращение ${html(t.id)}</title>
<style>body{margin:0;background:#0D0809;color:#F9EDC7;font:15px/1.5 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}small{color:#B3A792}article{border-left:3px solid #59161E;background:#1B1013;border-radius:6px;padding:10px 14px;margin:12px 0}article.guest{border-color:#F7B50A}article.staff{border-color:#F0177A}article.bot{opacity:.7}header{display:flex;justify-content:space-between;gap:12px}time{color:#B3A792;font-size:12px}p{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#F7B50A}</style></head>
<body><main><h1>${html(t.topic)}</h1><small>${html(t.discord)} · открыто ${stamp(t.createdAt)} · закрыл ${html(by)} ${stamp(Date.now())}</small>
${rows}</main></body></html>`;
}

// Пост из конструктора на сайте
export function postPayload(p, site = '') {
  const image = publicUrl(p.image, site), thumbnail = publicUrl(p.thumbnail, site);
  const hasEmbed = p.title || p.description || image || thumbnail || p.fields?.length;
  const embed = {
    ...(p.title ? { title: p.title } : {}), ...(p.url ? { url: p.url } : {}), ...(p.description ? { description: p.description } : {}),
    color: parseInt(String(p.color || '#F0177A').slice(1), 16),
    ...(p.fields?.length ? { fields: p.fields } : {}), ...(image ? { image: { url: image } } : {}), ...(thumbnail ? { thumbnail: { url: thumbnail } } : {}),
    ...(p.footer ? { footer: { text: p.footer } } : {})
  };
  return { content: p.content || '', embeds: hasEmbed ? [embed] : [], components: p.button?.label ? linkRow(p.button.label, p.button.url) : [], allowedMentions: { parse: [] } };
}

// Анонс события, созданного на сервере
export function eventAnnouncement(ev, site = '') {
  const t = Math.floor(ev.start / 1000), image = publicUrl(ev.image, site);
  return {
    embeds: [{
      title: `📅 ${cut(ev.name, 240)}`, color: PALETTE.pink, ...(ev.url ? { url: ev.url } : {}),
      description: cut(`<t:${t}:f> (<t:${t}:R>)${ev.location ? `\n📍 ${ev.location}` : ''}${ev.desc ? `\n\n${ev.desc}` : ''}`, 4000),
      ...(image ? { image: { url: image } } : {})
    }],
    components: linkRow('Афиша на сайте', site ? `${site}/#home` : ''),
    allowedMentions: { parse: [] }
  };
}
