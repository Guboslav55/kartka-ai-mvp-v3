import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const EDIT_COST = 2

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

  // Check stars
  const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
  const balance = profile?.stars_balance ?? 0
  if (balance < EDIT_COST) return NextResponse.json({ error: `Недостатньо зорь (${EDIT_COST} ⭐)`, needStars: true }, { status: 402 })

  const { cardId, userMessage, card, history = [] } = await req.json()
  if (!userMessage || !card) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

  const messages: any[] = [
    {
      role: 'system',
      content: `You are a copywriting assistant for Ukrainian marketplace sellers. 
Current card:
- Title: ${card.title}
- Description: ${card.description}
- Benefits: ${Array.isArray(card.bullets) ? card.bullets.join(', ') : card.bullets}
- Keywords: ${Array.isArray(card.keywords) ? card.keywords.join(', ') : card.keywords}
- Platform: ${card.platform}

When user asks to change something, respond with:
1. A short explanation in Ukrainian of what you changed
2. JSON diff with only changed fields

Format: <explanation>text</explanation><diff>{"field":"new value"}</diff>
Fields: title (string), description (string), bullets (array), keywords (array)`
    },
    ...history.map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ]

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 800,
    temperature: 0.7,
  })

  const content = res.choices[0]?.message?.content || ''

  // Parse response
  const explMatch = content.match(/<explanation>([\s\S]*?)<\/explanation>/)
  const diffMatch = content.match(/<diff>([\s\S]*?)<\/diff>/)

  let diff: Record<string, any> = {}
  let explanation = content

  if (explMatch) explanation = explMatch[1].trim()
  if (diffMatch) {
    try { diff = JSON.parse(diffMatch[1]) } catch {}
  }

  const changedFields = Object.keys(diff)

  // Save changes to DB if cardId provided
  if (cardId && changedFields.length > 0) {
    await supabase.from('cards').update(diff).eq('id', cardId).eq('user_id', user.id)
  }

  // Deduct stars
  await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: EDIT_COST })
  await supabase.from('star_transactions').insert({
    user_id: user.id, type: 'spend', amount: -EDIT_COST,
    description: `AI редагування: ${userMessage.slice(0, 40)}`
  })

  return NextResponse.json({ diff, explanation, changedFields, starsSpent: EDIT_COST, newBalance: balance - EDIT_COST })
}
