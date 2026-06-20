import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'fs'

export const maxDuration = 300
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

// Find a specific font file (by candidate names) in the deployed font dirs
function fontFile(names: string[]): string {
  const dirs = ['/var/task/kartka-ai/public/fonts', path.join(process.cwd(), 'public/fonts')]
  for (const d of dirs) for (const n of names) {
    const p = path.join(d, n)
    try { if (fs.existsSync(p)) return p } catch {}
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



async function generateBulletEmojis(bullets: string[]): Promise<string[]> {
  try {
    const list = bullets.map((b, i) => `${i+1}. ${b}`).join('\n')
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `For each product feature, choose ONE relevant emoji.\nRules: one emoji per feature, no text, use specific emojis (not generic checkmarks).\nExamples: lightweight->🪶 waterproof->💧 fast->⚡ design->✨ comfort->😌 durable->🛡️ eco->🌿 size->📐 color->🎨\nFeatures:\n${list}\nReturn ONLY a JSON array: ["emoji1","emoji2",...]` }],
      max_tokens: 60, temperature: 0.3,
    })
    const raw = r.choices[0]?.message?.content?.trim() || '[]'
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === bullets.length) return parsed
    return bullets.map(() => '⚡')
  } catch { return bullets.map(() => '⚡') }
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
const PRESETS: Record<string, { accent: string; bg: string; textColor: string; sceneStyle: string; font: string }> = {
  // ── Existing styles (unchanged colors, font added) ──
  auto:        { accent: '#FFD700', bg: '#111111', textColor: '#FFFFFF', font: 'KAIInter',  sceneStyle: 'dramatic professional product marketing scene, dynamic lighting, dark atmospheric background' },
  military:    { accent: '#8B9E4C', bg: '#1a1f0f', textColor: '#FFFFFF', font: 'KAIDejaVu', sceneStyle: 'dark tactical military style, smoke and fog, olive khaki tones, dramatic moody lighting, metal textures' },
  premium:     { accent: '#C9A84C', bg: '#0d0d0d', textColor: '#C9A84C', font: 'KAIArial',  sceneStyle: 'luxury premium dark style, cinematic studio lighting, deep black background, elegant gold light tones' },
  marketplace: { accent: '#FF6600', bg: '#FFFFFF', textColor: '#1a1a1a', font: 'KAIInter',  sceneStyle: 'clean white studio background, soft even product photography lighting, professional ecommerce style' },
  social:      { accent: '#E91E8C', bg: '#0d0d0d', textColor: '#FFFFFF', font: 'KAIInter',  sceneStyle: 'trendy social media aesthetic, vibrant colors, lifestyle background, Instagram-style lighting' },
  minimal:     { accent: '#FFFFFF', bg: '#111111', textColor: '#FFFFFF', font: 'KAIInter',  sceneStyle: 'minimalist dark background, elegant single light source, luxury product photography' },
  urban:       { accent: '#FFD700', bg: '#111111', textColor: '#FFFFFF', font: 'KAIArial',  sceneStyle: 'urban streetwear style, dark gradient, energetic composition' },
  rozetka:     { accent: '#FF6600', bg: '#FFFFFF', textColor: '#1a1a1a', font: 'KAIArial',  sceneStyle: 'clean white studio, soft even lighting, professional ecommerce' },
  prom:        { accent: '#0066CC', bg: '#F5F7FF', textColor: '#1a1a1a', font: 'KAIArial',  sceneStyle: 'clean light studio, professional marketplace photography' },
  // ── New styles ──
  noir:        { accent: '#B8B8B8', bg: '#0a0a0a', textColor: '#FFFFFF', font: 'KAIInter',  sceneStyle: 'high-contrast black and white studio, dramatic single spotlight, deep shadows, monochrome elegance, no text' },
  emerald:     { accent: '#2ECC71', bg: '#07140d', textColor: '#FFFFFF', font: 'KAIArial',  sceneStyle: 'deep emerald green studio, soft glowing light, luxurious dark green gradient background, no text' },
  crimson:     { accent: '#E63946', bg: '#160808', textColor: '#FFFFFF', font: 'KAIArial',  sceneStyle: 'bold dramatic red lighting, dark cinematic background, energetic intense atmosphere, no text' },
  ocean:       { accent: '#00B4D8', bg: '#06121f', textColor: '#FFFFFF', font: 'KAIInter',  sceneStyle: 'cool blue aqua studio, soft gradient, fresh modern atmosphere, subtle reflections, no text' },
  sunset:      { accent: '#FF7B00', bg: '#1a0f1e', textColor: '#FFFFFF', font: 'KAIDejaVu', sceneStyle: 'warm sunset gradient, orange and purple tones, golden hour glow, atmospheric haze, no text' },
  royal:       { accent: '#9D4EDD', bg: '#100a1a', textColor: '#FFFFFF', font: 'KAIInter',  sceneStyle: 'royal purple luxury studio, velvet textures, elegant deep violet lighting, no text' },
  goldlux:     { accent: '#D4AF37', bg: '#050505', textColor: '#FFFFFF', font: 'KAIArial',  sceneStyle: 'ultra luxury pure black studio, golden rim lighting, premium reflective surfaces, no text' },
  mint:        { accent: '#06D6A0', bg: '#F3FFFB', textColor: '#1a1a1a', font: 'KAIInter',  sceneStyle: 'clean fresh mint white studio, soft natural light, airy minimalist background, no text' },
  coral:       { accent: '#FF5D8F', bg: '#1a0c14', textColor: '#FFFFFF', font: 'KAIInter',  sceneStyle: 'trendy coral pink lighting, soft glow, modern lifestyle aesthetic, vibrant, no text' },
  steel:       { accent: '#6C8CB5', bg: '#0c1118', textColor: '#FFFFFF', font: 'KAIDejaVu', sceneStyle: 'industrial steel blue-grey studio, brushed metal textures, cool professional lighting, no text' },
  forest:      { accent: '#52B788', bg: '#0a140e', textColor: '#FFFFFF', font: 'KAIDejaVu', sceneStyle: 'natural forest green ambiance, organic earthy tones, soft daylight, eco lifestyle, no text' },
}

