import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/onboarding'

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const userId = data.user.id
      const accountCode = 'UA-' + Math.floor(Math.random() * 99999).toString().padStart(5, '0')

      // Upsert user profile — ignoreDuplicates so existing users aren't overwritten
      const { data: upserted, error: upsertError } = await supabase.from('users').upsert({
        id: userId,
        email: data.user.email,
        plan: 'free',
        cards_left: 5,
        cards_total: 0,
        stars_balance: 5,
        free_stars_given: true,
        free_regenerations: 3,
        account_code: accountCode,
      }, { onConflict: 'id', ignoreDuplicates: true })

      // Check if this is a NEW user (upsert inserted, not updated)
      const { data: profile } = await supabase.from('users').select('stars_balance, free_stars_given').eq('id', userId).single()
      const isNew = !upsertError && profile

      if (isNew) {
        // Log welcome gift transaction (ignore errors)
        await supabase.from('star_transactions').insert({
          user_id: userId,
          type: 'free_gift',
          amount: 5,
          description: 'Вітальні зорі при реєстрації 🎁',
        }).then(() => {})
      }
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kartka-ai-mvp-v3.vercel.app'
  return NextResponse.redirect(new URL('/onboarding', baseUrl))
}
