import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'fs'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

const FONT_BOLD = [
  path.join(process.cwd(), 'public/fonts/DejaVuSans-Bold.ttf'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
].find(p => { try { return fs.existsSync(p) } catch { return false } }) || ''

const FONT_REG = [
  path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
].find(p => { try { return fs.existsSync(p) } catch { return false } }) || ''

// Step 1: Get Flux prompt based on product analysis
async function getFluxPrompt(photo: string, name: string, category: string, style: string, wishes: string, variationIdx: number): Promise<string> {
  const styleMap: Record<string, string> = {
    model: 'urban lifestyle street scene, city environment',
    store: 'premium boutique store, clothes hanger, retail environment',
    flatlay: 'flat lay top-down view on marble surface, NO people',
    catalog: 'pure clean white seamless studio background',
    outdoor: 'outdoor nature, mountains or forest, golden hour',
    dark: 'dark dramatic studio, moody rim lighting',
    lifestyle: 'cozy lifestyle indoor environment, natural light',
  }
  const sceneDesc = styleMap[style] || styleMap.catalog
  const variationHints = ['', 'slightly different angle', 'alternative lighting', 'different mood']
  const wishesEn = wishes ? await translateToEn(wishes) : ''

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: photo, detail: 'low' } },
        { type: 'text', text: `Product: "${name}", Category: "${category}".
Target scene: ${sceneDesc}.${wishesEn ? ` User requirement: ${wishesEn}.` : ''}
Variation: ${variationHints[variationIdx] || variationIdx + 1}.

Write a Flux Kontext image editing prompt (English, max 80 words):
- Start with: "Keep this exact product/person/clothing completely unchanged."
- Describe the specific target scene vividly (environment, lighting, mood)
- Mention: preserve all logos, prints, colors, textures exactly
- End with: "Professional marketing photography."
Return ONLY the prompt:` }
      ]}],
      max_tokens: 150, temperature: 0.8,
    })
    return r.choices[0]?.message?.content?.trim() || `Keep this exact product unchanged. ${sceneDesc}. Preserve all details. Professional photography.`
  } catch {
    return `Keep this exact product and person unchanged. ${sceneDesc}. Preserve all logos and colors. Professional marketing photography.`
  }
}

// Step 2: After Flux generates the scene, GPT-4o analyzes it and decides WHERE to put text
async function analyzeSceneForLayout(sceneImageUrl: string, name: string, bullets: string[]): Promise<{
  titleX: number; titleY: number; titleSize: number; titleAlign: 'left' | 'center' | 'right'
  bulletsX: number; bulletsY: number; bulletsDirection: 'down' | 'right'
  accentColor: string; textBg: string; accentBar: 'left' | 'top' | 'bottom' | 'right'
  bottomBarColor: string
}> {
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: sceneImageUrl, detail: 'low' } },
        { type: 'text', text: `This is a 1024x1024 marketing product photo. I need to add text overlays.

Product name: "${name.slice(0,20).toUpperCase()}"
Benefits count: ${Math.min(bullets.filter(Boolean).length, 5)}

Analyze the image and decide WHERE to place text to avoid covering the main product:
- Find the darkest/emptiest areas (left side, right side, top, bottom)
- Extract the dominant brand/accent color from the product

Return JSON ONLY:
{
  "titleX": number (0-900, pixel X for title),
  "titleY": number (80-300, pixel Y for title),  
  "titleSize": number (48-80, font size based on name length),
  "titleAlign": "left" | "center",
  "bulletsX": number (10-700, pixel X for bullets list),
  "bulletsY": number (200-700, pixel Y start for bullets),
  "bulletsDirection": "down",
  "accentColor": "#hexcolor (from product logo/branding or complementary)",
  "textBg": "rgba(0,0,0,0.80)" | "rgba(255,255,255,0.88)",
  "accentBar": "left" | "top",
  "bottomBarColor": "#hexcolor"
}` }
      ]}],
      max_tokens: 200,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })
    const d = JSON.parse(r.choices[0]?.message?.content || '{}')
    return {
      titleX: Math.max(20, Math.min(d.titleX || 40, 900)),
      titleY: Math.max(80, Math.min(d.titleY || 120, 300)),
      titleSize: Math.max(48, Math.min(d.titleSize || 64, 80)),
      titleAlign: d.titleAlign || 'left',
      bulletsX: Math.max(10, Math.min(d.bulletsX || 30, 700)),
      bulletsY: Math.max(200, Math.min(d.bulletsY || 240, 700)),
      bulletsDirection: 'down',
      accentColor: d.accentColor || '#FFD700',
      textBg: d.textBg || 'rgba(0,0,0,0.80)',
      bottomBarColor: d.bottomBarColor || d.accentColor || '#FFD700',
    }
  } catch {
    return {
      titleX: 36, titleY: 110, titleSize: 64, titleAlign: 'left',
      bulletsX: 30, bulletsY: 230, bulletsDirection: 'down',
      accentColor: '#FFD700', textBg: 'rgba(0,0,0,0.80)', accentBar: 'left',
      bottomBarColor: '#FFD700',
    }
  }
}

