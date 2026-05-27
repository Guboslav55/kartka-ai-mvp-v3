import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const COSTS = { '5s': 16, '10s': 32 } as const

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

  const { imageBase64, imageUrl, description = '', duration = '5s', loop = false } = await req.json()
  const cost = COSTS[duration as keyof typeof COSTS] || 16

  const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
  const balance = profile?.stars_balance ?? 0
  if (balance < cost) return NextResponse.json({ error: `Недостатньо зорь (потрібно ${cost} ⭐, є ${balance})`, needStars: true, balance }, { status: 402 })

  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN
  if (!REPLICATE_TOKEN) return NextResponse.json({ error: 'Додай REPLICATE_API_TOKEN в Vercel env для активації відео' }, { status: 503 })

  // Upload image to get public URL
  let sourceUrl = imageUrl
  if (!sourceUrl && imageBase64) {
    const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/s)
    if (match) {
      const buf = Buffer.from(match[2], 'base64')
      const fileName = `video/${user.id}/${Date.now()}-source.${match[1].split('/')[1]}`
      await supabase.storage.from('card-images').upload(fileName, buf, { contentType: match[1] })
      sourceUrl = supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl
    }
  }
  if (!sourceUrl) return NextResponse.json({ error: 'Потрібне фото товару' }, { status: 400 })

  try {
    // Use Wan I2V (image-to-video) model - best for product videos
    const prediction = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Token ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 'a07f252abbbd832009640b27f063ea52d87d7a23ce5e8b0a8b8e7b3defc4028e',
        input: {
          image: sourceUrl,
          prompt: description || 'Smooth 360-degree product rotation, professional commercial video, clean background',
          num_frames: duration === '10s' ? 81 : 41,
          fps: 8,
          motion_bucket_id: 40,
          cond_aug: 0.02,
        }
      })
    })
    const predData = await prediction.json()
    if (!prediction.ok) return NextResponse.json({ error: predData.detail || 'Replicate error' }, { status: 500 })

    // Poll for result (max 90 sec)
    let result = predData
    let attempts = 0
    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < 30) {
      await new Promise(r => setTimeout(r, 3000))
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` }
      })
      result = await poll.json()
      attempts++
    }

    if (result.status === 'failed' || !result.output) {
      return NextResponse.json({ error: 'Відео не вдалось згенерувати. Спробуйте ще раз.' }, { status: 500 })
    }

    const videoUrl = Array.isArray(result.output) ? result.output[0] : result.output

    // Save video URL to gallery
    await supabase.from('studio_results').insert({
      user_id: user.id, product_name: 'AI Відео',
      mode: 'video', urls: [videoUrl], stars_spent: cost,
      settings: { duration, loop, description: description.slice(0, 100) }
    }).then(() => {})

    // Deduct stars
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: cost })
    await supabase.from('star_transactions').insert({
      user_id: user.id, type: 'spend', amount: -cost,
      description: `AI Відео ${duration}: товар`
    })

    return NextResponse.json({ url: videoUrl, starsSpent: cost, newBalance: balance - cost })
  } catch (e: any) {
    console.error('Video error:', e)
    return NextResponse.json({ error: e.message || 'Помилка генерації відео' }, { status: 500 })
  }
}
