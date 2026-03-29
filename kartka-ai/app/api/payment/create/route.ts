import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildLiqpayParams } from '@/lib/liqpay';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan } = await req.json();
  if (!['pro', 'business'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const orderId = `kartka-${user.id.slice(0, 8)}-${Date.now()}`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const params = buildLiqpayParams(
    plan,
    orderId,
    `${siteUrl}/payment-result?payment=success`,
    `${siteUrl}/api/payment`
  );

  return NextResponse.json(params);
}

