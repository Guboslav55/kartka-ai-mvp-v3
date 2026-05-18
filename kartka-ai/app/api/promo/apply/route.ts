import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await req.json()
  if (!code?.trim()) return NextResponse.json({ error: 'Введіть промокод' }, { status: 400 })

  const upperCode = code.trim().toUpperCase()
  const { data: promo, error } = await supabase.from('promo_codes').select('*').eq('code', upperCode).eq('is_active', true).single()
  if (error || !promo) return NextResponse.json({ error: 'Промокод не знайдено' }, { status: 404 })
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) return NextResponse.json({ error: 'Термін дії закінчився' }, { status: 400 })
  if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) return NextResponse.json({ error: 'Ліміт вичерпано' }, { status: 400 })

  const { data: alreadyUsed } = await supabase.from('promo_code_uses').select('id').eq('user_id', user.id).eq('promo_code_id', promo.id).maybeSingle()
  if (alreadyUsed) return NextResponse.json({ error: 'Ви вже використовували цей промокод' }, { status: 400 })

  if (promo.free_stars && promo.free_stars > 0) {
    await supabase.rpc('add_stars', { p_user_id: user.id, p_amount: promo.free_stars })
    await supabase.from('star_transactions').insert({ user_id: user.id, type: 'promo', amount: promo.free_stars, description: `Промокод ${upperCode}: +${promo.free_stars} ⭐` })
    await supabase.from('promo_code_uses').insert({ user_id: user.id, promo_code_id: promo.id })
    await supabase.from('promo_codes').update({ uses_count: promo.uses_count + 1 }).eq('id', promo.id)
    return NextResponse.json({ success: true, type: 'stars', free_stars: promo.free_stars, message: `🎉 Отримано ${promo.free_stars} зорь!` })
  }

  if (promo.discount_percent && promo.discount_percent > 0) {
    return NextResponse.json({ success: true, type: 'discount', discount_percent: promo.discount_percent, promo_id: promo.id, message: `✅ Знижка ${promo.discount_percent}% активована` })
  }

  return NextResponse.json({ error: 'Невідомий тип промокоду' }, { status: 500 })
}
