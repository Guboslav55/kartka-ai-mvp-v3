import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const FREE_REGENS = 3
const REGEN_COST = 2 // зорі якщо безкоштовні закінчились

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

  const { cardId, field, currentValue, productName, platform, lang = 'uk' } = await req.json()
  if (!cardId || !field) return NextResponse.json({ error: 'Потрібен cardId та field' }, { status: 400 })

  // Check regeneration allowance
  const { data: profile } = await supabase.from('users').select('stars_balance, free_regenerations').eq('id', user.id).single()
  const freeLeft = profile?.free_regenerations ?? 0
  const starsBalance = profile?.stars_balance ?? 0
  const isFree = freeLeft > 0

  if (!isFree && starsBalance < REGEN_COST) {
    return NextResponse.json({ error: `Недостатньо зорь (потрібно ${REGEN_COST} ⭐). Залишок безкоштовних регенерацій: 0`, needStars: true }, { status: 402 })
  }

  const langHint = lang === 'uk' ? 'Пиши ТІЛЬКИ українською' : lang === 'ru' ? 'Пиши ТІЛЬКИ російською' : 'Write ONLY in English'
  const platformHint = platform === 'prom' ? 'Prom.ua (заголовок до 80 симв)' : platform === 'rozetka' ? 'Rozetka' : 'OLX'

  const fieldPrompts: Record<string, string> = {
    title: `${langHint}. Перепиши SEO-заголовок для маркетплейсу ${platformHint}. Товар: "${productName}". Поточний: "${currentValue}". Зроби інший варіант — більш конкретний, з ключовими словами. Лише заголовок, без пояснень.`,
    description: `${langHint}. Перепиши опис товару "${productName}" для ${platformHint}. Поточний: "${currentValue}". Зроби інший варіант — більш продаючий, з іншою структурою. Лише опис, без пояснень.`,
    bullets: `${langHint}. Перепиши переваги товару "${productName}". Поточні: "${currentValue}". Зроби 5 інших конкретних переваг з деталями. Відповідай JSON масивом: ["перевага 1","перевага 2","перевага 3","перевага 4","перевага 5"]`,
    keywords: `${langHint}. Напиши 6 нових ключових слів для "${productName}" на ${platformHint}. Відповідай JSON масивом: ["слово1","слово2","слово3","слово4","слово5","слово6"]`,
  }

  const prompt = fieldPrompts[field]
  if (!prompt) return NextResponse.json({ error: 'Невідоме поле' }, { status: 400 })

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
    temperature: 0.85,
  })

  let newValue = completion.choices[0]?.message?.content?.trim() || ''
  if ((field === 'bullets' || field === 'keywords') && newValue.includes('[')) {
    try { newValue = JSON.parse(newValue.slice(newValue.indexOf('['), newValue.lastIndexOf(']') + 1)) }
    catch { /* keep as string */ }
  }

  // Update card in DB
  await supabase.from('cards').update({ [field]: newValue }).eq('id', cardId).eq('user_id', user.id)

  // Deduct cost
  if (isFree) {
    await supabase.from('users').update({ free_regenerations: freeLeft - 1 }).eq('id', user.id)
  } else {
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: REGEN_COST })
    await supabase.from('star_transactions').insert({ user_id: user.id, type: 'regeneration', amount: -REGEN_COST, description: `Регенерація: ${field} для "${productName?.slice(0,30)}"` })
  }

  return NextResponse.json({
    newValue,
    isFree,
    starsSpent: isFree ? 0 : REGEN_COST,
    freeLeft: isFree ? freeLeft - 1 : 0,
    newBalance: isFree ? starsBalance : starsBalance - REGEN_COST,
  })
}
