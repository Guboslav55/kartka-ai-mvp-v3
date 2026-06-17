import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Перевіряє набір фото і повертає індекси тих, що НЕ відносяться до товару.
// Еталон — фото 0 (саме воно дало назву товару) + назва productName.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { photos, productName = '' } = await req.json()
  if (!Array.isArray(photos) || photos.length < 2) {
    return NextResponse.json({ irrelevant: [] })
  }

  const pics: string[] = photos.slice(0, 10)

  try {
    // Будуємо контент: текстова мітка перед кожним фото, потім інструкція.
    const content: any[] = []
    pics.forEach((url, i) => {
      content.push({ type: 'text', text: `Фото ${i}:` })
      content.push({ type: 'image_url', image_url: { url, detail: 'low' } })
    })

    content.push({
      type: 'text',
      text: `Усі ці фото мали б показувати ОДИН і той самий товар${productName ? `: "${productName}"` : ''}.
Фото 0 — еталон (це і є потрібний товар). Порівняй кожне інше фото з еталоном.

Для КОЖНОГО фото визнач "belongs":
- true  — це той самий товар (інший ракурс, деталь, бирка/етикетка цього ж товару, упаковка цього ж товару).
- false — це ЯВНО інший товар, випадкове/стороннє фото, скріншот, чужий предмет, не пов'язаний з товаром.

ВАЖЛИВО: за будь-яких сумнівів став belongs:true. Познач false ТІЛЬКИ коли ВПЕВНЕНО, що фото не стосується товару.
Фото 0 завжди belongs:true.

Поверни ТІЛЬКИ JSON:
{ "results": [ {"index": 0, "belongs": true}, {"index": 1, "belongs": false} ] }`
    })

    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content }],
      max_tokens: 300,
      response_format: { type: 'json_object' },
      temperature: 0,
    })

    const data = JSON.parse(res.choices[0]?.message?.content || '{}')
    const results: any[] = Array.isArray(data.results) ? data.results : []

    const irrelevant: number[] = results
      .filter(r => r && r.belongs === false && Number(r.index) > 0)
      .map(r => Number(r.index))
      .filter(i => Number.isInteger(i) && i >= 0 && i < pics.length)

    return NextResponse.json({ irrelevant })
  } catch (e: any) {
    console.error('check-product-photos:', e?.message)
    // На помилці — нічого не блокуємо, повертаємо порожньо.
    return NextResponse.json({ irrelevant: [] })
  }
}
