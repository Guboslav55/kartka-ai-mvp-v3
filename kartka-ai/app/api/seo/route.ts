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

  const langNames: Record<string,string> = { uk: 'Ukrainian', ru: 'Russian', en: 'English' }
  const reqLangCodes = platform === 'prom' ? ['uk', 'ru'] : [lang]

  const PLATFORM_RULES: Record<string, string> = {
    prom: 'Prom.ua marketplace. SEO title up to 80 characters with the main keyword first; include key attributes (type, material, colour). Buyers search in BOTH Ukrainian and Russian.',
    rozetka: 'Rozetka — the most SEO-heavy Ukrainian retailer. Long descriptive title: brand + model + product type + key attribute. Description must be the most thorough and attribute-rich; weave keywords densely but naturally.',
    olx: 'OLX classifieds — person-to-person ads. Keep everything SHORT, simple and conversational (e.g. "В наявності", "Відправка щодня Новою Поштою", "Стан новий"). Minimal marketing. Plain short title, no keyword stuffing. Focus on item, condition and availability.',
    google: 'Google Shopping product FEED. Title MUST be: Brand + Product type + key attributes (gender, colour, material), max 70 characters, NO marketing or salesy words. Descriptions factual and dry, concrete attributes only, no emotional selling.',
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: `You are a senior e-commerce copywriter and SEO specialist for the Ukrainian market.
Platform: ${platform} — ${PLATFORM_RULES[platform] || PLATFORM_RULES.prom}

Product:
- Title: ${title}
- Notes: ${description?.slice(0, 400) || '—'}
- Features: ${bullets.slice(0, 6).join(', ') || '—'}
- Seed keywords: ${keywords.slice(0, 8).join(', ') || '—'}

Produce a COMPLETE localized block for EACH of these languages, in this exact order: ${reqLangCodes.join(', ')}.
Each block must include TWO selling description variants:
- "descriptionPremium": restrained premium tone. Confident, driven by concrete benefits and facts, no pressure, no clichés. 500-800 characters.
- "descriptionActive": active selling. Open with a strong hook addressing the buyer's desire or pain; speak in buyer-benefit language (e.g. "не промокнеш під дощем" instead of "водостійка тканина"); answer one likely objection; finish with a soft call to action. 500-800 characters.

STRICT RULES:
- Each block fully in its target language, natural and fluent — NEVER machine-translated, never mixed languages.
- FORBIDDEN empty filler: "висока якість", "ергономічний дизайн", "сучасний дизайн", "найкращий вибір", "ідеальне рішення". Replace with concrete benefits, materials, use-cases.
- Descriptions: plain text only, NO markdown, NO emoji, NO bullet symbols; short paragraphs.
- Keywords: real buyer search queries (synonyms, type, brand/model, use-case, intent words like "купити"); no duplicates.
- Strictly respect the platform rules above (title length, tone, dryness).

Return ONLY valid JSON with this shape:
{
  "categoryPath": "category > subcategory",
  "priceSuggestion": "short price positioning note",
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "blocks": [
    {
      "lang": "${reqLangCodes[0]}",
      "seoTitle": "...",
      "metaDescription": "150-160 chars",
      "h1": "...",
      "descriptionPremium": "...",
      "descriptionActive": "...",
      "searchKeywords": ["8 keywords"],
      "longTailKeywords": ["lt1","lt2","lt3"]
    }
  ]
}
Return EXACTLY ${reqLangCodes.length} block(s), one per language, in this order: ${reqLangCodes.join(', ')}. Each block fully written in its own language.`
    }],
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  })

  const result = JSON.parse(completion.choices[0]?.message?.content || '{}')

  await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: COST })
  await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -COST, description: `SEO: ${title.slice(0, 40)}` })

  return NextResponse.json({ ...result, starsSpent: COST, newBalance: balance - COST })
}
