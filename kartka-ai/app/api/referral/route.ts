import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const REFERRER_BONUS = 20   // зорі за запрошеного
const INVITED_BONUS  = 10   // зорі для нового юзера

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

  const { referralCode } = await req.json()
  if (!referralCode?.trim()) return NextResponse.json({ error: 'Немає реферального коду' }, { status: 400 })

  // Check if user already used a referral
  const { data: currentUser } = await supabase.from('users').select('referred_by, account_code, stars_balance').eq('id', user.id).single()
  if (currentUser?.referred_by) return NextResponse.json({ error: 'Ви вже використали реферальний код' }, { status: 400 })
  if (currentUser?.account_code === referralCode.toUpperCase()) return NextResponse.json({ error: 'Не можна використати власний код' }, { status: 400 })

  // Find referrer
  const { data: referrer } = await supabase.from('users').select('id, stars_balance').eq('account_code', referralCode.toUpperCase()).single()
  if (!referrer) return NextResponse.json({ error: 'Реферальний код не знайдено' }, { status: 404 })

  // Give bonus to invited user
  await supabase.rpc('add_stars', { p_user_id: user.id, p_amount: INVITED_BONUS })
  await supabase.from('star_transactions').insert({ user_id: user.id, type: 'promo', amount: INVITED_BONUS, description: `Реферальний бонус: +${INVITED_BONUS} ⭐` })
  await supabase.from('users').update({ referred_by: referrer.id }).eq('id', user.id)

  // Give bonus to referrer
  await supabase.rpc('add_stars', { p_user_id: referrer.id, p_amount: REFERRER_BONUS })
  await supabase.from('star_transactions').insert({ user_id: referrer.id, type: 'promo', amount: REFERRER_BONUS, description: `Запросив друга: +${REFERRER_BONUS} ⭐` })

  return NextResponse.json({ success: true, bonus: INVITED_BONUS, message: `🎉 +${INVITED_BONUS} зорь нараховано!` })
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('account_code').eq('id', user.id).single()
  const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('referred_by', user.id)

  return NextResponse.json({ code: profile?.account_code || null, referrals: count || 0, referrerBonus: REFERRER_BONUS, invitedBonus: INVITED_BONUS })
}
