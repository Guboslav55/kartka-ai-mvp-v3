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
- "keep": true для БУДЬ-ЯКОГО фото, де видно сам товар — спереду, ЗЗАДУ, збоку, зсередини, капюшон, рукав, комір, деталь крупним планом, складеним, на вішаку, розкладкою чи вдягненим. false ТІЛЬКИ коли ГОЛОВНИЙ об'єкт фото — НЕ сам товар: бирка, паперова етикетка, розмірна таблиця/догляд, штрихкод, наклейка, чек, коробка/пакет-упаковка або зовсім сторонній предмет. За сумнівів — keep:true.
- "wearable": true ЛИШЕ якщо товар показано крупно, чітко й приблизно АНФАС (вид спереду — на вішаку, розкладкою чи вдягнений). false якщо це вид ЗЗАДУ, збоку, дрібно/здалеку, під дивним кутом чи частково за кадром. Вид ЗЗАДУ — це keep:true, wearable:false (НЕ keep:false).
- "person": true якщо на фото є людина (модель), яка вдягнена в товар або тримає його; false якщо людини немає (товар сам, на вішаку, розкладкою тощо).

Поверни ТІЛЬКИ JSON: {"items":[{"keep":bool,"wearable":bool,"person":bool}, ...]} — рівно ${pics.length} записів у тому ж порядку.`
    }]
    pics.forEach(url => content.push({ type: 'image_url', image_url: { url, detail: 'high' } }))

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

    const hasModel = items.some((x, i) => keep[i] && x?.person === true)

    return NextResponse.json({ irrelevant, notForModel, hasModel })
  } catch (e: any) {
    console.error('check-product-photos:', e?.message)
    return NextResponse.json({ irrelevant: [], notForModel: [] })
  }
}
