// app/api/payment/create/route.ts
// Ініціація платежу через LiqPay

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPackageById } from '@/lib/stars'
import crypto from 'crypto'

const LIQPAY_PUBLIC_KEY = process.env.LIQPAY_PUBLIC_KEY!
const LIQPAY_PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY!
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL!

function liqpaySign(data: string): string {
  return crypto
    .createHash('sha1')
    .update(LIQPAY_PRIVATE_KEY + data + LIQPAY_PRIVATE_KEY)
    .digest('base64')
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { packageId, promoCode } = body as { packageId: string; promoCode?: string }

  const pkg = getPackageById(packageId)
  if (!pkg) {
    return NextResponse.json({ error: 'Пакет не знайдено' }, { status: 400 })
  }

  // Застосувати промокод якщо є
  let finalPrice = pkg.price_uah
  let discountPercent = 0

  if (promoCode) {
    const { data: promo } = await supabase
      .from('promo_codes')
      .select('*, promo_code_uses(id)')
      .eq('code', promoCode.toUpperCase().trim())
      .eq('is_active', true)
      .single()

    if (promo && promo.discount_percent > 0) {
      // Перевірка чи не використовував цей юзер
      const alreadyUsed = promo.promo_code_uses?.some(
        (u: { id: string }) => u !== null,
      )
      if (!alreadyUsed) {
        discountPercent = promo.discount_percent
        finalPrice = Math.round(pkg.price_uah * (1 - discountPercent / 100))
      }
    }
  }

  const orderId = `kartka_${user.id.slice(0, 8)}_${packageId}_${Date.now()}`
  const totalStars = pkg.stars + pkg.bonus_stars
  const description = `КарткаАІ: ${pkg.name} (${totalStars} зорь)`

  // Зберегти платіж у БД (pending)
  await supabase.from('payments').insert({
    user_id: user.id,
    package_id: packageId,
    stars_amount: totalStars,
    price_uah: finalPrice,
    liqpay_order_id: orderId,
    status: 'pending',
    promo_code: promoCode ?? null,
    discount_percent: discountPercent,
  })

  // Формуємо LiqPay data
  const params = {
    version: '3',
    public_key: LIQPAY_PUBLIC_KEY,
    action: 'pay',
    amount: finalPrice,
    currency: 'UAH',
    description,
    order_id: orderId,
    result_url: `${BASE_URL}/payment/success?order=${orderId}`,
    server_url: `${BASE_URL}/api/payment/callback`,
    language: 'uk',
  }

  const dataBase64 = Buffer.from(JSON.stringify(params)).toString('base64')
  const signature = liqpaySign(dataBase64)

  return NextResponse.json({
    data: dataBase64,
    signature,
    orderId,
    finalPrice,
    totalStars,
    discountPercent,
    pkg: {
      name: pkg.name,
      stars: pkg.stars,
      bonus_stars: pkg.bonus_stars,
    },
  })
}
