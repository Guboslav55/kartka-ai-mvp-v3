import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'fs'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

// Find font paths - works on Vercel (fonts committed to repo)
function findFont(bold: boolean): string {
  const name = bold ? ['arialbd.ttf','Arial Bold.ttf','DejaVuSans-Bold.ttf'] : ['arial.ttf','Arial.ttf','DejaVuSans.ttf']
  const dirs = [
    path.join(process.cwd(), 'public/fonts'),
    '/var/task/public/fonts',
    '/usr/share/fonts/truetype/dejavu',
    '/usr/share/fonts/truetype/liberation',
  ]
  for (const dir of dirs) {
    for (const n of name) {
      const p = path.join(dir, n)
      try { if (fs.existsSync(p)) { console.log('Font found:', p); return p } } catch {}
    }
  }
  console.warn('No font found, using empty path')
  return ''
}

// ─── STEP 1: GPT-4o analyses product, builds Flux prompt ──────────────────────
async function buildFluxPrompt(photo: string, name: string, category: string, style: string, wishes: string, varIdx: number): Promise<string> {
  const styleMap: Record<string,string> = {
    model: 'urban lifestyle street, city environment, bokeh background',
    store: 'premium boutique store, clothes hanger, retail interior',
    flatlay: 'flat lay top-down view on marble surface, NO people',
    catalog: 'pure clean white seamless studio background',
    outdoor: 'dramatic outdoor nature, mountains or forest, golden hour',
    dark: 'dark moody studio, dramatic rim lighting from behind',
    lifestyle: 'cozy warm lifestyle indoor, natural light bokeh',
  }
  const scene = styleMap[style] || styleMap.catalog
  const vars = ['','slightly different angle','alternative lighting mood','different background depth']
  let wishEn = ''
  if (wishes.trim()) {
    try {
      const r = await openai.chat.completions.create({ model:'gpt-4o-mini', messages:[{role:'user',content:`Translate to English for AI image editor: "${wishes}"`}], max_tokens:60 })
      wishEn = r.choices[0]?.message?.content?.trim() || wishes
    } catch { wishEn = wishes }
  }
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages:[{ role:'user', content:[
        { type:'image_url', image_url:{ url:photo, detail:'low' } },
        { type:'text', text:`Product: "${name}", Category: "${category}". Scene: "${scene}".${wishEn ? ` User wants: "${wishEn}".` : ''} Variation ${varIdx+1}: ${vars[varIdx]||''}.
Write Flux Kontext prompt (English, 70 words max):
- "Keep this exact product/person/clothing completely unchanged."
- Describe the scene vividly with specific atmosphere and lighting
- "Preserve all logos, prints, colors, textures exactly."
- "Professional marketing photography."
Return ONLY the prompt:`
        }
      ]}],
      max_tokens: 120, temperature: 0.8,
    })
    return r.choices[0]?.message?.content?.trim() || `Keep this exact product unchanged. ${scene}. Preserve all details. Professional photography.`
  } catch {
    return `Keep this exact product unchanged. ${scene}. Preserve all logos and colors. Professional marketing photography.`
  }
}