// Step 3: Overlay infographic elements using GPT-4o's layout decision
async function overlayInfographic(imageUrl: string, name: string, bullets: string[], layout: Awaited<ReturnType<typeof analyzeSceneForLayout>>): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const imgBuf = Buffer.from(await (await fetch(imageUrl)).arrayBuffer())
  const meta = await sharp(imgBuf).metadata()
  const W = meta.width || 1024, H = meta.height || 1024

  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const bs = bullets.filter(Boolean).slice(0,5)
  const title = esc(name.slice(0,24).toUpperCase())
  const { titleX, titleY, titleSize, accentColor, textBg, bulletsX, bulletsY, bottomBarColor } = layout

  const bulletItems = bs.map((b, i) => {
    const clean = esc(b.replace(/^[•✓\-]\s*/, '').slice(0, 38))
    const y = bulletsY + i * 105
    const bw = Math.min(clean.length * 13 + 85, W * 0.52)
    return `<rect x="${bulletsX}" y="${y}" width="${bw}" height="92" rx="13" fill="${textBg}"/>
<circle cx="${bulletsX + 42}" cy="${y + 46}" r="26" fill="${accentColor}"/>
<text x="${bulletsX + 42}" y="${y + 53}" text-anchor="middle" font-family="Bold" font-size="19" fill="#000">${i+1}</text>
<text x="${bulletsX + 82}" y="${y + 37}" font-family="Bold" font-size="18" fill="white">${clean.slice(0,28)}</text>
${clean.length > 28 ? `<text x="${bulletsX + 82}" y="${y + 62}" font-family="Reg" font-size="15" fill="rgba(255,255,255,0.70)">${esc(clean.slice(28))}</text>` : ''}`
  }).join('\n')

  const fontStyle = FONT_BOLD ? `@font-face { font-family: 'Bold'; src: url('${FONT_BOLD}'); }
  @font-face { font-family: 'Reg'; src: url('${FONT_REG}'); }` : ''

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <style>${fontStyle}</style>
  <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.75)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>
  <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.88)"/></linearGradient>
