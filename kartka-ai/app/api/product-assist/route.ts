import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Generates a product NAME + selling DESCRIPTION from a product image (URL or base64).
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl } = await req.json()
  if (!imageUrl) return NextResponse.json({ error: 'No image' }, { status: 400 })

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Уважно подивись на фото товару і згенеруй продаючий контент для українського маркетплейсу. Відповідай ТІЛЬКИ українською.

Поверни JSON:
{
  "name": "назва товару, 2-5 слів (тип + бренд або ключова характеристика)",
  "description": "продаючий опис, 500-800 символів"
}

Правила опису:
- Структура: 1) чіпляючий вступ; 2) 3-5 конкретних вигод МОВОЮ ПОКУПЦЯ (що він отримає), а не суха характеристика; 3) кому підходить / сценарій використання; 4) коротке завершення з мʼяким закликом до дії.
- Пиши лише про те, що реально видно або очевидно з фото (матеріал, колір, крій, деталі, фурнітура).
- СУВОРО ЗАБОРОНЕНО воду: "висока якість", "ергономічний дизайн", "сучасний дизайн", "найкращий вибір", "ідеальне рішення".
- Звичайний текст, короткі абзаци. БЕЗ markdown, БЕЗ емодзі, БЕЗ списків із символами.`,
          },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      }],
    })
    const data = JSON.parse(completion.choices[0]?.message?.content || '{}')
    return NextResponse.json({ name: data.name || '', description: data.description || '' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI error' }, { status: 500 })
  }
}
