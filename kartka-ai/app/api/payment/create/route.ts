import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { buildPaymentForm } from '@/lib/wayforpay';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan } = await req.json();
  if (!['pro', 'business'].includes(plan)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

  const orderId = `kartka-${user.id.slice(0, 8)}-${Date.now()}`;
  const params = buildPaymentForm(plan, user.email!, orderId);
  return NextResponse.json(params);
}
