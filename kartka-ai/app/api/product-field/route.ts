import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Regenerate ONE Prom.ua field (name | description | keywords) in one language (uk|ru).
// Cheap (gpt-4o-mini), NO star cost — for manual fine-tuning of a single text.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { field, lang = 'uk', name = '', category = '', description = '' } = await req.json()
  const langName = lang === 'ru' ? 'російською мовою' : 'українською мовою'
  const ctx = `Товар: "${name}". Категорія: "${category}".${description ? ` Поточний опис: "${String(description).slice(0, 400)}".` : ''}`

  let task = ''
  if (field === 'name') task = `Згенеруй SEO-назву позиції для Prom.ua ${langName}. Формула: тип/склад товару + ключові ознаки (колір, матеріал, призначення/аудиторія). ДО 80 символів. Поверни ЛИШЕ назву без лапок.`
  else if (field === 'description') task = `Згенеруй продаючий опис товару для Prom.ua ${langName}, 400-700 символів: сильний гачок про вигоду, 1-2 переваги, відповідь на заперечення, мʼякий заклик до дії. Звичайний текст без markdown.`
  else if (field === 'keywords') task = `Згенеруй РІВНО 8 пошукових запитів ${langName}, за якими покупці шукають цей товар на Prom.ua. Поверни через кому, без нумерації та лапок.`
  else return NextResponse.json({ error: 'Bad field' }, { status: 400 })

  try {
    const c = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.8,
      max_tokens: 700,
      messages: [{ role: 'user', content: `${ctx}\n\n${task}\nПиши САМЕ ${langName}, природно, не машинний переклад.` }],
    })
    const text = (c.choices[0]?.message?.content || '').trim()
    return NextResponse.json({ text })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI error' }, { status: 500 })
  }
}
