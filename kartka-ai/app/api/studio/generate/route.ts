import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

const STYLE_PROMPTS: Record<string, string> = {
  model:     'Keep this exact person and clothing completely unchanged. Change only the background to an urban lifestyle city street with blurred buildings, soft natural daylight. Preserve EVERY detail: exact clothing, print, logo, camo pattern, colors, person face.',
  store:     'Keep this exact clothing completely unchanged. Change the setting so the clothing hangs on a premium chrome metal hanger in a minimalist fashion boutique interior, soft retail lighting. Preserve EVERY detail: exact print, logo, colors, fabric.',
  flatlay:   'Keep this exact clothing completely unchanged. Show ONLY the clothing item (NO people, NO body parts, NO mannequin) neatly arranged on clean white marble photographed from directly above (strict 90-degree top-down). Soft even studio lighting. Preserve EVERY detail.',
  catalog:   'Keep this exact clothing and person completely unchanged. Change only the background to pure seamless white studio backdrop with soft professional lighting. Preserve EVERY detail.',
  outdoor:   'Keep this exact person and clothing completely unchanged. Change only the background to dramatic outdoor nature with mountains or forest, golden hour lighting. Preserve EVERY detail.',
  dark:      'Keep this exact person and clothing completely unchanged. Change only the background to dark moody professional studio with dramatic rim lighting. Preserve EVERY detail.',
  lifestyle: 'Keep this exact person and clothing completely unchanged. Change only the background to warm cozy lifestyle environment with natural bokeh. Preserve EVERY detail.',
}

async function translateWishes(wishes: string): Promise<string> {
  if (!wishes.trim()) return ''
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Translate to English for AI image editor (keep exact visual meaning): "${wishes}"` }],
      max_tokens: 80,
    })
    return r.choices[0]?.message?.content?.trim() || wishes
  } catch { return wishes }
}

async function uploadPhoto(supabase: ReturnType<typeof createClient>, b64: string, uid: string, folder: string): Promise<string | null> {
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
  const resized = await sharp(prodBuf).resize(SIZE-PAD*2, SIZE-PAD*2, { fit:'contain', background:{r:0,g:0,b:0,alpha:0} }).png().toBuffer()
  const shadow = Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><ellipse cx="${SIZE/2}" cy="${SIZE-PAD*0.5}" rx="${SIZE*0.28}" ry="${SIZE*0.02}" fill="rgba(0,0,0,0.07)"/></svg>`)
  return sharp({ create:{width:SIZE,height:SIZE,channels:4,background:{r:248,g:248,b:248,alpha:255}} })
    .composite([{input:resized,top:PAD,left:PAD},{input:shadow,top:0,left:0}])
    .jpeg({quality:95}).toBuffer()
}

