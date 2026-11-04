// Удаляет с Discord-сервера то, что осталось от прошлых схем. Запуск: npm run discord:cleanup
// Список тот же, что у кнопки «Убрать лишнее»: только созданное ботом, каналы с сообщениями людей остаются.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.js';
import { createCore } from '../public/js/core.js';
import { startBot } from './bot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }

const store = openStore(path.resolve(ROOT, process.env.DATA_DIR || 'data', 'mhc.sqlite'));
const hooks = { changed() {} }, core = createCore(store, hooks);
const client = await startBot({ core, store, env: process.env, hooks });
if (!client) { console.error('Бот не настроен: проверьте .env'); process.exit(1); }

const list = await hooks.planCleanup();
console.log(`Будет удалено: каналов ${list.channels.length}, категорий ${list.categories.length}, ролей ${list.roles.length}.`);
if (list.kept.length) console.log('Останутся, там писали люди:', list.kept.join(', '));
const r = await hooks.cleanupGuild();
const traces = await hooks.clearTestTraces();
console.log(`Готово. Удалено каналов: ${r.channels}, категорий: ${r.categories}, ролей: ${r.roles}, сообщений проверок: ${traces}.`);
await client.destroy();
process.exit(0);
