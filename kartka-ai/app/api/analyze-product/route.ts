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
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64, detail: 'low' } },
          {
            type: 'text',
            text: `Ти маркетолог для українських маркетплейсів (Rozetka, Prom, OLX).
Проаналізуй фото товару. Відповідай ТІЛЬКИ українською мовою.

Поверни JSON:
{
  "productName": "коротка назва 2-4 слова (тип + ключова характеристика, наприклад: Куртка Multicam, Кросівки ON Cloud, Рюкзак 45л)",
  "category": "одна з: ${CATEGORIES.join(', ')}",
  "bullets": [
    "коротка перевага 1 (3-5 слів, ПРОДАЮЧА, конкретна)",
    "коротка перевага 2",
    "коротка перевага 3",
    "коротка перевага 4",
    "коротка перевага 5"
  ]
}

Правила для bullets:
- Максимум 5 слів на перевагу
- Конкретні факти з фото (матеріал, функція, особливість)
- Продаючий стиль: "Водостійка тканина", "М'яка підошва", "Зручні кишені"
- НЕ починати з "Має", "Є", "Дає"
- Тільки те що ВИДНО на фото

Правила для productName:
- 2-4 слова максимум
- Тип товару + бренд АБО ключова характеристика
- Якщо видно бренд/логотип — вказати`
          }
        ]
      }],
      max_tokens: 300,
      response_format: { type: 'json_object' },
      temperature: 0.2,
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
