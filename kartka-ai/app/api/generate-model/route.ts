import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 8

const GENDER_MAP = { male: 'male', female: 'female', nonbinary: 'androgynous person' }
const AGE_MAP = { young: '20-25 years old', adult: '30-40 years old', middle: '45-55 years old' }
const ETHNICITY_MAP = {
  european: 'European Caucasian',
  asian: 'East Asian',
  african: 'African',
  latin: 'Latin American',
  middle_eastern: 'Middle Eastern',
}
const POSE_MAP = {
  standing_front: 'standing facing camera, neutral pose',
  standing_side: 'standing in 3/4 angle pose',
  walking: 'walking pose, dynamic movement',
  casual: 'casual relaxed standing pose',
  sitting: 'sitting on chair, relaxed',
  arms_crossed: 'standing with arms crossed, confident pose',
}

async function pollReplicate(id: string, token: string, max = 40): Promise<any> {
  for (let i = 0; i < max; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Token ${token}` }
    })
    const d = await r.json()
    if (d.status === 'succeeded' || d.status === 'failed') return d
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

    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < COST) return NextResponse.json({ error: `Недостатньо зорь (${COST} ⭐)`, needStars: true, balance }, { status: 402 })

    const REPLICATE = process.env.REPLICATE_API_TOKEN

    const {
      gender = 'female',
      age = 'adult',
      ethnicity = 'european',
      pose = 'standing_front',
      clothingPhoto,
      background = 'studio white',
      additionalDetails = '',
    } = await req.json()

    if (!clothingPhoto) return NextResponse.json({ error: 'Завантажте фото одягу' }, { status: 400 })

    const genderDesc = GENDER_MAP[gender as keyof typeof GENDER_MAP] || 'female'
    const ageDesc = AGE_MAP[age as keyof typeof AGE_MAP] || '25-35 years old'
    const ethDesc = ETHNICITY_MAP[ethnicity as keyof typeof ETHNICITY_MAP] || 'European'
    const poseDesc = POSE_MAP[pose as keyof typeof POSE_MAP] || 'standing pose'

    if (!REPLICATE) {
      // Fallback: use DALL-E 2 to generate model wearing clothing
      const modelPrompt = `Professional fashion photography. ${genderDesc} model, ${ageDesc}, ${ethDesc} appearance, ${poseDesc}. Wearing the clothing from the reference image. ${background} background. ${additionalDetails}. High quality, photorealistic, commercial fashion photo. NO text.`

      try {
        const imgRes = await openai.images.generate({
          model: 'dall-e-2',
          prompt: modelPrompt,
          size: '1024x1024',
          n: 1,
        })
        const url = imgRes.data[0]?.url
        if (!url) return NextResponse.json({ error: 'Генерація не вдалась' }, { status: 500 })

        // Download and save
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
        const fn = `models/${user.id}/${Date.now()}.jpg`
        await supabase.storage.from('card-images').upload(fn, buf, { contentType: 'image/jpeg' })
        const finalUrl = supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl

        await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: COST })
        await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -COST, description: 'AI Генерація моделі' })

        return NextResponse.json({ url: finalUrl, method: 'dalle', starsSpent: COST, newBalance: balance - COST })
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
      }
    }

    // With Replicate: use IDM-VTON for try-on with generated model
    // Upload clothing photo
    const match = clothingPhoto.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
    if (!match) return NextResponse.json({ error: 'Невірний формат фото' }, { status: 400 })

    const clothBuf = Buffer.from(match[2], 'base64')
    const clothFn = `models/${user.id}/${Date.now()}-cloth.${match[1].split('/')[1]}`
    await supabase.storage.from('card-images').upload(clothFn, clothBuf, { contentType: match[1] })
    const clothUrl = supabase.storage.from('card-images').getPublicUrl(clothFn).data.publicUrl

    // First generate a model person using Flux
    const fluxPred = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${REPLICATE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: '80537f9eead1a5bfa72d5ac6ea6414379be41d4d4f6679fd776e9535d1eb58bb',
        input: {
          prompt: `Professional fashion model, ${genderDesc}, ${ageDesc}, ${ethDesc}, ${poseDesc}, ${background} background, full body shot, fashion photography, high quality. ${additionalDetails}`,
          width: 768,
          height: 1024,
          num_inference_steps: 28,
          guidance_scale: 3.5,
        }
      })
    })

    if (!fluxPred.ok) {
      const err = await fluxPred.json()
      return NextResponse.json({ error: err.detail || 'Flux error' }, { status: 500 })
    }

    const fluxData = await fluxPred.json()
    const fluxResult = await pollReplicate(fluxData.id, REPLICATE)

    if (fluxResult.status === 'failed' || !fluxResult.output) {
      return NextResponse.json({ error: 'Генерація моделі не вдалась' }, { status: 500 })
    }

    const modelUrl = Array.isArray(fluxResult.output) ? fluxResult.output[0] : fluxResult.output

    // Now apply clothing via IDM-VTON
    const tryonPred = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${REPLICATE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 'c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4',
        input: {
          human_img: modelUrl,
          garm_img: clothUrl,
          garment_des: 'clothing item',
          is_checked: true,
          denoise_steps: 30,
          seed: Math.floor(Math.random() * 999999),
        }
      })
    })

    const tryonData = await tryonPred.json()
    const tryonResult = await pollReplicate(tryonData.id, REPLICATE)

    if (tryonResult.status === 'failed' || !tryonResult.output) {
      return NextResponse.json({ error: 'Try-on не вдався' }, { status: 500 })
    }

    const outputUrl = Array.isArray(tryonResult.output) ? tryonResult.output[0] : tryonResult.output

    // Save result
    const resBuf = Buffer.from(await (await fetch(outputUrl)).arrayBuffer())
    const resFn = `models/${user.id}/${Date.now()}-result.jpg`
    await supabase.storage.from('card-images').upload(resFn, resBuf, { contentType: 'image/jpeg' })
    const finalUrl = supabase.storage.from('card-images').getPublicUrl(resFn).data.publicUrl

    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: COST })
    await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -COST, description: 'AI Генерація моделі + Try-on' })
    await supabase.from('studio_results').insert({ user_id: user.id, product_name: 'AI Модель', mode: 'model', urls: [finalUrl], stars_spent: COST }).then(() => {})

    return NextResponse.json({ url: finalUrl, modelUrl, starsSpent: COST, newBalance: balance - COST })
  } catch (err: unknown) {
    console.error('Model gen error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
