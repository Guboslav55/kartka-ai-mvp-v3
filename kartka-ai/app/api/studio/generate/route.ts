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

// ─── GPT: shorten title to fit card ──────────────────────────────────────────
async function shortenTitle(name: string, creativity: number): Promise<string> {
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Shorten this product name for a marketplace card.\nProduct: "' + name + '"\nRules:\n- Max 12 chars per line, 2 lines max\n- Keep product type + brand/material\n- Remove: prepositions, repeated adjectives\n- Do NOT add new words not in original name\n- Match input language (Ukrainian/Russian)\nReturn ONLY uppercase shortened title:' }],
      max_tokens: 20, temperature: Math.max(0.1, creativity * 0.4),
    })
    const t = (r.choices[0]?.message?.content?.trim() || name).toUpperCase()
    return t.slice(0, 28)
  } catch { return name.toUpperCase().slice(0, 28) }
}


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

// ─── Build background prompt matching the product ────────────────────────────
async function buildMatchingBackground(
  photo: string, name: string, category: string,
  preset: { sceneStyle: string; accent: string },
  varIdx: number,
  creativity: number
): Promise<string> {
  const varStyles = [
    'clean studio background, soft even lighting, light gradient',
    'lifestyle environment matching product mood, soft bokeh',
    'minimal abstract background, complementary colors',
    'dynamic scene matching product style, professional lighting',
  ]
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: photo, detail: 'low' } },
        { type: 'text', text: `Product: "${name}", Category: "${category}". Variation ${varIdx+1}.

Analyze the product colors and style. Create a background scene description for a product card.

Rules:
- Background should COMPLEMENT the product, not compete with it
- Use LIGHTER tones on the left side (where text will be placed)
- The right side can have depth/texture
- Match the product's style: sportswear→dynamic gym, military→tactical outdoor, luxury→dark studio, casual→lifestyle
- Variation ${varIdx+1} style hint: ${varStyles[varIdx % varStyles.length]}
- Creativity level ${creativity > 0.65 ? 'high: be creative with the scene' : 'medium: keep it professional'}

Return ONLY a short background description (max 40 words, English):` }
      ]}],
      max_tokens: 80, temperature: 0.6,
    })
    return r.choices[0]?.message?.content?.trim() || preset.sceneStyle
  } catch { return preset.sceneStyle }
}

// ─── Style presets ────────────────────────────────────────────────────────────
const PRESETS: Record<string, { accent: string; bg: string; textColor: string; sceneStyle: string }> = {
  auto:        { accent: '#FFD700', bg: '#111111', textColor: '#FFFFFF', sceneStyle: 'dramatic professional product marketing scene, dynamic lighting, dark atmospheric background' },
  military:    { accent: '#8B9E4C', bg: '#1a1f0f', textColor: '#FFFFFF', sceneStyle: 'dark tactical military style, smoke and fog, olive khaki tones, dramatic moody lighting, metal textures' },
  premium:     { accent: '#C9A84C', bg: '#0d0d0d', textColor: '#C9A84C', sceneStyle: 'luxury premium dark style, cinematic studio lighting, deep black background, elegant gold light tones' },
  marketplace: { accent: '#FF6600', bg: '#FFFFFF', textColor: '#1a1a1a', sceneStyle: 'clean white studio background, soft even product photography lighting, professional ecommerce style' },
  social:      { accent: '#E91E8C', bg: '#0d0d0d', textColor: '#FFFFFF', sceneStyle: 'trendy social media aesthetic, vibrant colors, lifestyle background, Instagram-style lighting' },
  minimal:     { accent: '#FFFFFF', bg: '#111111', textColor: '#FFFFFF', sceneStyle: 'minimalist dark background, elegant single light source, luxury product photography' },
  urban:       { accent: '#FFD700', bg: '#111111', textColor: '#FFFFFF', sceneStyle: 'urban streetwear style, dark gradient, energetic composition' },
  rozetka:     { accent: '#FF6600', bg: '#FFFFFF', textColor: '#1a1a1a', sceneStyle: 'clean white studio, soft even lighting, professional ecommerce' },
  prom:        { accent: '#0066CC', bg: '#F5F7FF', textColor: '#1a1a1a', sceneStyle: 'clean light studio, professional marketplace photography' },
}

