import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const LIQPAY_PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY!

function verifySignature(data: string, signature: string): boolean {
  return crypto.createHash('sha1').update(LIQPAY_PRIVATE_KEY + data + LIQPAY_PRIVATE_KEY).digest('base64') === signature
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const data = formData.get('data') as string
  const signature = formData.get('signature') as string

  if (!verifySignature(data, signature))
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })

  let payload: Record<string, string>
  try { payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) }
  catch { return NextResponse.json({ error: 'Invalid data' }, { status: 400 }) }

  const { status, order_id, payment_id } = payload
  if (status !== 'success' && status !== 'sandbox') return NextResponse.json({ ok: true })

  // Use service role for webhook (no user token)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: payment, error } = await supabase.from('payments').select('*').eq('liqpay_order_id', order_id).single()
  if (error || !payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  if (payment.status === 'success') return NextResponse.json({ ok: true })

  await supabase.from('payments').update({ status: 'success', liqpay_payment_id: payment_id, completed_at: new Date().toISOString() }).eq('id', payment.id)
  await supabase.rpc('add_stars', { p_user_id: payment.user_id, p_amount: payment.stars_amount })
  await supabase.from('star_transactions').insert({ user_id: payment.user_id, type: 'purchase', amount: payment.stars_amount, description: `Поповнення: ${payment.stars_amount} ⭐`, payment_id })

  return NextResponse.json({ ok: true })
}
