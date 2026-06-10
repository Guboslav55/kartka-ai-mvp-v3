import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CATEGORIES = [
  "Одяг та взуття", "Електроніка", "Спорт та відпочинок", "Дім та сад",
  "Краса та здоров'я", "Дитячі товари", "Авто", "Їжа та напої",
  "Книги та канцелярія", "Меблі", "Іграшки", "Інше"
]

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageBase64, lang = 'uk' } = await req.json()
  if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
          {
            type: 'text',
            text: `Ти досвідчений маркетолог-копірайтер для українських маркетплейсів (Rozetka, Prom, OLX).
Уважно роздивись фото і знайди КОНКРЕТНІ видимі деталі. Відповідай ТІЛЬКИ українською.

Поверни JSON:
{
  "productName": "коротка назва 2-4 слова (тип + бренд або ключова характеристика, напр.: Куртка Multicam, Кросівки ON Cloud, Рюкзак 45л)",
  "category": "одна з: ${CATEGORIES.join(', ')}",
  "bullets": ["перевага 1","перевага 2","перевага 3","перевага 4","перевага 5"]
}

ГОЛОВНЕ ПРО bullets — КОНКРЕТИКА, БЕЗ ВОДИ:
- Кожна перевага = конкретна видима деталь, матеріал, колір або функція.
- СУВОРО ЗАБОРОНЕНО загальні фрази: "ергономічний дизайн", "висока якість", "сучасний дизайн", "стильний вигляд", "зручність використання", "надійність", "практичність", "комфорт". Це вода — заміни на конкретику.
- Приклади ПОГАНО → ДОБРЕ:
  "Стильний дизайн" → "Контрастна біла підошва"
  "Висока якість" → "Подвійні армовані шви"
  "Зручність" → "Регульований капюшон на шнурку"
  "Сучасні матеріали" → "Сітчаста дихаюча тканина"
  "Практичність" → "Чотири кишені на блискавці"
- 3-5 слів, продаючий тон, НЕ починати з "Має/Є/Дає".
- Лише те, що реально видно/очевидно з фото (матеріал, колір, кишені, підошва, застібки, текстура, кріплення, фурнітура).
- 5 РІЗНИХ переваг, не повторювати думку.

productName: 2-4 слова, тип + бренд/логотип (якщо видно) або ключова характеристика.`
          }
        ]
      }],
      max_tokens: 400,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const data = JSON.parse(res.choices[0]?.message?.content || '{}')
    return NextResponse.json({
      productName: data.productName || '',
      category: data.category || '',
      bullets: Array.isArray(data.bullets) ? data.bullets.slice(0, 5) : [],
    })
  } catch (e: any) {
    console.error('analyze-product:', e.message)
    return NextResponse.json({ productName: '', category: '', bullets: [] })
  }
}
