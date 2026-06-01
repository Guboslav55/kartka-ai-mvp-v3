import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && session) {
      const userId = session.user.id

      // Give 10 stars to new users
      const { data: existing } = await supabase
        .from('users')
        .select('id, onboarding_done')
        .eq('id', userId)
        .single()

      if (!existing) {
        await supabase.from('users').insert({
          id: userId,
          email: session.user.email,
          stars_balance: 10,
          onboarding_done: false,
        })
        // New user → onboarding
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      // Check if onboarding done
      if (!existing.onboarding_done) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=callback`)
}
