import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CATEGORIES = [
  'Одяг та взуття', 'Електроніка', 'Спорт та відпочинок', 'Дім та сад',
  "Краса та здоров'я", 'Дитячі товари', 'Авто', 'Їжа та напої',
  'Книги та канцелярія', 'Меблі', 'Іграшки', 'Інше',
]

// From one OR several product photos (all angles of the SAME product):
// short name + SEO name + category + selling description.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl, imageUrls } = await req.json()
  const urls: string[] = Array.isArray(imageUrls) && imageUrls.length
    ? imageUrls
    : (imageUrl ? [imageUrl] : [])
  if (!urls.length) return NextResponse.json({ error: 'No image' }, { status: 400 })

  const imgs = urls.slice(0, 8).map((u: string) => ({
    type: 'image_url' as const,
    image_url: { url: u, detail: 'high' as const },
  }))

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.5,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Ти сильний копірайтер для українських маркетплейсів (Prom, Rozetka). Нижче — ${imgs.length} фото ОДНОГО І ТОГО Ж товару з різних боків (перед, спина, деталі, можливо різні ракурси чи складові комплекту). Уважно роздивись УСІ фото РАЗОМ і врахуй усе, що бачиш на КОЖНОМУ: принти спереду І ЗЗАДУ, колір, крій, склад комплекту (напр. футболка + шорти), матеріал, фурнітуру, деталі. Відповідай ТІЛЬКИ українською.

Поверни JSON:
{
  "shortName": "приваблива конкретна назва 3-6 слів. Назви РЕАЛЬНИЙ тип/склад (напр. 'Костюм футболка + шорти') та головну фішку (принт/колір). НЕ загальне на кшталт 'чорний комплект з черепом'.",
  "seoName": "довга SEO-назва до 80 символів за формулою: тип/склад + ключові ознаки (колір, принт, матеріал) + призначення/аудиторія. Саме за цим товар шукають на Prom.",
  "category": "категорія 'Розділ > Підрозділ', Розділ — один з: ${CATEGORIES.join(', ')}",
  "description": "продаючий опис 500-800 символів"
}

Приклади сильних назв:
- shortName: "Літній костюм Skull: футболка + шорти"
- seoName: "Костюм чоловічий літній футболка і шорти чорний з принтом череп спортивний"

Опис — як живий продавець, не шаблон:
- ПЕРШИЙ рядок — конкретний гачок (сценарій або сильна вигода). ЗАБОРОНЕНО "Відчуйте комфорт", "Представляємо", "Наш товар".
- 3-4 конкретні вигоди мовою покупця за тим, що ВИДНО на фото (склад комплекту, принти спереду й ззаду, матеріал, колір, крій).
- Кому підходить / коли носити.
- Кінцівка — конкретний заклик (напр. "Замовляйте у вашому розмірі — відправка щодня"), не кліше.
- ЗАБОРОНЕНО воду: "висока якість", "ергономічний дизайн", "сучасний дизайн", "найкращий вибір", "функціональність і стиль".
- Звичайний текст, короткі абзаци. БЕЗ markdown, емодзі, списків.`,
          },
          ...imgs,
        ],
      }],
    })
    const d = JSON.parse(completion.choices[0]?.message?.content || '{}')
    return NextResponse.json({
      shortName: d.shortName || '',
      seoName: d.seoName || '',
      category: d.category || '',
      description: d.description || '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI error' }, { status: 500 })
  }
}
