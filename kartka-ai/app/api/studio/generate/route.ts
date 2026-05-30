import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

// ─── Build Ideogram prompt for marketplace infographic ────────────────────────
async function buildIdeogramPrompt(
  photo: string,
  productName: string,
  category: string,
  bullets: string[],
  cardStyle: string,
  varIdx: number
): Promise<string> {
  const bs = bullets.filter(Boolean).slice(0, 5)
  const styles = [
    'dark military tactical style, dark moody background, gold accent colors',
    'urban streetwear style, gradient dark background, yellow accent',
    'premium luxury dark style, cinematic lighting, gold and dark tones',
    'dynamic sports style, dark gradient, energetic composition',
  ]
  const styleHint = styles[varIdx % styles.length]

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: photo, detail: 'low' } },
          {
            type: 'text',
            text: `Create an Ideogram prompt for a marketplace product infographic card.
Product: "${productName}"
Category: "${category}"
Style: ${styleHint}
Benefits to show: ${bs.map((b, i) => `${i + 1}. "${b}"`).join(', ')}

Write a detailed Ideogram image generation prompt that:
1. Describes a PROFESSIONAL MARKETING INFOGRAPHIC CARD for online marketplace (like Wildberries/Rozetka)
2. Includes the EXACT TEXT to render: title "${productName.slice(0, 20).toUpperCase()}" and each benefit bullet point
3. Describes a UNIQUE LAYOUT (not always left-right - can be centered, bottom overlay, diagonal split, etc.)
4. Matches the product's visual style (color, brand, vibe)
5. Specifies typography style (bold, large title, smaller bullets)
6. The product/person from the photo should be prominently featured
7. Portrait orientation 2:3

IMPORTANT: Include the actual text strings in quotes in the prompt so Ideogram renders them legibly.
Example format: "...the title text "${productName.toUpperCase()}" in bold white letters at the top..."

Return ONLY the English Ideogram prompt, max 300 words:`
          }
        ]
      }],
      max_tokens: 350,
      temperature: 0.9,
    })
    return r.choices[0]?.message?.content?.trim() || buildFallbackPrompt(productName, bs, styleHint)
  } catch {
    return buildFallbackPrompt(productName, bs, styleHint)
  }
}

function buildFallbackPrompt(name: string, bullets: string[], styleHint: string): string {
  const bs = bullets.slice(0, 5)
  return `Professional marketplace product infographic card, portrait orientation. ${styleHint}. 
Large bold title text "${name.slice(0, 20).toUpperCase()}" prominently displayed.
Product photo integrated into the design.
Benefit list with icons: ${bs.map((b, i) => `"${b.slice(0, 30)}"`).join(', ')}.
Clean professional ecommerce design. Text "РОЗМІРИ: XS-3XL" at bottom.
High quality marketing photography, studio lighting.`
}

// ─── Build Flux prompt for photo scene transformation ─────────────────────────
async function buildFluxPrompt(photo: string, name: string, category: string, style: string, wishes: string, varIdx: number): Promise<string> {
  const styleMap: Record<string, string> = {
    model: 'urban lifestyle city street, natural daylight bokeh',
    store: 'premium boutique store hanger, minimalist retail interior',
    flatlay: 'flat lay top-down on marble surface, NO people',
    catalog: 'pure seamless white studio background',
    outdoor: 'dramatic outdoor nature mountains, golden hour',
    dark: 'dark moody studio, dramatic rim lighting',
    lifestyle: 'cozy warm lifestyle interior, natural bokeh',
  }
  const scene = styleMap[style] || styleMap.catalog
  const vars = ['', 'slightly different angle', 'alternative lighting', 'different atmosphere']
  let wishEn = ''
  if (wishes.trim()) {
    try {
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: `Translate to English for AI image editor: "${wishes}"` }], max_tokens: 60 })
      wishEn = r.choices[0]?.message?.content?.trim() || wishes
    } catch { wishEn = wishes }
  }
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user', content: [
          { type: 'image_url', image_url: { url: photo, detail: 'low' } },
          { type: 'text', text: `Product: "${name}", Category: "${category}". Scene: "${scene}".${wishEn ? ` Requirement: "${wishEn}".` : ''} Variation: ${vars[varIdx] || varIdx + 1}.\nWrite Flux Kontext prompt (English, 70 words):\n- "Keep this exact product/person/clothing completely unchanged."\n- Describe specific scene atmosphere\n- "Preserve all logos, prints, colors exactly."\n- "Professional marketing photography."\nReturn ONLY the prompt:` }
        ]
      }],
      max_tokens: 120, temperature: 0.8,
    })
    return r.choices[0]?.message?.content?.trim() || `Keep this exact product unchanged. ${scene}. Preserve all details. Professional photography.`
  } catch {
    return `Keep this exact product unchanged. ${scene}. Professional marketing photography.`
  }
}

// ─── Poll Replicate ────────────────────────────────────────────────────────────
async function pollReplicate(id: string, token: string, max = 40): Promise<any> {
  for (let i = 0; i < max; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers: { Authorization: `Token ${token}` } })
    const d = await r.json()
    if (d.status === 'succeeded' || d.status === 'failed') return d
  }
  return { status: 'failed', error: 'Timeout' }
}

