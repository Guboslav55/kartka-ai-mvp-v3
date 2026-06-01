import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'fs'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

// ─── Font loader ──────────────────────────────────────────────────────────────
function findFont(bold: boolean): string {
  const names = bold
    ? ['ARIALBD.TTF','ARIBLK.TTF','arialbd.ttf','DejaVuSans-Bold.ttf']
    : ['ARIAL.TTF','arial.ttf','DejaVuSans.ttf']
  const dirs = [
    '/var/task/kartka-ai/public/fonts',
    path.join(process.cwd(), 'public/fonts'),
  ]
  for (const d of dirs) {
    for (const n of names) {
      const p = path.join(d, n)
      try { if (fs.existsSync(p)) return p } catch {}
    }
  }
  return ''
}

// ─── Style presets ────────────────────────────────────────────────────────────
const PRESETS: Record<string, { accent: string; bg: string; textColor: string; sceneStyle: string }> = {
  military: { accent: '#8B9E4C', bg: '#1a1f0f', textColor: '#FFFFFF', sceneStyle: 'dark tactical military style, olive khaki tones, dramatic lighting' },
  urban:    { accent: '#FFD700', bg: '#111111', textColor: '#FFFFFF', sceneStyle: 'urban streetwear style, dark gradient, energetic composition' },
  premium:  { accent: '#C9A84C', bg: '#0d0d0d', textColor: '#C9A84C', sceneStyle: 'luxury premium dark style, cinematic lighting, elegant gold tones' },
  rozetka:  { accent: '#FF6600', bg: '#FFFFFF', textColor: '#1a1a1a', sceneStyle: 'clean white studio, soft even lighting, professional ecommerce' },
  prom:     { accent: '#0066CC', bg: '#F5F7FF', textColor: '#1a1a1a', sceneStyle: 'clean light studio, professional marketplace photography' },
  minimal:  { accent: '#FFFFFF', bg: '#111111', textColor: '#FFFFFF', sceneStyle: 'minimalist dark background, elegant soft lighting' },
}

// ─── GPT: analyse product photo ───────────────────────────────────────────────
async function analyseProduct(photo: string, name: string, category: string) {
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: photo, detail: 'low' } },
        { type: 'text', text: `Product: "${name}", Category: "${category}".
Return JSON only:
{
  "dominantColors": ["#hex1","#hex2"],
  "productStyle": "military|urban|sport|casual|premium|minimal",
  "backgroundPrompt": "Flux Kontext prompt (English, 60 words): Keep this exact product/person unchanged. Describe ONLY the new background scene matching the product style. No text, no letters. Portrait orientation."
}` }
      ]}],
      max_tokens: 200,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })
    return JSON.parse(r.choices[0]?.message?.content || '{}')
  } catch { return {} }
}

