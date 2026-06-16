import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CATEGORIES = [
  'Одяг та взуття', 'Електроніка', 'Спорт та відпочинок', 'Дім та сад',
  "Краса та здоров'я", 'Дитячі товари', 'Авто', 'Їжа та напої',
  'Книги та канцелярія', 'Меблі', 'Іграшки', 'Інше',
]

// From a product image (URL or base64): short name + SEO name + category + selling description.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl } = await req.json()
  if (!imageUrl) return NextResponse.json({ error: 'No image' }, { status: 400 })

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
            text: `Ти сильний копірайтер для українських маркетплейсів (Prom, Rozetka). Уважно роздивись фото товару і згенеруй контент. Відповідай ТІЛЬКИ українською.

Поверни JSON:
{
  "shortName": "коротка назва 2-4 слова (тип + колір/ключова ознака). Для гарної картки.",
  "seoName": "довга SEO-назва для маркетплейсу за формулою: тип + ознаки + (бренд/модель якщо видно) + призначення/аудиторія. До 80 символів. Саме за цим товар шукають.",
  "category": "категорія 'Розділ > Підрозділ', Розділ — один з: ${CATEGORIES.join(', ')}",
  "description": "продаючий опис 500-800 символів"
}

Приклад seoName: "Куртка тактична чоловіча олива з капюшоном Soft Shell водовідштовхувальна".

Опис — як живий продавець, не шаблон:
- ПЕРШИЙ рядок — конкретний гачок (сценарій або сильна вигода). ЗАБОРОНЕНО "Відчуйте комфорт", "Представляємо", "Наш товар".
- 3-4 конкретні вигоди мовою покупця за тим, що ВИДНО на фото (матеріал, колір, кишені, капюшон, фурнітура, крій).
- Кому підходить / коли носити.
- Кінцівка — конкретний заклик (напр. "Замовляйте у вашому розмірі — відправка щодня"), не кліше.
- ЗАБОРОНЕНО воду: "висока якість", "ергономічний дизайн", "сучасний дизайн", "найкращий вибір", "функціональність і стиль".
- Звичайний текст, короткі абзаци. БЕЗ markdown, емодзі, списків.`,
          },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
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
