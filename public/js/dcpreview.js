// Предпросмотр поста так, как его покажет Discord (тёмная тема): аватар и имя отправителя, метка, время,
// текст над карточкой, карточка с цветной полосой, миниатюра, поля (встроенные — до трёх в ряд), картинка,
// подпись и кнопка-ссылка. Разметка Discord (жирный, курсив, ссылки, заголовки, цитаты, списки) отображается.
// Всё строится из экранированного текста, поэтому HTML из поста не исполняется.
import { esc } from './ui.js';

const safeUrl = u => (/^https?:\/\//i.test(u) ? u : '');
const img = u => (/^(https?:\/\/|\/uploads\/|uploads\/|img\/|data:image\/)/i.test(u || '') ? u : '');

// встроенная разметка: применяется к уже экранированной строке
function inline(s, links) {
  // код и ссылки откладываем, чтобы * и _ внутри них не стали курсивом
  const keep = [], put = h => `\u0000${keep.push(h) - 1}\u0000`;
  s = s.replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${c}</code>`));
  if (links) s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => put(`<a href="${u}" target="_blank" rel="noopener">${t}</a>`));
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<\u0000]+)/g, (_, a, u) => a + put(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`))
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/\|\|([^|\n]+)\|\|/g, '<span class="sp">$1</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[i]);
}
// блочная разметка: заголовки, цитаты, списки, ```код```
export function md(text, { links = false, headings = true } = {}) {
  const out = []; let quote = [], list = [];
  const flush = () => { if (quote.length) out.push(`<blockquote>${quote.join('<br>')}</blockquote>`); if (list.length) out.push(`<ul>${list.map(x => `<li>${x}</li>`).join('')}</ul>`); quote = []; list = []; };
  const parts = esc(text || '').split(/```(?:[a-z]*\n)?([\s\S]*?)```/);
  parts.forEach((part, k) => {
    if (k % 2) { flush(); out.push(`<pre>${part}</pre>`); return; }
    part.split('\n').forEach((line, i, all) => {
      let m;
      if ((m = /^&gt; ?(.*)$/.exec(line))) { if (list.length) flush(); quote.push(inline(m[1], links)); return; }
      if ((m = /^\s*[-*] (.*)$/.exec(line))) { if (quote.length) flush(); list.push(inline(m[1], links)); return; }
      flush();
      if (headings && (m = /^(#{1,3}) (.+)$/.exec(line))) { out.push(`<div class="h${m[1].length}">${inline(m[2], links)}</div>`); return; }
      out.push(inline(line, links) + (i < all.length - 1 ? '<br>' : ''));
    });
  });
  flush();
  return out.join('');
}

// встроенные поля Discord ставит до трёх в ряд, обычное поле занимает всю строку
function fieldsHtml(fields, thumb) {
  const rows = []; let row = [];
  for (const f of fields) {
    if (f.inline && row.length < (thumb ? 2 : 3)) { row.push(f); continue; }
    if (row.length) rows.push(row);
    row = f.inline ? [f] : []; if (!f.inline) rows.push([f]);
  }
  if (row.length) rows.push(row);
  return `<div class="dcm-fields">${rows.map(r => r.map((f, i) => {
    const span = 12 / r.length;
    return `<div class="dcm-field" style="grid-column:${i * span + 1} / span ${span}"><div class="dcm-fn">${inline(esc(f.name), false)}</div><div class="dcm-fv">${md(f.value, { links: true, headings: false })}</div></div>`;
  }).join('')).join('')}</div>`;
}

export function discordPreview(p, { sender, channelName, at } = {}) {
  const time = new Date(at || Date.now()), today = new Date().toDateString() === time.toDateString();
  const stamp = (today ? 'Сегодня, в ' : time.toLocaleDateString('ru-RU') + ', ') + time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const image = img(p.image), thumb = img(p.thumbnail), fields = (p.fields || []).filter(f => f.name && f.value);
  const hasEmbed = p.title || p.description || image || thumb || fields.length;
  const title = p.title ? (safeUrl(p.url) ? `<a class="dcm-title link" href="${esc(p.url)}" target="_blank" rel="noopener">${inline(esc(p.title), false)}</a>` : `<div class="dcm-title">${inline(esc(p.title), false)}</div>`) : '';
  const embed = hasEmbed ? `<div class="dcm-embed${thumb ? ' has-thumb' : ''}" style="--c:${/^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#F0177A'}">
      ${thumb ? `<img class="dcm-thumb" src="${esc(thumb)}" alt="">` : ''}
      ${title}${p.description ? `<div class="dcm-desc">${md(p.description, { links: true })}</div>` : ''}
      ${fields.length ? fieldsHtml(fields, !!thumb) : ''}
      ${image ? `<img class="dcm-image" src="${esc(image)}" alt="">` : ''}
      ${p.footer ? `<div class="dcm-footer">${esc(p.footer)}</div>` : ''}
    </div>` : '';
  const button = p.button?.label ? `<div class="dcm-btns"><span class="dcm-btn">${esc(p.button.label)}<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15 2a1 1 0 0 0 0 2h3.6l-7.3 7.3a1 1 0 1 0 1.4 1.4L20 5.4V9a1 1 0 1 0 2 0V3a1 1 0 0 0-1-1h-6Z"/><path fill="currentColor" d="M5 4a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-6a1 1 0 1 0-2 0v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6a1 1 0 1 0 0-2H5Z"/></svg></span></div>` : '';
  const avatar = sender?.avatar ? `<img class="dcm-av" src="${esc(sender.avatar)}" alt="">` : `<div class="dcm-av">${esc((sender?.name || '?').slice(0, 1))}</div>`;
  return `<div class="dcm" aria-label="Так пост будет выглядеть в Discord">
    ${channelName ? `<div class="dcm-chan"><span>#</span>${esc(channelName)}</div>` : ''}
    <div class="dcm-msg">${avatar}<div class="dcm-body">
      <div class="dcm-head"><span class="dcm-name">${esc(sender?.name || 'Отправитель')}</span><span class="dcm-tag">APP</span><span class="dcm-time">${stamp}</span></div>
      ${p.content ? `<div class="dcm-content">${md(p.content, { links: false })}</div>` : ''}
      ${embed}${button}
      ${!p.content && !hasEmbed && !button ? '<div class="dcm-empty">Пустое сообщение: добавьте текст, заголовок или картинку</div>' : ''}
    </div></div></div>`;
}
