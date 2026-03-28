import crypto from 'node:crypto';

export const PLANS = {
  pro: { name: 'КарткаАІ Про', price: 499, cards: 200 },
  business: { name: 'КарткаАІ Бізнес', price: 1490, cards: 99999 },
};

export function generateWayforpaySignature(params: string[], key: string): string {
  const str = params.join(';');
  return crypto.createHmac('md5', key).update(str).digest('hex');
}

export function buildPaymentForm(plan: 'pro' | 'business', userEmail: string, orderId: string) {
  const merchant = process.env.NEXT_PUBLIC_WAYFORPAY_MERCHANT!;
  const key = process.env.WAYFORPAY_MERCHANT_KEY!;
  const { name, price } = PLANS[plan];
  const domain = process.env.NEXT_PUBLIC_SITE_URL!;
  const returnUrl = `${domain}/dashboard?payment=success`;
  const serviceUrl = `${domain}/api/payment`;
  const orderDate = Math.floor(Date.now() / 1000).toString();
  const amount = price.toString();
  const currency = 'UAH';
  const qty = '1';

  const signParams = [
    merchant, orderId, amount, currency, orderDate,
    name, qty, amount,
  ];
  const signature = generateWayforpaySignature(signParams, key);

  return {
    merchantAccount: merchant,
    merchantDomainName: new URL(domain).hostname,
    merchantSignature: signature,
    orderReference: orderId,
    orderDate,
    amount,
    currency,
    orderTimeout: '49000',
    productName: name,
    productCount: qty,
    productPrice: amount,
    clientEmail: userEmail,
    returnUrl,
    serviceUrl,
    language: 'UA',
    paymentSystems: 'card;googlePay;applePay',
  };
}
