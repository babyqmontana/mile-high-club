# Айдентика Mile High Club

| Файл | Что это |
|---|---|
| `logo-source.webp` | Исходник логотипа (верблюд с трубкой и надпись «MILE HIGH CLUB») |
| `mhc-wordmark.svg` | Надпись без верблюда, вектор, квадрат 1000×1000, прозрачный фон. Цвет `#F6E8D2` |
| `mhc-wordmark-512.gif` | Анимированная надпись, бесшовная петля 4 с, 512×512 |
| `mhc-wordmark.png` | Статичный кадр анимации, 720×720 |
| `build_brand.py` | Собирает логотип сайта, эмблему, favicon, аватарки бота и вебхуков и баннер из `masks/`. Заменяет вывод `build_logo.py` |
| `wordmark-anim.html` | Сама анимация: открыть через любой статический сервер из папки `brand/` |

Эффекты анимации:
- шампань-металл с тиснением;
- переливающаяся фольга (золото, роза, перламутр, мята);
- диагональный блик-свип;
- искры на кончиках букв в момент прохода блика;
- световой бегунок по росчерку под CLUB;
- дышащий бордовый ореол;
- золотая пыль.

Пересборка:

```bash
node brand/render-wordmark.cjs out/wm          # 100 кадров PNG
ffmpeg -framerate 25 -i out/wm/f%04d.png -vf "split[a][b];[a]palettegen=max_colors=200[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" -loop 0 mhc-wordmark.gif
```