// ─── Ideogram v2: generate complete infographic card ─────────────────────────
async function runIdeogram(
  prompt: string,
  _imageUrl: string | null,
  token: string,
  aspectRatio = '2:3'
): Promise<string | null> {
  try {
    const input: Record<string, any> = {
      prompt,
      aspect_ratio: aspectRatio,
      style_type: 'DESIGN',
      magic_prompt_option: 'OFF',
      negative_prompt: 'blurry, low quality, text errors, illegible text, watermark',
    }

    console.log('Ideogram request:', JSON.stringify({ input }).slice(0, 200))

    const pred = await fetch('https://api.replicate.com/v1/models/ideogram-ai/ideogram-v2-turbo/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input })
    })

    const predText = await pred.text()
    console.log('Ideogram response status:', pred.status, predText.slice(0, 300))

    if (!pred.ok) return null

    const data = JSON.parse(predText)
    if (!data.id) { console.error('No prediction ID:', data); return null }

    const result = await pollReplicate(data.id, token)
    console.log('Ideogram result status:', result.status, JSON.stringify(result.output || result.error || '').slice(0,200))

    if (result.status !== 'succeeded' || !result.output) return null
    const output = result.output
    // Ideogram returns array of objects with url property
    if (Array.isArray(output)) {
      return output[0]?.url || output[0] || null
    }
    return output?.url || output || null
  } catch (e) { console.error('Ideogram exception:', e); return null }
}

