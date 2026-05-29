import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4
const FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
const FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

const STYLE_PROMPTS: Record<string, string> = {
  model:     'Keep this exact person and clothing completely unchanged. Change only the background to urban city street with blurred buildings, soft natural daylight. Preserve EVERY detail: exact clothing, prints, logos, colors, person face.',
  store:     'Keep this exact clothing completely unchanged. Change setting to premium boutique with clothing on chrome hanger, minimal white walls, soft retail lighting. Preserve EVERY detail: exact prints, logo, colors.',
  flatlay:   'Keep this exact clothing completely unchanged. Show ONLY the clothing (NO people, NO body parts) neatly laid flat on clean white marble, strict 90-degree top-down view. Soft even studio lighting. Preserve EVERY detail.',
  catalog:   'Keep this exact clothing and person completely unchanged. Change only background to pure seamless white studio with soft professional lighting. Preserve EVERY detail.',
  outdoor:   'Keep this exact person and clothing completely unchanged. Change only background to dramatic outdoor nature with mountains or forest, golden hour lighting. Preserve EVERY detail.',
  dark:      'Keep this exact person and clothing completely unchanged. Change only background to dark moody professional studio with dramatic rim lighting. Preserve EVERY detail.',
  lifestyle: 'Keep this exact person and clothing completely unchanged. Change only background to warm cozy lifestyle environment with natural bokeh. Preserve EVERY detail.',
}

async function translateWishes(wishes: string): Promise<string> {
  if (!wishes.trim()) return ''
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Translate to English for AI image editor (exact visual meaning): "${wishes}"` }],
      max_tokens: 80,
    })
    return r.choices[0]?.message?.content?.trim() || wishes
  } catch { return wishes }
}

async function uploadPhoto(supabase: any, b64: string, uid: string, folder: string): Promise<string | null> {
  try {
    const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
    if (!m) return null
    const buf = Buffer.from(m[2], 'base64')
    const fn = `${folder}/${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
    const { error } = await supabase.storage.from('card-images').upload(fn, buf, { contentType: 'image/jpeg' })
    if (error) return null
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return null }
}

async function pollReplicate(id: string, token: string, max = 40): Promise<any> {
  for (let i = 0; i < max; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers: { Authorization: `Token ${token}` } })
    const d = await r.json()
    if (d.status === 'succeeded' || d.status === 'failed') return d
  }
  return { status: 'failed', error: 'Timeout' }
}

