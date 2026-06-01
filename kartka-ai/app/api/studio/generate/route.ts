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
async function renderCard(
  sceneUrl: string,
  _productUrl: string | null,
  name: string,
  bullets: string[],
  layout: 'split' | 'diagonal' | 'radial' | 'bold',
  cardPreset: string
): Promise<Buffer> {
  const { createCanvas, loadImage, GlobalFonts } = await import('@napi-rs/canvas')

  const fontBold = findFont(true)
  const fontReg  = findFont(false)
  if (fontBold) try { GlobalFonts.registerFromPath(fontBold, 'CF') } catch {}
  const FF = fontBold ? 'CF' : 'Arial'

  const W = 1080, H = 1440
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  const preset = PRESETS[cardPreset] || PRESETS.urban
  const { accent } = preset

  // ── helpers ────────────────────────────────────────────────────────────────
  function hexAlpha(hex: string, a: number) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
    return `rgba(${r},${g},${b},${a})`
  }
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill()
  }
  function wrapText(text: string, maxW: number, font: string): string[] {
    ctx.font = font
    const words = text.split(' ')
    const lines: string[] = []
    let cur = ''
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w
      if (ctx.measureText(t).width <= maxW) { cur = t }
      else { if (cur) lines.push(cur); cur = w }
    }
    if (cur) lines.push(cur)
    return lines
  }
  function accentLine(x: number, y: number, w: number) {
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(x, y, w, 6, 3); ctx.fill()
  }

  // Load scene
  const scene = await loadImage(sceneUrl)
  ctx.drawImage(scene, 0, 0, W, H)

  const bs = bullets.filter(Boolean).slice(0, 4)

  // ── SPLIT layout ────────────────────────────────────────────────────────────
  if (layout === 'split') {
    // Deep gradient left side - text lives here
    const g = ctx.createLinearGradient(0,0,W*0.62,0)
    g.addColorStop(0,   'rgba(0,0,0,0.96)')
    g.addColorStop(0.55,'rgba(0,0,0,0.82)')
    g.addColorStop(1,   'rgba(0,0,0,0.0)')
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H)

    // Top & bottom vignette
    const gt = ctx.createLinearGradient(0,0,0,H*0.15)
    gt.addColorStop(0,'rgba(0,0,0,0.6)'); gt.addColorStop(1,'rgba(0,0,0,0)')
    ctx.fillStyle = gt; ctx.fillRect(0,0,W,H*0.15)
    const gb = ctx.createLinearGradient(0,H*0.85,0,H)
    gb.addColorStop(0,'rgba(0,0,0,0)'); gb.addColorStop(1,'rgba(0,0,0,0.7)')
    ctx.fillStyle = gb; ctx.fillRect(0,H*0.85,W,H*0.15)

    // Accent left bar
    ctx.fillStyle = accent
    ctx.beginPath(); ctx.roundRect(0,0,10,H,0); ctx.fill()

    // Title block
    const titleX = 40, titleY = 90
    const maxTW = Math.round(W * 0.50)
    const titleFS = Math.min(96, Math.round(W * 0.082))
    const titleLines = wrapText(name, maxTW, `bold ${titleFS}px ${FF}`)

    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold ${titleFS}px ${FF}`
    let ty = titleY + titleFS
    for (const line of titleLines.slice(0,3)) {
      ctx.fillText(line, titleX, ty)
      ty += titleFS + 8
    }
    accentLine(titleX, ty + 8, 200)
    ty += 36

    // Bullets
    const bSpacing = Math.round((H * 0.82 - ty) / Math.max(bs.length, 1))
    for (let i = 0; i < bs.length; i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/,'')
      const by = ty + i * bSpacing
      const bFS = 26
      const bLines = wrapText(clean, maxTW - 90, `bold ${bFS}px ${FF}`)
      const bh = bLines.length > 1 ? 106 : 88
      const bw = Math.round(W * 0.52)

      // Pill background
      ctx.fillStyle = 'rgba(0,0,0,0.78)'
      roundRect(titleX - 4, by - 4, bw, bh, 16)

      // Accent numbered circle
      ctx.fillStyle = accent
      ctx.beginPath(); ctx.arc(titleX + 34, by + Math.round(bh/2), 30, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#000000'
      ctx.font = `bold 22px ${FF}`
      ctx.textAlign = 'center'
      ctx.fillText(String(i+1), titleX + 34, by + Math.round(bh/2) + 8)
      ctx.textAlign = 'left'

      // Bullet text
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `bold ${bFS}px ${FF}`
      ctx.fillText(bLines[0] || '', titleX + 78, by + (bLines.length > 1 ? 36 : Math.round(bh/2) + 10))
      if (bLines[1]) {
        ctx.fillStyle = 'rgba(255,255,255,0.70)'
        ctx.font = `${bFS - 4}px ${FF}`
        ctx.fillText(bLines[1], titleX + 78, by + 68)
      }
    }

    // Bottom bar
    ctx.fillStyle = accent
    ctx.fillRect(0, H - 90, W, 90)
    ctx.fillStyle = '#000000'
    ctx.font = `bold 28px ${FF}`
    ctx.textAlign = 'center'
    ctx.fillText('XS · S · M · L · XL · 2XL · 3XL', W/2, H - 30)
    ctx.textAlign = 'left'
  }

  // ── DIAGONAL layout ─────────────────────────────────────────────────────────
  else if (layout === 'diagonal') {
    // Dark upper-left for title
    const g1 = ctx.createLinearGradient(0,0,W*0.7,H*0.5)
    g1.addColorStop(0,'rgba(0,0,0,0.94)'); g1.addColorStop(1,'rgba(0,0,0,0)')
    ctx.fillStyle = g1; ctx.fillRect(0,0,W,H)
    // Dark lower-right for bullets
    const g2 = ctx.createLinearGradient(W,H,W*0.25,H*0.45)
    g2.addColorStop(0,'rgba(0,0,0,0.94)'); g2.addColorStop(1,'rgba(0,0,0,0)')
    ctx.fillStyle = g2; ctx.fillRect(0,0,W,H)

    // Diagonal accent stripe
    ctx.save()
    ctx.strokeStyle = accent; ctx.lineWidth = 10
    ctx.shadowColor = accent; ctx.shadowBlur = 20
    ctx.beginPath(); ctx.moveTo(-10, H*0.46); ctx.lineTo(W+10, H*0.56); ctx.stroke()
    ctx.restore()

    // Title top-left
    const titleFS = Math.min(104, Math.round(W * 0.09))
    const titleLines = wrapText(name, Math.round(W*0.55), `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `bold ${titleFS}px ${FF}`
    let ty = 90 + titleFS
    for (const line of titleLines.slice(0,3)) { ctx.fillText(line, 40, ty); ty += titleFS + 6 }
    accentLine(40, ty + 8, 180)

    // Bullets bottom-right
    const bFS = 25
    const bStartY = H * 0.60
    const bSpacing = Math.round((H * 0.86 - bStartY) / Math.max(bs.length, 1))
    for (let i = 0; i < bs.length; i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/,'')
      const bx = Math.round(W * 0.34)
      const bw = W - bx - 20
      const by = bStartY + i * bSpacing
      const bLines = wrapText(clean, bw - 85, `bold ${bFS}px ${FF}`)
      const bh = bLines.length > 1 ? 100 : 84

      ctx.fillStyle = 'rgba(0,0,0,0.80)'
      roundRect(bx, by, bw, bh, 16)

      ctx.fillStyle = accent
      ctx.beginPath(); ctx.arc(bx+38, by+Math.round(bh/2), 28, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#000000'; ctx.font = `bold 20px ${FF}`; ctx.textAlign = 'center'
      ctx.fillText(String(i+1), bx+38, by+Math.round(bh/2)+7)
      ctx.textAlign = 'left'

      ctx.fillStyle = '#FFFFFF'; ctx.font = `bold ${bFS}px ${FF}`
      ctx.fillText(bLines[0]||'', bx+78, by+(bLines.length>1?32:Math.round(bh/2)+9))
      if (bLines[1]) { ctx.fillStyle='rgba(255,255,255,0.70)'; ctx.font=`${bFS-4}px ${FF}`; ctx.fillText(bLines[1], bx+78, by+62) }
    }

    ctx.fillStyle = accent; ctx.fillRect(0, H-90, W, 90)
    ctx.fillStyle = '#000000'; ctx.font = `bold 28px ${FF}`; ctx.textAlign = 'center'
    ctx.fillText('XS · S · M · L · XL · 2XL · 3XL', W/2, H-30)
    ctx.textAlign = 'left'
  }

  // ── RADIAL layout ───────────────────────────────────────────────────────────
  else if (layout === 'radial') {
    // Soft vignette around edges
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.18, W/2, H/2, H*0.72)
    vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.88)')
    ctx.fillStyle = vg; ctx.fillRect(0,0,W,H)

    // Top header gradient
    const gh = ctx.createLinearGradient(0,0,0,H*0.28)
    gh.addColorStop(0,'rgba(0,0,0,0.92)'); gh.addColorStop(1,'rgba(0,0,0,0)')
    ctx.fillStyle = gh; ctx.fillRect(0,0,W,H*0.28)

    // Title centered
    const titleFS = Math.min(100, Math.round(W * 0.086))
    const titleLines = wrapText(name, W*0.80, `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFFFFF'; ctx.font = `bold ${titleFS}px ${FF}`
    ctx.textAlign = 'center'
    let ty = 70 + titleFS
    for (const line of titleLines.slice(0,2)) { ctx.fillText(line, W/2, ty); ty += titleFS + 8 }
    // Centered accent line
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(W/2-120, ty+10, 240, 6, 3); ctx.fill()
    ctx.textAlign = 'left'

    // 4 bullets in corners (2 left, 2 right)
    const positions = [
      { x: 20,       y: H*0.36, align: 'left'  as const },
      { x: 20,       y: H*0.56, align: 'left'  as const },
      { x: W - 20,   y: H*0.36, align: 'right' as const },
      { x: W - 20,   y: H*0.56, align: 'right' as const },
    ]
    const bFS = 24; const maxBW = Math.round(W * 0.40)
    for (let i = 0; i < Math.min(bs.length, 4); i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/,'')
      const pos = positions[i]
      const bLines = wrapText(clean, maxBW - 60, `bold ${bFS}px ${FF}`)
      const bh = bLines.length > 1 ? 96 : 80
      const bw = Math.min(ctx.measureText(bLines[0]||'').width + 70, maxBW)
      const bx = pos.align === 'right' ? pos.x - bw : pos.x
      const by = pos.y - Math.round(bh/2)

      ctx.fillStyle = 'rgba(0,0,0,0.82)'; roundRect(bx, by, bw, bh, 14)
      // Accent dot
      ctx.fillStyle = accent
      const dotX = pos.align === 'right' ? bx + bw - 28 : bx + 28
      ctx.beginPath(); ctx.arc(dotX, by+Math.round(bh/2), 22, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#000000'; ctx.font = `bold 16px ${FF}`; ctx.textAlign = 'center'
      ctx.fillText(String(i+1), dotX, by+Math.round(bh/2)+6)
      ctx.textAlign = pos.align === 'right' ? 'right' : 'left'
      ctx.fillStyle = '#FFFFFF'; ctx.font = `bold ${bFS}px ${FF}`
      const tx = pos.align === 'right' ? bx + bw - 56 : bx + 56
      ctx.fillText(bLines[0]||'', tx, by+(bLines.length>1?28:Math.round(bh/2)+9))
      if (bLines[1]) { ctx.fillStyle='rgba(255,255,255,0.70)'; ctx.font=`${bFS-4}px ${FF}`; ctx.fillText(bLines[1], tx, by+56) }
      ctx.textAlign = 'left'
    }

    ctx.fillStyle = accent; ctx.fillRect(0,H-90,W,90)
    ctx.fillStyle='#000000'; ctx.font=`bold 28px ${FF}`; ctx.textAlign='center'
    ctx.fillText('XS · S · M · L · XL · 2XL · 3XL', W/2, H-30)
    ctx.textAlign='left'
  }

  // ── BOLD layout ─────────────────────────────────────────────────────────────
  else if (layout === 'bold') {
    // Dark top zone
    const gt = ctx.createLinearGradient(0,0,0,H*0.42)
    gt.addColorStop(0,'rgba(0,0,0,0.97)'); gt.addColorStop(1,'rgba(0,0,0,0)')
    ctx.fillStyle = gt; ctx.fillRect(0,0,W,H*0.42)
    // Dark bottom zone
    const gb2 = ctx.createLinearGradient(0,H*0.60,0,H)
    gb2.addColorStop(0,'rgba(0,0,0,0)'); gb2.addColorStop(1,'rgba(0,0,0,0.97)')
    ctx.fillStyle = gb2; ctx.fillRect(0,H*0.60,W,H*0.40)

    // Top accent bar
    ctx.fillStyle = accent; ctx.fillRect(0,0,W,12)

    // HUGE title
    const titleFS = Math.min(118, Math.round(W * 0.102))
    const titleLines = wrapText(name, W*0.88, `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFFFFF'; ctx.font = `bold ${titleFS}px ${FF}`; ctx.textAlign = 'center'
    let ty = 26 + titleFS
    for (const line of titleLines.slice(0,2)) { ctx.fillText(line, W/2, ty); ty += titleFS + 8 }
    // Accent underline
    ctx.fillStyle = hexAlpha(accent, 0.9)
    ctx.beginPath(); ctx.roundRect(W/2-160, ty+10, 320, 8, 4); ctx.fill()
    ty += 36; ctx.textAlign = 'left'

    // 2 large bullet blocks side by side
    const topBullets = bs.slice(0, 2)
    const pad = 20, gap = 16
    const bw = (W - pad*2 - gap) / 2
    const bStartY = H * 0.70
    for (let i = 0; i < Math.min(topBullets.length, 2); i++) {
      const clean = topBullets[i].replace(/^[•✓\-]\s*/,'')
      const bx = pad + i * (bw + gap)
      const bh = 150
      ctx.fillStyle = 'rgba(0,0,0,0.85)'
      roundRect(bx, bStartY, bw, bh, 18)
      // Accent top border
      ctx.fillStyle = accent; roundRect(bx, bStartY, bw, 10, [9,9,0,0])
      // Big number watermark
      ctx.fillStyle = hexAlpha(accent, 0.12)
      ctx.font = `bold 90px ${FF}`; ctx.textAlign = 'center'
      ctx.fillText(String(i+1), bx+bw/2, bStartY+100)
      // Text
      const bLines = wrapText(clean, bw-30, `bold 26px ${FF}`)
      ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 26px ${FF}`
      ctx.fillText(bLines[0]||'', bx+bw/2, bStartY+(bLines.length>1 ? 95 : 105))
      if (bLines[1]) { ctx.fillStyle='rgba(255,255,255,0.70)'; ctx.font=`22px ${FF}`; ctx.fillText(bLines[1], bx+bw/2, bStartY+128) }
      ctx.textAlign = 'left'
    }
    // Remaining bullets as slim pills
    for (let i = 2; i < bs.length; i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/,'')
      const by = bStartY + 168 + (i-2) * 60
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; roundRect(pad, by, W - pad*2, 50, 12)
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(pad+26, by+25, 18, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#000'; ctx.font = `bold 15px ${FF}`; ctx.textAlign='center'; ctx.fillText(String(i+1), pad+26, by+30); ctx.textAlign='left'
      ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 24px ${FF}`; ctx.fillText(clean.slice(0,42), pad+56, by+32)
    }

    ctx.fillStyle = accent; ctx.fillRect(0,H-90,W,90)
    ctx.fillStyle='#000'; ctx.font=`bold 28px ${FF}`; ctx.textAlign='center'
    ctx.fillText('XS · S · M · L · XL · 2XL · 3XL', W/2, H-30)
    ctx.textAlign='left'
  }

  return canvas.toBuffer('image/jpeg', { quality: 94 })
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

      const photoUrl = await uploadPhoto(supabase, allPhotos[0], user.id, 'card-input')
      if (!photoUrl) return NextResponse.json({ error: 'Помилка завантаження фото' }, { status: 500 })

      const preset = PRESETS[cardPreset] || PRESETS.urban
      const layouts: ('split'|'diagonal'|'radial'|'bold')[] = ['split','diagonal','radial','bold']

      for (let i = 0; i < qty; i++) {
        try {
          const chosenLayout = layouts[i % layouts.length]

          // Flux generates scene (portrait 2:3, product preserved)
          const fluxPrompt = `CRITICAL: Keep the main product/subject 100% IDENTICAL. ONLY change the background. New background scene: ${preset.sceneStyle}. Product stays on right side of frame. Left side darker for text overlay. Variation ${i+1}: ${creativity > 0.65 ? ['dramatic cinematic angle','extreme contrast lighting','abstract background','bold dynamic composition'][i] : ['standard composition','different angle','alternative lighting','dramatic perspective'][i]}. Professional marketing photography.`
          console.log(`[card ${i+1}] layout:${chosenLayout} flux...`)

          const sceneUrl = await runFlux(photoUrl, fluxPrompt, REPLICATE)
          if (!sceneUrl) { console.warn(`Card ${i+1}: Flux failed`); continue }

          // GPT shortens title + max 4 bullets for bigger, readable text
          const shortTitle = await shortenTitle(productName, creativity)
          const topBullets = cardBullets.slice(0, 4)
          const cardBuf = await renderCard(sceneUrl, null, shortTitle, topBullets, chosenLayout, cardPreset)
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
