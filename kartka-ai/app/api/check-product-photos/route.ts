import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Дзеркалить classifyPhotos з /api/studio/generate:
//  keep=false      -> взагалі не товар (бирка/упаковка/інше) — пропускається у ВСІХ режимах -> irrelevant
//  keep&!wearable  -> справжній товар, але не анфас — пропускається ЛИШЕ в режимі "На моделі" -> notForModel
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { photos, productName = '' } = await req.json()
  if (!Array.isArray(photos) || photos.length < 2) {
    return NextResponse.json({ irrelevant: [], notForModel: [] })
  }

  const pics: string[] = photos.slice(0, 10)

  try {
    const content: any[] = [{
      type: 'text',
      text: `Перевір набір фото товару${productName ? ` ("${productName}")` : ''}. Для КОЖНОГО фото по порядку поверни два булевих:
- "keep": true якщо фото показує САМ товар; false якщо це переважно бирка, паперова етикетка, розмірна таблиця, штрихкод, наклейка, чек, УПАКОВКА/коробка, або ЯВНО інший/сторонній предмет.
- "wearable": true ЛИШЕ якщо товар показано крупно, чітко й приблизно АНФАС — так, що його реально "вдягнути" на модель (вид спереду, на вішаку або вже вдягнений). false якщо це вид ззаду, розкладка пласко, дрібно/здалеку, під дивним кутом, частково за кадром або на захаращеному фоні.

Поверни ТІЛЬКИ JSON: {"items":[{"keep":bool,"wearable":bool}, ...]} — рівно ${pics.length} записів у тому ж порядку.`
    }]
    pics.forEach(url => content.push({ type: 'image_url', image_url: { url, detail: 'low' } }))

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content }],
      max_tokens: 400,
      response_format: { type: 'json_object' },
      temperature: 0,
    })

    const items: any[] = JSON.parse(res.choices[0]?.message?.content || '{}').items
    if (!Array.isArray(items) || items.length !== pics.length) {
      return NextResponse.json({ irrelevant: [], notForModel: [] })
    }

    const keep = items.map(x => x?.keep !== false)
    let irrelevant = keep.map((k, i) => (k ? -1 : i)).filter(i => i >= 0)
    // Якщо все відкинуто — бекенд однаково візьме всі (fallback) -> нічого не позначаємо
    if (irrelevant.length >= pics.length) irrelevant = []

    const notForModel = items
      .map((x, i) => (keep[i] && x?.wearable === false ? i : -1))
      .filter(i => i >= 0 && !irrelevant.includes(i))

    return NextResponse.json({ irrelevant, notForModel })
  } catch (e: any) {
    console.error('check-product-photos:', e?.message)
    return NextResponse.json({ irrelevant: [], notForModel: [] })
  }
}
