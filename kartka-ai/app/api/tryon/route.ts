import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const TRYON_COST = 6 // зорі за приміряння

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

  // Check balance
  const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
  const balance = profile?.stars_balance ?? 0
  if (balance < TRYON_COST) {
    return NextResponse.json({ error: `Недостатньо зорь (потрібно ${TRYON_COST} ⭐, є ${balance})`, needStars: true, balance }, { status: 402 })
  }

  const { personPhoto, clothingPhoto, category = 'upper_body' } = await req.json()
  if (!personPhoto || !clothingPhoto) {
    return NextResponse.json({ error: 'Потрібне фото людини та фото одягу' }, { status: 400 })
  }

  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN
  if (!REPLICATE_TOKEN) {
    return NextResponse.json({ error: 'Replicate API не налаштований. Додай REPLICATE_API_TOKEN в Vercel env.' }, { status: 503 })
  }

  // Upload images to get URLs for Replicate
  async function uploadToStorage(base64: string, suffix: string): Promise<string | null> {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/s)
    if (!match) return null
    const mimeType = match[1]
    const buf = Buffer.from(match[2], 'base64')
    const fileName = `tryon/${user!.id}/${Date.now()}-${suffix}.${mimeType.split('/')[1]}`
    const { error } = await supabase.storage.from('card-images').upload(fileName, buf, { contentType: mimeType })
    if (error) return null
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl
  }

  const [personUrl, clothingUrl] = await Promise.all([
    uploadToStorage(personPhoto, 'person'),
    uploadToStorage(clothingPhoto, 'clothing'),
  ])

  if (!personUrl || !clothingUrl) {
    return NextResponse.json({ error: 'Помилка завантаження фото' }, { status: 500 })
  }

  // Call Replicate IDM-VTON
  try {
    const prediction = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4',
        input: {
          human_img: personUrl,
          garm_img: clothingUrl,
          garment_des: `${category} clothing item`,
          is_checked: true,
          is_checked_crop: false,
          denoise_steps: 30,
          seed: Math.floor(Math.random() * 999999),
        },
      }),
    })

    const predData = await prediction.json()
    if (!prediction.ok) {
      return NextResponse.json({ error: predData.detail || 'Replicate error' }, { status: 500 })
    }

    // Poll for result
    let result = predData
    let attempts = 0
    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < 30) {
      await new Promise(r => setTimeout(r, 3000))
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` },
      })
      result = await poll.json()
      attempts++
    }

    if (result.status === 'failed' || !result.output) {
      return NextResponse.json({ error: 'Генерація не вдалась. Спробуйте ще раз.' }, { status: 500 })
    }

    const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output

    // Download and save to our storage
    const imgRes = await fetch(outputUrl)
    const imgBuf = Buffer.from(await imgRes.arrayBuffer())
    const savePath = `tryon/${user.id}/${Date.now()}-result.jpg`
    await supabase.storage.from('card-images').upload(savePath, imgBuf, { contentType: 'image/jpeg' })
    const { data: { publicUrl } } = supabase.storage.from('card-images').getPublicUrl(savePath)

    // Deduct stars
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: TRYON_COST })
    await supabase.from('star_transactions').insert({
      user_id: user.id, type: 'spend', amount: -TRYON_COST,
      description: 'AI Приміряння одягу',
    })
    // Save to gallery
    await supabase.from('studio_results').insert({
      user_id: user.id, product_name: 'AI Приміряння',
      mode: 'tryon', urls: [publicUrl], stars_spent: TRYON_COST,
    }).then(() => {})

    return NextResponse.json({ url: publicUrl, starsSpent: TRYON_COST, newBalance: balance - TRYON_COST })
  } catch (e: any) {
    console.error('Tryon error:', e)
    return NextResponse.json({ error: e.message || 'Помилка AI приміряння' }, { status: 500 })
  }
}