// ─── Layout Engine using @napi-rs/canvas ─────────────────────────────────────
async function renderCard(
  sceneUrl: string,
  productUrl: string | null,
  name: string,
  bullets: string[],
  layout: 'split' | 'diagonal' | 'radial',
  cardPreset: string
): Promise<Buffer> {
  const { createCanvas, loadImage, GlobalFonts } = await import('@napi-rs/canvas')

  // Register font
  const fontBold = findFont(true)
  const fontReg  = findFont(false)
  if (fontBold) { try { GlobalFonts.registerFromPath(fontBold, 'CardFont'); console.log('Font registered:', fontBold) } catch(e) { console.error('Font reg:', e) } }

  const BF = fontBold ? 'bold 1px CardFont' : 'bold 1px Arial'
  const RF = fontReg  ? '1px CardFont'      : '1px Arial'
  const fontFamily = fontBold ? 'CardFont' : 'Arial, sans-serif'

  const W = 1080, H = 1440  // Portrait 3:4
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  const preset = PRESETS[cardPreset] || PRESETS.urban
  const { accent, textColor } = preset
  const bs = bullets.filter(Boolean).slice(0, 5)

  // Load background scene
  const scene = await loadImage(sceneUrl)
  ctx.drawImage(scene, 0, 0, W, H)

  // ── SPLIT layout: text left, product right ─────────────────────────────────
  if (layout === 'split') {
    // Dark gradient on left half
    const grad = ctx.createLinearGradient(0, 0, W, 0)
    grad.addColorStop(0, 'rgba(0,0,0,0.92)')
    grad.addColorStop(0.50, 'rgba(0,0,0,0.60)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Top gradient
    const gt = ctx.createLinearGradient(0, 0, 0, H * 0.2)
    gt.addColorStop(0, 'rgba(0,0,0,0.70)')
    gt.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gt
    ctx.fillRect(0, 0, W, H * 0.2)

    // Accent bar left
    ctx.fillStyle = accent
    ctx.fillRect(0, 0, 10, H)

    // Title
    const words = name.toUpperCase().split(' ')
    const lines: string[] = []; let cur = ''
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > 14 && cur) { lines.push(cur); cur = w }
      else cur = (cur + ' ' + w).trim()
    }
    if (cur) lines.push(cur)

    const tFS = Math.min(100, Math.round(W * 0.085))
    ctx.font = `bold ${tFS}px ${fontFamily}`
    ctx.fillStyle = textColor
    let titleY = Math.round(H * 0.09)
    for (const line of lines.slice(0, 3)) {
      ctx.fillText(line, 30, titleY)
      titleY += tFS + 10
    }

    // Accent line
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.roundRect(30, titleY + 6, 220, 6, 3)
    ctx.fill()

    // Bullets
    const bStart = titleY + 36
    const bSpacing = Math.round((H * 0.78 - bStart) / Math.max(bs.length, 1))
    for (let i = 0; i < bs.length; i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/, '').slice(0, 32)
      const by = bStart + i * bSpacing

      // Bullet background
      ctx.fillStyle = 'rgba(0,0,0,0.80)'
      ctx.beginPath()
      ctx.roundRect(18, by, Math.min(clean.length * 18 + 90, W * 0.50), 85, 12)
      ctx.fill()

      // Circle
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(62, by + 42, 28, 0, Math.PI * 2)
      ctx.fill()

      // Number
      ctx.font = `bold 20px ${fontFamily}`
      ctx.fillStyle = preset.bg === '#FFFFFF' || preset.bg === '#F5F7FF' ? '#000000' : '#000000'
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), 62, by + 50)
      ctx.textAlign = 'left'

      // Text - wrap long text to 2 lines
      ctx.font = `bold 21px ${fontFamily}`
      ctx.fillStyle = '#FFFFFF'
      const maxW = Math.round(W * 0.47) - 104
      const words = clean.split(' ')
      let line1 = '', line2 = ''
      for (const word of words) {
        const test = line1 ? line1 + ' ' + word : word
        if (ctx.measureText(test).width <= maxW) { line1 = test }
        else { line2 = line2 ? line2 + ' ' + word : word }
      }
      ctx.fillText(line1, 104, line2 ? by + 36 : by + 48)
      if (line2) {
        ctx.font = `18px ${fontFamily}`
        ctx.fillStyle = 'rgba(255,255,255,0.80)'
        ctx.fillText(line2.slice(0, 32), 104, by + 62)
      }
    }

    // Bottom bar
    ctx.fillStyle = accent
    ctx.fillRect(0, H - 88, W, 88)
    ctx.font = `bold 26px ${fontFamily}`
    ctx.fillStyle = preset.bg === '#FFFFFF' || preset.bg === '#F5F7FF' ? '#FFFFFF' : '#000000'
    ctx.textAlign = 'center'
    ctx.fillText('XS · S · M · L · XL · 2XL · 3XL', W / 2, H - 30)
    ctx.textAlign = 'left'
  }

  // ── DIAGONAL layout: title top-left, bullets bottom-right ─────────────────
  else if (layout === 'diagonal') {
    // Dark top-left triangle gradient
    const g1 = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.5)
    g1.addColorStop(0, 'rgba(0,0,0,0.90)')
    g1.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g1
    ctx.fillRect(0, 0, W, H)

    // Dark bottom-right
    const g2 = ctx.createLinearGradient(W, H, W * 0.3, H * 0.5)
    g2.addColorStop(0, 'rgba(0,0,0,0.90)')
    g2.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g2
    ctx.fillRect(0, 0, W, H)

    // Diagonal accent line
    ctx.strokeStyle = accent
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(0, H * 0.42)
    ctx.lineTo(W, H * 0.58)
    ctx.stroke()

    // Title top-left
    const words = name.toUpperCase().split(' ')
    const lines: string[] = []; let cur = ''
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > 12 && cur) { lines.push(cur); cur = w }
      else cur = (cur + ' ' + w).trim()
    }
    if (cur) lines.push(cur)

    const tFS = Math.min(110, Math.round(W * 0.095))
    ctx.font = `bold ${tFS}px ${fontFamily}`
    ctx.fillStyle = textColor
    let ty = Math.round(H * 0.08)
    for (const line of lines.slice(0, 3)) {
      ctx.fillText(line, 40, ty)
      ty += tFS + 8
    }

    // Bullets bottom-right
    const bFS = 24
    ctx.font = `bold ${bFS}px ${fontFamily}`
    const bStart = H * 0.62
    const bSpacing = Math.round((H * 0.88 - bStart) / Math.max(bs.length, 1))
    for (let i = 0; i < bs.length; i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/, '').slice(0, 30)
      const by = bStart + i * bSpacing
      const bx = W * 0.38

      ctx.fillStyle = 'rgba(0,0,0,0.82)'
      ctx.beginPath()
      ctx.roundRect(bx, by, W - bx - 20, 80, 12)
      ctx.fill()

      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(bx + 36, by + 40, 24, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = `bold 18px ${fontFamily}`
      ctx.fillStyle = '#000000'
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), bx + 36, by + 47)
      ctx.textAlign = 'left'

      ctx.font = `bold 22px ${fontFamily}`
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(clean, bx + 72, by + 47)
    }

    // Bottom accent
    ctx.fillStyle = accent
    ctx.fillRect(0, H - 80, W, 80)
    ctx.font = `bold 24px ${fontFamily}`
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'center'
    ctx.fillText('XS · S · M · L · XL · 2XL · 3XL', W / 2, H - 24)
    ctx.textAlign = 'left'
  }

  // ── RADIAL layout: title top-center, bullets around product ───────────────
  else if (layout === 'radial') {
    // Vignette
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.15, W/2, H/2, H*0.75)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)

    // Top gradient for title
    const gt = ctx.createLinearGradient(0, 0, 0, H * 0.22)
    gt.addColorStop(0, 'rgba(0,0,0,0.85)')
    gt.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gt
    ctx.fillRect(0, 0, W, H * 0.22)

    // Title centered top
    const words = name.toUpperCase().split(' ')
    const lines: string[] = []; let cur = ''
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > 16 && cur) { lines.push(cur); cur = w }
      else cur = (cur + ' ' + w).trim()
    }
    if (cur) lines.push(cur)

    const tFS = Math.min(96, Math.round(W * 0.082))
    ctx.font = `bold ${tFS}px ${fontFamily}`
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    let ty = Math.round(H * 0.08)
    for (const line of lines.slice(0, 2)) {
      ctx.fillText(line, W / 2, ty)
      ty += tFS + 8
    }

    // Accent line under title
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.roundRect(W/2 - 100, ty + 8, 200, 6, 3)
    ctx.fill()

    // Bullets in positions around center
    const positions = [
      { x: 40,       y: H * 0.38, align: 'left'  },
      { x: 40,       y: H * 0.55, align: 'left'  },
      { x: 40,       y: H * 0.72, align: 'left'  },
      { x: W - 40,   y: H * 0.38, align: 'right' },
      { x: W - 40,   y: H * 0.55, align: 'right' },
    ]

    for (let i = 0; i < Math.min(bs.length, 5); i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/, '').slice(0, 22)
      const pos = positions[i]
      const bw = Math.min(clean.length * 16 + 70, W * 0.40)
      const bx = pos.align === 'right' ? pos.x - bw : pos.x
      const by = pos.y - 35

      ctx.fillStyle = 'rgba(0,0,0,0.82)'
      ctx.beginPath()
      ctx.roundRect(bx, by, bw, 70, 10)
      ctx.fill()

      // Dot accent
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(pos.align === 'right' ? bx + bw - 30 : bx + 30, pos.y, 20, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = `bold 20px ${fontFamily}`
      ctx.fillStyle = '#000000'
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), pos.align === 'right' ? bx + bw - 30 : bx + 30, pos.y + 7)

      ctx.textAlign = pos.align === 'right' ? 'right' : 'left'
      ctx.font = `bold 19px ${fontFamily}`
      ctx.fillStyle = '#FFFFFF'
      const tx = pos.align === 'right' ? bx + bw - 58 : bx + 58
      ctx.fillText(clean, tx, pos.y + 7)
    }

    ctx.textAlign = 'left'

    // Bottom bar
    ctx.fillStyle = accent
    ctx.fillRect(0, H - 80, W, 80)
    ctx.font = `bold 26px ${fontFamily}`
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'center'
    ctx.fillText('XS · S · M · L · XL · 2XL · 3XL', W / 2, H - 22)
    ctx.textAlign = 'left'
  }

  return canvas.toBuffer('image/jpeg', { quality: 93 })
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
    await supabase.storage.from('card-images').upload(fn, await sharp(buf).jpeg({ quality: 93 }).toBuffer(), { contentType: 'image/jpeg' })
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return url }
}