</defs>
<rect width="${W}" height="${Math.round(H*0.22)}" fill="url(#gt)"/>
<rect y="${Math.round(H*0.78)}" width="${W}" height="${Math.round(H*0.22)}" fill="url(#gb)"/>
<rect x="0" y="0" width="9" height="${H}" fill="${accentColor}"/>
<rect x="${titleX - 16}" y="${titleY - titleSize - 4}" width="${Math.min(title.length * titleSize * 0.54 + 24, W - titleX)}" height="${titleSize + 24}" rx="10" fill="${textBg}"/>
<text x="${titleX}" y="${titleY}" font-family="Bold,Arial Black,sans-serif" font-size="${titleSize}" fill="white">${title}</text>
<rect x="${titleX - 4}" y="${titleY + 8}" width="${Math.min(title.length * titleSize * 0.3, 260)}" height="5" rx="3" fill="${accentColor}"/>
${bulletItems}
<rect x="0" y="${H - 72}" width="${W}" height="72" fill="${bottomBarColor}"/>
<text x="${W/2}" y="${H - 24}" text-anchor="middle" font-family="Bold,Arial Black,sans-serif" font-size="22" fill="#000">XS · S · M · L · XL · 2XL · 3XL</text>
</svg>`

  return sharp(imgBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 93 })
    .toBuffer()
}

async function translateToEn(text: string): Promise<string> {
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Translate to English (keep exact visual meaning, be specific): "${text}"` }],
      max_tokens: 60,
    })
    return r.choices[0]?.message?.content?.trim() || text
  } catch { return text }
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
    const data = await pred.json()
    const result = await pollReplicate(data.id, token)
    if (result.status !== 'succeeded' || !result.output) return null
    return Array.isArray(result.output) ? result.output[0] : result.output
  } catch (e) { console.error('Flux:', e); return null }
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
  const resized = await sharp(prodBuf).resize(SIZE-PAD*2, SIZE-PAD*2, { fit:'contain', background:{r:0,g:0,b:0,alpha:0} }).png().toBuffer()
  return sharp({ create:{width:SIZE,height:SIZE,channels:4,background:{r:248,g:248,b:248,alpha:255}} })
    .composite([{input:resized,top:PAD,left:PAD}]).jpeg({quality:95}).toBuffer()
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
    await supabase.storage.from('card-images').upload(fn, await sharp(buf).jpeg({quality:93}).toBuffer(), { contentType: 'image/jpeg' })
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

    const { mode='photo', displayStyle='catalog', productPhoto, productPhotos, productPhotoUrl, productName='', category='', wishes='', count=1, cardStyle='classic', bullets=[] } = await req.json()
    if (!productName.trim()) return NextResponse.json({ error: 'Введіть назву товару' }, { status: 400 })

    const allPhotos: string[] = productPhotos?.length ? productPhotos : (productPhoto ? [productPhoto] : [])
    if (!allPhotos.length && productPhotoUrl) {
      try { const r = await fetch(productPhotoUrl); const buf = Buffer.from(await r.arrayBuffer()); allPhotos.push(`data:${r.headers.get('content-type')||'image/jpeg'};base64,${buf.toString('base64')}`) } catch {}
    }
    if (!allPhotos.length) return NextResponse.json({ error: 'Завантажте фото товару' }, { status: 400 })

    const qty = Math.min(Math.max(1, count), 4)
    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < COST * qty) return NextResponse.json({ error: `Недостатньо зорь (${COST*qty} ⭐)`, needStars:true, balance }, { status: 402 })

    const REPLICATE = process.env.REPLICATE_API_TOKEN
    const RMBG = process.env.REMOVE_BG_API_KEY
    const results: string[] = []

    if (mode === 'card') {
      // CARD MODE:
      // 1. Flux generates unique scene for this product
      // 2. GPT-4o analyzes the generated scene → decides layout
      // 3. sharp overlays infographic text in AI-decided positions
      if (!REPLICATE) return NextResponse.json({ error: 'Карточка потребує REPLICATE_API_TOKEN' }, { status: 503 })

      const cardBullets = (bullets as string[]).filter(Boolean)
      if (!cardBullets.length) return NextResponse.json({ error: 'Додайте хоча б одну перевагу' }, { status: 400 })

      const photoUrl = await uploadPhoto(supabase, allPhotos[0], user.id, 'card-input')
      if (!photoUrl) return NextResponse.json({ error: 'Помилка завантаження фото' }, { status: 500 })

      for (let i = 0; i < qty; i++) {
        try {
          // Step 1: Generate unique Flux scene
          const fluxPrompt = await getFluxPrompt(allPhotos[0], productName, category, 'lifestyle', wishes, i)
          console.log(`[card ${i+1}] Flux prompt:`, fluxPrompt.slice(0,80))

          const fluxUrl = await runFluxKontext(photoUrl, fluxPrompt, REPLICATE)
          if (!fluxUrl) { console.warn(`Card ${i+1} Flux failed`); continue }

          // Step 2: GPT-4o analyzes the Flux result → decides where to put text
          console.log(`[card ${i+1}] Analyzing layout...`)
          const layout = await analyzeSceneForLayout(fluxUrl, productName, cardBullets)
          console.log(`[card ${i+1}] Layout:`, layout)

          // Step 3: Overlay infographic text in AI-decided positions
          const cardBuf = await overlayInfographic(fluxUrl, productName, cardBullets, layout)
          results.push(await saveBuf(supabase, cardBuf, user.id, 'cards'))
        } catch (e) { console.error(`card ${i}:`, e) }
      }
    } else {
      // PHOTO MODE: Flux transforms scene
      const wishesEn = wishes ? await translateToEn(wishes) : ''
      const STYLE_PROMPTS: Record<string,string> = {
        model:    'Keep this exact person and clothing completely unchanged. Change only the background to urban city street, blurred buildings, natural daylight. Preserve EVERY detail.',
        store:    'Keep this exact clothing completely unchanged. Show hanging on premium chrome hanger in minimalist boutique, soft retail lighting. Preserve EVERY detail.',
        flatlay:  'Keep this exact clothing completely unchanged. Show ONLY clothing (NO people) neatly arranged on clean white marble, strict top-down view. Preserve EVERY detail.',
        catalog:  'Keep this exact clothing and person completely unchanged. Change only background to pure seamless white studio. Preserve EVERY detail.',
        outdoor:  'Keep this exact person and clothing completely unchanged. Outdoor nature, mountains or forest, golden hour. Preserve EVERY detail.',
        dark:     'Keep this exact person and clothing completely unchanged. Dark moody studio, dramatic rim lighting. Preserve EVERY detail.',
        lifestyle:'Keep this exact person and clothing completely unchanged. Warm cozy lifestyle environment, natural bokeh. Preserve EVERY detail.',
      }
      const VARIATIONS = ['', 'slightly different angle, different lighting mood', 'alternative perspective, different depth', 'different time of day, alternative environment']

      if (displayStyle === 'catalog' && !REPLICATE) {
        for (let i=0; i<qty; i++) {
          try { const buf = await makeCatalog(allPhotos[i%allPhotos.length], RMBG); results.push(await saveBuf(supabase, buf, user.id, 'studio')) }
          catch(e) { console.error(`catalog ${i}:`, e) }
        }
      } else if (REPLICATE) {
        const photoUrls: string[] = []
        for (const p of allPhotos) { const u = await uploadPhoto(supabase, p, user.id, 'replicate-input'); if(u) photoUrls.push(u) }
        if (!photoUrls.length) return NextResponse.json({ error: 'Помилка завантаження фото' }, { status: 500 })

        for (let i=0; i<qty; i++) {
          try {
            const base = STYLE_PROMPTS[displayStyle] || STYLE_PROMPTS.catalog
            let prompt = wishesEn ? `${wishesEn}. ${base}` : base
            if (i > 0) prompt += `. ${VARIATIONS[i]||`variation ${i+1}`}`
            const url = await runFluxKontext(photoUrls[i%photoUrls.length], prompt.slice(0,600), REPLICATE)
            if (url) results.push(await saveUrl(supabase, url, user.id, 'studio'))
          } catch(e) { console.error(`flux ${i}:`, e) }
        }
      } else {
        return NextResponse.json({ error: 'Потрібен REPLICATE_API_TOKEN в Vercel env.', needReplicate: true }, { status: 503 })
      }
    }

    if (!results.length) return NextResponse.json({ error: 'Генерація не вдалась. Спробуйте ще раз.' }, { status: 500 })
    const spent = COST * results.length
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: spent })
    await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -spent, description: `Студія: ${productName.slice(0,35)} (${mode} x${results.length})` })
    await supabase.from('studio_results').insert({ user_id: user.id, product_name: productName.slice(0,100), mode: mode==='card'?'card':displayStyle, urls: results, stars_spent: spent, settings: { displayStyle, mode, count: results.length } }).then(()=>{})
    return NextResponse.json({ results, starsSpent: spent, newBalance: balance - spent, count: results.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Studio error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
