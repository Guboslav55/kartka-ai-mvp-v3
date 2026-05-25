import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? ''

async function tg(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
  }).catch(() => {})
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const record = body.record || body
  if (!record?.id || !record?.email) return NextResponse.json({ ok: true })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  const { data: existing } = await supabase.from('users').select('id').eq('id', record.id).single()
  if (!existing) {
    const code = 'UA-' + Math.floor(Math.random()*99999).toString().padStart(5,'0')
    await supabase.from('users').insert({ id: record.id, email: record.email, plan: 'free', cards_left: 5, cards_total: 0, stars_balance: 5, free_stars_given: true, free_regenerations: 3, account_code: code })
    await supabase.from('star_transactions').insert({ user_id: record.id, type: 'free_gift', amount: 5, description: 'Вітальні зорі при реєстрації 🎁' })
    await tg(`🆕 <b>Новий юзер!</b>\n📧 ${record.email}\n⭐ +5 зорь нараховано`)
  }
  return NextResponse.json({ ok: true })
}
