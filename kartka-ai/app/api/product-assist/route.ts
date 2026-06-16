import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CATEGORIES = [
  'Одяг та взуття', 'Електроніка', 'Спорт та відпочинок', 'Дім та сад',
  "Краса та здоров'я", 'Дитячі товари', 'Авто', 'Їжа та напої',
  'Книги та канцелярія', 'Меблі', 'Іграшки', 'Інше',
]

// Generates NAME + CATEGORY + selling DESCRIPTION from a product image (URL or base64).
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl } = await req.json()
  if (!imageUrl) return NextResponse.json({ error: 'No image' }, { status: 400 })

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.5,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Ти сильний копірайтер для українських маркетплейсів. Уважно роздивись фото товару і згенеруй контент. Відповідай ТІЛЬКИ українською.

Поверни JSON:
{
  "name": "назва товару, 2-5 слів (тип + ключова характеристика/колір/бренд)",
  "category": "категорія у форматі 'Розділ > Підрозділ', де Розділ — один з: ${CATEGORIES.join(', ')} (напр. 'Одяг та взуття > Куртки')",
  "description": "продаючий опис, 500-800 символів"
}

Опис — пиши як живий продавець, не як шаблон:
- ПЕРШИЙ рядок — конкретний гачок: сценарій або сильна вигода. ЗАБОРОНЕНО шаблонні відкриття типу "Відчуйте комфорт і захист", "Представляємо вам", "Наш товар".
- 3-4 конкретні вигоди МОВОЮ ПОКУПЦЯ (що він отримає в житті), спираючись на те, що ВИДНО на фото (матеріал, колір, кишені, капюшон, фурнітура, крій).
- Кому підходить / коли носити чи використовувати.
- Кінцівка — конкретний заклик (напр. "Замовляйте у розмірі — відправка щодня"), а НЕ кліше "надійність і комфорт, які завжди з вами".
- СУВОРО ЗАБОРОНЕНО воду: "висока якість", "ергономічний дизайн", "сучасний дизайн", "найкращий вибір", "функціональність і стиль".
- Звичайний текст, короткі абзаци. БЕЗ markdown, БЕЗ емодзі, БЕЗ списків.`,
          },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      }],
    })
    const data = JSON.parse(completion.choices[0]?.message?.content || '{}')
    return NextResponse.json({
      name: data.name || '',
      category: data.category || '',
      description: data.description || '',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI error' }, { status: 500 })
  }
}