// ─── Layout Engine using @napi-rs/canvas ─────────────────────────────────────
// ─── Universal card renderer: DALL-E bg + Sharp composite + Canvas text ───────
async function renderAllLayouts(
  productPhoto: string,
  name: string,
  bullets: string[],
  layout: 'split' | 'diagonal' | 'radial' | 'bold' | 'poster' | 'magazine' | 'sidebar',
  cardPreset: string,
  rmbgKey?: string,
  fluxBgUrl?: string,
  bulletEmojis?: string[],
  category?: string
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas')

  const regFam = (names: string[], alias: string) => { const p = fontFile(names); if (p) { try { GlobalFonts.registerFromPath(p, alias) } catch {} } }
  regFam(['DejaVuSans.ttf'], 'KAIDejaVu'); regFam(['DejaVuSans-Bold.ttf'], 'KAIDejaVu')
  regFam(['Inter.ttf'], 'KAIInter')
  regFam(['ARIAL.TTF','arial.ttf'], 'KAIArial'); regFam(['ARIALBD.TTF','arialbd.ttf'], 'KAIArial')
  // Legacy fallback (keeps old behaviour if font files are missing)
  const fontBold = findFont(true)
  if (fontBold) try { GlobalFonts.registerFromPath(fontBold, 'CF') } catch {}

  const preset = PRESETS[cardPreset] || PRESETS.urban
  const fontsOk = !!fontFile(['DejaVuSans.ttf'])
  const FF = (fontsOk && preset.font) ? preset.font : (fontBold ? 'CF' : 'Arial')
  const { accent } = preset
  const W = 1080, H = 1440, BARH = 88
  const bs = bullets.filter(Boolean).slice(0, 5)

  // ── helpers ────────────────────────────────────────────────────────────────
  function accentRGB() {
    return { r: parseInt(accent.slice(1,3),16), g: parseInt(accent.slice(3,5),16), b: parseInt(accent.slice(5,7),16) }
  }
  function hexAlpha(h: string, a: number): string {
    const { r, g, b } = (() => { const hh = h.replace('#',''); return { r: parseInt(hh.slice(0,2),16), g: parseInt(hh.slice(2,4),16), b: parseInt(hh.slice(4,6),16) } })()
    return `rgba(${r},${g},${b},${a})`
  }
  const cleanTitle = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()

  // ── 1. Remove bg from product ──────────────────────────────────────────────
  const m = productPhoto.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  let productBuf = m ? Buffer.from(m[2], 'base64') : Buffer.from(productPhoto, 'base64')
  if (rmbgKey) {
    try {
      const fd = new FormData()
      fd.append('image_file', new Blob([productBuf], { type: m?.[1] || 'image/jpeg' }), 'p.jpg')
      fd.append('size', 'auto')
      const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': rmbgKey }, body: fd })
      if (r.ok) { productBuf = Buffer.from(await r.arrayBuffer()); console.log('rmbg: ok ✅') }
      else console.error('rmbg: FAIL status', r.status)
    } catch (e: any) { console.error('rmbg: error', e?.message) }
  } else { console.error('rmbg: NO KEY (REMOVE_BG_API_KEY missing)') }

  // ── 2. Background: Flux scene → blurred photo → solid dark ───────────────
  let bgFull: Buffer
  let fluxScene: Buffer | null = null
  if (fluxBgUrl) {
    try {
      const r = await fetch(fluxBgUrl)
      fluxScene = Buffer.from(await r.arrayBuffer())
      bgFull = await sharp(fluxScene).resize(W, H, { fit: 'cover', position: 'centre' }).jpeg({ quality: 92 }).toBuffer()
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

  // ── 3. Showcase for Split/Sidebar: cut-out product (with air) over a softly
  //       blurred scene. If no cut-out is available, show the scene itself. ────
  let productResized: Buffer | null = null      // crisp cut-out product
  let showcaseBg: Buffer | null = null          // backdrop behind product
  let prodW = 0, prodH = 0, prodLeft = 0, prodTop = 0
  let showW = 0, showH = 0, showLeft = 0

  if (layout === 'split' || layout === 'sidebar') {
    const COL = Math.round(W * 0.385)
    showW = W - COL - 4; showH = H - BARH
    showLeft = layout === 'split' ? COL + 4 : 0

    let hasAlpha = false
    try { hasAlpha = !!(await sharp(productBuf).metadata()).hasAlpha } catch {}

    if (hasAlpha) {
      // backdrop = blurred scene (or dark), product sits crisp on top with margins
      showcaseBg = fluxScene
        ? await sharp(fluxScene).resize(showW, showH, { fit: 'cover', position: 'centre' }).blur(16).modulate({ brightness: 0.9 }).jpeg({ quality: 88 }).toBuffer()
        : await sharp({ create: { width: showW, height: showH, channels: 3, background: { r: 14, g: 14, b: 16 } } }).jpeg().toBuffer()
      const margin = 80
      prodW = showW - margin * 2; prodH = showH - margin * 2
      // Trim transparent border so the PRODUCT centers (not the original framing)
      let cutBuf = productBuf
      try { cutBuf = await sharp(productBuf).trim({ threshold: 12 }).toBuffer() } catch {}
      const resized = await sharp(cutBuf)
        .resize(prodW, prodH, { fit: 'contain', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer()
      // centre the trimmed product within the showcase area
      const meta = await sharp(resized).metadata()
      prodTop = Math.round((showH - (meta.height || prodH)) / 2)
      prodLeft = showLeft + Math.round((showW - (meta.width || prodW)) / 2)
      productResized = resized
    } else {
      // no cut-out → show the scene (or original photo) itself, cover-fit
      const src = fluxScene || productBuf
      showcaseBg = await sharp(src).resize(showW, showH, { fit: 'cover', position: 'centre' }).jpeg({ quality: 92 }).toBuffer()
    }
  }

  // Centred cut-out over full-bleed blurred scene (radial / bold / poster)
  if (layout === 'radial' || layout === 'bold' || layout === 'poster') {
    showW = W; showH = H - BARH; showLeft = 0
    let hasAlpha = false
    try { hasAlpha = !!(await sharp(productBuf).metadata()).hasAlpha } catch {}
    if (hasAlpha) {
      // crisp cut-out on a softly blurred scene backdrop
      const blurAmt = layout === 'bold' ? 9 : 16
      const bright = layout === 'bold' ? 0.78 : 0.88
      showcaseBg = fluxScene
        ? await sharp(fluxScene).resize(W, H - BARH, { fit: 'cover', position: 'centre' }).blur(blurAmt).modulate({ brightness: bright }).jpeg({ quality: 88 }).toBuffer()
        : await sharp({ create: { width: W, height: H - BARH, channels: 3, background: { r: 14, g: 14, b: 16 } } }).jpeg().toBuffer()
      let cutBuf = productBuf
      try { cutBuf = await sharp(productBuf).trim({ threshold: 12 }).toBuffer() } catch {}
      let boxW = 560, boxH = 560, cx = W / 2, cy = Math.round((H - BARH) * 0.54)
      if (layout === 'bold')   { boxW = 720; boxH = 560; cy = Math.round((H - BARH) * 0.32) }
      if (layout === 'poster') { boxW = 600; boxH = 540; cy = Math.round((H - BARH) * 0.42) }
      productResized = await sharp(cutBuf)
        .resize(boxW, boxH, { fit: 'contain', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer()
      prodW = boxW; prodH = boxH
      prodLeft = Math.round(cx - boxW / 2)
      prodTop = Math.round(cy - boxH / 2)
    } else {
      // no cut-out available → show the scene itself CRISP (never an all-blur mush)
      const src = fluxScene || productBuf
      showcaseBg = await sharp(src).resize(W, H - BARH, { fit: 'cover', position: 'centre' }).jpeg({ quality: 92 }).toBuffer()
      productResized = null
    }
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

  // Simple line-icons drawn in dark, mapped to bullet keywords
  function pickIcon(t: string): string {
    const s = t.toLowerCase()
    if (/дихаюч|тканин|сітчаст|матеріал|fabric|кро[йя]|бавовн/.test(s)) return 'fabric'
    if (/амортиз|підошв|комфорт|sole|устілк|пружн/.test(s)) return 'sole'
    if (/розмір|size|габарит|об[\u0027’]?єм|вмісти/.test(s)) return 'ruler'
    if (/волог|water|захист|непром|водо|дощ/.test(s)) return 'drop'
    if (/актив|спорт|енерг|швидк|потужн|динам/.test(s)) return 'bolt'
    if (/стиль|дизайн|сучасн|якіс|преміум|елегант/.test(s)) return 'star'
    return 'check'
  }
  function drawIcon(type: string, cx: number, cy: number, s: number) {
    ctx.save(); ctx.translate(cx, cy)
    ctx.strokeStyle = '#111'; ctx.fillStyle = '#111'
    ctx.lineWidth = Math.max(2.6, s * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath()
    if (type === 'fabric') {
      ctx.moveTo(-s*0.7,-s*0.35); ctx.lineTo(-s*0.22,-s*0.7); ctx.lineTo(0,-s*0.5); ctx.lineTo(s*0.22,-s*0.7); ctx.lineTo(s*0.7,-s*0.35); ctx.lineTo(s*0.42,-s*0.05); ctx.lineTo(s*0.42,s*0.7); ctx.lineTo(-s*0.42,s*0.7); ctx.lineTo(-s*0.42,-s*0.05); ctx.closePath(); ctx.stroke()
    } else if (type === 'sole') {
      ctx.moveTo(-s*0.75,s*0.25); ctx.bezierCurveTo(-s*0.3,-s*0.55,s*0.3,-s*0.55,s*0.75,s*0.25); ctx.stroke()
      ctx.beginPath(); ctx.arc(-s*0.32,s*0.55,s*0.13,0,7); ctx.fill(); ctx.beginPath(); ctx.arc(0,s*0.55,s*0.13,0,7); ctx.fill(); ctx.beginPath(); ctx.arc(s*0.32,s*0.55,s*0.13,0,7); ctx.fill()
    } else if (type === 'ruler') {
      ctx.rect(-s*0.78,-s*0.32,s*1.56,s*0.64); ctx.stroke()
      for (let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(i*s*0.32,-s*0.32); ctx.lineTo(i*s*0.32, i%2?-s*0.02:s*0.08); ctx.stroke() }
    } else if (type === 'drop') {
      ctx.moveTo(0,-s*0.8); ctx.bezierCurveTo(s*0.72,-s*0.1,s*0.55,s*0.72,0,s*0.72); ctx.bezierCurveTo(-s*0.55,s*0.72,-s*0.72,-s*0.1,0,-s*0.8); ctx.closePath(); ctx.stroke()
    } else if (type === 'bolt') {
      ctx.moveTo(s*0.18,-s*0.8); ctx.lineTo(-s*0.5,s*0.08); ctx.lineTo(-s*0.05,s*0.08); ctx.lineTo(-s*0.18,s*0.8); ctx.lineTo(s*0.5,-s*0.08); ctx.lineTo(s*0.05,-s*0.08); ctx.closePath(); ctx.fill()
    } else if (type === 'star') {
      for (let i=0;i<5;i++){ const a=-Math.PI/2+i*2*Math.PI/5; const x=Math.cos(a)*s*0.85,y=Math.sin(a)*s*0.85; i?ctx.lineTo(x,y):ctx.moveTo(x,y); const a2=a+Math.PI/5; ctx.lineTo(Math.cos(a2)*s*0.38,Math.sin(a2)*s*0.38) } ctx.closePath(); ctx.fill()
    } else {
      ctx.moveTo(-s*0.6,0); ctx.lineTo(-s*0.12,s*0.5); ctx.lineTo(s*0.65,-s*0.55); ctx.stroke()
    }
    ctx.restore()
  }

  function drawBullets(
    startX: number, startY: number, availW: number, availH: number,
    count: number, _align: 'left' | 'center' = 'left'
  ) {
    const iconR = 22, bFS = 27, subFS = 21, padX = 24, gap = 16
    const badge = 30
    const items: { lines: string[], icon: string }[] = []
    for (let i = 0; i < count; i++) {
      const clean = bs[i].replace(/^[•✓\-]\s*/, '')
      const lines = wrapText(clean, availW - badge * 2 - padX - 24, `bold ${bFS}px ${FF}`).slice(0, 2)
      items.push({ lines, icon: pickIcon(clean) })
    }
    let y = startY
    for (let i = 0; i < count; i++) {
      const { lines, icon } = items[i]
      const bH = lines.length > 1 ? 98 : 70
      const bx = startX, cy = y + bH / 2
      ctx.fillStyle = 'rgba(0,0,0,0.80)'; pill(bx, y, availW, bH, 16)
      ctx.strokeStyle = hexAlpha(accent, 0.34); ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.roundRect(bx, y, availW, bH, 16); ctx.stroke()
      ctx.fillStyle = accent
      ctx.beginPath(); ctx.roundRect(bx + 14, cy - badge, badge * 2, badge * 2, 12); ctx.fill()
      drawIcon(icon, bx + 14 + badge, cy, badge * 0.6)
      const tx = bx + 14 + badge * 2 + 20
      ctx.fillStyle = '#FFF'; ctx.font = `bold ${bFS}px ${FF}`
      if (lines.length > 1) {
        ctx.fillText(lines[0], tx, cy - 3)
        ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = `${subFS}px ${FF}`
        ctx.fillText(lines[1], tx, cy + subFS + 3)
      } else {
        ctx.fillText(lines[0] || '', tx, cy + bFS * 0.36)
      }
      y += bH + gap
    }
  }

  // Bottom bar (shared by all layouts)
  function drawBottomBar() {
    ctx.fillStyle = accent; ctx.fillRect(0, H - BARH, W, BARH)
    ctx.fillStyle = '#000'; ctx.font = `bold 30px ${FF}`; ctx.textAlign = 'center'
    ctx.fillText('XS · S · M · L · XL · 2XL · 3XL', W / 2, H - BARH / 2 + 11)
    ctx.textAlign = 'left'
  }

  // Compact feature chip: dark pill + accent icon badge + text (with optional sub-line)
  function chip(bx: number, by: number, bw: number, bh: number, text: string) {
    const clean = text.replace(/^[•✓\-]\s*/, '')
    ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.fill()
    ctx.strokeStyle = hexAlpha(accent, 0.34); ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 14); ctx.stroke()
    const r = bh / 2 - 9, cyc = by + bh / 2
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(bx + 10, cyc - r, r * 2, r * 2, 9); ctx.fill()
    drawIcon(pickIcon(clean), bx + 10 + r, cyc, r * 0.6)
    const bFS = 24, tx = bx + 10 + r * 2 + 16
    const tl = wrapText(clean, bw - r * 2 - 44, `bold ${bFS}px ${FF}`).slice(0, 2)
    ctx.fillStyle = '#fff'; ctx.font = `bold ${bFS}px ${FF}`
    if (tl.length > 1) {
      ctx.fillText(tl[0], tx, cyc - 3)
      ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = `${bFS - 5}px ${FF}`
      ctx.fillText(tl[1], tx, cyc + bFS - 5)
    } else {
      ctx.fillText(tl[0] || clean, tx, cyc + bFS * 0.36)
    }
  }

  if (layout === 'split') {
    const COL = Math.round(W * 0.385)
    const PAD = 40

    // Dark overlay on left column
    ctx.fillStyle = 'rgba(0,0,0,0.62)'
    ctx.fillRect(0, 0, COL, H - BARH)

    // Accent stripe
    ctx.fillStyle = accent; ctx.fillRect(0, 0, 8, H - BARH)

    // Separator
    ctx.fillStyle = accent; ctx.globalAlpha = 0.7
    ctx.fillRect(COL, 0, 4, H - BARH)
    ctx.globalAlpha = 1

    // Title (small category lead + big name)
    const maxTW = COL - PAD - 16
    let titleTop = 60
    const cat = (category || '').trim()
    if (cat) {
      ctx.fillStyle = accent; ctx.font = `bold 26px ${FF}`
      ctx.fillText(cleanTitle(cat).slice(0, 22), PAD, 70)
      titleTop = 104
    }
    let titleFS = Math.min(96, Math.round(maxTW * 0.26))
    const _tw = cleanTitle(name).split(' ')
    const _widest = () => { ctx.font = `bold ${titleFS}px ${FF}`; return Math.max(..._tw.map(w => ctx.measureText(w).width)) }
    while (titleFS > 30 && _widest() > maxTW) titleFS -= 2
    const titleLines = wrapText(cleanTitle(name), maxTW, `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS}px ${FF}`
    let ty = titleTop + titleFS
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
    const titleLines = wrapText(cleanTitle(name), Math.round(W * 0.52), `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS}px ${FF}`
    let ty = 60 + titleFS
    for (const line of titleLines.slice(0, 2)) { ctx.fillText(line, 40, ty); ty += titleFS + 6 }
    ctx.fillStyle = accent; ctx.fillRect(40, ty + 8, 180, 5)

    // Bullets bottom
    const bStartY = H * 0.68
    const availH = H - BARH - 20 - bStartY
    drawBullets(20, bStartY, W - 40, availH, bs.length)
    drawBottomBar()

  } else if (layout === 'radial') {
    // Title top-centre
    const titleFS = Math.min(72, Math.round(W * 0.066))
    const titleLines = wrapText(cleanTitle(name), W - 120, `bold ${titleFS}px ${FF}`).slice(0, 2)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS}px ${FF}`; ctx.textAlign = 'center'
    let ty = 56 + titleFS
    for (const line of titleLines) { ctx.fillText(line, W / 2, ty); ty += titleFS + 4 }
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(W / 2 - 90, ty + 6, 180, 6, 3); ctx.fill()
    ctx.textAlign = 'left'
    // Four callout chips around the centred product, each pointing to a
    // different region of the product (no central X).
    const pw = 384, ph = 78, cx = W / 2, cyP = Math.round((H - BARH) * 0.54)
    const ox = 200, oy = 230  // spread of target points around product centre
    const pos: [number, number][] = [[40, H * 0.30], [W - 40 - pw, H * 0.30], [40, H * 0.66], [W - 40 - pw, H * 0.66]]
    const tgt: [number, number][] = [[cx - ox, cyP - oy], [cx + ox, cyP - oy], [cx - ox, cyP + oy], [cx + ox, cyP + oy]]
    for (let i = 0; i < Math.min(bs.length, 4); i++) {
      const px = pos[i][0], py = pos[i][1]
      const sx = px < W / 2 ? px + pw : px, sy = py + ph / 2
      const tx = tgt[i][0], ty = tgt[i][1]
      ctx.strokeStyle = hexAlpha(accent, 0.7); ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke()
      // arrowhead at the product end
      const ang = Math.atan2(ty - sy, tx - sx), ah = 13
      ctx.fillStyle = accent; ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(tx - ah * Math.cos(ang - 0.42), ty - ah * Math.sin(ang - 0.42))
      ctx.lineTo(tx - ah * Math.cos(ang + 0.42), ty - ah * Math.sin(ang + 0.42))
      ctx.closePath(); ctx.fill()
      chip(px, py, pw, ph, bs[i])
    }
    drawBottomBar()

  } else if (layout === 'bold') {
    // Bottom gradient for the giant title
    const gb = ctx.createLinearGradient(0, H * 0.45, 0, H)
    gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, 'rgba(0,0,0,0.92)')
    ctx.fillStyle = gb; ctx.fillRect(0, H * 0.45, W, H)
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 12)
    // Single row of compact chips above the bottom bar
    const rowY = H - BARH - 96, cw = (W - 48 - 3 * 12) / 4
    for (let i = 0; i < Math.min(bs.length, 4); i++) chip(16 + i * (cw + 12), rowY, cw, 72, bs[i])
    // GIANT title bottom-left
    const titleFS = Math.min(150, Math.round(W * 0.135))
    const titleLines = wrapText(cleanTitle(name), W - 80, `bold ${titleFS}px ${FF}`).slice(0, 3)
    const lineH = Math.round(titleFS * 0.96)
    ctx.fillStyle = accent; ctx.fillRect(40, rowY - 40 - titleLines.length * lineH, 120, 10)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS}px ${FF}`; ctx.textAlign = 'left'
    let ty = rowY - 40 - (titleLines.length - 1) * lineH
    for (const line of titleLines) { ctx.fillText(line, 40, ty); ty += lineH }
    drawBottomBar()
  }

  if (layout === 'poster') {
    ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.strokeRect(26, 26, W - 52, H - BARH - 30)
    const cat = (category || '').trim()
    ctx.textAlign = 'center'
    if (cat) { ctx.fillStyle = accent; ctx.font = `bold 26px ${FF}`; ctx.fillText(cleanTitle(cat).slice(0, 26), W / 2, 92) }
    const tFS = Math.min(76, Math.round(W * 0.07))
    const tl = wrapText(cleanTitle(name), W - 180, `bold ${tFS}px ${FF}`).slice(0, 2)
    ctx.fillStyle = '#fff'; ctx.font = `bold ${tFS}px ${FF}`
    let ty = (cat ? 130 : 100) + tFS
    for (const l of tl) { ctx.fillText(l, W / 2, ty); ty += tFS + 4 }
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(W / 2 - 70, ty + 6, 140, 6, 3); ctx.fill()
    ctx.textAlign = 'left'
    // 2x2 icon chips, centred with margins
    const pw = 476, ph = 80, gapx = 20, gapy = 16
    const gridW = pw * 2 + gapx, gx = Math.round((W - gridW) / 2), gy = H - BARH - 50 - (ph * 2 + gapy)
    for (let i = 0; i < Math.min(bs.length, 4); i++) {
      const col = i % 2, row = Math.floor(i / 2)
      chip(gx + col * (pw + gapx), gy + row * (ph + gapy), pw, ph, bs[i])
    }
    drawBottomBar()
  }

  if (layout === 'magazine') {
    ctx.fillStyle=accent; ctx.fillRect(0,0,12,H-BARH)
    let gb = ctx.createLinearGradient(0,H*0.55,0,H); gb.addColorStop(0,'rgba(0,0,0,0)'); gb.addColorStop(1,'rgba(0,0,0,0.94)'); ctx.fillStyle=gb; ctx.fillRect(0,H*0.55,W,H*0.45)
    let gt = ctx.createLinearGradient(0,0,0,H*0.40); gt.addColorStop(0,'rgba(0,0,0,0.55)'); gt.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=gt; ctx.fillRect(0,0,W,H*0.40)
    const items = bs.slice(0,4)
    const chipW = 440, chipH = 58, gap = 12, rx = W - chipW - 34
    items.forEach((b,i)=>{
      const clean = b.replace(/^[•✓\-]\s*/,'')
      const y = 44 + i*(chipH+gap)
      ctx.fillStyle='rgba(0,0,0,0.72)'; pill(rx, y, chipW, chipH, 12)
      ctx.fillStyle=accent; pill(rx, y, 5, chipH, 2)
      ctx.fillStyle=accent; ctx.beginPath(); ctx.arc(rx+34, y+chipH/2, 13, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle='#000'; ctx.font=`bold 15px ${FF}`; ctx.textAlign='center'; ctx.fillText(String(i+1), rx+34, y+chipH/2+5); ctx.textAlign='left'
      const tline = wrapText(clean, chipW-90, `bold 22px ${FF}`)[0] || clean
      ctx.fillStyle='#fff'; ctx.font=`bold 22px ${FF}`; ctx.fillText(tline, rx+60, y+chipH/2+8)
    })
    const tFS = Math.min(104, Math.round(W*0.092))
    const tl = wrapText(cleanTitle(name), W*0.78, `bold ${tFS}px ${FF}`).slice(0,3)
    ctx.fillStyle=accent; ctx.fillRect(40, H-BARH-60-(tl.length)*(tFS+4)-2, 90, 7)
    ctx.fillStyle='#fff'; ctx.font=`bold ${tFS}px ${FF}`
    let by = H - BARH - 60 - (tl.length-1)*(tFS+4)
    for (const l of tl) { ctx.fillText(l, 40, by); by += tFS + 4 }
    drawBottomBar()
  }

  if (layout === 'sidebar') {
    const COL = Math.round(W * 0.385), PAD = 40, PX = W - COL
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(PX, 0, COL, H - BARH)
    ctx.fillStyle = accent; ctx.fillRect(W - 8, 0, 8, H - BARH)
    ctx.fillStyle = hexAlpha(accent, 0.7); ctx.fillRect(PX, 0, 4, H - BARH)
    const maxTW = COL - PAD * 2
    let sbTitleTop = 60
    const sbCat = (category || '').trim()
    if (sbCat) {
      ctx.fillStyle = accent; ctx.font = `bold 26px ${FF}`
      ctx.fillText(cleanTitle(sbCat).slice(0, 22), PX + PAD, 70)
      sbTitleTop = 104
    }
    let titleFS = Math.min(96, Math.round(maxTW * 0.26))
    const words = cleanTitle(name).split(' ')
    const widest = () => { ctx.font = `bold ${titleFS}px ${FF}`; return Math.max(...words.map(w => ctx.measureText(w).width)) }
    while (titleFS > 28 && widest() > maxTW) titleFS -= 2
    const tl = wrapText(cleanTitle(name), maxTW, `bold ${titleFS}px ${FF}`)
    ctx.fillStyle = '#FFF'; ctx.font = `bold ${titleFS}px ${FF}`
    let ty = sbTitleTop + titleFS
    for (const l of tl.slice(0, 3)) { ctx.fillText(l, PX + PAD, ty); ty += titleFS + 6 }
    ctx.fillStyle = accent; ctx.fillRect(PX + PAD, ty + 10, Math.round(maxTW * 0.6), 5); ty += 36
    drawBullets(PX + PAD, ty, COL - PAD * 2, H - BARH - ty - 20, Math.min(bs.length, 4))
    drawBottomBar()
  }

  const textOverlay = canvas.toBuffer('image/png')

  // ── 5. Sharp composite ─────────────────────────────────────────────────────
  const compositeInputs: sharp.OverlayOptions[] = []

  if ((layout === 'split' || layout === 'sidebar') && showcaseBg) {
    const COL = Math.round(W * 0.385)
    // clean opaque panel on the text side
    const panel = await sharp({
      create: { width: COL, height: H - BARH, channels: 3, background: { r: 13, g: 13, b: 16 } }
    }).jpeg().toBuffer()
    const panelLeft = layout === 'split' ? 0 : W - COL
    compositeInputs.push({ input: panel, top: 0, left: panelLeft })
    // showcase backdrop (blurred scene or scene cover)
    compositeInputs.push({ input: showcaseBg, top: 0, left: showLeft })
    // crisp cut-out product floating with air (only when available)
    if (productResized) compositeInputs.push({ input: productResized, top: prodTop, left: prodLeft })
  }
  if ((layout === 'radial' || layout === 'bold' || layout === 'poster') && showcaseBg) {
    // full-bleed blurred scene + centred cut-out product, text overlay on top
    compositeInputs.push({ input: showcaseBg, top: 0, left: 0 })
    if (productResized) compositeInputs.push({ input: productResized, top: prodTop, left: prodLeft })
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

async function runFlux(imageUrl: string, prompt: string, token: string, aspectRatio: string = '2:3'): Promise<string | null> {
  try {
    const pred = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { input_image: imageUrl, prompt, aspect_ratio: aspectRatio, output_format: 'jpg', output_quality: 95, safety_tolerance: 2 } })
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
// Screens reference photos: keep real product shots (drop tags/labels), and flag which are
// suitable to place on a model (large, clear, front-ish — not flat-laid/tiny on busy background).
async function classifyPhotos(urls: string[]): Promise<{ keep: boolean; wearable: boolean }[]> {
  try {
    const content: any[] = [{ type: 'text', text: `Screen product reference photos. For EACH of the ${urls.length} images, in order, return two booleans:
- "keep": true for ANY photo that shows the actual product itself — front, BACK, side, inside, hood, sleeve, collar, a close-up detail, folded, on a hanger, flat-laid or worn. false ONLY when the photo's MAIN subject is NOT the product itself: a hang tag, paper label, size/care chart, barcode, sticker, receipt, box/poly-bag packaging, or a completely unrelated object. When unsure, keep:true.
- "wearable": true ONLY if the item is shown LARGE, clearly and roughly FRONT-facing so it could be placed on a model (flat front view, on a hanger, or already worn). false for a BACK view, side view, far/small shot, odd angle, or partially out of frame. A back view is keep:true, wearable:false (NOT keep:false).
Return ONLY JSON {"items":[{"keep":bool,"wearable":bool}, ...]} with exactly ${urls.length} entries in the same order.` }]
    for (const u of urls) content.push({ type: 'image_url', image_url: { url: u, detail: 'high' } })
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 500, response_format: { type: 'json_object' }, messages: [{ role: 'user', content }] })
    const arr = JSON.parse(r.choices[0]?.message?.content || '{}').items
    if (Array.isArray(arr) && arr.length === urls.length) return arr.map((x: any) => ({ keep: x?.keep !== false, wearable: x?.wearable !== false }))
  } catch (e) { console.error('classifyPhotos:', e) }
  return urls.map(() => ({ keep: true, wearable: true }))
}

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
      productName = '', category = '', wishes = '', count = 1, bullets = [], format = '2:3', photoStyle = 'commercial'
    } = await req.json()

    if (!productName.trim()) return NextResponse.json({ error: 'Введіть назву товару' }, { status: 400 })

    const allPhotos: string[] = productPhotos?.length ? productPhotos : (productPhoto ? [productPhoto] : [])
    if (!allPhotos.length && productPhotoUrl) {
      try { const r = await fetch(productPhotoUrl); const buf = Buffer.from(await r.arrayBuffer()); allPhotos.push(`data:${r.headers.get('content-type')||'image/jpeg'};base64,${buf.toString('base64')}`) } catch {}
    }
    if (!allPhotos.length) return NextResponse.json({ error: 'Завантажте фото товару' }, { status: 400 })
    const VALID_AR = ['9:16','3:4','1:1','4:3','16:9','2:3','3:2']
    const aspect = VALID_AR.includes(format) ? format : '2:3'

    const qty = Math.min(Math.max(1, count), 10)
    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
    const balance = profile?.stars_balance ?? 0
    const expected = mode === 'card' ? qty : allPhotos.length
    if (balance < COST * expected) return NextResponse.json({ error: `Недостатньо зорь (${COST*expected} ⭐)`, needStars: true, balance }, { status: 402 })

    const REPLICATE = process.env.REPLICATE_API_TOKEN
    const RMBG = process.env.REMOVE_BG_API_KEY
    const results: string[] = []

    // ── CARD MODE ─────────────────────────────────────────────────────────────
    if (mode === 'card') {
      const cardBullets = (bullets as string[]).filter(Boolean)
      if (!cardBullets.length) return NextResponse.json({ error: 'Додайте переваги товару' }, { status: 400 })
      if (!REPLICATE) return NextResponse.json({ error: 'Потрібен REPLICATE_API_TOKEN' }, { status: 503 })

      const preset = PRESETS[cardPreset] || PRESETS.urban
      const VALID = ['split','diagonal','radial','bold','poster','magazine','sidebar']
      const userLayout = VALID.includes(cardLayout) ? cardLayout : 'split'

      for (let i = 0; i < qty; i++) {
        try {
          const chosenLayout = userLayout as 'split'|'diagonal'|'radial'|'bold'|'poster'|'magazine'|'sidebar'

          console.log(`[card ${i+1}] layout:${chosenLayout} flux...`)
          // Upload photo to get public URL for Flux
          console.log(`[card ${i+1}] uploading photo...`)
          const photoUrl = await uploadPhoto(supabase, allPhotos[0], user.id, 'card-input')
          console.log(`[card ${i+1}] photoUrl: ${photoUrl ? 'OK' : 'FAILED'}`)
          let sceneUrl: string | null = null
          if (photoUrl) {
            console.log(`[card ${i+1}] building bg prompt...`)
            const bgPrompt = await buildMatchingBackground(allPhotos[0], productName, category, preset, i, creativity)
            const fluxPrompt = `CRITICAL: Keep the main product COMPLETELY UNCHANGED - same appearance, colors, shape, textures. ONLY change the background. ${bgPrompt} The background must be ONE single seamless cohesive surface with soft bokeh blur and even diffused lighting. No split background, no seam, no vertical dividing line, no two-tone halves. Professional ecommerce product photography. Portrait orientation.`
            console.log(`[card ${i+1}] calling Flux...`)
            sceneUrl = await runFlux(photoUrl, fluxPrompt, REPLICATE)
            console.log(`[card ${i+1}] sceneUrl: ${sceneUrl ? 'OK ✅' : 'FAILED ❌'}`)
          } else {
            console.warn(`[card ${i+1}] uploadPhoto failed → blur fallback`)
          }
          // GPT shortens title + max 4 bullets
          const shortTitle = await shortenTitle(productName, creativity)
          const topBullets = cardBullets.slice(0, 4)
          const bulletEmojis = await generateBulletEmojis(topBullets)
          // Flux scene as bg, product composited separately, text never overlaps product
          const cardBuf = await renderAllLayouts(allPhotos[0], shortTitle, topBullets, chosenLayout, cardPreset, RMBG, sceneUrl || undefined, bulletEmojis, category)
          results.push(await saveBuf(supabase, cardBuf, user.id, 'cards'))
          console.log(`[card ${i+1}] done ✅`)
        } catch (e) { console.error(`card ${i}:`, e) }
      }
    }
    // ── PHOTO MODE ────────────────────────────────────────────────────────────
    else {
      const STYLES: Record<string, string> = {
        model:    'A photorealistic full-body human model naturally WEARING this EXACT garment on the body at life size, as a real worn item filling the torso. CRITICAL: do NOT paste, print or place the garment as a small picture/graphic onto other clothing; the model wears the actual item, not an image of it. The product must remain 100% identical — same colours, shape, fabric, textures, prints and logos on every visible side. Realistic anatomy and proportions, natural flattering pose, professional fashion editorial photography, shallow depth of field, soft natural light.',
        store:    'This EXACT product presented on a clean modern retail display stand or shelf in a stylish boutique. Product remains 100% identical. Tasteful staging, soft retail lighting, shallow depth of field.',
        flatlay:  'Completely RESTAGE this EXACT product as a strict top-down FLAT-LAY: remove the hanger, remove the original background, wall, poster or painting entirely, and lay the garment FLAT on a clean styled surface (neutral fabric, wood or stone). Photograph it straight from directly above at a true 90-degree overhead angle, the garment spread out flat, fully visible, neatly arranged, zipped and symmetric. Do NOT show it hanging or on a hanger and do NOT keep the original backdrop. The product itself stays 100% identical in colour, fabric, logos and details. Even soft daylight, subtle realistic shadows.',
        catalog:  'This EXACT product alone, perfectly centred on a seamless studio background with a soft gradient and a subtle ground shadow, clean even e-commerce lighting. Product remains 100% identical.',
        outdoor:  'This EXACT product in a real outdoor setting with natural golden-hour light and soft background bokeh. Product remains 100% identical.',
        dark:     'This EXACT product in a moody dark studio with dramatic rim lighting and soft reflections. Product remains 100% identical.',
        lifestyle:'This EXACT product in a warm lifestyle interior with natural window light and soft bokeh. Product remains 100% identical.',
      }
      // styles where a human/hanger must NOT appear
      const NO_PEOPLE = new Set(['store', 'flatlay', 'catalog'])
      const VARS = ['', 'slightly different angle', 'alternative lighting', 'different atmosphere']

      if (displayStyle === 'catalog' && !REPLICATE) {
        for (let i = 0; i < allPhotos.length; i++) {
          try { const buf = await makeCatalog(allPhotos[i], RMBG); results.push(await saveBuf(supabase, buf, user.id, 'studio')) }
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

        // Drop tag/label photos (all modes); for model mode also drop shots unsuitable for try-on
        let usableUrls = photoUrls
        try {
          const cls = await classifyPhotos(photoUrls)
          const isModel = displayStyle === 'model'
          const filtered = photoUrls.filter((_, i) => cls[i].keep && (!isModel || cls[i].wearable))
          if (filtered.length) usableUrls = filtered
          console.log(`classify: ${photoUrls.length} photos -> ${usableUrls.length} usable (model=${isModel})`)
        } catch (e) { console.error('classify error:', e) }

        const STYLE_TONE = photoStyle === 'home'
          ? 'Overall look: natural casual lifestyle, soft natural daylight, authentic relatable everyday atmosphere.'
          : 'Overall look: premium commercial e-commerce photography, clean studio-grade lighting, crisp polished high-end result.'
        const QUALITY = 'Ultra-realistic, sharp focus, fine detail, true-to-life colours, natural soft shadows and reflections, high resolution. CRITICAL: preserve every brand logo, swoosh, printed text, stripe, zipper, hood, pocket and fabric texture EXACTLY as in the reference — never redraw, simplify, move or remove them. No added text, no watermark, no extra objects, do not alter the product in any way.'
        for (let i = 0; i < usableUrls.length; i++) {
          try {
            const base = STYLES[displayStyle] || STYLES.catalog
            let prompt = base
            prompt += ' CRITICAL: keep the product 100% identical to the reference photo — the SAME colour (do NOT recolour, tint, lighten, darken or apply any pastel/warm/cool colour cast to the product itself; if the reference garment is black it must stay black), the same shape, fabric, proportions and design. Reproduce every brand logo, Nike swoosh and printed wordmark EXACTLY — sharp, undistorted and clearly legible, with the "NIKE" lettering spelled and shaped correctly, never blurred, warped or turned into random characters. Do NOT invent or add features: no hood drawstrings, cords, laces or toggles, no extra zippers, buttons, pockets, straps or seams that are not visibly present in the reference, and do not remove any zipper or closure that is present. If the hood has no drawstring, keep it without one.'
            if (NO_PEOPLE.has(displayStyle)) prompt += ' Absolutely no humans, no model, no mannequin, no hands, no clothing hanger — the product is the only subject.'
            prompt += ' ' + STYLE_TONE
            if (wishEn) prompt += ` Apply the following ONLY to the background, location, scene and lighting mood — it must NOT change the product's own colour, design, materials or details: ${wishEn}.`
            prompt += ' ' + QUALITY
            if (aspect === '16:9' || aspect === '4:3') prompt += ' Compose as a close upper-body / waist-up shot so the product and all its logos and text appear large, sharp and clearly legible — do not show the product small in a wide empty frame.'
            const url = await runFlux(usableUrls[i], prompt.slice(0, 1500), REPLICATE, aspect)
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
