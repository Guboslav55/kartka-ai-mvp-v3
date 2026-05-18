import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPackageById } from '@/lib/stars'
import crypto from 'crypto'

const LIQPAY_PUBLIC_KEY = process.env.LIQPAY_PUBLIC_KEY!
const LIQPAY_PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY!
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL!

function liqpaySign(data: string): string {
  return crypto.createHash('sha1').update(LIQPAY_PRIVATE_KEY + data + LIQPAY_PRIVATE_KEY).digest('base64')
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { packageId, promoCode } = await req.json()
  const pkg = getPackageById(packageId)
  if (!pkg) return NextResponse.json({ error: 'Пакет не знайдено' }, { status: 400 })

  let finalPrice = pkg.price_uah
  let discountPercent = 0

  if (promoCode) {
    const { data: promo } = await supabase.from('promo_codes').select('*').eq('code', promoCode.toUpperCase().trim()).eq('is_active', true).single()
    if (promo && promo.discount_percent > 0) {
      discountPercent = promo.discount_percent
      finalPrice = Math.round(pkg.price_uah * (1 - discountPercent / 100))
    }
  }

  const orderId = `kartka_${user.id.slice(0, 8)}_${packageId}_${Date.now()}`
  const totalStars = pkg.stars + pkg.bonus_stars

  await supabase.from('payments').insert({
    user_id: user.id, package_id: packageId, stars_amount: totalStars,
    price_uah: finalPrice, liqpay_order_id: orderId, status: 'pending',
    promo_code: promoCode ?? null, discount_percent: discountPercent,
  })

  const params = {
    version: '3', public_key: LIQPAY_PUBLIC_KEY, action: 'pay',
    amount: finalPrice, currency: 'UAH',
    description: `КарткаАІ: ${pkg.name} (${totalStars} зорь)`,
    order_id: orderId,
    result_url: `${BASE_URL}/payment/success?order=${orderId}`,
    server_url: `${BASE_URL}/api/payment/callback`,
    language: 'uk',
  }
  const dataBase64 = Buffer.from(JSON.stringify(params)).toString('base64')
  return NextResponse.json({ data: dataBase64, signature: liqpaySign(dataBase64), orderId, finalPrice, totalStars, discountPercent })
}
