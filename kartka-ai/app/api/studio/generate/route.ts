import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { buildCacheKey, checkCache, saveToCache } from '@/lib/cache'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

const STYLES: Record<string,string> = {
  catalog:   'Pure white/light grey seamless background, professional product photography, even soft lighting, no shadows, e-commerce style',
  lifestyle: 'Realistic lifestyle environment, natural lighting, authentic atmosphere, the product used in daily life',
  studio:    'Professional photography studio, gradient background, dramatic moody lighting, commercial look',
  flatlay:   'Flat lay from directly above, clean minimal surface, perfect for online stores',
  outdoor:   'Outdoor setting, natural daylight, environmental context matching the product',
  dark:      'Dark premium background, moody dramatic lighting, luxury product presentation',
}
const LIGHT: Record<string,string> = {
  natural: 'soft natural daylight',
  studio:  'professional studio with multiple light sources',
  dramatic:'dramatic single-source side lighting, strong contrast',
  soft:    'soft diffused lighting with no hard shadows',
  golden:  'warm golden hour lighting',
}

async function buildPrompt(photo: string, name: string, cat: string, style: string, light: string, wishes: string, mkt: string, variation = 0): Promise<string> {
  const styleDesc = STYLES[style] || STYLES.catalog
  const lightDesc = LIGHT[light] || LIGHT.studio
  const mktNote = {prom:'Prom.ua',rozetka:'Rozetka',olx:'OLX'}[mkt] || 'e-commerce'
  const variNote = variation > 0 ? ` Variation ${variation+1}: slightly different angle/composition.` : ''
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role:'user', content:[
        { type:'image_url', image_url:{ url:photo, detail:'low' }},
        { type:'text', text:`Professional product photographer for ${mktNote}. Product: "${name}", Category: "${cat}".
Create a DALL-E 2 background scene prompt. Style: ${styleDesc}. Lighting: ${lightDesc}.${wishes ? ` Requirements: ${wishes}` : ''}${variNote}
Rules: English only, product is main subject, preserve logo/text/shape, NO text in background, photorealistic.
Return ONLY the prompt (max 200 words):` }
      ]}],
      max_tokens:300, temperature:0.8,
    })
    return r.choices[0]?.message?.content?.trim() || `${styleDesc}. ${lightDesc}. Professional product photo. NO text.`
  } catch { return `${styleDesc}. ${lightDesc}. Product: ${name}. High quality. NO text.` }
}

async function genDalle(prompt: string): Promise<string | null> {
  try {
    const r = await openai.images.generate({ model:'dall-e-2', prompt:`${prompt}\n\nNO text, NO letters, NO words anywhere.`, size:'1024x1024', n:1 })
    return r.data[0]?.url ?? null
  } catch(e:any) {
    console.error('DALL-E:', e?.message)
    return null
  }
}

async function composite(sceneBuf: Buffer, prodB64: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const m = prodB64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  if (!m) return sceneBuf
  const prodBuf = Buffer.from(m[2],'base64')
  const meta = await sharp(sceneBuf).metadata()
  const size = Math.round(Math.min(meta.width||1024, meta.height||1024) * 0.55)
  const resized = await sharp(prodBuf).resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer()
  const left = Math.round(((meta.width||1024)-size)/2)
  const top  = Math.round(((meta.height||1024)-size)/2)
  return sharp(sceneBuf).composite([{input:resized,top,left,blend:'over'}]).jpeg({quality:92}).toBuffer()
}

