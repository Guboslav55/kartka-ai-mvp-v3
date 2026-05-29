import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

// ─── Background prompts by product category/style ─────────────────────────────
async function buildBackgroundPrompt(
  photo: string, productName: string, category: string,
  style: string, wishes: string
): Promise<{ prompt: string; colors: string[] }> {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: photo, detail: 'low' } },
          {
            type: 'text',
            text: `Analyze this product photo. Product: "${productName}", Category: "${category}".
Style preference: "${style}". ${wishes ? `Requirements: ${wishes}` : ''}

Return JSON:
{
  "bgPrompt": "English DALL-E prompt for background scene only - dramatic, moody, matching product vibe. NO people, NO products, NO text. Just atmosphere.",
  "accentColor": "#hex - dominant color that matches product",
  "textColor": "#hex - either white or very dark for contrast",
  "cardTitle": "SHORT punchy title in Ukrainian (2-4 words, ALL CAPS)",
  "cardSubtitle": "Ukrainian subtitle phrase (3-6 words)"
}

Examples for sportswear: bgPrompt about mountain/forest scene, accentColor #FFD700 for camo brand.
Return ONLY valid JSON.`
          }
        ]
      }],
      max_tokens: 300,
      response_format: { type: 'json_object' },
    })
    const d = JSON.parse(res.choices[0]?.message?.content || '{}')
    return {
      prompt: d.bgPrompt || `Dramatic ${style} background, dark moody atmosphere, no people, no products, no text`,
      colors: [d.accentColor || '#FFD700', d.textColor || '#FFFFFF', d.cardTitle || productName.toUpperCase(), d.cardSubtitle || '']
    }
  } catch {
    return {
      prompt: `Dark dramatic outdoor background, moody atmosphere, no people, no products, no text`,
      colors: ['#FFD700', '#FFFFFF', productName.slice(0, 20).toUpperCase(), '']
    }
  }
}

// ─── Generate background image ─────────────────────────────────────────────────
async function generateBg(prompt: string): Promise<Buffer | null> {
  const p = `${prompt}\n\nIMPORTANT: NO people, NO products, NO text, NO logos. Background/atmosphere only.`
  try {
    const r = await openai.images.generate({ model: 'gpt-image-1', prompt: p, size: '1024x1024', quality: 'medium', n: 1 } as any)
    const item = r.data[0] as any
    if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
    if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer())
    return null
  } catch (e1: any) {
    console.error('gpt-image-1:', e1?.message)
    try {
      const r2 = await openai.images.generate({ model: 'dall-e-2', prompt: p.slice(0, 900), size: '1024x1024', n: 1 })
      const url = r2.data[0]?.url
      if (!url) return null
      return Buffer.from(await (await fetch(url)).arrayBuffer())
    } catch (e2: any) {
      console.error('dall-e-2:', e2?.message)
      return null
    }
  }
}

