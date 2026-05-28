import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
          { type: 'text', text: `Analyze this product photo. Respond in ${langHint}. Return JSON:
{"productName":"product name","category":"category","bullets":["feature 1","feature 2","feature 3"],"keepBackground":false,"bbox":{"w":0.8,"h":0.8}}
keepBackground=true if background is already clean/white. bbox is approximate product area (0-1).` }
        ]
      }],
      max_tokens: 300,
      response_format: { type: 'json_object' }
    })
    const data = JSON.parse(res.choices[0]?.message?.content || '{}')
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ productName: '', category: '', bullets: [], keepBackground: false }, { status: 200 })
  }
}