async function compositeCard(sceneBuf: Buffer, prodB64: string, name: string, bullets: string[], cardStyle: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const m = prodB64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  if (!m) return sceneBuf
  const prodBuf = Buffer.from(m[2],'base64')
  const prodResized = await sharp(prodBuf).resize(440,440,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer()
  const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const accent = cardStyle==='premium'?'#c9a84c':'#6366f1'
  const textBg = cardStyle==='premium'?'rgba(0,0,0,0.88)':'rgba(255,255,255,0.93)'
  const tc = cardStyle==='premium'?'#fff':'#111827'
  const sn = name.slice(0,45)
  const bs = bullets.filter(Boolean).slice(0,3).map(b=>b.replace(/^[•✓]\s*/,'').slice(0,42))
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.7)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>
<linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.82)"/></linearGradient></defs>
<rect width="1024" height="180" fill="url(#g1)"/><rect y="844" width="1024" height="180" fill="url(#g2)"/>
<rect x="0" y="0" width="8" height="1024" fill="${accent}"/>
<rect x="20" y="18" width="${Math.min(sn.length*17+40,720)}" height="60" rx="10" fill="${textBg}"/>
<text x="40" y="58" font-family="Arial,sans-serif" font-size="30" font-weight="bold" fill="${tc}">${esc(sn)}</text>
${bs.map((b,i)=>`<rect x="20" y="${880+i*44}" width="${Math.min(b.length*13+55,720)}" height="38" rx="8" fill="${textBg}"/>
<text x="50" y="${905+i*44}" font-family="Arial,sans-serif" font-size="20" fill="${tc}">✓ ${esc(b)}</text>`).join('\n')}
<rect x="1016" y="0" width="8" height="1024" fill="${accent}"/></svg>`
  return sharp(sceneBuf).composite([{input:prodResized,top:292,left:292,blend:'over'},{input:Buffer.from(svg),top:0,left:0}]).jpeg({quality:92}).toBuffer()
}

async function upload(supabase: ReturnType<typeof createClient>, buf: Buffer, uid: string, folder='studio'): Promise<string> {
  try {
    const fn=`${folder}/${uid}/${Date.now()}.jpg`
    await supabase.storage.from('card-images').upload(fn, buf, {contentType:'image/jpeg'})
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return `data:image/jpeg;base64,${buf.toString('base64')}` }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ','')
    if (!token) return NextResponse.json({error:'Unauthorized'},{status:401})

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {global:{headers:{Authorization:`Bearer ${token}`}}})
    const {data:{user}} = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({error:'Unauthorized'},{status:401})

    const { mode='photo', productPhoto, productPhotoUrl, productName='', category='', style='catalog', lighting='studio', wishes='', marketplace='general', format='1:1', count=1, cardStyle='classic', bullets=[] } = await req.json()

    if (!productName.trim()) return NextResponse.json({error:"Введіть назву товару"},{status:400})

    let prodB64 = productPhoto || ''
    if (!prodB64 && productPhotoUrl) {
      try {
        const r = await fetch(productPhotoUrl)
        const buf = Buffer.from(await r.arrayBuffer())
        prodB64 = `data:${r.headers.get('content-type')||'image/jpeg'};base64,${buf.toString('base64')}`
      } catch {}
    }
    if (!prodB64) return NextResponse.json({error:'Завантажте фото товару'},{status:400})
    if (mode==='video') return NextResponse.json({error:'Відео потребує Replicate API токену'},{status:400})

    const qty = Math.min(Math.max(1,count),4)
    const totalCost = COST*qty

    const {data:profile} = await supabase.from('users').select('stars_balance').eq('id',user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < totalCost) return NextResponse.json({error:`Недостатньо зорь (потрібно ${totalCost} ⭐, є ${balance})`,needStars:true,balance,required:totalCost},{status:402})

    // Check result cache (skip for mode=video)
    if (mode !== 'video') {
      const cacheKey = buildCacheKey({ mode, style, lighting, wishes: wishes.slice(0,50), productName: productName.slice(0,30), format, qty })
      const cached = await checkCache(supabase, cacheKey)
      if (cached) {
        return NextResponse.json({ results: cached, starsSpent: 0, newBalance: balance, cached: true })
      }
    }

    const results: string[] = []

    for (let i=0; i<qty; i++) {
      try {
        const prompt = await buildPrompt(prodB64, productName, category, style, lighting, wishes, marketplace, i)
        const url = await genDalle(prompt)
        if (!url) { console.warn(`image ${i+1} failed`); continue }
        const sceneBuf = Buffer.from(await (await fetch(url)).arrayBuffer())
        let finalBuf: Buffer
        if (mode==='card') {
          finalBuf = await compositeCard(sceneBuf, prodB64, productName, bullets as string[], cardStyle)
        } else {
          finalBuf = await composite(sceneBuf, prodB64)
        }
        const finalUrl = await upload(supabase, finalBuf, user.id, mode==='card'?'infographic':'studio')
        results.push(finalUrl)
      } catch(e) { console.error(`img ${i+1}:`, e) }
    }

    if (!results.length) return NextResponse.json({error:'Не вдалось згенерувати. Перевірте ключ OpenAI та спробуйте ще раз.'},{status:500})

    const spent = COST*results.length

    // Save to cache for future requests
    if (results.length > 0 && mode !== 'video') {
      const cacheKey = buildCacheKey({ mode, style, lighting, wishes: wishes.slice(0,50), productName: productName.slice(0,30), format, qty })
      saveToCache(supabase, cacheKey, results).then(() => {})
    }

    await supabase.rpc('deduct_stars',{p_user_id:user.id,p_amount:spent})
    await supabase.from('star_transactions').insert({user_id:user.id,type:'spend',amount:-spent,description:`AI Студія: ${productName.slice(0,35)} (${mode} ×${results.length})`})
    await supabase.from('studio_results').insert({user_id:user.id,product_name:productName.slice(0,100),mode,urls:results,stars_spent:spent,settings:{style,lighting,format,count:results.length,marketplace}}).then(()=>{})

    return NextResponse.json({results,starsSpent:spent,newBalance:balance-spent,count:results.length})
  } catch(err:unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Studio error:', msg)
    return NextResponse.json({error:msg},{status:500})
  }
}
