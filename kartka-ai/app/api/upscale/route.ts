import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60
const UPSCALE_COST = 2

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl, imageBase64, scale = 2 } = await req.json()

  const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
  const balance = profile?.stars_balance ?? 0
  if (balance < UPSCALE_COST) {
    return NextResponse.json({ error: `Недостатньо зорь (потрібно ${UPSCALE_COST} ⭐)`, needStars: true }, { status: 402 })
  }

  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN
  if (!REPLICATE_TOKEN) {
    // Fallback: use sharp to upscale without AI
    try {
      const sharp = (await import('sharp')).default
      let buf: Buffer
      if (imageBase64) {
        const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/s)
        buf = Buffer.from(match![2], 'base64')
      } else {
        const r = await fetch(imageUrl)
        buf = Buffer.from(await r.arrayBuffer())
      }
      const meta = await sharp(buf).metadata()
      const w = (meta.width || 512) * scale
      const h = (meta.height || 512) * scale
      const upscaled = await sharp(buf)
        .resize(Math.min(w, 4096), Math.min(h, 4096), { fit: 'fill', kernel: 'lanczos3' })
        .jpeg({ quality: 95 })
        .toBuffer()
      const b64 = `data:image/jpeg;base64,${upscaled.toString('base64')}`
      return NextResponse.json({ url: b64, method: 'sharp', starsSpent: 0, newBalance: balance })
    } catch (e: any) {
      return NextResponse.json({ error: 'Upscale помилка: ' + e.message }, { status: 500 })
    }
  }

  // Upload to storage first if base64
  let sourceUrl = imageUrl
  if (!sourceUrl && imageBase64) {
    const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/s)
    if (match) {
      const buf = Buffer.from(match[2], 'base64')
      const fileName = `upscale/${user.id}/${Date.now()}.${match[1].split('/')[1]}`
      await supabase.storage.from('card-images').upload(fileName, buf, { contentType: match[1] })
      sourceUrl = supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl
    }
  }
  if (!sourceUrl) return NextResponse.json({ error: 'Потрібне зображення' }, { status: 400 })

  // RealESRGAN via Replicate
  const pred = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Token ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
      input: { image: sourceUrl, scale, face_enhance: false }
    })
  })
  const predData = await pred.json()
  if (!pred.ok) return NextResponse.json({ error: predData.detail || 'Replicate error' }, { status: 500 })

  // Poll
  let result = predData, attempts = 0
  while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < 20) {
    await new Promise(r => setTimeout(r, 2000))
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
      headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` }
    })
    result = await poll.json()
    attempts++
  }

  if (result.status === 'failed' || !result.output) {
    return NextResponse.json({ error: 'Upscale не вдався' }, { status: 500 })
  }

  await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: UPSCALE_COST })
  await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -UPSCALE_COST, description: `Покращення якості ×${scale}` })

  return NextResponse.json({ url: result.output, starsSpent: UPSCALE_COST, newBalance: balance - UPSCALE_COST })
}