// ─── STEP 2: Flux Kontext generates the scene ────────────────────────────────
async function runFlux(imageUrl: string, prompt: string, token: string): Promise<string | null> {
  try {
    const pred = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method:'POST', headers:{ Authorization:`Token ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ input:{ input_image:imageUrl, prompt, aspect_ratio:'1:1', output_format:'jpg', output_quality:90, safety_tolerance:2 } })
    })
    if (!pred.ok) { const e=await pred.json(); console.error('Flux:',e.detail); return null }
    const { id } = await pred.json()
    for (let i=0; i<40; i++) {
      await new Promise(r=>setTimeout(r,3000))
      const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers:{ Authorization:`Token ${token}` } })
      const d = await r.json()
      if (d.status==='succeeded') return Array.isArray(d.output) ? d.output[0] : d.output
      if (d.status==='failed') { console.error('Flux failed:',d.error); return null }
    }
    return null
  } catch(e) { console.error('Flux exception:',e); return null }
}

// ─── STEP 3: GPT-4o Vision analyses the Flux scene → decides layout ──────────
async function analyseSceneLayout(sceneUrl: string, name: string, bullets: string[]): Promise<{
  titleX:number; titleY:number; titleFontSize:number; titleMaxWidth:number
  bulletsX:number; bulletsY:number; bulletSpacing:number; bulletMaxWidth:number
  accentHex:string; textBgAlpha:number; gradientSide:'left'|'right'|'bottom'
  bottomBarHex:string; textColorHex:string; cardFormat:'portrait'|'square'
}> {
  const defaults = {
    titleX:50, titleY:130, titleFontSize:72, titleMaxWidth:520,
    bulletsX:40, bulletsY:260, bulletSpacing:110, bulletMaxWidth:500,
    accentHex:'#FFD700', textBgAlpha:0.82, gradientSide:'left' as const,
    bottomBarHex:'#FFD700', textColorHex:'#FFFFFF', cardFormat:'square' as const,
  }
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages:[{ role:'user', content:[
        { type:'image_url', image_url:{ url:sceneUrl, detail:'low' } },
        { type:'text', text:`This is a 1024×1024 product marketing photo.
Product: "${name}", ${bullets.length} benefits to show.

Analyse the image carefully:
1. Where is the MAIN subject (person/product)? Left side or right side?
2. Which area has the most EMPTY or DARK space for text overlay?
3. What is the dominant BRAND COLOR from any logo/print?

Based on your analysis, decide optimal text placement.
The text area should be OPPOSITE to the main subject.

Return ONLY valid JSON (no markdown):
{
  "titleX": number (pixel X for title, 30-600),
  "titleY": number (pixel Y for title, 80-200),
  "titleFontSize": number (50-90, smaller if long name),
  "titleMaxWidth": number (300-560),
  "bulletsX": number (same X as title or close),
  "bulletsY": number (titleY + titleFontSize + 40),
  "bulletSpacing": number (95-120 pixels between bullets),
  "bulletMaxWidth": number (280-520),
  "accentHex": "#hex (brand color from product logo/print, or gold if unclear)",
  "textBgAlpha": number (0.75-0.90),
  "gradientSide": "left" or "right" (darker side where text goes),
  "bottomBarHex": "#hex (same as accent)",
  "textColorHex": "#FFFFFF",
  "cardFormat": "square"
}` }
      ]}],
      max_tokens:300, response_format:{ type:'json_object' }, temperature:0.2,
    })
    const d = JSON.parse(r.choices[0]?.message?.content || '{}')
    return {
      titleX: Math.max(30, Math.min(d.titleX||50, 600)),
      titleY: Math.max(80, Math.min(d.titleY||130, 220)),
      titleFontSize: Math.max(50, Math.min(d.titleFontSize||72, 90)),
      titleMaxWidth: Math.max(280, Math.min(d.titleMaxWidth||520, 580)),
      bulletsX: Math.max(30, Math.min(d.bulletsX||40, 580)),
      bulletsY: Math.max(200, Math.min(d.bulletsY||270, 650)),
      bulletSpacing: Math.max(90, Math.min(d.bulletSpacing||110, 130)),
      bulletMaxWidth: Math.max(260, Math.min(d.bulletMaxWidth||480, 540)),
      accentHex: /^#[0-9a-fA-F]{6}$/.test(d.accentHex) ? d.accentHex : '#FFD700',
      textBgAlpha: Math.max(0.70, Math.min(d.textBgAlpha||0.82, 0.92)),
      gradientSide: d.gradientSide==='right' ? 'right' : 'left',
      bottomBarHex: /^#[0-9a-fA-F]{6}$/.test(d.bottomBarHex) ? d.bottomBarHex : (d.accentHex||'#FFD700'),
      textColorHex: '#FFFFFF',
      cardFormat: 'square',
    }
  } catch(e) { console.error('analyseScene error:',e); return defaults }
}

// ─── STEP 4: sharp overlays infographic in AI-decided positions ───────────────
async function overlayInfographic(sceneUrl: string, name: string, bullets: string[], layout: Awaited<ReturnType<typeof analyseSceneLayout>>): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  const imgBuf = Buffer.from(await (await fetch(sceneUrl)).arrayBuffer())
  const meta = await sharp(imgBuf).metadata()
  const W = meta.width || 1024, H = meta.height || 1024

  const fontBold = findFont(true)
  const fontReg  = findFont(false)
  const fontDecl = fontBold ? `@font-face{font-family:'B';src:url('${fontBold}');}@font-face{font-family:'R';src:url('${fontReg||fontBold}');}` : ''
  const BF = fontBold ? 'B' : 'Arial Black,Arial,sans-serif'
  const RF = fontReg  ? 'R' : 'Arial,sans-serif'

  const esc = (s:string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const { titleX, titleY, titleFontSize, accentHex, textBgAlpha, gradientSide,
          bulletsX, bulletsY, bulletSpacing, bulletMaxWidth, bottomBarHex } = layout

  const bs = bullets.filter(Boolean).slice(0,5)
  const titleLine1 = esc(name.slice(0,18).toUpperCase())
  const titleLine2 = name.length > 18 ? esc(name.slice(18,36).toUpperCase()) : ''
  const titleH = titleLine2 ? titleFontSize*2+16 : titleFontSize+8

  // Dark gradient overlay on the text side
  const gradSvg = gradientSide === 'right'
    ? `<linearGradient id="gd" x1="1" y1="0" x2="0" y2="0"><stop offset="0%" stop-color="rgba(0,0,0,0.90)"/><stop offset="60%" stop-color="rgba(0,0,0,0.55)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>`
    : `<linearGradient id="gd" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgba(0,0,0,0.90)"/><stop offset="60%" stop-color="rgba(0,0,0,0.55)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>`

  // Build bullet SVG items
  const hex2rgba = (hex:string, a:number) => {
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16)
    return `rgba(${r},${g},${b},${a})`
  }
  const bulletBg = `rgba(0,0,0,${textBgAlpha})`

  const bulletItems = bs.map((b,i) => {
    const clean = esc(b.replace(/^[•✓\-]\s*/,'').slice(0,36))
    const y = bulletsY + i * bulletSpacing
    const bw = Math.min(clean.length*13+85, bulletMaxWidth)
    // Split into 2 lines if too long
    const words = clean.split(' ')
    const half = Math.ceil(words.length/2)
    const l1 = words.slice(0,half).join(' ')
    const l2 = words.length > 3 ? words.slice(half).join(' ') : ''
    return `
<rect x="${bulletsX}" y="${y}" width="${bw}" height="${l2?100:82}" rx="13" fill="${bulletBg}"/>
<circle cx="${bulletsX+40}" cy="${y+(l2?50:41)}" r="25" fill="${accentHex}"/>
<text x="${bulletsX+40}" y="${y+(l2?57:48)}" text-anchor="middle" font-family="${BF}" font-size="18" fill="#000000">${i+1}</text>
<text x="${bulletsX+78}" y="${y+(l2?36:48)}" font-family="${BF}" font-size="19" fill="#FFFFFF">${l1}</text>
${l2?`<text x="${bulletsX+78}" y="${y+62}" font-family="${RF}" font-size="16" fill="rgba(255,255,255,0.75)">${l2}</text>`:''}
`
  }).join('')

  const accentBarX = gradientSide==='right' ? W-9 : 0

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <style>${fontDecl}</style>
  ${gradSvg}
  <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.70)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>
  <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.85)"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#gd)"/>
