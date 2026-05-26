import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'guboslav55@gmail.com'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use service role to verify admin
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const userSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user } } = await userSupabase.auth.getUser(token)
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { targetEmail, amount, reason } = await req.json()
  if (!targetEmail || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Потрібен email і кількість зорь' }, { status: 400 })
  }

  // Find target user
  const { data: targetUser } = await supabase
    .from('users')
    .select('id, email, stars_balance')
    .eq('email', targetEmail)
    .single()

  if (!targetUser) {
    return NextResponse.json({ error: `Юзер ${targetEmail} не знайдений` }, { status: 404 })
  }

  // Give stars
  await supabase.rpc('add_stars', { p_user_id: targetUser.id, p_amount: amount })
  await supabase.from('star_transactions').insert({
    user_id: targetUser.id,
    type: 'free_gift',
    amount,
    description: reason || `Адмін нарахував ${amount} ⭐`,
  })

  // Get new balance
  const { data: updated } = await supabase.from('users').select('stars_balance').eq('id', targetUser.id).single()

  return NextResponse.json({
    success: true,
    email: targetEmail,
    given: amount,
    newBalance: updated?.stars_balance ?? 0,
    message: `✅ ${amount} зорь нараховано для ${targetEmail}`,
  })
}
