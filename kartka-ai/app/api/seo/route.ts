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
      content: `You are a senior SEO copywriter for Ukrainian e-commerce. Write ALL text in ${langHint}, natural and fluent (never machine-translated, never English mixed in).
Platform: ${platformMap[platform] || platformMap.prom}

Product:
- Title: ${title}
- Notes/description: ${description?.slice(0, 400) || '—'}
- Key features: ${bullets.slice(0, 6).join(', ') || '—'}
- Seed keywords: ${keywords.slice(0, 8).join(', ') || '—'}

STRICT RULES:
- Be SPECIFIC and concrete. NEVER use empty filler such as "висока якість", "ергономічний дизайн", "сучасний дизайн", "найкращий вибір", "ідеальне рішення". Replace any filler with a concrete benefit, material, feature or use-case.
- Keywords = real search queries Ukrainian buyers actually type: include product type, synonyms, brand/model if any, use-case, and buying-intent words (напр. "купити"). No duplicates, no single over-generic words.
- "fullDescription" = a ready-to-paste product description, 600-900 characters, in ${langHint}. Structure: 1) короткий чіпляючий вступ; 2) 3-5 конкретних переваг, природно вплетені ключові слова (без спаму); 3) кому підходить / сценарій використання; 4) коротке завершення. Short paragraphs, plain text only — NO markdown, NO emoji, NO bullet symbols.

Return ONLY valid JSON:
{
  "seoTitle": "SEO title, max 70 chars, main keyword near the start",
  "metaDescription": "150-160 chars, compelling, contains main keyword",
  "h1": "H1 heading",
  "fullDescription": "600-900 character selling description in ${langHint}",
  "searchKeywords": ["8 realistic search keywords"],
  "longTailKeywords": ["long tail phrase 1","long tail phrase 2","long tail phrase 3"],
  "priceSuggestion": "short price positioning note",
  "categoryPath": "category > subcategory",
  "tags": ["tag1","tag2","tag3","tag4","tag5"]
}`
    }],
    max_tokens: 1300,
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}')

  await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: COST })
  await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -COST, description: `SEO: ${title.slice(0, 40)}` })

  return NextResponse.json({ ...result, starsSpent: COST, newBalance: balance - COST })
}