<rect width="${W}" height="${Math.round(H*0.2)}" fill="url(#gt)"/>
<rect y="${Math.round(H*0.8)}" width="${W}" height="${Math.round(H*0.2)}" fill="url(#gb)"/>
<rect x="${accentBarX}" y="0" width="9" height="${H}" fill="${accentHex}"/>
<rect x="${titleX-14}" y="${titleY-titleFontSize-6}" width="${Math.min(titleLine1.length*titleFontSize*0.56+28, layout.titleMaxWidth+20)}" height="${titleH+14}" rx="12" fill="rgba(0,0,0,0.80)"/>
<text x="${titleX}" y="${titleY}" font-family="${BF}" font-size="${titleFontSize}" fill="#FFFFFF">${titleLine1}</text>
${titleLine2?`<text x="${titleX}" y="${titleY+titleFontSize+8}" font-family="${BF}" font-size="${titleFontSize}" fill="#FFFFFF">${titleLine2}</text>`:''}
<rect x="${titleX}" y="${titleY+titleH-titleFontSize*0.15}" width="${Math.min(titleLine1.length*titleFontSize*0.28,260)}" height="5" rx="3" fill="${accentHex}"/>
${bulletItems}
<rect x="0" y="${H-74}" width="${W}" height="74" fill="${bottomBarHex}"/>
<text x="${W/2}" y="${H-24}" text-anchor="middle" font-family="${BF}" font-size="23" fill="#000000">XS · S · M · L · XL · 2XL · 3XL</text>
</svg>`

  return sharp(imgBuf).composite([{ input:Buffer.from(svg), top:0, left:0 }]).jpeg({ quality:93 }).toBuffer()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function uploadPhoto(supabase:any, b64:string, uid:string, folder:string): Promise<string|null> {
  try {
    const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
    if (!m) return null
    const buf = Buffer.from(m[2],'base64')
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('card-images').upload(fn, buf, { contentType:'image/jpeg' })
    if (error) return null
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return null }
}

async function saveBuf(supabase:any, buf:Buffer, uid:string, folder:string): Promise<string> {
  try {
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    await supabase.storage.from('card-images').upload(fn, buf, { contentType:'image/jpeg' })
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return `data:image/jpeg;base64,${buf.toString('base64')}` }
}

async function saveUrl(supabase:any, url:string, uid:string, folder:string): Promise<string> {
  try {
    const sharp = (await import('sharp')).default
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    await supabase.storage.from('card-images').upload(fn, await sharp(buf).jpeg({quality:93}).toBuffer(), { contentType:'image/jpeg' })
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return url }
}

async function makeCatalog(b64:string, rmbgKey?:string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  let prodBuf = m ? Buffer.from(m[2],'base64') : Buffer.from(b64,'base64')
  if (rmbgKey) {
    try {
      const fd = new FormData(); fd.append('image_file', new Blob([prodBuf],{type:m?.[1]||'image/jpeg'}),'p.jpg'); fd.append('size','auto')
      const r = await fetch('https://api.remove.bg/v1.0/removebg',{method:'POST',headers:{'X-Api-Key':rmbgKey},body:fd})
      if (r.ok) prodBuf = Buffer.from(await r.arrayBuffer())
    } catch {}
  }
  const SIZE=1200, PAD=100
  const resized = await sharp(prodBuf).resize(SIZE-PAD*2,SIZE-PAD*2,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer()
  return sharp({create:{width:SIZE,height:SIZE,channels:4,background:{r:248,g:248,b:248,alpha:255}}})
    .composite([{input:resized,top:PAD,left:PAD}]).jpeg({quality:95}).toBuffer()
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ','')
    if (!token) return NextResponse.json({error:'Unauthorized'},{status:401})
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {global:{headers:{Authorization:`Bearer ${token}`}}})
    const {data:{user}} = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({error:'Unauthorized'},{status:401})

    const {mode='photo', displayStyle='catalog', productPhoto, productPhotos, productPhotoUrl,
      productName='', category='', wishes='', count=1, cardStyle='classic', bullets=[]} = await req.json()

    if (!productName.trim()) return NextResponse.json({error:'Введіть назву товару'},{status:400})

    const allPhotos:string[] = productPhotos?.length ? productPhotos : (productPhoto?[productPhoto]:[])
    if (!allPhotos.length && productPhotoUrl) {
      try { const r=await fetch(productPhotoUrl); const buf=Buffer.from(await r.arrayBuffer()); allPhotos.push(`data:${r.headers.get('content-type')||'image/jpeg'};base64,${buf.toString('base64')}`) } catch {}
    }
    if (!allPhotos.length) return NextResponse.json({error:'Завантажте фото товару'},{status:400})

    const qty = Math.min(Math.max(1,count),4)
    const {data:profile} = await supabase.from('users').select('stars_balance').eq('id',user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < COST*qty) return NextResponse.json({error:`Недостатньо зорь (${COST*qty} ⭐)`,needStars:true,balance},{status:402})

    const REPLICATE = process.env.REPLICATE_API_TOKEN
    const RMBG = process.env.REMOVE_BG_API_KEY
    const results:string[] = []

    // ── CARD MODE: Full autonomous design engine ──────────────────────────────
    if (mode==='card') {
      const cardBullets = (bullets as string[]).filter(Boolean)
      if (!cardBullets.length) return NextResponse.json({error:'Додайте переваги товару'},{status:400})
      if (!REPLICATE) return NextResponse.json({error:'Карточка потребує REPLICATE_API_TOKEN'},{status:503})

      const photoUrl = await uploadPhoto(supabase, allPhotos[0], user.id, 'card-input')
      if (!photoUrl) return NextResponse.json({error:'Помилка завантаження фото'},{status:500})

      for (let i=0; i<qty; i++) {
        try {
          // STEP 1: Build Flux prompt based on product
          const fluxPrompt = await buildFluxPrompt(allPhotos[0], productName, category, 'lifestyle', wishes, i)
          console.log(`[card ${i+1}] Flux:`, fluxPrompt.slice(0,80))

          // STEP 2: Flux generates unique scene
          const sceneUrl = await runFlux(photoUrl, fluxPrompt, REPLICATE)
          if (!sceneUrl) { console.warn(`Card ${i+1}: Flux failed`); continue }

          // STEP 3: GPT-4o analyses scene → decides where text goes
          console.log(`[card ${i+1}] Analysing layout...`)
          const layout = await analyseSceneLayout(sceneUrl, productName, cardBullets)
          console.log(`[card ${i+1}] Layout: title@(${layout.titleX},${layout.titleY}) bullets@(${layout.bulletsX},${layout.bulletsY}) accent=${layout.accentHex} gradient=${layout.gradientSide}`)

          // STEP 4: sharp overlays text in AI-decided positions
          const cardBuf = await overlayInfographic(sceneUrl, productName, cardBullets, layout)
          results.push(await saveBuf(supabase, cardBuf, user.id, 'cards'))
          console.log(`[card ${i+1}] ✅ done`)
        } catch(e) { console.error(`card ${i}:`,e) }
      }
    }
    // ── PHOTO MODE: Flux scene transformation ────────────────────────────────
    else {
      const STYLE_PROMPTS:Record<string,string> = {
        model:    'Keep this exact person and clothing completely unchanged. Change only the background to urban city street, blurred buildings, natural daylight. Preserve EVERY detail.',
        store:    'Keep this exact clothing completely unchanged. Show hanging on premium chrome hanger in minimalist boutique, soft retail lighting. Preserve EVERY detail.',
        flatlay:  'Keep this exact clothing completely unchanged. Show ONLY clothing (NO people) neatly arranged on clean white marble, strict top-down view. Preserve EVERY detail.',
        catalog:  'Keep this exact clothing and person completely unchanged. Change only background to pure seamless white studio. Preserve EVERY detail.',
        outdoor:  'Keep this exact person and clothing completely unchanged. Outdoor nature, mountains or forest, golden hour. Preserve EVERY detail.',
        dark:     'Keep this exact person and clothing completely unchanged. Dark moody studio, dramatic rim lighting. Preserve EVERY detail.',
        lifestyle:'Keep this exact person and clothing completely unchanged. Warm cozy lifestyle environment, natural bokeh. Preserve EVERY detail.',
      }
      const VARS=['','slightly different angle, different lighting mood','alternative perspective, different background depth','different time of day, alternative environment']

      if (displayStyle==='catalog' && !REPLICATE) {
        for (let i=0; i<qty; i++) {
          try { const buf=await makeCatalog(allPhotos[i%allPhotos.length],RMBG); results.push(await saveBuf(supabase,buf,user.id,'studio')) }
          catch(e) { console.error(`catalog ${i}:`,e) }
        }
      } else if (REPLICATE) {
        let wishEn = ''
        if (wishes.trim()) {
          try { const r=await openai.chat.completions.create({model:'gpt-4o-mini',messages:[{role:'user',content:`Translate to English for AI image editor: "${wishes}"`}],max_tokens:60}); wishEn=r.choices[0]?.message?.content?.trim()||wishes } catch { wishEn=wishes }
        }
        const photoUrls:string[] = []
        for (const p of allPhotos) { const u=await uploadPhoto(supabase,p,user.id,'replicate-input'); if(u) photoUrls.push(u) }
        if (!photoUrls.length) return NextResponse.json({error:'Помилка завантаження фото'},{status:500})
        for (let i=0; i<qty; i++) {
          try {
            const base = STYLE_PROMPTS[displayStyle]||STYLE_PROMPTS.catalog
            let prompt = wishEn ? `${wishEn}. ${base}` : base
            if (i>0) prompt += `. ${VARS[i]||`variation ${i+1}`}`
            const url = await runFlux(photoUrls[i%photoUrls.length], prompt.slice(0,600), REPLICATE)
            if (url) results.push(await saveUrl(supabase,url,user.id,'studio'))
          } catch(e) { console.error(`flux ${i}:`,e) }
        }
      } else {
        return NextResponse.json({error:'Потрібен REPLICATE_API_TOKEN в Vercel env.',needReplicate:true},{status:503})
      }
    }

    if (!results.length) return NextResponse.json({error:'Генерація не вдалась. Спробуйте ще раз.'},{status:500})
    const spent = COST*results.length
    await supabase.rpc('deduct_stars',{p_user_id:user.id,p_amount:spent})
    await supabase.from('star_transactions').insert({user_id:user.id,type:'spend',amount:-spent,description:`Студія: ${productName.slice(0,35)} (${mode} x${results.length})`})
    await supabase.from('studio_results').insert({user_id:user.id,product_name:productName.slice(0,100),mode:mode==='card'?'card':displayStyle,urls:results,stars_spent:spent,settings:{displayStyle,mode,count:results.length}}).then(()=>{})
    return NextResponse.json({results,starsSpent:spent,newBalance:balance-spent,count:results.length})
  } catch(err:unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Studio error:',msg)
    return NextResponse.json({error:msg},{status:500})
  }
}
