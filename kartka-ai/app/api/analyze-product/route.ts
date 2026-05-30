import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CATEGORIES = [
  'Одяг та взуття', 'Електроніка', 'Спорт та відпочинок', 'Дім та сад',
  'Краса та здоров\'я', 'Дитячі товари', 'Авто', 'Їжа та напої',
  'Книги та канцелярія', 'Меблі', 'Іграшки', 'Інше'
]

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageBase64, lang = 'uk' } = await req.json()
  if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

  try {
    const langHint = lang === 'uk' ? 'Ukrainian' : lang === 'ru' ? 'Russian' : 'English'
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64, detail: 'low' } },
          {
            type: 'text',
            text: `Analyze this product photo carefully. Respond in ${langHint}.

Return JSON:
{
  "productName": "specific product name with brand if visible (e.g. 'Куртка тактична POMSTA мультикам')",
  "category": "one of: ${CATEGORIES.join(', ')}",
  "bullets": [
    "specific benefit 1 (e.g. 'Водовідштовхувальна тканина')",
    "specific benefit 2",
    "specific benefit 3",
    "specific benefit 4",
    "specific benefit 5"
  ]
}

Rules:
- productName: be specific, mention visible brand/logo/text, material, style
- bullets: real product features you can SEE in the photo (not generic marketing phrases)
- If you see a logo or text, include it in the name
- Return exactly 5 bullets`
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
    console.error('analyze-product error:', e.message)
    return NextResponse.json({ productName: '', category: '', bullets: [] })
  }
}