async function runFluxKontext(imageUrl: string, prompt: string, token: string): Promise<string | null> {
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

// Extract dominant colors from product image
async function extractColors(prodBuf: Buffer): Promise<{ primary: string; secondary: string; accent: string }> {
  try {
    const sharp = (await import('sharp')).default
    const { dominant } = await sharp(prodBuf).resize(50, 50).stats()
    const r = dominant.r, g = dominant.g, b = dominant.b
    // Create complementary colors
    const primary = `rgb(${r},${g},${b})`
    // Brighten for accent
    const ar = Math.min(255, r + 80), ag = Math.min(255, g + 80), ab = Math.min(255, b + 80)
    const accent = `rgb(${ar},${ag},${ab})`
    return { primary, secondary: 'rgba(255,255,255,0.9)', accent }
  } catch {
    return { primary: '#FFD700', secondary: '#FFFFFF', accent: '#FFD700' }
  }
}

// Generate unique card layout with proper Cyrillic font
async function makeCard(bgUrl: string, prodB64: string, name: string, bullets: string[], cardStyle: string, layoutIdx = 0): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const CANVAS = 1080

  // Download and resize background
  const bgBuf = Buffer.from(await (await fetch(bgUrl)).arrayBuffer())
  const bg = await sharp(bgBuf).resize(CANVAS, CANVAS, { fit: 'cover', position: 'center' }).toBuffer()

  // Decode product
  const m = prodB64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  if (!m) return bg
  const prodBuf = Buffer.from(m[2], 'base64')

  // Extract colors for dynamic theming
  const colors = await extractColors(prodBuf)
  const accent = cardStyle === 'premium' ? '#c9a84c' : '#FFD700'
  const isDark = cardStyle === 'premium'

  // Product resize
  const prodMeta = await sharp(prodBuf).metadata()
  const prodAspect = (prodMeta.width || 512) / (prodMeta.height || 512)

  const esc = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

  const bs = bullets.filter(Boolean).slice(0, 5)
  const titleText = esc(name.slice(0, 22).toUpperCase())
  const fontDecl = `@font-face { font-family: 'CardFont'; src: url('${FONT_PATH}'); font-weight: bold; }
  @font-face { font-family: 'CardFontReg'; src: url('${FONT_REG}'); }`

  let svg = ''
  let prodTop = 0, prodLeft = 0, photoW = 0, photoH = 0
  let prodResized: Buffer

  // ── Layout selection (4 unique compositions) ──────────────────────────────
  const layout = layoutIdx % 4

  if (layout === 0) {
    // Layout 0: Product RIGHT, text LEFT (Aidentika-style)
    photoH = Math.round(CANVAS * 0.92)
    photoW = Math.round(photoH * Math.min(prodAspect, 0.62))
    prodResized = await sharp(prodBuf).resize(photoW, photoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    prodLeft = CANVAS - photoW - 5
    prodTop = Math.max(0, Math.round((CANVAS - photoH) / 2))

    const bulletsSvg = bs.map((b, i) => {
      const clean = esc(b.replace(/^[•✓\-]\s*/, '').slice(0, 35))
      const y = 240 + i * 130
      return `<rect x="30" y="${y}" width="${Math.min(clean.length * 14 + 85, 450)}" height="110" rx="16" fill="rgba(0,0,0,0.82)"/>
<circle cx="74" cy="${y + 55}" r="30" fill="${accent}"/>
<text x="74" y="${y + 63}" text-anchor="middle" font-family="CardFont,sans-serif" font-size="22" fill="#000">${i + 1}</text>
<text x="120" y="${y + 45}" font-family="CardFont,sans-serif" font-size="20" fill="white">${clean}</text>`
    }).join('\n')

    svg = `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
<defs><style>${fontDecl}</style>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgba(0,0,0,0.92)"/><stop offset="58%" stop-color="rgba(0,0,0,0.65)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>
<linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.65)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>
<linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.88)"/></linearGradient>
</defs>
<rect width="${CANVAS}" height="${CANVAS}" fill="url(#gl)"/>
<rect width="${CANVAS}" height="170" fill="url(#gt)"/>
<rect y="${CANVAS - 155}" width="${CANVAS}" height="155" fill="url(#gb)"/>
<rect x="0" y="0" width="9" height="${CANVAS}" fill="${accent}"/>
<text x="50" y="110" font-family="CardFont,sans-serif" font-size="66" fill="white">${titleText}</text>
<rect x="50" y="132" width="240" height="6" rx="3" fill="${accent}"/>
${bulletsSvg}
<rect x="0" y="${CANVAS - 78}" width="${CANVAS}" height="78" fill="${accent}"/>
<text x="50" y="${CANVAS - 26}" font-family="CardFont,sans-serif" font-size="26" fill="#000">РОЗМІРИ: XS · S · M · L · XL · 2XL · 3XL</text>
</svg>`

  } else if (layout === 1) {
    // Layout 1: Product LEFT, text RIGHT
    photoH = Math.round(CANVAS * 0.85)
    photoW = Math.round(photoH * Math.min(prodAspect, 0.58))
    prodResized = await sharp(prodBuf).resize(photoW, photoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    prodLeft = 10
    prodTop = Math.max(0, Math.round((CANVAS - photoH) / 2))
    const textX = photoW + 40

    const bulletsSvg = bs.map((b, i) => {
      const clean = esc(b.replace(/^[•✓\-]\s*/, '').slice(0, 28))
      const y = 210 + i * 140
      return `<rect x="${textX}" y="${y}" width="${CANVAS - textX - 20}" height="120" rx="16" fill="rgba(0,0,0,0.80)"/>
<rect x="${textX + 10}" y="${y + 10}" width="6" height="100" rx="3" fill="${accent}"/>
<text x="${textX + 32}" y="${y + 55}" font-family="CardFont,sans-serif" font-size="21" fill="white">${clean}</text>
<text x="${textX + 32}" y="${y + 90}" font-family="CardFontReg,sans-serif" font-size="16" fill="rgba(255,255,255,0.55)">переваги товару</text>`
    }).join('\n')

    svg = `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
<defs><style>${fontDecl}</style>
<linearGradient id="gr" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgba(0,0,0,0.0)"/><stop offset="45%" stop-color="rgba(0,0,0,0.70)"/><stop offset="100%" stop-color="rgba(0,0,0,0.92)"/></linearGradient>
<linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.65)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>
</defs>
<rect width="${CANVAS}" height="${CANVAS}" fill="url(#gr)"/>
<rect width="${CANVAS}" height="170" fill="url(#gt)"/>
<rect x="${CANVAS - 9}" y="0" width="9" height="${CANVAS}" fill="${accent}"/>
<text x="${textX}" y="120" font-family="CardFont,sans-serif" font-size="58" fill="white">${titleText}</text>
<rect x="${textX}" y="140" width="200" height="5" rx="3" fill="${accent}"/>
${bulletsSvg}
<rect x="0" y="${CANVAS - 78}" width="${CANVAS}" height="78" fill="${accent}"/>
<text x="${CANVAS / 2}" y="${CANVAS - 26}" text-anchor="middle" font-family="CardFont,sans-serif" font-size="24" fill="#000">XS · S · M · L · XL · 2XL · 3XL</text>
</svg>`

  } else if (layout === 2) {
    // Layout 2: Product CENTER-RIGHT, title TOP-LEFT, bullets bottom-left
    photoH = Math.round(CANVAS * 0.78)
    photoW = Math.round(photoH * Math.min(prodAspect, 0.65))
    prodResized = await sharp(prodBuf).resize(photoW, photoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    prodLeft = CANVAS - photoW - 20
    prodTop = Math.round((CANVAS - photoH) / 2)

    const bulletsSvg = bs.slice(0, 4).map((b, i) => {
      const clean = esc(b.replace(/^[•✓\-]\s*/, '').slice(0, 30))
      const row = Math.floor(i / 2), col = i % 2
      const bx = 30 + col * 260, by = CANVAS - 340 + row * 140
      return `<rect x="${bx}" y="${by}" width="240" height="115" rx="14" fill="rgba(0,0,0,0.85)"/>
<rect x="${bx + 10}" y="${by + 10}" width="${220}" height="4" rx="2" fill="${accent}"/>
<text x="${bx + 15}" y="${by + 55}" font-family="CardFont,sans-serif" font-size="18" fill="${accent}">${i + 1}</text>
<text x="${bx + 38}" y="${by + 55}" font-family="CardFont,sans-serif" font-size="18" fill="white">${clean}</text>`
    }).join('\n')

    svg = `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
<defs><style>${fontDecl}</style>
<linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.88)"/><stop offset="35%" stop-color="rgba(0,0,0,0.30)"/><stop offset="65%" stop-color="rgba(0,0,0,0.20)"/><stop offset="100%" stop-color="rgba(0,0,0,0.88)"/></linearGradient>
</defs>
<rect width="${CANVAS}" height="${CANVAS}" fill="url(#gm)"/>
<rect x="0" y="0" width="${CANVAS}" height="9" fill="${accent}"/>
<rect x="0" y="${CANVAS - 9}" width="${CANVAS}" height="9" fill="${accent}"/>
<text x="40" y="95" font-family="CardFont,sans-serif" font-size="70" fill="white">${titleText}</text>
<rect x="40" y="115" width="260" height="6" rx="3" fill="${accent}"/>
${bulletsSvg}
</svg>`

  } else {
    // Layout 3: SPLIT DIAGONAL - product full-bleed, dark overlay band
    photoH = CANVAS
    photoW = Math.round(CANVAS * 0.72)
    prodResized = await sharp(prodBuf).resize(photoW, photoH, { fit: 'cover', position: 'center' }).jpeg({ quality: 90 }).toBuffer()
    prodLeft = CANVAS - photoW
    prodTop = 0

    const bulletsSvg = bs.map((b, i) => {
      const clean = esc(b.replace(/^[•✓\-]\s*/, '').slice(0, 32))
      const y = 230 + i * 118
      return `<text x="44" y="${y}" font-family="CardFont,sans-serif" font-size="22" fill="${accent}">✓</text>
<text x="72" y="${y}" font-family="CardFontReg,sans-serif" font-size="22" fill="white">${clean}</text>`
    }).join('\n')

    svg = `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
<defs><style>${fontDecl}</style>
<linearGradient id="gd" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgba(0,0,0,0.96)"/><stop offset="100%" stop-color="rgba(0,0,0,0.0)"/></linearGradient>
</defs>
<rect width="${CANVAS * 0.45}" height="${CANVAS}" fill="url(#gd)"/>
<rect x="0" y="0" width="9" height="${CANVAS}" fill="${accent}"/>
<text x="44" y="110" font-family="CardFont,sans-serif" font-size="62" fill="white">${titleText}</text>
<rect x="44" y="130" width="220" height="6" rx="3" fill="${accent}"/>
${bulletsSvg}
<rect x="0" y="${CANVAS - 78}" width="${CANVAS * 0.48}" height="78" fill="${accent}"/>
<text x="44" y="${CANVAS - 26}" font-family="CardFont,sans-serif" font-size="22" fill="#000">XS · S · M · L · XL · 2XL</text>
</svg>`
  }

  const layers: any[] = [{ input: prodResized!, top: prodTop, left: prodLeft, blend: 'over' }]
  if (svg) layers.push({ input: Buffer.from(svg), top: 0, left: 0 })

  return sharp(bg).composite(layers).jpeg({ quality: 94 }).toBuffer()
}

// Catalog: Remove.bg + white background
async function makeCatalog(b64: string, rmbgKey?: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  let prodBuf = m ? Buffer.from(m[2], 'base64') : Buffer.from(b64, 'base64')
  if (rmbgKey) {
    try {
      const fd = new FormData()
      fd.append('image_file', new Blob([prodBuf], { type: m?.[1] || 'image/jpeg' }), 'p.jpg')
      fd.append('size', 'auto')
      const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': rmbgKey }, body: fd })
      if (r.ok) prodBuf = Buffer.from(await r.arrayBuffer())
    } catch {}
  }
  const SIZE = 1200, PAD = 100
  const resized = await sharp(prodBuf).resize(SIZE - PAD * 2, SIZE - PAD * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const shadow = Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><ellipse cx="${SIZE / 2}" cy="${SIZE - PAD * 0.5}" rx="${SIZE * 0.28}" ry="${SIZE * 0.02}" fill="rgba(0,0,0,0.07)"/></svg>`)
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 248, g: 248, b: 248, alpha: 255 } } })
    .composite([{ input: resized, top: PAD, left: PAD }, { input: shadow, top: 0, left: 0 }])
    .jpeg({ quality: 95 }).toBuffer()
}

async function saveBuf(supabase: any, buf: Buffer, uid: string, folder: string): Promise<string> {
  try {
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    await supabase.storage.from('card-images').upload(fn, buf, { contentType: 'image/jpeg' })
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return `data:image/jpeg;base64,${buf.toString('base64')}` }
}

async function saveUrl(supabase: any, url: string, uid: string, folder: string): Promise<string> {
  try {
    const sharp = (await import('sharp')).default
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    const p = await sharp(buf).jpeg({ quality: 93 }).toBuffer()
    await supabase.storage.from('card-images').upload(fn, p, { contentType: 'image/jpeg' })
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return url }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { mode = 'photo', displayStyle = 'catalog', productPhoto, productPhotos, productPhotoUrl, productName = '', category = '', wishes = '', count = 1, cardStyle = 'classic', bullets = [], marketplace = 'general' } = await req.json()
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

    if (mode === 'card') {
      const prodB64 = allPhotos[0]
      const cardBullets = (bullets as string[]).filter(Boolean)
      if (!cardBullets.length) return NextResponse.json({ error: 'Додайте хоча б одну перевагу для карточки' }, { status: 400 })

      for (let i = 0; i < qty; i++) {
        try {
          let bgUrl: string | null = null
          const bgVariants = ['dark luxury premium', 'bold dynamic energetic', 'gradient abstract modern', 'dramatic atmospheric cinematic']
          try {
            const bgRes = await openai.images.generate({
              model: 'gpt-image-1',
              prompt: `${bgVariants[i % bgVariants.length]} abstract background for product marketing card. ${category || 'clothing'}. No people, no products, no text, no logos. Pure atmospheric design.`,
              size: '1024x1024', quality: 'medium', n: 1
            } as any)
            const bgItem = bgRes.data[0] as any
            if (bgItem?.url) bgUrl = bgItem.url
            else if (bgItem?.b64_json) {
              const buf = Buffer.from(bgItem.b64_json, 'base64')
              bgUrl = await saveBuf(supabase, buf, user.id, 'card-bg')
            }
          } catch (e) { console.error('bg gen:', e) }

          if (!bgUrl) continue
          const cardBuf = await makeCard(bgUrl, prodB64, productName, cardBullets, cardStyle, i)
          results.push(await saveBuf(supabase, cardBuf, user.id, 'cards'))
        } catch (e) { console.error(`card ${i}:`, e) }
      }
    } else {
      const wishesEn = await translateWishes(wishes)

      if (displayStyle === 'catalog' && !REPLICATE) {
        for (let i = 0; i < qty; i++) {
          try { const buf = await makeCatalog(allPhotos[i % allPhotos.length], RMBG); results.push(await saveBuf(supabase, buf, user.id, 'studio')) }
          catch (e) { console.error(`catalog ${i}:`, e) }
        }
      } else if (REPLICATE) {
        const photoUrls: string[] = []
        for (const p of allPhotos) { const u = await uploadPhoto(supabase, p, user.id, 'replicate-input'); if (u) photoUrls.push(u) }
        if (!photoUrls.length) return NextResponse.json({ error: 'Помилка завантаження фото' }, { status: 500 })

        const VARIATIONS = ['', 'slightly different angle, different lighting mood', 'alternative perspective, different background depth', 'different time of day, alternative environment']
        for (let i = 0; i < qty; i++) {
          try {
            const photoUrl = photoUrls[i % photoUrls.length]
            const base = STYLE_PROMPTS[displayStyle] || STYLE_PROMPTS.catalog
            const variation = i > 0 ? (VARIATIONS[i] || `unique variation ${i + 1}`) : ''
            let prompt = wishesEn ? `${wishesEn}. ${base}` : base
            if (variation) prompt += `. ${variation}`
            const url = await runFluxKontext(photoUrl, prompt.slice(0, 600), REPLICATE)
            if (url) results.push(await saveUrl(supabase, url, user.id, 'studio'))
          } catch (e) { console.error(`flux ${i}:`, e) }
        }
      } else {
        return NextResponse.json({ error: 'Для цього стилю потрібен REPLICATE_API_TOKEN в Vercel env.', needReplicate: true }, { status: 503 })
      }
    }

    if (!results.length) return NextResponse.json({ error: 'Генерація не вдалась. Спробуйте ще раз.' }, { status: 500 })
    const spent = COST * results.length
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: spent })
    await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -spent, description: `Студія: ${productName.slice(0, 35)} (${mode}/${displayStyle} x${results.length})` })
    await supabase.from('studio_results').insert({ user_id: user.id, product_name: productName.slice(0, 100), mode: mode === 'card' ? 'card' : displayStyle, urls: results, stars_spent: spent, settings: { displayStyle, mode, count: results.length } }).then(() => {})
    return NextResponse.json({ results, starsSpent: spent, newBalance: balance - spent, count: results.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Studio error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
