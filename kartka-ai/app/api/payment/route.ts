import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyLiqpaySignature } from '@/lib/liqpay';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PLAN_CARDS: Record<string, number> = {
  'КарткаАІ Про — 200 карточок': 200,
  'КарткаАІ Бізнес — Безліміт':  99999,
};
const PLAN_SLUG: Record<string, string> = {
  'КарткаАІ Про — 200 карточок': 'pro',
  'КарткаАІ Бізнес — Безліміт':  'business',
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const data      = formData.get('data') as string;
    const signature = formData.get('signature') as string;

    if (!verifyLiqpaySignature(data, signature)) {
      console.error('Invalid LiqPay signature');
      return new NextResponse('Invalid signature', { status: 400 });
    }

    const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
    console.log('LiqPay callback:', payload.status, payload.order_id);

    if (payload.status === 'success' || payload.status === 'sandbox') {
      const description = payload.description as string;
      const orderId     = payload.order_id as string;

      // Extract user id from order_id: kartka-USERID8-timestamp
      const parts  = orderId.split('-');
      const userId8 = parts[1];

      const cardsToAdd = PLAN_CARDS[description] ?? 0;
      const planSlug   = PLAN_SLUG[description]  ?? 'free';

      if (cardsToAdd > 0 && userId8) {
        const { data: users } = await supabaseAdmin
          .from('users').select('id, cards_left')
          .ilike('id', `${userId8}%`);

        if (users && users.length > 0) {
          const u = users[0];
          await supabaseAdmin.from('users').update({
            plan:       planSlug,
            cards_left: planSlug === 'business' ? 99999 : (u.cards_left ?? 0) + cardsToAdd,
          }).eq('id', u.id);
          console.log('Updated user:', u.id, planSlug);
        }
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('Payment webhook error:', err);
    return new NextResponse('Error', { status: 500 });
  }
}

