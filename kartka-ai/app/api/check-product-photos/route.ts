import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Помічає фото, які генерація ВСЕ ОДНО відкине: бирки/етикетки/штрихкоди/
// упаковку/чеки, а також ЯВНО інший товар. Визначення збігається з
// classifyPhotos у /api/studio/generate, щоб червоний хрестик відповідав
// реальному відсіву й розрахунку зорь.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { photos, productName = '' } = await req.json()
  if (!Array.isArray(photos) || photos.length < 2) {
    return NextResponse.json({ irrelevant: [] })
  }

  const pics: string[] = photos.slice(0, 10)

  try {
    const content: any[] = [{
      type: 'text',
      text: `Перевір набір фото товару${productName ? ` ("${productName}")` : ''}. Для КОЖНОГО фото по порядку поверни "keep":
- keep:true  — фото показує САМ товар (будь-який ракурс, деталь, фрагмент того ж товару).
- keep:false — фото це переважно бирка, паперова етикетка, розмірна таблиця, штрихкод, наклейка, чек, УПАКОВКА/коробка, АБО це ЯВНО інший товар чи стороннє фото, не пов'язане з товаром.

Поверни ТІЛЬКИ JSON: {"items":[{"keep":bool}, ...]} — рівно ${pics.length} записів у тому ж порядку.`
    }]
    pics.forEach(url => content.push({ type: 'image_url', image_url: { url, detail: 'low' } }))

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content }],
      max_tokens: 300,
      response_format: { type: 'json_object' },
      temperature: 0,
    })

    const items: any[] = JSON.parse(res.choices[0]?.message?.content || '{}').items
    if (!Array.isArray(items) || items.length !== pics.length) {
      return NextResponse.json({ irrelevant: [] })
    }

    const irrelevant: number[] = items
      .map((x, i) => (x?.keep === false ? i : -1))
      .filter(i => i >= 0)

    // Якщо все відкинуто — бекенд однаково використає всі фото (fallback),
    // тож не позначаємо нічого, щоб UI збігався з реальною поведінкою.
    if (irrelevant.length >= pics.length) {
      return NextResponse.json({ irrelevant: [] })
    }

    return NextResponse.json({ irrelevant })
  } catch (e: any) {
    console.error('check-product-photos:', e?.message)
    return NextResponse.json({ irrelevant: [] })
  }
}
