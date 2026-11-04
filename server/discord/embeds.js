// Сообщения бота: чистые функции. Содержимое постов задаётся на сайте, здесь только сборка под формат Discord.

export const WINE = 0x7A1E26, PINK = 0xF0177A, TEAL = 0x3FD3C6;
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const btn = (custom_id, label, style, emoji) => ({ type: 2, style, label, custom_id, emoji: { name: emoji } });
const linkRow = (label, url) => (/^https?:\/\//.test(url || '') ? [{ type: 1, components: [{ type: 2, style: 5, label, url }] }] : []);

// Картинки из панели лежат на сайте. Discord показывает только публичные https-адреса.
const publicUrl = (u, site) => { const url = /^https?:/.test(u || '') ? u : u && site ? `${site}/${String(u).replace(/^\//, '')}` : ''; return /^https:/.test(url) ? url : ''; };

// Панель обращений: единственная постоянная карточка на сервере
export function helpdeskBoard() {
  return {
    embeds: [{ title: '🎫 Написать отелю', color: TEAL, description: 'Вопрос к управляющим или заявка на работу. Нажмите кнопку, и откроется закрытый канал только для вас и персонала.' }],
    components: [{ type: 1, components: [btn('mhc:ticket', 'Обращение', 1, '✉️'), btn('mhc:job', 'Работа в отеле', 2, '🧾')] }]
  };
}

// Пост из конструктора на сайте
export function postPayload(p, site = '') {
  const image = publicUrl(p.image, site), thumbnail = publicUrl(p.thumbnail, site);
  const hasEmbed = p.title || p.description || image || thumbnail || p.fields?.length;
  const embed = {
    ...(p.title ? { title: p.title } : {}), ...(p.url ? { url: p.url } : {}), ...(p.description ? { description: p.description } : {}),
    color: parseInt(String(p.color || '#7A1E26').slice(1), 16),
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
      title: `📅 ${cut(ev.name, 240)}`, color: PINK, ...(ev.url ? { url: ev.url } : {}),
      description: cut(`<t:${t}:f> (<t:${t}:R>)${ev.location ? `\n📍 ${ev.location}` : ''}${ev.desc ? `\n\n${ev.desc}` : ''}`, 4000),
      ...(image ? { image: { url: image } } : {})
    }],
    components: linkRow('Афиша на сайте', site ? `${site}/#home` : ''),
    allowedMentions: { parse: [] }
  };
}