async function makeCard(bgUrl: string, prodB64: string, name: string, bullets: string[], cardStyle: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const bgBuf = Buffer.from(await (await fetch(bgUrl)).arrayBuffer())
  const CANVAS = 1080
  const bg = await sharp(bgBuf).resize(CANVAS, CANVAS, { fit:'cover', position:'center' }).toBuffer()
  const m = prodB64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  if (!m) return bg
  const prodBuf = Buffer.from(m[2], 'base64')
  const prodMeta = await sharp(prodBuf).metadata()
  const prodAspect = (prodMeta.width||512)/(prodMeta.height||512)
  const photoH = Math.round(CANVAS*0.92)
  const photoW = Math.round(photoH*Math.min(prodAspect,0.65))
  const prodResized = await sharp(prodBuf).resize(photoW, photoH, {fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer()
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const accent = cardStyle==='premium' ? '#c9a84c' : '#FFD700'
  const bs = bullets.filter(Boolean).slice(0,5)
  const bulletsSvg = bs.map((b,i)=>{
    const clean = b.replace(/^[•✓\-]\s*/,'').slice(0,38).toUpperCase()
    const y = 220+i*140
    return `<rect x="32" y="${y}" width="${Math.min(clean.length*16+70,440)}" height="110" rx="14" fill="rgba(0,0,0,0.82)"/>
<circle cx="72" cy="${y+55}" r="27" fill="${accent}"/>
<text x="72" y="${y+63}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="20" font-weight="900" fill="#000">${i+1}</text>
<text x="115" y="${y+48}" font-family="Arial Black,Arial,sans-serif" font-size="18" font-weight="900" fill="#fff">${esc(clean)}</text>`
  }).join('\n')
  const svg = `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgba(0,0,0,0.92)"/><stop offset="55%" stop-color="rgba(0,0,0,0.70)"/><stop offset="100%" stop-color="rgba(0,0,0,0.0)"/></linearGradient>
<linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.6)"/><stop offset="100%" stop-color="rgba(0,0,0,0.0)"/></linearGradient>
<linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.88)"/></linearGradient>
</defs>
<rect width="${CANVAS}" height="${CANVAS}" fill="url(#gl)"/>
<rect width="${CANVAS}" height="160" fill="url(#gt)"/>
<rect y="${CANVAS-150}" width="${CANVAS}" height="150" fill="url(#gb)"/>
<rect x="0" y="0" width="8" height="${CANVAS}" fill="${accent}"/>
<text x="48" y="105" font-family="Arial Black,Arial,sans-serif" font-size="58" font-weight="900" fill="#fff" letter-spacing="-2">${esc(name.slice(0,20).toUpperCase())}</text>
<rect x="48" y="130" width="220" height="5" rx="3" fill="${accent}"/>
${bulletsSvg}
<rect x="0" y="${CANVAS-75}" width="${CANVAS}" height="75" fill="${accent}"/>
<text x="${CANVAS/2}" y="${CANVAS-24}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="22" font-weight="900" fill="#000">РОЗМІРИ: XS · S · M · L · XL · XXL · 3XL</text>
</svg>`
  const photoLeft = CANVAS-photoW-5
  const photoTop = Math.max(0,Math.round((CANVAS-photoH)/2))
  return sharp(bg).composite([{input:prodResized,top:photoTop,left:photoLeft,blend:'over'},{input:Buffer.from(svg),top:0,left:0}]).jpeg({quality:94}).toBuffer()
}

async function saveBuf(supabase: ReturnType<typeof createClient>, buf: Buffer, uid: string, folder: string): Promise<string> {
  try {
    const fn=`${folder}/${uid}/${Date.now()}.jpg`
    await supabase.storage.from('card-images').upload(fn,buf,{contentType:'image/jpeg'})
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return `data:image/jpeg;base64,${buf.toString('base64')}` }
}

async function saveUrl(supabase: ReturnType<typeof createClient>, url: string, uid: string, folder: string): Promise<string> {
  try {
    const sharp=(await import('sharp')).default
    const buf=Buffer.from(await (await fetch(url)).arrayBuffer())
    const fn=`${folder}/${uid}/${Date.now()}.jpg`
    const p=await sharp(buf).jpeg({quality:93}).toBuffer()
    await supabase.storage.from('card-images').upload(fn,p,{contentType:'image/jpeg'})
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return url }
}

export async function POST(req: NextRequest) {
  try {
    const token=req.headers.get('authorization')?.replace('Bearer ','')
    if(!token) return NextResponse.json({error:'Unauthorized'},{status:401})
    const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}}})
    const {data:{user}}=await supabase.auth.getUser(token)
    if(!user) return NextResponse.json({error:'Unauthorized'},{status:401})

    const {mode='photo',displayStyle='catalog',productPhoto,productPhotos,productPhotoUrl,productName='',category='',wishes='',count=1,cardStyle='classic',bullets=[],marketplace='general'}=await req.json()

    if(!productName.trim()) return NextResponse.json({error:'Введіть назву товару'},{status:400})

    const allPhotos:string[]=productPhotos?.length?productPhotos:(productPhoto?[productPhoto]:[])
    if(!allPhotos.length&&productPhotoUrl){
      try{const r=await fetch(productPhotoUrl);const buf=Buffer.from(await r.arrayBuffer());allPhotos.push(`data:${r.headers.get('content-type')||'image/jpeg'};base64,${buf.toString('base64')}`)}catch{}
    }
    if(!allPhotos.length) return NextResponse.json({error:'Завантажте фото товару'},{status:400})

    const qty=Math.min(Math.max(1,count),4)
    const {data:profile}=await supabase.from('users').select('stars_balance').eq('id',user.id).single()
    const balance=profile?.stars_balance??0
    if(balance<COST*qty) return NextResponse.json({error:`Недостатньо зорь (${COST*qty} ⭐)`,needStars:true,balance},{status:402})

    const REPLICATE=process.env.REPLICATE_API_TOKEN
    const RMBG=process.env.REMOVE_BG_API_KEY
    const results:string[]=[]

    if(mode==='card'){
      const prodB64=allPhotos[0]
      const cardBullets=(bullets as string[]).filter(Boolean)
      if(!cardBullets.length) return NextResponse.json({error:'Додайте хоча б одну перевагу для карточки'},{status:400})

      for(let i=0;i<qty;i++){
        try{
          let bgUrl:string|null=null
          // Try gpt-image-1 for background
          try{
            const bgRes=await openai.images.generate({model:'gpt-image-1',prompt:`Abstract ${cardStyle==='premium'?'dark luxury gold accent':'bold dynamic colorful'} marketing background for product card. No people, no products, no text. Unique variation ${i+1}.`,size:'1024x1024',quality:'medium',n:1} as any)
            const bgItem=bgRes.data[0] as any
            if(bgItem?.url) bgUrl=bgItem.url
            else if(bgItem?.b64_json){
              const buf=Buffer.from(bgItem.b64_json,'base64')
              bgUrl=await saveBuf(supabase,buf,user.id,'card-bg') 
            }
          }catch(e){console.error('bg gen:',e)}

          if(!bgUrl) continue
          const cardBuf=await makeCard(bgUrl,prodB64,productName,cardBullets,cardStyle)
          results.push(await saveBuf(supabase,cardBuf,user.id,'cards'))
        }catch(e){console.error(`card ${i}:`,e)}
      }
    } else {
      const wishesEn=await translateWishes(wishes)

      if(displayStyle==='catalog'&&!REPLICATE){
        for(let i=0;i<qty;i++){
          try{const b64=allPhotos[i%allPhotos.length];const buf=await makeCatalog(b64,RMBG);results.push(await saveBuf(supabase,buf,user.id,'studio'))}
          catch(e){console.error(`catalog ${i}:`,e)}
        }
      } else if(REPLICATE){
        const photoUrls:string[]=[]
        for(const p of allPhotos){const u=await uploadPhoto(supabase,p,user.id,'replicate-input');if(u)photoUrls.push(u)}
        if(!photoUrls.length) return NextResponse.json({error:'Помилка завантаження фото'},{status:500})

        const VARIATIONS=['','slightly different angle, different lighting mood','alternative perspective, different background depth','different time of day, alternative environment']
        for(let i=0;i<qty;i++){
          try{
            const photoUrl=photoUrls[i%photoUrls.length]
            const base=STYLE_PROMPTS[displayStyle]||STYLE_PROMPTS.catalog
            const variation=i>0?(VARIATIONS[i]||`unique variation ${i+1}`):''
            let prompt=wishesEn?`${wishesEn}. ${base}`:base
            if(variation) prompt+=`. ${variation}`
            console.log(`[${i+1}] ${displayStyle}:`,prompt.slice(0,80))
            const url=await runFluxKontext(photoUrl,prompt.slice(0,600),REPLICATE)
            if(url) results.push(await saveUrl(supabase,url,user.id,'studio'))
          }catch(e){console.error(`flux ${i}:`,e)}
        }
      } else {
        return NextResponse.json({error:'Для цього стилю потрібен REPLICATE_API_TOKEN в Vercel env.',needReplicate:true},{status:503})
      }
    }

    if(!results.length) return NextResponse.json({error:'Генерація не вдалась. Спробуйте ще раз.'},{status:500})
    const spent=COST*results.length
    await supabase.rpc('deduct_stars',{p_user_id:user.id,p_amount:spent})
    await supabase.from('star_transactions').insert({user_id:user.id,type:'spend',amount:-spent,description:`AI Студія: ${productName.slice(0,35)} (${mode}/${displayStyle} x${results.length})`})
    await supabase.from('studio_results').insert({user_id:user.id,product_name:productName.slice(0,100),mode:mode==='card'?'card':displayStyle,urls:results,stars_spent:spent,settings:{displayStyle,mode,count:results.length,marketplace}}).then(()=>{})
    return NextResponse.json({results,starsSpent:spent,newBalance:balance-spent,count:results.length})
  }catch(err:unknown){
    const msg=err instanceof Error?err.message:'Server error'
    console.error('Studio error:',msg)
    return NextResponse.json({error:msg},{status:500})
  }
}
