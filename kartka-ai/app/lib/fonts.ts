import fs from 'fs'
import path from 'path'

// Имя семейства шрифта, которое умеет кириллицу. Используем его во ВСЕХ SVG.
// Файл DejaVuSans.ttf лежит в public/fonts и заявляет семейство "DejaVu Sans".
export const FONT_FAMILY = 'DejaVu Sans'

let configured = false

/**
 * Подключает шрифт с кириллицей к серверному рендеру (sharp/librsvg).
 * На Vercel нет шрифта Arial и нет гарантии кириллицы в системном фолбэке,
 * поэтому мы явно показываем fontconfig, где лежит наш DejaVuSans,
 * и рендерим текст по имени "DejaVu Sans". Без этого кириллица превращается
 * в квадратики. Запускается один раз на процесс (контейнер) — потом кэшируется.
 */
export function ensureFonts(): void {
  if (configured) return
  configured = true

  // Возможные места, куда Vercel/Next кладёт public/fonts внутри функции.
  const candidates = [
    path.join(process.cwd(), 'public/fonts'),
    '/var/task/public/fonts',
    path.join(process.cwd(), 'kartka-ai/public/fonts'),
  ]

  let fontDir: string | null = null
  for (const d of candidates) {
    try {
      if (fs.existsSync(path.join(d, 'DejaVuSans.ttf'))) { fontDir = d; break }
    } catch { /* ignore */ }
  }

  // Шрифт не найден — молча выходим (как было раньше), приложение не падает.
  if (!fontDir) return

  try {
    const confPath = '/tmp/kai-fonts.conf'
    const cacheDir = '/tmp/kai-fccache'
    try { fs.mkdirSync(cacheDir, { recursive: true }) } catch { /* ignore */ }

    const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>${cacheDir}</cachedir>
  <config></config>
</fontconfig>`

    fs.writeFileSync(confPath, conf)
    // librsvg прочитает эту переменную при первом рендере текста.
    process.env.FONTCONFIG_FILE = confPath
  } catch { /* ignore — не ломаем генерацию из-за шрифтов */ }
}

// Подключаем сразу при импорте модуля — до того, как загрузится sharp.
ensureFonts()