// ─── Layout Engine using @napi-rs/canvas ─────────────────────────────────────
// ─── Universal card renderer: DALL-E bg + Sharp composite + Canvas text ───────
async function renderAllLayouts(
  productPhoto: string,
  name: string,
  bullets: string[],
  layout: 'split' | 'diagonal' | 'radial' | 'bold',
  cardPreset: string,
  rmbgKey?: string,
  fluxBgUrl?: string
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas')

  const fontBold = findFont(true)
  if (fontBold) try { GlobalFonts.registerFromPath(fontBold, 'CF') } catch {}
  const FF = fontBold ? 'CF' : 'Arial'

  const preset = PRESETS[cardPreset] || PRESETS.urban
  const { accent } = preset
  const W = 1080, H = 1440, BARH = 88
  const bs = bullets.filter(Boolean).slice(0, 5)

  // ── helpers ────────────────────────────────────────────────────────────────
  function accentRGB() {
    return { r: parseInt(accent.slice(1,3),16), g: parseInt(accent.slice(3,5),16), b: parseInt(accent.slice(5,7),16) }
  }

  // ── 1. Remove bg from product ──────────────────────────────────────────────
  const m = productPhoto.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  let productBuf = m ? Buffer.from(m[2], 'base64') : Buffer.from(productPhoto, 'base64')
  if (rmbgKey) {
    try {
      const fd = new FormData()
      fd.append('image_file', new Blob([productBuf], { type: m?.[1] || 'image/jpeg' }), 'p.jpg')
      fd.append('size', 'auto')
      const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': rmbgKey }, body: fd })
      if (r.ok) productBuf = Buffer.from(await r.arrayBuffer())
    } catch {}
  }

  // ── 2. Background: Flux scene → blurred photo → solid dark ───────────────
  let bgFull: Buffer
  if (fluxBgUrl) {
    try {
      const r = await fetch(fluxBgUrl)
      bgFull = await sharp(Buffer.from(await r.arrayBuffer())).resize(W, H, { fit: 'cover', position: 'centre' }).jpeg({ quality: 92 }).toBuffer()
      console.log('bg: flux scene ✅')
    } catch (e) {
      console.error('Flux bg fetch failed:', e)
      bgFull = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 15, g: 15, b: 15 } } }).jpeg().toBuffer()
    }
  } else {
    try {
      const rawBuf = m ? Buffer.from(m[2], 'base64') : Buffer.from(productPhoto, 'base64')
      bgFull = await sharp(rawBuf).resize(W, H, { fit: 'cover', position: 'centre' }).blur(28).modulate({ brightness: 0.45, saturation: 0.6 }).jpeg({ quality: 88 }).toBuffer()
      console.log('bg: blurred product photo ✅')
    } catch {
      bgFull = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 15, g: 15, b: 15 } } }).jpeg().toBuffer()
    }
  }

  // ── 3. Product cutout — only for Split (others use Flux scene directly) ────
  let productResized: Buffer | null = null
  let prodW = 0, prodH = 0, prodLeft = 0, prodTop = 0

  if (layout === 'split') {
    const COL = Math.round(W * 0.385)
    prodW = W - COL - 80;  prodH = H - BARH - 80
    prodLeft = COL + 40;   prodTop = 40
    productResized = await sharp(productBuf)
      .resize(prodW, prodH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer()
  }

  // ── 4. Canvas: draw text overlays ─────────────────────────────────────────
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)

  function wrapText(text: string, maxW: number, font: string): string[] {
    ctx.font = font
    const words = text.split(' '), lines: string[] = []
    let cur = ''
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w
      if (ctx.measureText(t).width <= maxW) { cur = t }
      else { if (cur) lines.push(cur); cur = w }
    }
    if (cur) lines.push(cur)
    return lines
  }

  function pill(x: number, y: number, w: number, h: number, r = 14) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill()
  }

  function drawBullets(
    startX: number, startY: number, availW: number, availH: number,
    count: number, align: 'left' | 'center' = 'left'
  ) {
    const bH = Math.min(105, Math.round(availH / count) - 10)
    const bGap = Math.round((availH - bH * count) / Math.max(count - 1, 1))
    const bFS = 26, iconR = 23
    for (let i = 0; i < count; i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/, '')
      const bx = startX
      const by = startY + i * (bH + bGap)
      ctx.fillStyle = 'rgba(0,0,0,0.78)'; pill(bx, by, availW, bH)
      ctx.fillStyle = accent
      ctx.beginPath(); ctx.arc(bx + iconR + 8, by + bH / 2, iconR, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#000'; ctx.font = `bold ${Math.round(iconR * 0.85)}px ${FF}`; ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), bx + iconR + 8, by + bH / 2 + Math.round(iconR * 0.32))
      ctx.textAlign = 'left'
      const bLines = wrapText(clean, availW - iconR * 2 - 28, `bold ${bFS}px ${FF}`)
      ctx.fillStyle = '#FFF'; ctx.font = `bold ${bFS}px ${FF}`
      ctx.fillText(bLines[0] || '', bx + iconR * 2 + 18, by + (bLines[1] ? bH / 2 - 2 : bH / 2 + bFS * 0.36))
      if (bLines[1]) {
        ctx.fillStyle = 'rgba(255,255,255,0.60)'; ctx.font = `${bFS - 5}px ${FF}`
        ctx.fillText(bLines[1], bx + iconR * 2 + 18, by + bH / 2 + bFS * 0.58)
      }
    }
  }

  // Bottom bar (shared by all layouts)
  function drawBottomBar() {
    ctx.fillStyle = accent; ctx.fillRect(0, H - BARH, W, BARH)
    ctx.fillStyle = '#000'; ctx.font = `bold 30px ${FF}`; ctx.textAlign = 'center'
    ctx.fillText('XS · S · M · L · XL · 2XL · 3XL', W / 2, H - BARH / 2 + 11)
    ctx.textAlign = 'left'
  }

  if (layout === 'split') {
    const COL = Math.round(W * 0.385)
    const PAD = 40

    // Semi-transparent dark overlay on left column (shows Flux bg through)
    ctx.fillStyle = 'rgba(0,0,0,0.72)'
    ctx.fillRect(0, 0, COL, H - BARH)

    // Accent stripe
    ctx.fillStyle = accent; ctx.fillRect(0, 0, 8, H - BARH)

    // Separator
    ctx.fillStyle = accent; ctx.globalAlpha = 0.7
    ctx.fillRect(COL, 0, 4, H - BARH)
    ctx.globalAlpha = 1

    // Title
    const maxTW = COL - PAD - 16
    const titleFS = Math.min(96, Math.round(maxTW * 0.26))
    const titleLines = wrapText(name.toUpperCase(), maxTW, `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS}px ${FF}`
    let ty = 60 + titleFS
    for (const line of titleLines.slice(0, 3)) { ctx.fillText(line, PAD, ty); ty += titleFS + 6 }
    ctx.fillStyle = accent; ctx.fillRect(PAD, ty + 10, Math.round(maxTW * 0.6), 5)
    ty += 36

    drawBullets(PAD - 8, ty, COL - PAD, H - BARH - ty - 20, bs.length)
    drawBottomBar()

  } else if (layout === 'diagonal') {
    // Dark bands top-left and bottom
    const g1 = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.45)
    g1.addColorStop(0, 'rgba(0,0,0,0.88)'); g1.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H)

    const g2 = ctx.createLinearGradient(0, H * 0.65, 0, H)
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.92)')
    ctx.fillStyle = g2; ctx.fillRect(0, H * 0.65, W, H * 0.35)

    // Diagonal accent line
    ctx.save()
    ctx.strokeStyle = accent; ctx.lineWidth = 12
    ctx.shadowColor = accent; ctx.shadowBlur = 16
    ctx.beginPath(); ctx.moveTo(0, H * 0.44); ctx.lineTo(W, H * 0.56); ctx.stroke()
    ctx.restore()

    // Title top-left
    const titleFS = Math.min(100, Math.round(W * 0.087))
    const titleLines = wrapText(name.toUpperCase(), Math.round(W * 0.52), `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS}px ${FF}`
    let ty = 60 + titleFS
    for (const line of titleLines.slice(0, 2)) { ctx.fillText(line, 40, ty); ty += titleFS + 6 }
    ctx.fillStyle = accent; ctx.fillRect(40, ty + 8, 180, 5)

    // Bullets bottom
    const bStartY = H * 0.76
    const availH = H - BARH - 20 - bStartY
    drawBullets(20, bStartY, W - 40, availH, bs.length)
    drawBottomBar()

  } else if (layout === 'radial') {
    // Top dark band
    const gt = ctx.createLinearGradient(0, 0, 0, H * 0.26)
    gt.addColorStop(0, 'rgba(0,0,0,0.94)'); gt.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H * 0.26)

    // Bottom dark band for bullets
    const bRows = Math.ceil(bs.length / 2)
    const bH2 = 74, bGap2 = 12
    const gridH = bRows * bH2 + (bRows - 1) * bGap2
    const gridStartY = H - BARH - 20 - gridH
    const gbl = ctx.createLinearGradient(0, gridStartY - 70, 0, H)
    gbl.addColorStop(0, 'rgba(0,0,0,0)'); gbl.addColorStop(1, 'rgba(0,0,0,0.94)')
    ctx.fillStyle = gbl; ctx.fillRect(0, gridStartY - 70, W, H - gridStartY + 70)

    // Title centered top
    const titleFS = Math.min(94, Math.round(W * 0.082))
    const titleLines = wrapText(name.toUpperCase(), W * 0.84, `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS}px ${FF}`; ctx.textAlign = 'center'
    let ty = 52 + titleFS
    for (const line of titleLines.slice(0, 2)) { ctx.fillText(line, W / 2, ty); ty += titleFS + 6 }
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(W / 2 - 100, ty + 8, 200, 6, 3); ctx.fill()
    ctx.textAlign = 'left'

    // 2-col grid bullets
    const colW = (W - 48) / 2, bFS = 23, iconR = 20
    for (let i = 0; i < Math.min(bs.length, 4); i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/, '')
      const col = i % 2, row = Math.floor(i / 2)
      const bx = 16 + col * (colW + 16), by = gridStartY + row * (bH2 + bGap2)
      ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.beginPath(); ctx.roundRect(bx, by, colW, bH2, 14); ctx.fill()
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(bx + iconR + 8, by + bH2 / 2, iconR, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#000'; ctx.font = `bold 15px ${FF}`; ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), bx + iconR + 8, by + bH2 / 2 + 5); ctx.textAlign = 'left'
      const bLines = wrapText(clean, colW - iconR * 2 - 22, `bold ${bFS}px ${FF}`)
      ctx.fillStyle = '#FFF'; ctx.font = `bold ${bFS}px ${FF}`
      ctx.fillText(bLines[0] || '', bx + iconR * 2 + 16, by + bH2 / 2 + bFS * 0.36)
    }
    drawBottomBar()

  } else { // bold
    // Top dark band
    const gt = ctx.createLinearGradient(0, 0, 0, H * 0.24)
    gt.addColorStop(0, 'rgba(0,0,0,0.96)'); gt.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H * 0.24)

    // Bottom dark band
    const bRows2 = Math.ceil(bs.length / 2)
    const bH3 = 82, bGap3 = 14
    const gridH2 = bRows2 * bH3 + (bRows2 - 1) * bGap3
    const gridStart2 = H - BARH - 24 - gridH2
    const gb2 = ctx.createLinearGradient(0, gridStart2 - 70, 0, H)
    gb2.addColorStop(0, 'rgba(0,0,0,0)'); gb2.addColorStop(1, 'rgba(0,0,0,0.96)')
    ctx.fillStyle = gb2; ctx.fillRect(0, gridStart2 - 70, W, H - gridStart2 + 70)

    // Top accent bar
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 10)

    // Large title
    const titleFS = Math.min(100, Math.round(W * 0.087))
    const titleLines = wrapText(name.toUpperCase(), W * 0.88, `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS}px ${FF}`; ctx.textAlign = 'center'
    let ty = 18 + titleFS
    for (const line of titleLines.slice(0, 2)) { ctx.fillText(line, W / 2, ty); ty += titleFS + 6 }
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(W / 2 - 130, ty + 8, 260, 8, 4); ctx.fill()
    ctx.textAlign = 'left'

    // 2-col grid bullets
    const colW2 = (W - 48) / 2, bFS2 = 25, iconR2 = 22
    for (let i = 0; i < Math.min(bs.length, 4); i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/, '')
      const col = i % 2, row = Math.floor(i / 2)
      const bx = 16 + col * (colW2 + 16), by = gridStart2 + row * (bH3 + bGap3)
      ctx.fillStyle = 'rgba(0,0,0,0.84)'; ctx.beginPath(); ctx.roundRect(bx, by, colW2, bH3, 16); ctx.fill()
      ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(bx, by, colW2, 8, [8,8,0,0]); ctx.fill()
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(bx + iconR2 + 8, by + bH3 / 2 + 4, iconR2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#000'; ctx.font = `bold 16px ${FF}`; ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), bx + iconR2 + 8, by + bH3 / 2 + 10); ctx.textAlign = 'left'
      const bLines = wrapText(clean, colW2 - iconR2 * 2 - 26, `bold ${bFS2}px ${FF}`)
      ctx.fillStyle = '#FFF'; ctx.font = `bold ${bFS2}px ${FF}`
      ctx.fillText(bLines[0] || '', bx + iconR2 * 2 + 18, by + bH3 / 2 + bFS2 * 0.5)
      if (bLines[1]) {
        ctx.fillStyle = 'rgba(255,255,255,0.60)'; ctx.font = `${bFS2 - 4}px ${FF}`
        ctx.fillText(bLines[1], bx + iconR2 * 2 + 18, by + bH3 / 2 + bFS2 * 1.1)
      }
    }
    drawBottomBar()
  }

  if (layout === 'bold') {
    const BARH2 = 90
    const bH4 = 82, bGap4 = 14
    const rows4 = Math.ceil(bs.length / 2)
    const gridH4 = rows4 * bH4 + (rows4 - 1) * bGap4
    const gridStart4 = H - BARH2 - 24 - gridH4
    const gt4 = ctx.createLinearGradient(0, 0, 0, H * 0.24)
    gt4.addColorStop(0, 'rgba(0,0,0,0.96)'); gt4.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gt4; ctx.fillRect(0, 0, W, H * 0.24)
    const gb4 = ctx.createLinearGradient(0, gridStart4 - 70, 0, H)
    gb4.addColorStop(0, 'rgba(0,0,0,0)'); gb4.addColorStop(1, 'rgba(0,0,0,0.96)')
    ctx.fillStyle = gb4; ctx.fillRect(0, gridStart4 - 70, W, H - gridStart4 + 70)
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 10)
    const titleFS4 = Math.min(100, Math.round(W * 0.087))
    const titleLines4 = wrapText(name.toUpperCase(), W * 0.88, `bold ${titleFS4}px ${FF}`)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS4}px ${FF}`; ctx.textAlign = 'center'
    let ty4 = 18 + titleFS4
    for (const line of titleLines4.slice(0, 2)) { ctx.fillText(line, W / 2, ty4); ty4 += titleFS4 + 6 }
    ctx.fillStyle = hexAlpha(accent, 0.9)
    ctx.beginPath(); ctx.roundRect(W / 2 - 130, ty4 + 8, 260, 8, 4); ctx.fill()
    ctx.textAlign = 'left'
    const colW4 = (W - 48) / 2, bFS4 = 25, iconR4 = 22
    for (let i4 = 0; i4 < Math.min(bs.length, 4); i4++) {
      const clean4 = bs[i4].replace(/^[•✓\-]\s*/, '')
      const col4 = i4 % 2, row4 = Math.floor(i4 / 2)
      const bx4 = 16 + col4 * (colW4 + 16), by4 = gridStart4 + row4 * (bH4 + bGap4)
      ctx.fillStyle = 'rgba(0,0,0,0.84)'; ctx.beginPath(); ctx.roundRect(bx4, by4, colW4, bH4, 16); ctx.fill()
      ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(bx4, by4, colW4, 8, [8,8,0,0]); ctx.fill()
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(bx4 + iconR4 + 8, by4 + bH4 / 2 + 4, iconR4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#000'; ctx.font = `bold 16px ${FF}`; ctx.textAlign = 'center'
      ctx.fillText(String(i4 + 1), bx4 + iconR4 + 8, by4 + bH4 / 2 + 10); ctx.textAlign = 'left'
      const bLines4 = wrapText(clean4, colW4 - iconR4 * 2 - 26, `bold ${bFS4}px ${FF}`)
      ctx.fillStyle = '#FFF'; ctx.font = `bold ${bFS4}px ${FF}`
      ctx.fillText(bLines4[0] || '', bx4 + iconR4 * 2 + 18, by4 + bH4 / 2 + bFS4 * 0.5)
      if (bLines4[1]) {
        ctx.fillStyle = 'rgba(255,255,255,0.60)'; ctx.font = `${bFS4 - 4}px ${FF}`
        ctx.fillText(bLines4[1], bx4 + iconR4 * 2 + 18, by4 + bH4 / 2 + bFS4 * 1.1)
      }
    }
    drawBottomBar()
  }

  const textOverlay = canvas.toBuffer('image/png')

  // ── 5. Sharp composite ─────────────────────────────────────────────────────
  const compositeInputs: sharp.OverlayOptions[] = []

  if (layout === 'split' && productResized) {
    const COL = Math.round(W * 0.385)
    const rightBg = await sharp({
      create: { width: W - COL - 4, height: H - BARH, channels: 3, background: { r: 10, g: 10, b: 10 } }
    }).jpeg().toBuffer()
    compositeInputs.push({ input: rightBg, top: 0, left: COL + 4 })
    compositeInputs.push({ input: productResized, top: prodTop, left: prodLeft })
  }
  compositeInputs.push({ input: textOverlay, top: 0, left: 0 })

  return sharp(bgFull)
    .composite(compositeInputs)
    .jpeg({ quality: 95 })
    .toBuffer()
}


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
      cardPreset = 'urban', cardLayout = 'split', creativity = 0.5,
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

      const preset = PRESETS[cardPreset] || PRESETS.urban
      const layouts: ('split'|'diagonal'|'radial'|'bold')[] = ['split','diagonal','radial','bold']

      for (let i = 0; i < qty; i++) {
        try {
          const chosenLayout = layouts[i % layouts.length]

          console.log(`[card ${i+1}] layout:${chosenLayout} flux...`)
          // Upload photo to get public URL for Flux
          console.log(`[card ${i+1}] uploading photo...`)
          const photoUrl = await uploadPhoto(supabase, allPhotos[0], user.id, 'card-input')
          console.log(`[card ${i+1}] photoUrl: ${photoUrl ? 'OK' : 'FAILED'}`)
          let sceneUrl: string | null = null
          if (photoUrl) {
            console.log(`[card ${i+1}] building bg prompt...`)
            const bgPrompt = await buildMatchingBackground(allPhotos[0], productName, category, preset, i, creativity)
            const fluxPrompt = `CRITICAL: Keep the main product COMPLETELY UNCHANGED - same appearance, colors, shape, textures. ONLY change the background. ${bgPrompt} Professional ecommerce product photography. Portrait orientation.`
            console.log(`[card ${i+1}] calling Flux...`)
            sceneUrl = await runFlux(photoUrl, fluxPrompt, REPLICATE)
            console.log(`[card ${i+1}] sceneUrl: ${sceneUrl ? 'OK ✅' : 'FAILED ❌'}`)
          } else {
            console.warn(`[card ${i+1}] uploadPhoto failed → blur fallback`)
          }
          // GPT shortens title + max 4 bullets
          const shortTitle = await shortenTitle(productName, creativity)
          const topBullets = cardBullets.slice(0, 4)
          // Flux scene as bg, product composited separately, text never overlaps product
          const cardBuf = await renderAllLayouts(allPhotos[0], shortTitle, topBullets, chosenLayout, cardPreset, RMBG, sceneUrl || undefined)
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
