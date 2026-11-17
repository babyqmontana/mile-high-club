// Приложение Mile High Club на телефоне. Ничего не кэширует: сайт всегда свежий, как в браузере.
// Единственная работа — показать понятную страницу, если открыть приложение без интернета.
const OFFLINE = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mile High Club</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0D0809;color:#F9EDC7;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px">
<div><div style="font-size:12px;letter-spacing:.3em;color:#F7B50A;text-transform:uppercase">Mile High Club</div><h1 style="margin:.4em 0;font-size:28px">Нет связи с отелем</h1>
<p style="color:#B3A792;margin:0 0 20px">Проверьте интернет и попробуйте ещё раз.</p>
<button onclick="location.reload()" style="font:700 15px system-ui;padding:12px 22px;border:0;border-radius:999px;background:#F0177A;color:#fff">Обновить</button></div></body></html>`;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;   // картинки, скрипты и данные идут напрямую
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
