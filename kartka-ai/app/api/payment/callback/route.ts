// app/api/payment/callback/route.ts
// LiqPay Webhook — спрацьовує після успішної оплати

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addStars } from '@/lib/stars'
import crypto from 'crypto'

const LIQPAY_PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY!

function verifySignature(data: string, signature: string): boolean {
  const expected = crypto
    .createHash('sha1')
    .update(LIQPAY_PRIVATE_KEY + data + LIQPAY_PRIVATE_KEY)
    .digest('base64')
  return expected === signature
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const data = formData.get('data') as string
  const signature = formData.get('signature') as string

  // 1. Перевірка підпису
  if (!verifySignature(data, signature)) {
    console.error('[LiqPay callback] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 2. Декодуємо дані
  let payload: Record<string, string>
  try {
    payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  const { status, order_id, amount, currency, payment_id } = payload

  // 3. Обробляємо тільки успішні платежі
  if (status !== 'success' && status !== 'sandbox') {
    console.log(`[LiqPay callback] Ignored status: ${status}, order: ${order_id}`)
    return NextResponse.json({ ok: true })
  }

  const supabase = createClient()

  // 4. Знаходимо платіж
  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('liqpay_order_id', order_id)
    .single()

  if (error || !payment) {
    console.error(`[LiqPay callback] Payment not found: ${order_id}`)
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  // 5. Ідемпотентність — не нараховувати двічі
  if (payment.status === 'success') {
    console.log(`[LiqPay callback] Already processed: ${order_id}`)
    return NextResponse.json({ ok: true })
  }

  // 6. Оновлюємо статус платежу
  await supabase
    .from('payments')
    .update({
      status: 'success',
      liqpay_payment_id: payment_id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', payment.id)

  // 7. Нараховуємо зорі
  const pkg = { name: 'Пакет зорь', id: payment.package_id }
  await addStars(
    payment.user_id,
    payment.stars_amount,
    'purchase',
    `Поповнення: ${payment.stars_amount} ⭐ (замовлення ${order_id})`,
    payment_id,
  )

  // 8. Якщо був промокод — застосовуємо його використання
  if (payment.promo_code) {
    try {
      const { data: promo } = await supabase
        .from('promo_codes')
        .select('id')
        .eq('code', payment.promo_code)
        .single()

      if (promo) {
        await supabase.from('promo_code_uses').insert({
          user_id: payment.user_id,
          promo_code_id: promo.id,
        })
        await supabase.rpc('increment_promo_uses', { p_promo_id: promo.id })
      }
    } catch {
      // Не критично якщо не вдалось
    }
  }

  console.log(
    `[LiqPay callback] ✅ Нараховано ${payment.stars_amount} зорь → user ${payment.user_id}`,
  )

  return NextResponse.json({ ok: true })
}
