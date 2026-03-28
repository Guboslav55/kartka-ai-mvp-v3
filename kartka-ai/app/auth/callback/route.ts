import { createServerSupabase } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    if (data.user) {
      await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        plan: 'free',
        cards_left: 5,
        cards_total: 0,
      }, { onConflict: 'id', ignoreDuplicates: true });
    }
  }

  return NextResponse.redirect(new URL('/onboarding', request.url));
}