async function runFlux(imageUrl: string, prompt: string, token: string): Promise<string | null> {
  try {
    const pred = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { input_image: imageUrl, prompt, aspect_ratio: '2:3', output_format: 'jpg', output_quality: 90, safety_tolerance: 2 } })
    })
    if (!pred.ok) return null
    const { id } = await pred.json()
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers: { Authorization: `Token ${token}` } })
      const d = await r.json()
      if (d.status === 'succeeded') return Array.isArray(d.output) ? d.output[0] : d.output
      if (d.status === 'failed') return null
    }
    return null
  } catch { return null }
}

async function makeCatalog(b64: string, rmbgKey?: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  let p = m ? Buffer.from(m[2], 'base64') : Buffer.from(b64, 'base64')
  if (rmbgKey) {
    try {
      const fd = new FormData(); fd.append('image_file', new Blob([p], { type: m?.[1] || 'image/jpeg' }), 'p.jpg'); fd.append('size', 'auto')
      const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': rmbgKey }, body: fd })
      if (r.ok) p = Buffer.from(await r.arrayBuffer())
    } catch {}
  }
  const S = 1200, PAD = 100
  const rs = await sharp(p).resize(S-PAD*2, S-PAD*2, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer()
  return sharp({ create: { width:S, height:S, channels:4, background:{r:248,g:248,b:248,alpha:255} } })
    .composite([{input:rs,top:PAD,left:PAD}]).jpeg({quality:95}).toBuffer()
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      mode = 'photo', displayStyle = 'catalog',
      cardPreset = 'urban', cardLayout = 'split',
      productPhoto, productPhotos, productPhotoUrl,
      productName = '', category = '', wishes = '', count = 1, bullets = []
    } = await req.json()

    if (!productName.trim()) return NextResponse.json({ error: 'Введіть назву товару' }, { status: 400 })

    const allPhotos: string[] = productPhotos?.length ? productPhotos : (productPhoto ? [productPhoto] : [])
    if (!allPhotos.length && productPhotoUrl) {
      try { const r = await fetch(productPhotoUrl); const buf = Buffer.from(await r.arrayBuffer()); allPhotos.push(`data:${r.headers.get('content-type')||'image/jpeg'};base64,${buf.toString('base64')}`) } catch {}
    }
    if (!allPhotos.length) return NextResponse.json({ error: 'Завантажте фото товару' }, { status: 400 })

    const qty = Math.min(Math.max(1, count), 4)
    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < COST * qty) return NextResponse.json({ error: `Недостатньо зорь (${COST*qty} ⭐)`, needStars: true, balance }, { status: 402 })

    const REPLICATE = process.env.REPLICATE_API_TOKEN
    const RMBG = process.env.REMOVE_BG_API_KEY
    const results: string[] = []

    // ── CARD MODE ─────────────────────────────────────────────────────────────
    if (mode === 'card') {
      const cardBullets = (bullets as string[]).filter(Boolean)
      if (!cardBullets.length) return NextResponse.json({ error: 'Додайте переваги товару' }, { status: 400 })
      if (!REPLICATE) return NextResponse.json({ error: 'Потрібен REPLICATE_API_TOKEN' }, { status: 503 })

      const photoUrl = await uploadPhoto(supabase, allPhotos[0], user.id, 'card-input')
      if (!photoUrl) return NextResponse.json({ error: 'Помилка завантаження фото' }, { status: 500 })

      const preset = PRESETS[cardPreset] || PRESETS.urban
      const layouts: ('split'|'diagonal'|'radial')[] = ['split','diagonal','radial','split']

      for (let i = 0; i < qty; i++) {
        try {
          const chosenLayout = cardLayout === 'auto'
            ? layouts[i % layouts.length]
            : cardLayout as 'split'|'diagonal'|'radial'

          // Flux generates scene (portrait 2:3, product preserved)
          const fluxPrompt = `IMPORTANT: Keep this exact product/person/clothing 100% identical - do NOT change any clothing, colors, patterns, logos, or person appearance. ONLY change the background environment. New background: ${preset.sceneStyle}. Keep product on right side of frame. Left side should be darker. Absolutely preserve: jacket color, camouflage pattern, hood shape, all clothing details. Professional marketing photo.`
          console.log(`[card ${i+1}] layout:${chosenLayout} flux...`)

          const sceneUrl = await runFlux(photoUrl, fluxPrompt, REPLICATE)
          if (!sceneUrl) { console.warn(`Card ${i+1}: Flux failed`); continue }

          // Canvas layout engine renders text
          const cardBuf = await renderCard(sceneUrl, null, productName, cardBullets, chosenLayout, cardPreset)
          results.push(await saveBuf(supabase, cardBuf, user.id, 'cards'))
          console.log(`[card ${i+1}] done ✅`)
        } catch (e) { console.error(`card ${i}:`, e) }
      }
    }
    // ── PHOTO MODE ────────────────────────────────────────────────────────────
    else {
      const STYLES: Record<string, string> = {
        model:    'Keep this exact person and clothing completely unchanged. Change only background to urban city street. Preserve EVERY detail.',
        store:    'Keep this exact clothing completely unchanged. Show on premium hanger in boutique. Preserve EVERY detail.',
        flatlay:  'Keep this exact clothing completely unchanged. Show ONLY clothing top-down on white marble. Preserve EVERY detail.',
        catalog:  'Keep this exact clothing and person completely unchanged. Pure white studio background. Preserve EVERY detail.',
        outdoor:  'Keep this exact person and clothing completely unchanged. Outdoor nature mountains, golden hour. Preserve EVERY detail.',
        dark:     'Keep this exact person and clothing completely unchanged. Dark moody studio, dramatic rim lighting. Preserve EVERY detail.',
        lifestyle:'Keep this exact person and clothing completely unchanged. Warm lifestyle interior, bokeh. Preserve EVERY detail.',
      }
      const VARS = ['', 'slightly different angle', 'alternative lighting', 'different atmosphere']

      if (displayStyle === 'catalog' && !REPLICATE) {
        for (let i = 0; i < qty; i++) {
          try { const buf = await makeCatalog(allPhotos[i % allPhotos.length], RMBG); results.push(await saveBuf(supabase, buf, user.id, 'studio')) }
          catch (e) { console.error(e) }
        }
      } else if (REPLICATE) {
        let wishEn = ''
        if (wishes.trim()) {
          try { const r = await openai.chat.completions.create({ model:'gpt-4o-mini', messages:[{role:'user',content:`Translate to English: "${wishes}"`}], max_tokens:60 }); wishEn = r.choices[0]?.message?.content?.trim() || wishes } catch { wishEn = wishes }
        }
        const photoUrls: string[] = []
        for (const p of allPhotos) { const u = await uploadPhoto(supabase, p, user.id, 'replicate-input'); if (u) photoUrls.push(u) }
        if (!photoUrls.length) return NextResponse.json({ error: 'Помилка завантаження фото' }, { status: 500 })

        for (let i = 0; i < qty; i++) {
          try {
            const base = STYLES[displayStyle] || STYLES.catalog
            let prompt = wishEn ? `${wishEn}. ${base}` : base
            if (i > 0) prompt += `. ${VARS[i]}`
            const url = await runFlux(photoUrls[i % photoUrls.length], prompt.slice(0, 600), REPLICATE)
            if (url) results.push(await saveUrl(supabase, url, user.id, 'studio'))
          } catch (e) { console.error(e) }
        }
      } else {
        return NextResponse.json({ error: 'Потрібен REPLICATE_API_TOKEN.', needReplicate: true }, { status: 503 })
      }
    }

    if (!results.length) return NextResponse.json({ error: 'Генерація не вдалась. Спробуйте ще раз.' }, { status: 500 })
    const spent = COST * results.length
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: spent })
    await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -spent, description: `Студія: ${productName.slice(0,35)} (${mode} x${results.length})` })
    await supabase.from('studio_results').insert({ user_id: user.id, product_name: productName.slice(0,100), mode: mode==='card'?'card':displayStyle, urls: results, stars_spent: spent, settings: { displayStyle, mode, cardPreset, cardLayout, count: results.length } }).then(() => {})
    return NextResponse.json({ results, starsSpent: spent, newBalance: balance - spent, count: results.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Studio error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
