import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PLAN_CARDS: Record<string, number> = {
  'КарткаАІ Про': 200,
  'КарткаАІ Бізнес': 99999,
};
const PLAN_NAME: Record<string, string> = {
  'КарткаАІ Про': 'pro',
  'КарткаАІ Бізнес': 'business',
};

function verifySignature(body: Record<string, string>): boolean {
  const key = process.env.WAYFORPAY_MERCHANT_KEY!;
  const params = [body.merchantAccount, body.orderReference, body.amount, body.currency, body.authCode, body.cardPan, body.transactionStatus, body.reasonCode];
  const expected = crypto.createHmac('md5', key).update(params.join(';')).digest('hex');
  return expected === body.merchantSignature;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!verifySignature(body)) return NextResponse.json({ status: 'error' }, { status: 400 });

    if (body.transactionStatus === 'Approved') {
      const cardsToAdd = PLAN_CARDS[body.productName] ?? 0;
      const planSlug = PLAN_NAME[body.productName] ?? 'free';
      if (cardsToAdd > 0 && body.clientEmail) {
        const { data: users } = await supabaseAdmin.from('users').select('id, cards_left').eq('email', body.clientEmail);
        if (users?.length) {
          await supabaseAdmin.from('users').update({
            plan: planSlug,
            cards_left: planSlug === 'business' ? 99999 : (users[0].cards_left ?? 0) + cardsToAdd,
          }).eq('id', users[0].id);
        }
      }
    }

    const time = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac('md5', process.env.WAYFORPAY_MERCHANT_KEY!).update(`${body.orderReference};accept;${time}`).digest('hex');
    return NextResponse.json({ orderReference: body.orderReference, status: 'accept', time, signature });
  } catch (err) {
    console.error('Payment webhook error:', err);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
