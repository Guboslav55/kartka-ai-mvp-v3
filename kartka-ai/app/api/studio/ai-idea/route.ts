import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const { productName, category, displayStyle, mode = 'random' } = await req.json()

  const styleMap: Record<string, string> = {
    model:   'на моделі в міському середовищі',
    store:   'на вішаку або підставці як у магазині',
    flatlay: 'раскладка зверху на поверхні',
    catalog: 'студійна фотографія на білому фоні',
  }
  const styleNote = styleMap[displayStyle] || ''

  const prompt = mode === 'random'
    ? `Generate a creative photography wish/requirement for a product photo.
Product: "${productName || 'товар'}", Category: "${category || 'одяг'}", Display: ${styleNote}
Write in Ukrainian, 2-4 sentences describing: lighting, mood, composition, color palette, atmosphere.
Examples of good wishes: "М'яке бічне освітлення, мінімалістичний фон, акцент на текстурі тканини"
Be specific and creative. Return ONLY the wish text, no explanations.`
    : `You are a creative photography director. Generate a detailed scene description for a product photo.
Product: "${productName || 'товар'}", Category: "${category || 'одяг'}", Style: ${styleNote}
Write in Ukrainian, 4-6 sentences. Describe: environment, lighting, mood, color palette, camera angle, composition details.
Make it vivid and professional. Return ONLY the description.`

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.9,
    })
    return NextResponse.json({ idea: res.choices[0]?.message?.content?.trim() || '' })
  } catch (e) {
    return NextResponse.json({ error: 'Помилка генерації ідеї' }, { status: 500 })
  }
}
