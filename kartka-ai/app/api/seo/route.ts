import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 2

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
  const balance = profile?.stars_balance ?? 0
  if (balance < COST) return NextResponse.json({ error: `Недостатньо зорь (${COST} ⭐)`, needStars: true }, { status: 402 })

  const { title, description, bullets = [], keywords = [], platform = 'prom', lang = 'uk' } = await req.json()
  if (!title) return NextResponse.json({ error: 'Потрібна назва товару' }, { status: 400 })

  const langHint = lang === 'uk' ? 'Ukrainian' : lang === 'ru' ? 'Russian' : 'English'
  const platformMap: Record<string, string> = {
    prom: 'Prom.ua (Ukrainian B2B/B2C marketplace, title max 80 chars)',
    rozetka: 'Rozetka (largest Ukrainian retailer, SEO-focused)',
    olx: 'OLX Ukraine (classified ads, casual tone)',
    google: 'Google Shopping (product title and description)',
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: `You are an SEO expert for Ukrainian e-commerce. Write in ${langHint}.
Platform: ${platformMap[platform] || platformMap.prom}

Current product info:
- Title: ${title}
- Description: ${description?.slice(0, 200) || ''}
- Key features: ${bullets.slice(0, 3).join(', ')}
- Current keywords: ${keywords.slice(0, 5).join(', ')}

Generate optimized SEO content. Return ONLY valid JSON:
{
  "seoTitle": "optimized SEO title for ${platform}",
  "metaDescription": "155 chars meta description",
  "h1": "H1 heading",
  "searchKeywords": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7","keyword8"],
  "longTailKeywords": ["long tail 1","long tail 2","long tail 3"],
  "priceSuggestion": "price positioning note",
  "categoryPath": "suggested category > subcategory",
  "tags": ["tag1","tag2","tag3","tag4","tag5"]
}`
    }],
    max_tokens: 800,
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}')

  await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: COST })
  await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -COST, description: `SEO: ${title.slice(0, 40)}` })

  return NextResponse.json({ ...result, starsSpent: COST, newBalance: balance - COST })
}
