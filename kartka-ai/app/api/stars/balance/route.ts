// app/api/stars/balance/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stars_balance, free_regenerations, account_code')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ balance: 0, free_regenerations: 0 })
  }

  return NextResponse.json({
    balance: profile.stars_balance ?? 0,
    free_regenerations: profile.free_regenerations ?? 0,
    account_code: profile.account_code ?? null,
  })
}
