import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function GET() {
  return NextResponse.json({
    name: 'КарткаАІ Public API v1.0',
    endpoint: 'POST /api/public/generate',
    headers: { 'X-API-Key': 'your_api_key', 'Content-Type': 'application/json' },
    body: { productName: 'required', category: 'optional', features: 'optional', platform: 'prom|rozetka|olx|general', lang: 'uk|ru|en', tone: 'professional|friendly|premium|simple' },
    returns: { title: 'string', description: 'string', bullets: 'string[]', keywords: 'string[]', starsLeft: 'number' },
    cost: '2 ⭐ per request',
    pricing: 'https://kartka-ai-mvp-v3.vercel.app/pricing',
  })
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
  if (!apiKey) return NextResponse.json({ error: 'Потрібен X-API-Key заголовок' }, { status: 401 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: user } = await supabase.from('users').select('id, stars_balance').eq('api_key', apiKey).single()
  if (!user) return NextResponse.json({ error: 'Невірний API ключ' }, { status: 401 })
  if (user.stars_balance < 2) return NextResponse.json({ error: 'Недостатньо зорь', balance: user.stars_balance }, { status: 402 })

  const { productName, category='', features='', platform='general', lang='uk', tone='professional' } = await req.json()
  if (!productName?.trim()) return NextResponse.json({ error: 'productName required' }, { status: 400 })

  const langMap: Record<string,string> = { uk:'Ukrainian only', ru:'Russian only', en:'English only' }
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role:'user', content:`Write product card for Ukrainian marketplace. Language: ${langMap[lang]||'Ukrainian only'}. Platform: ${platform}. Tone: ${tone}.\nProduct: "${productName}"${category?`, Category: ${category}`:''}${features?`, Features: ${features}`:''}\nReturn ONLY JSON: {"title":"","description":"","bullets":["","","","",""],"keywords":["","","","","",""]}` }],
    max_tokens: 800, response_format: { type: 'json_object' }
  })

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}')
  if (!result.title) return NextResponse.json({ error: 'AI error' }, { status: 500 })

  await supabase.rpc('add_stars', { p_user_id: user.id, p_amount: -2 })
  await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -2, description: `API: ${productName.slice(0,40)}` })

  return NextResponse.json({ ...result, starsLeft: user.stars_balance - 2 })
}
