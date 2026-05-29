import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120
const COST = 6

async function pollReplicate(id: string, token: string, maxAttempts = 40): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Token ${token}` }
    })
    const data = await r.json()
    if (data.status === 'succeeded' || data.status === 'failed') return data
  }
  return { status: 'failed', error: 'Timeout' }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const REPLICATE = process.env.REPLICATE_API_TOKEN
    if (!REPLICATE) {
      return NextResponse.json({
        error: 'AI Приміряння потребує Replicate API токену. Додайте REPLICATE_API_TOKEN у Vercel Environment Variables.'
      }, { status: 503 })
    }

    // Check balance
    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < COST) return NextResponse.json({ error: `Недостатньо зорь (${COST} ⭐)`, needStars: true, balance }, { status: 402 })

    const { personPhoto, clothingPhoto, clothingPhotoUrl, category = 'upper_body' } = await req.json()
    if (!personPhoto) return NextResponse.json({ error: 'Завантажте фото людини' }, { status: 400 })
    if (!clothingPhoto && !clothingPhotoUrl) return NextResponse.json({ error: 'Завантажте фото одягу' }, { status: 400 })

    // Upload person photo
    async function uploadPhoto(b64: string, name: string): Promise<string> {
      const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
      if (!m) throw new Error('Invalid image')
      const buf = Buffer.from(m[2], 'base64')
      const fn = `tryon/${user!.id}/${Date.now()}-${name}.${m[1].split('/')[1]}`
      const { error } = await supabase.storage.from('card-images').upload(fn, buf, { contentType: m[1] })
      if (error) throw error
      return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
    }

    const [personUrl, clothingUrl] = await Promise.all([
      uploadPhoto(personPhoto, 'person'),
      clothingPhoto ? uploadPhoto(clothingPhoto, 'clothing') : Promise.resolve(clothingPhotoUrl),
    ])

    // Call IDM-VTON via Replicate
    const pred = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${REPLICATE}`, 'Content-Type': 'application/json' },
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
        }
      })
    })

    if (!pred.ok) {
      const err = await pred.json()
      return NextResponse.json({ error: err.detail || 'Replicate помилка' }, { status: 500 })
    }

    const predData = await pred.json()
    const result = await pollReplicate(predData.id, REPLICATE)

    if (result.status === 'failed' || !result.output) {
      return NextResponse.json({ error: `Генерація не вдалась: ${result.error || 'невідома помилка'}` }, { status: 500 })
    }

    const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output

    // Download and re-upload to our storage
    let finalUrl = outputUrl
    try {
      const r = await fetch(outputUrl)
      const buf = Buffer.from(await r.arrayBuffer())
      const fn = `tryon/${user.id}/${Date.now()}-result.jpg`
      await supabase.storage.from('card-images').upload(fn, buf, { contentType: 'image/jpeg' })
      finalUrl = supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
    } catch {}

    // Deduct stars
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: COST })
    await supabase.from('star_transactions').insert({
      user_id: user.id, type: 'spend', amount: -COST,
      description: 'AI Приміряння одягу'
    })

    // Save to gallery
    await supabase.from('studio_results').insert({
      user_id: user.id, product_name: 'AI Приміряння', mode: 'tryon',
      urls: [finalUrl], stars_spent: COST,
    }).then(() => {})

    return NextResponse.json({ url: finalUrl, starsSpent: COST, newBalance: balance - COST })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('TryOn error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
