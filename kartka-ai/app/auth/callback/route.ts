import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    // Use service role to upsert new user — no user token yet at this point
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Create user profile with free stars
      await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        plan: 'free',
        cards_left: 5,
        cards_total: 0,
        stars_balance: 5,          // 5 безкоштовних зорь при реєстрації
        free_stars_given: true,
        free_regenerations: 3,
        account_code: 'UA-' + Math.floor(Math.random() * 99999).toString().padStart(5, '0'),
      }, { onConflict: 'id', ignoreDuplicates: true })

      // Log the free gift transaction
      await supabase.from('star_transactions').insert({
        user_id: data.user.id,
        type: 'free_gift',
        amount: 5,
        description: 'Вітальні зорі при реєстрації 🎁',
      }).then(() => {})  // ignore error if table not ready
    }
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