// ─── Flux Kontext: scene transformation ───────────────────────────────────────
async function runFlux(imageUrl: string, prompt: string, token: string): Promise<string | null> {
  try {
    const pred = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { input_image: imageUrl, prompt, aspect_ratio: '1:1', output_format: 'jpg', output_quality: 90, safety_tolerance: 2 } })
    })
    if (!pred.ok) { const e = await pred.json(); console.error('Flux:', e.detail); return null }
    const result = await pollReplicate((await pred.json()).id, token)
    if (result.status !== 'succeeded' || !result.output) return null
    return Array.isArray(result.output) ? result.output[0] : result.output
  } catch (e) { console.error('Flux:', e); return null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function uploadPhoto(supabase: any, b64: string, uid: string, folder: string): Promise<string | null> {
  try {
    const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
    if (!m) return null
    const buf = Buffer.from(m[2], 'base64')
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('card-images').upload(fn, buf, { contentType: 'image/jpeg' })
    if (error) return null
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return null }
}

async function saveUrl(supabase: any, url: string, uid: string, folder: string): Promise<string> {
  try {
    const sharp = (await import('sharp')).default
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    await supabase.storage.from('card-images').upload(fn, await sharp(buf).jpeg({ quality: 93 }).toBuffer(), { contentType: 'image/jpeg' })
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return url }
}

async function saveBuf(supabase: any, buf: Buffer, uid: string, folder: string): Promise<string> {
  try {
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    await supabase.storage.from('card-images').upload(fn, buf, { contentType: 'image/jpeg' })
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return `data:image/jpeg;base64,${buf.toString('base64')}` }
}

async function makeCatalog(b64: string, rmbgKey?: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  let prodBuf = m ? Buffer.from(m[2], 'base64') : Buffer.from(b64, 'base64')
  if (rmbgKey) {
    try {
      const fd = new FormData(); fd.append('image_file', new Blob([prodBuf], { type: m?.[1] || 'image/jpeg' }), 'p.jpg'); fd.append('size', 'auto')
      const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': rmbgKey }, body: fd })
      if (r.ok) prodBuf = Buffer.from(await r.arrayBuffer())
    } catch {}
  }
  const SIZE = 1200, PAD = 100
  const resized = await sharp(prodBuf).resize(SIZE - PAD * 2, SIZE - PAD * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 248, g: 248, b: 248, alpha: 255 } } })
    .composite([{ input: resized, top: PAD, left: PAD }]).jpeg({ quality: 95 }).toBuffer()
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { mode = 'photo', displayStyle = 'catalog', productPhoto, productPhotos, productPhotoUrl,
      productName = '', category = '', wishes = '', count = 1, cardStyle = 'classic', bullets = [] } = await req.json()

    if (!productName.trim()) return NextResponse.json({ error: 'Введіть назву товару' }, { status: 400 })

    const allPhotos: string[] = productPhotos?.length ? productPhotos : (productPhoto ? [productPhoto] : [])
    if (!allPhotos.length && productPhotoUrl) {
      try { const r = await fetch(productPhotoUrl); const buf = Buffer.from(await r.arrayBuffer()); allPhotos.push(`data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`) } catch {}
    }
    if (!allPhotos.length) return NextResponse.json({ error: 'Завантажте фото товару' }, { status: 400 })

    const qty = Math.min(Math.max(1, count), 4)
    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < COST * qty) return NextResponse.json({ error: `Недостатньо зорь (${COST * qty} ⭐)`, needStars: true, balance }, { status: 402 })

    const REPLICATE = process.env.REPLICATE_API_TOKEN
    const RMBG = process.env.REMOVE_BG_API_KEY
    const results: string[] = []

    // ── CARD MODE: Ideogram generates complete infographic ──────────────────
    if (mode === 'card') {
      const cardBullets = (bullets as string[]).filter(Boolean)
      if (!cardBullets.length) return NextResponse.json({ error: 'Додайте переваги товару' }, { status: 400 })
      if (!REPLICATE) return NextResponse.json({ error: 'Карточка потребує REPLICATE_API_TOKEN' }, { status: 503 })

      // Upload product photo once
      const photoUrl = await uploadPhoto(supabase, allPhotos[0], user.id, 'card-input')

      for (let i = 0; i < qty; i++) {
        try {
          // GPT-4o builds unique Ideogram prompt for this specific product
          const prompt = await buildIdeogramPrompt(allPhotos[0], productName, category, cardBullets, cardStyle, i)
          console.log(`[card ${i + 1}] Ideogram prompt:`, prompt.slice(0, 100))

          // Ideogram generates the COMPLETE card — scene + text + layout — all in one
          const cardUrl = await runIdeogram(prompt, photoUrl, REPLICATE, '2:3')
          if (!cardUrl) { console.warn(`Card ${i + 1}: Ideogram failed`); continue }

          results.push(await saveUrl(supabase, cardUrl, user.id, 'cards'))
          console.log(`[card ${i + 1}] ✅`)
        } catch (e) { console.error(`card ${i}:`, e) }
      }
    }
    // ── PHOTO MODE: Flux Kontext transforms scene ───────────────────────────
    else {
      const STYLE_PROMPTS: Record<string, string> = {
        model: 'Keep this exact person and clothing completely unchanged. Change only the background to urban city street. Preserve EVERY detail.',
        store: 'Keep this exact clothing completely unchanged. Show on premium hanger in boutique. Preserve EVERY detail.',
        flatlay: 'Keep this exact clothing completely unchanged. Show ONLY clothing (NO people) top-down on white marble. Preserve EVERY detail.',
        catalog: 'Keep this exact clothing and person completely unchanged. Pure white studio background. Preserve EVERY detail.',
        outdoor: 'Keep this exact person and clothing completely unchanged. Outdoor nature mountains, golden hour. Preserve EVERY detail.',
        dark: 'Keep this exact person and clothing completely unchanged. Dark moody studio, dramatic rim lighting. Preserve EVERY detail.',
        lifestyle: 'Keep this exact person and clothing completely unchanged. Warm lifestyle interior, bokeh. Preserve EVERY detail.',
      }
      const VARS = ['', 'slightly different angle', 'alternative lighting', 'different atmosphere']

      if (displayStyle === 'catalog' && !REPLICATE) {
        for (let i = 0; i < qty; i++) {
          try { const buf = await makeCatalog(allPhotos[i % allPhotos.length], RMBG); results.push(await saveBuf(supabase, buf, user.id, 'studio')) }
          catch (e) { console.error(`catalog ${i}:`, e) }
        }
      } else if (REPLICATE) {
        let wishEn = ''
        if (wishes.trim()) {
          try { const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: `Translate to English: "${wishes}"` }], max_tokens: 60 }); wishEn = r.choices[0]?.message?.content?.trim() || wishes } catch { wishEn = wishes }
        }
        const photoUrls: string[] = []
        for (const p of allPhotos) { const u = await uploadPhoto(supabase, p, user.id, 'replicate-input'); if (u) photoUrls.push(u) }
        if (!photoUrls.length) return NextResponse.json({ error: 'Помилка завантаження фото' }, { status: 500 })

        for (let i = 0; i < qty; i++) {
          try {
            const base = STYLE_PROMPTS[displayStyle] || STYLE_PROMPTS.catalog
            let prompt = wishEn ? `${wishEn}. ${base}` : base
            if (i > 0) prompt += `. ${VARS[i] || `variation ${i + 1}`}`
            const url = await runFlux(photoUrls[i % photoUrls.length], prompt.slice(0, 600), REPLICATE)
            if (url) results.push(await saveUrl(supabase, url, user.id, 'studio'))
          } catch (e) { console.error(`flux ${i}:`, e) }
        }
      } else {
        return NextResponse.json({ error: 'Потрібен REPLICATE_API_TOKEN в Vercel env.', needReplicate: true }, { status: 503 })
      }
    }

    if (!results.length) return NextResponse.json({ error: 'Генерація не вдалась. Спробуйте ще раз.' }, { status: 500 })
    const spent = COST * results.length
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: spent })
    await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -spent, description: `Студія: ${productName.slice(0, 35)} (${mode} x${results.length})` })
    await supabase.from('studio_results').insert({ user_id: user.id, product_name: productName.slice(0, 100), mode: mode === 'card' ? 'card' : displayStyle, urls: results, stars_spent: spent, settings: { displayStyle, mode, count: results.length } }).then(() => {})
    return NextResponse.json({ results, starsSpent: spent, newBalance: balance - spent, count: results.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Studio error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
