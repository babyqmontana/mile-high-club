// Выпуск новой версии сайта: поднимает номер в package.json и подставляет его в README, CHANGELOG и дорожную карту.
// Сайт берёт версию из package.json сам (подвал, панель) — после перезапуска сервера она уже новая.
//
//   npm run release -- patch "Исправления"        v5.4.0 → v5.4.1  (мелкие правки)
//   npm run release -- minor "Правка этажей"      v5.4.0 → v5.5.0  (новая возможность)
//   npm run release -- major "Сезон 2"            v5.4.0 → v6.0.0  (большое обновление)
//   npm run release -- 5.4.2 "…"                  — точный номер
//
// Картинку дорожной карты потом пересобрать: node docs/roadmap/render.cjs (номер версии она тоже берёт из package.json).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [kind = 'patch', ...rest] = process.argv.slice(2), title = rest.join(' ').trim();
const pkgFile = path.join(ROOT, 'package.json'), pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const next = /^\d+\.\d+\.\d+$/.test(kind) ? kind : kind === 'major' ? `${ma + 1}.0.0` : kind === 'minor' ? `${ma}.${mi + 1}.0` : kind === 'patch' ? `${ma}.${mi}.${pa + 1}` : null;
if (!next) { console.error('Укажите patch, minor, major или точный номер вида 5.4.1'); process.exit(1); }
const date = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });

// package.json: меняем только строку версии, остальное форматирование не трогаем
fs.writeFileSync(pkgFile, fs.readFileSync(pkgFile, 'utf8').replace(/("version":\s*")[^"]+(")/, `$1${next}$2`));
const lock = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lock)) { const l = JSON.parse(fs.readFileSync(lock, 'utf8')); l.version = next; if (l.packages?.['']) l.packages[''].version = next; fs.writeFileSync(lock, JSON.stringify(l, null, 2) + '\n'); }

// README: номер между метками <!--ver-->…<!--/ver-->
const readme = path.join(ROOT, 'README.md');
fs.writeFileSync(readme, fs.readFileSync(readme, 'utf8').replace(/<!--ver-->[^<]*<!--\/ver-->/g, `<!--ver-->v${next}<!--/ver-->`));

// CHANGELOG: строка в список версий
const cl = path.join(ROOT, 'CHANGELOG.md'), clText = fs.readFileSync(cl, 'utf8'), mark = '<!--versions-->';
if (clText.includes(mark)) fs.writeFileSync(cl, clText.replace(mark, `${mark}\n- **v${next}** · ${date}${title ? ' · ' + title : ''}`));

// дорожная карта: текущая версия и дата обновления
const rm = path.join(ROOT, 'docs/roadmap/roadmap.html');
fs.writeFileSync(rm, fs.readFileSync(rm, 'utf8').replace(/(data-current>)[^<]*/g, `$1v${next}`).replace(/(Обновлено )[\d.]+/, `$1${date}`));

console.log(`Версия v${pkg.version} → v${next}. Обновлены package.json, README, CHANGELOG и дорожная карта.`);
console.log('Дальше: node docs/roadmap/render.cjs — пересобрать картинку дорожной карты, затем коммит и перезапуск сервера.');
