import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { cardId, variants } = await req.json();

    if (!cardId || !Array.isArray(variants) || variants.length === 0) {
      return NextResponse.json({ error: 'Missing cardId or variants' }, { status: 400 });
    }

    const { error } = await supabase
      .from('cards')
      .update({ infographic_urls: variants })
      .eq('id', cardId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Save infographics error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ saved: true });

  } catch (err: unknown) {
    console.error('Save infographics error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
