# The Ass.mosphere Club: анимированный логотип

Квадратная бесшовная петля 5 секунд.

| Файл | Что это |
|---|---|
| `logo-source.jpg` | исходник |
| `line.png` | кремовая линия логотипа (облако, горизонт, надпись) с прозрачностью, вырезана из исходника в 2× |
| `cloudfill.png` | заливка облака: она закрывает солнце |
| `anim.html` | анимация (Canvas) |
| `assmosphere-512.gif`, `still.png` | готовый GIF и кадр |

Эффекты:
- закатное солнце за горизонтом дышит и покачивается, медленно вращаются лучи;
- дымка дрейфует над горизонтом и под ним;
- мерцают звёзды;
- свет пробегает по контуру облака, затем по линии горизонта;
- блик проходит по надписи;
- искры вспыхивают на верхушке облака и на кончиках букв;
- мягкое свечение линии усиливается в момент прохода света.

Пересборка:

```bash
node brand/render-wordmark.cjs out/ass --page assmosphere/anim.html   # 125 кадров
ffmpeg -framerate 25 -i out/ass/f%04d.png -vf "fps=20,scale=640:640:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 assmosphere.gif
```
