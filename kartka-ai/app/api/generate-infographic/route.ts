import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

async function buildBgPrompt(prodB64: string, name: string, bullets: string[], variant: string): Promise<string> {
  const variantDesc = {
    lifestyle: 'Vibrant lifestyle scene that matches the product, atmospheric, colorful background. NO product visible.',
    benefits:  'Modern dynamic graphic design background with geometric shapes, bold gradient colors, abstract elements. NO product visible.',
    studio:    'Pure white or light grey studio background, minimal, professional, clean. NO product visible.',
  }[variant] || 'Clean professional background'

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role:'user', content:[
        { type:'image_url', image_url:{ url: prodB64.startsWith('data:') ? prodB64 : `data:image/jpeg;base64,${prodB64}`, detail:'low' } },
        { type:'text', text:`Create a DALL-E 2 background image prompt for a product infographic.
Product: "${name}", Features: ${bullets.slice(0,3).join(', ')}.
Background style: ${variantDesc}
Rules: English only, NO text/letters/words anywhere, background only (product will be added separately).
Return ONLY the English prompt (max 150 words):` }
      ]}],
      max_tokens:200, temperature:0.8,
    })
    return r.choices[0]?.message?.content?.trim() || variantDesc
  } catch { return variantDesc + ' High quality. NO text.' }
}

async function genBg(prompt: string): Promise<Buffer | null> {
  const cleanPrompt = `${prompt}\n\nNO text, NO words, NO letters anywhere.`
  // Try gpt-image-1 first
  try {
    const r = await openai.images.generate({ model:'gpt-image-1', prompt:cleanPrompt, size:'1024x1024', quality:'medium', n:1 } as any)
    const item = r.data[0] as any
    if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
    if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer())
    return null
  } catch(e1:any) {
    console.error('gpt-image-1 infographic:', e1?.message)
    // Fallback dall-e-2
    try {
      const r2 = await openai.images.generate({ model:'dall-e-2', prompt:cleanPrompt.slice(0,900), size:'1024x1024', n:1 })
      const url = r2.data[0]?.url
      if (!url) return null
      return Buffer.from(await (await fetch(url)).arrayBuffer())
    } catch(e2:any) {
      console.error('dall-e-2 infographic fallback:', e2?.message)
      return null
    }
  }
}

async function compositeInfographic(bgBuf: Buffer, prodB64: string, name: string, bullets: string[], variant: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const m = prodB64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  if (!m) return bgBuf
  const prodBuf = Buffer.from(m[2],'base64')
  const prodResized = await sharp(prodBuf).resize(430,430,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer()
  const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const accent = {lifestyle:'#6366f1',benefits:'#f59e0b',studio:'#1a1a2e'}[variant]||'#6366f1'
  const textBg = variant==='studio'?'rgba(255,255,255,0.93)':'rgba(0,0,0,0.78)'
  const tc = variant==='studio'?'#111827':'#ffffff'
  const sn = name.slice(0,45)
  const bs = bullets.filter(Boolean).slice(0,3).map(b=>b.replace(/^[•✓]\s*/,'').slice(0,42))
  const svg=`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.7)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>
<linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.82)"/></linearGradient></defs>
<rect width="1024" height="180" fill="url(#g1)"/><rect y="844" width="1024" height="180" fill="url(#g2)"/>
<rect x="0" y="0" width="8" height="1024" fill="${accent}"/>
<rect x="20" y="18" width="${Math.min(sn.length*17+40,720)}" height="60" rx="10" fill="${textBg}"/>
<text x="40" y="58" font-family="Arial,sans-serif" font-size="29" font-weight="bold" fill="${tc}">${esc(sn)}</text>
${bs.map((b,i)=>`<rect x="20" y="${880+i*44}" width="${Math.min(b.length*13+55,720)}" height="38" rx="8" fill="${textBg}"/>
<text x="50" y="${905+i*44}" font-family="Arial,sans-serif" font-size="20" fill="${tc}">✓ ${esc(b)}</text>`).join('\n')}
<rect x="1016" y="0" width="8" height="1024" fill="${accent}"/></svg>`
  return sharp(bgBuf).composite([{input:prodResized,top:297,left:297,blend:'over'},{input:Buffer.from(svg),top:0,left:0}]).jpeg({quality:92}).toBuffer()
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ','')
    if (!token) return NextResponse.json({error:'Unauthorized'},{status:401})

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {global:{headers:{Authorization:`Bearer ${token}`}}})
    const {data:{user}} = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({error:'Unauthorized'},{status:401})

    const { imageBase64, imageUrl, productName='', bullets=[], variant='lifestyle', cardId, allVariants } = await req.json()

    // Save mode
    if (allVariants && cardId) {
      await supabase.from('cards').update({infographic_urls:allVariants}).eq('id',cardId).eq('user_id',user.id)
      return NextResponse.json({saved:true})
    }

    if (!productName.trim()) return NextResponse.json({error:'Потрібна назва товару'},{status:400})

    // Check balance
    const {data:profile} = await supabase.from('users').select('stars_balance').eq('id',user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < COST) return NextResponse.json({error:`Недостатньо зорь (потрібно ${COST} ⭐, є ${balance})`,needStars:true,balance},{status:402})

    // Resolve image
    let resolvedB64 = imageBase64 || ''
    if (!resolvedB64 && imageUrl) {
      try {
        const r = await fetch(imageUrl)
        const buf = Buffer.from(await r.arrayBuffer())
        resolvedB64 = `data:${r.headers.get('content-type')||'image/jpeg'};base64,${buf.toString('base64')}`
      } catch {}
    }
    if (!resolvedB64) return NextResponse.json({error:'Потрібне фото товару'},{status:400})

    const cleanBullets = (bullets as string[]).filter(Boolean).slice(0,3)

    // Generate
    const prompt = await buildBgPrompt(resolvedB64, productName, cleanBullets, variant)
    const bgBuf = await genBg(prompt)
    if (!bgBuf) return NextResponse.json({error:'DALL-E не зміг згенерувати фон. Спробуйте ще раз.'},{status:500})

    const finalBuf = await compositeInfographic(bgBuf, resolvedB64, productName, cleanBullets, variant)

    // Upload
    let finalUrl: string
    try {
      const fn = `infographics/${user.id}/${Date.now()}-${variant}.jpg`
      await supabase.storage.from('card-images').upload(fn, finalBuf, {contentType:'image/jpeg'})
      finalUrl = supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
    } catch { finalUrl = `data:image/jpeg;base64,${finalBuf.toString('base64')}` }

    // Auto-save to card
    if (cardId) {
      await supabase.from('cards').update({[`infographic_urls`]: {[variant]: finalUrl}}).eq('id',cardId).eq('user_id',user.id).then(()=>{})
    }

    // Deduct stars
    await supabase.rpc('deduct_stars',{p_user_id:user.id,p_amount:COST})
    await supabase.from('star_transactions').insert({user_id:user.id,type:'spend',amount:-COST,description:`Інфографіка: ${productName.slice(0,35)} (${variant})`})

    return NextResponse.json({url:finalUrl,label:{lifestyle:'Lifestyle',benefits:'Переваги',studio:'Студійне'}[variant]||variant,starsSpent:COST,newBalance:balance-COST})
  } catch(err:unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Infographic error:', msg)
    return NextResponse.json({error:msg},{status:500})
  }
}
