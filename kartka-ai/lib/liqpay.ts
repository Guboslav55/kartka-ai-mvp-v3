import crypto from 'node:crypto';

export const PLANS = {
  pro:      { name: 'КарткаАІ Про — 200 карточок',      amount: 499,  cards: 200,   plan: 'pro' },
  business: { name: 'КарткаАІ Бізнес — Безліміт',       amount: 1490, cards: 99999, plan: 'business' },
};

export function buildLiqpayParams(
  planId: 'pro' | 'business',
  orderId: string,
  resultUrl: string,
  serverUrl: string,
) {
  const plan = PLANS[planId];
  const params = {
    version:     '3',
    public_key:  process.env.LIQPAY_PUBLIC_KEY!,
    action:      'pay',
    amount:      String(plan.amount),
    currency:    'UAH',
    description: plan.name,
    order_id:    orderId,
    result_url:  resultUrl,
    server_url:  serverUrl,
    language:    'uk',
  };
  const data = Buffer.from(JSON.stringify(params)).toString('base64');
  const signature = crypto
    .createHash('sha1')
    .update(process.env.LIQPAY_PRIVATE_KEY! + data + process.env.LIQPAY_PRIVATE_KEY!)
    .digest('base64');
  return { data, signature };
}

export function verifyLiqpaySignature(data: string, signature: string): boolean {
  const expected = crypto
    .createHash('sha1')
    .update(process.env.LIQPAY_PRIVATE_KEY! + data + process.env.LIQPAY_PRIVATE_KEY!)
    .digest('base64');
  return expected === signature;
}