// ─── Build Aidentika-style card ────────────────────────────────────────────────
async function buildAidentikaCard(
  bgBuf: Buffer,
  productPhotoBuf: Buffer,
  productName: string,
  bullets: string[],
  cardColors: string[],
  cardStyle: string,
  photoAspect: number
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const CANVAS = 1080
  const [accentColor, textColor, cardTitle, cardSubtitle] = cardColors

  // Escape XML
  const esc = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  // ── Resize background to card size ──
  const bg = await sharp(bgBuf)
    .resize(CANVAS, CANVAS, { fit: 'cover', position: 'center' })
    .toBuffer()

  // ── Resize product photo ──
  // Place on right ~55% of card, keep original aspect
  const photoH = Math.round(CANVAS * 0.88)
  const photoW = Math.round(photoH * Math.min(photoAspect, 0.7))
  const productResized = await sharp(productPhotoBuf)
    .resize(photoW, photoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const photoLeft = CANVAS - photoW - 10
  const photoTop = Math.round((CANVAS - photoH) / 2)

  // ── SVG card design overlay ──
  const leftW = CANVAS - photoW - 40  // text area width
  const bs = bullets.filter(Boolean).slice(0, 5)

  // Icon paths by index (simple SVG shapes)
  const icons = ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    'M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z',
    'M5 3l14 9-14 9V3z', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
    'M20 6L9 17l-5-5']

  const bulletItems = bs.map((b, i) => {
    const cleanB = b.replace(/^[•✓\-]\s*/, '')
    const words = cleanB.split(' ')
    // Split into 2 lines if long
    const mid = Math.ceil(words.length / 2)
    const line1 = words.slice(0, mid).join(' ')
    const line2 = words.slice(mid).join(' ')
    const yBase = 390 + i * 110
    const iconPath = icons[i % icons.length]
    return `
      <circle cx="52" cy="${yBase + 18}" r="28" fill="${accentColor}" opacity="0.9"/>
      <path d="${iconPath}" fill="${textColor}" transform="translate(38,${yBase + 4}) scale(1.1)"/>
      <text x="95" y="${yBase + 14}" font-family="Arial Black,Arial,sans-serif" font-size="22" font-weight="800" fill="${textColor}" text-decoration="none">${esc(line1.toUpperCase())}</text>
      ${line2 ? `<text x="95" y="${yBase + 38}" font-family="Arial Black,Arial,sans-serif" font-size="22" font-weight="800" fill="${textColor}">${esc(line2.toUpperCase())}</text>` : ''}
    `
  }).join('\n')

  // Dark gradient overlay on left side for text readability
  const svgOverlay = `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="lgLeft" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="rgba(0,0,0,0.88)"/>
    <stop offset="70%" stop-color="rgba(0,0,0,0.65)"/>
    <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
  </linearGradient>
  <linearGradient id="lgTop" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="rgba(0,0,0,0.5)"/>
    <stop offset="30%" stop-color="rgba(0,0,0,0)"/>
  </linearGradient>
  <linearGradient id="lgBot" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
    <stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
  </linearGradient>
</defs>

<!-- Gradient overlays for depth -->
<rect width="${CANVAS}" height="${CANVAS}" fill="url(#lgLeft)"/>
<rect width="${CANVAS}" height="180" fill="url(#lgTop)"/>
<rect y="${CANVAS - 200}" width="${CANVAS}" height="200" fill="url(#lgBot)"/>

<!-- Accent left bar -->
<rect x="0" y="0" width="7" height="${CANVAS}" fill="${accentColor}"/>

<!-- Main title -->
<text x="45" y="100" font-family="Arial Black,Arial,sans-serif" font-size="52" font-weight="900" fill="${textColor}" letter-spacing="-1">${esc(cardTitle || productName.slice(0,20).toUpperCase())}</text>

<!-- Subtitle -->
${cardSubtitle ? `<text x="45" y="148" font-family="Arial,sans-serif" font-size="26" font-weight="600" fill="${accentColor}" letter-spacing="2">${esc(cardSubtitle.toUpperCase())}</text>` : ''}

<!-- Divider line -->
<rect x="45" y="168" width="180" height="3" rx="2" fill="${accentColor}"/>

<!-- Bullet points -->
${bulletItems}

<!-- Bottom bar -->
<rect x="0" y="${CANVAS - 70}" width="${CANVAS}" height="70" fill="${accentColor}" opacity="0.92"/>
<text x="45" y="${CANVAS - 28}" font-family="Arial Black,Arial,sans-serif" font-size="22" font-weight="900" fill="#000000">РОЗМІРИ: XS · S · M · L · XL · XXL · 3XL</text>
</svg>`

  return sharp(bg)
    .composite([
      { input: productResized, top: photoTop, left: photoLeft, blend: 'over' },
      { input: Buffer.from(svgOverlay), top: 0, left: 0 },
    ])
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer()
}

// ─── Upload to storage ─────────────────────────────────────────────────────────
async function upload(supabase: ReturnType<typeof createClient>, buf: Buffer, uid: string, folder = 'studio'): Promise<string> {
  try {
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    await supabase.storage.from('card-images').upload(fn, buf, { contentType: 'image/jpeg' })
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return `data:image/jpeg;base64,${buf.toString('base64')}` }
}

