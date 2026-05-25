import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const BOT = process.env.TELEGRAM_BOT_TOKEN ?? ''
  const CHAT = process.env.TELEGRAM_CHAT_ID ?? ''
  if (!BOT || !CHAT) return NextResponse.json({ ok: true })

  const { email, amount, stars, packageName } = await req.json()
  const text = `💰 <b>Оплата КарткаАІ!</b>\n📧 ${email||'—'}\n💳 ${packageName||''}: ${amount} грн\n⭐ +${stars} зорь`

  await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: 'HTML' }),
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