// ─── Main Handler ──────────────────────────────────────────────────────────────
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

    const {
      mode = 'card',
      productPhoto, productPhotoUrl,
      productName = '', category = '',
      style = 'lifestyle', lighting = 'dramatic',
      wishes = '', marketplace = 'general',
      count = 1, cardStyle = 'classic', bullets = [],
    } = await req.json()

    if (!productName.trim()) return NextResponse.json({ error: 'Введіть назву товару' }, { status: 400 })

    // Resolve product photo
    let prodB64 = productPhoto || ''
    if (!prodB64 && productPhotoUrl) {
      try {
        const r = await fetch(productPhotoUrl)
        const buf = Buffer.from(await r.arrayBuffer())
        prodB64 = `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`
      } catch {}
    }
    if (!prodB64) return NextResponse.json({ error: 'Завантажте фото товару' }, { status: 400 })

    const qty = Math.min(Math.max(1, count), 4)
    const totalCost = COST * qty
    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < totalCost) return NextResponse.json({ error: `Недостатньо зорь (${totalCost} ⭐)`, needStars: true, balance }, { status: 402 })

    // Decode product photo
    const sharp = (await import('sharp')).default
    const m = prodB64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
    if (!m) return NextResponse.json({ error: 'Невірний формат фото' }, { status: 400 })
    const productBuf = Buffer.from(m[2], 'base64')
    const prodMeta = await sharp(productBuf).metadata()
    const photoAspect = (prodMeta.width || 512) / (prodMeta.height || 512)

    // Build background prompt (GPT-4o-mini analyzes photo)
    const { prompt: bgPrompt, colors } = await buildBackgroundPrompt(
      prodB64, productName, category, style, wishes
    )

    const results: string[] = []

    for (let i = 0; i < qty; i++) {
      try {
        // Generate background
        const bgBuf = await generateBg(bgPrompt + (i > 0 ? ` variation ${i+1}` : ''))
        if (!bgBuf) continue

        let finalBuf: Buffer
        if (mode === 'card') {
          // Aidentika-style card with text overlay
          finalBuf = await buildAidentikaCard(bgBuf, productBuf, productName, bullets as string[], colors, cardStyle, photoAspect)
        } else {
          // Photo mode: just composite product on background
          // Try remove.bg first
          let cleanProdBuf = productBuf
          const RMBG = process.env.REMOVE_BG_API_KEY
          if (RMBG) {
            try {
              const fd = new FormData()
              fd.append('image_file', new Blob([productBuf], { type: m[1] }), 'p.jpg')
              fd.append('size', 'auto')
              const rr = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': RMBG }, body: fd })
              if (rr.ok) cleanProdBuf = Buffer.from(await rr.arrayBuffer())
            } catch {}
          }
          const maxDim = Math.round(1024 * 0.65)
          const resized = await sharp(cleanProdBuf).resize(maxDim, maxDim, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
          const left = Math.round((1024 - maxDim) / 2)
          const top = Math.round((1024 - maxDim) / 2)
          finalBuf = await sharp(bgBuf).composite([{ input: resized, top, left }]).jpeg({ quality: 93 }).toBuffer()
        }

        const url = await upload(supabase, finalBuf, user.id, mode === 'card' ? 'cards' : 'studio')
        results.push(url)
      } catch (e) { console.error(`gen ${i+1}:`, e) }
    }

    if (!results.length) return NextResponse.json({ error: 'Генерація не вдалась. Спробуйте ще раз.' }, { status: 500 })

    const spent = COST * results.length
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: spent })
    await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -spent, description: `AI Студія: ${productName.slice(0,35)} (${mode} ×${results.length})` })
    await supabase.from('studio_results').insert({ user_id: user.id, product_name: productName.slice(0,100), mode, urls: results, stars_spent: spent, settings: { style, count: results.length, marketplace } }).then(() => {})

    return NextResponse.json({ results, starsSpent: spent, newBalance: balance - spent, count: results.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Studio error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
