import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'fs'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

function findFont(bold: boolean): string {
  // From debug: Vercel serves from /vercel/path0/kartka-ai/public/fonts/
  // User uploaded files are UPPERCASE: ARIALBD.TTF, ARIAL.TTF
  const boldNames = ['ARIALBD.TTF', 'ARIBLK.TTF', 'arialbd.ttf', 'DejaVuSans-Bold.ttf']
  const regNames  = ['ARIAL.TTF', 'arial.ttf', 'DejaVuSans.ttf']
  const names = bold ? boldNames : regNames
  const dirs = [
    '/vercel/path0/kartka-ai/public/fonts',
    path.join(process.cwd(), 'public/fonts'),
    '/var/task/public/fonts',
  ]
  for (const dir of dirs) {
    for (const n of names) {
      const p = path.join(dir, n)
      try { if (fs.existsSync(p)) { console.log('✅ Font:', p); return p } } catch {}
    }
  }
  // Last resort: list what IS in the fonts directory
  for (const dir of dirs) {
    try {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
        console.log('Fonts dir contents:', dir, files)
        // Return first font found regardless of name
        const f = files.find(f => f.toLowerCase().endsWith('.ttf') || f.toLowerCase().endsWith('.otf'))
        if (f) { console.log('Using fallback font:', f); return path.join(dir, f) }
      }
    } catch {}
  }
  console.warn('❌ No font found anywhere')
  return ''
}

const CARD_STYLES: Record<string,{accent:string;titleColor:string;bulletBg:string;bottomColor:string;bottomText:string;ideogramStyle:string}> = {
  military: { accent:'#8B9E4C', titleColor:'#FFFFFF', bulletBg:'rgba(0,0,0,0.82)', bottomColor:'#8B9E4C', bottomText:'#000000', ideogramStyle:'dark tactical military style, olive green khaki tones, moody dramatic lighting, realistic product photography, no text no letters' },
  urban:    { accent:'#FFD700', titleColor:'#FFFFFF', bulletBg:'rgba(0,0,0,0.80)', bottomColor:'#FFD700', bottomText:'#000000', ideogramStyle:'urban streetwear style, dark gradient background, bold energetic composition, professional photography, no text no letters' },
  premium:  { accent:'#C9A84C', titleColor:'#C9A84C', bulletBg:'rgba(0,0,0,0.85)', bottomColor:'#1a1a1a', bottomText:'#C9A84C', ideogramStyle:'luxury premium dark style, cinematic lighting, deep black background, elegant gold tones, high-end photography, no text no letters' },
  rozetka:  { accent:'#FF6600', titleColor:'#1a1a1a', bulletBg:'rgba(255,255,255,0.90)', bottomColor:'#FF6600', bottomText:'#FFFFFF', ideogramStyle:'clean white studio background, soft even lighting, professional ecommerce photography, minimal style, no text no letters' },
  prom:     { accent:'#0066CC', titleColor:'#1a1a1a', bulletBg:'rgba(255,255,255,0.88)', bottomColor:'#0066CC', bottomText:'#FFFFFF', ideogramStyle:'clean light studio background, professional marketplace photography, bright even lighting, no text no letters' },
  minimal:  { accent:'#FFFFFF', titleColor:'#FFFFFF', bulletBg:'rgba(0,0,0,0.70)', bottomColor:'#222222', bottomText:'#FFFFFF', ideogramStyle:'minimalist dark background, elegant composition, soft dramatic lighting, premium photography, no text no letters' },
}

async function buildScenePrompt(photo: string, category: string, cardPreset: string, varIdx: number): Promise<string> {
  const preset = CARD_STYLES[cardPreset] || CARD_STYLES.urban
  const vars = ['', 'slightly different angle', 'alternative lighting', 'different depth']
  try {
    const r = await openai.chat.completions.create({ model:'gpt-4o-mini', messages:[{role:'user', content:[
      { type:'image_url', image_url:{ url:photo, detail:'low' } },
      { type:'text', text:`Category: "${category}". Style: ${preset.ideogramStyle}. Variation: ${vars[varIdx]||''}.
Create Ideogram prompt for product marketing background (English, max 100 words):
- Product/person on RIGHT side, darker area on LEFT for text
- Portrait 2:3 format, ${preset.ideogramStyle}
- ABSOLUTELY NO TEXT NO LETTERS NO NUMBERS in the image
Return ONLY the prompt:` }
    ]}], max_tokens:150, temperature:0.85 })
    return r.choices[0]?.message?.content?.trim() || `${preset.ideogramStyle}. Product right side. Dark area left. Portrait 2:3. No text no letters.`
  } catch { return `${preset.ideogramStyle}. Product photography portrait 2:3. No text no letters.` }
}

async function poll(id: string, token: string, max=40): Promise<any> {
  for(let i=0;i<max;i++){
    await new Promise(r=>setTimeout(r,3000))
    const r=await fetch(`https://api.replicate.com/v1/predictions/${id}`,{headers:{Authorization:`Token ${token}`}})
    const d=await r.json(); if(d.status==='succeeded'||d.status==='failed') return d
  }
  return {status:'failed',error:'Timeout'}
}

async function runIdeogram(prompt: string, token: string): Promise<string|null> {
  try {
    const pred=await fetch('https://api.replicate.com/v1/models/ideogram-ai/ideogram-v2-turbo/predictions',{
      method:'POST', headers:{Authorization:`Token ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({input:{prompt,aspect_ratio:'2:3'}})
    })
    const t=await pred.text(); console.log('Ideogram HTTP:',pred.status,t.slice(0,200))
    if(!pred.ok) return null
    const d=JSON.parse(t); if(!d.id) return null
    const r=await poll(d.id,token); console.log('Ideogram result:',r.status)
    if(r.status!=='succeeded'||!r.output) return null
    const out=r.output; return Array.isArray(out)?(out[0]?.url||out[0]):(out?.url||out)||null
  } catch(e){console.error('Ideogram:',e);return null}
}

async function runFlux(imageUrl: string, prompt: string, token: string): Promise<string|null> {
  try {
    const pred=await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',{
      method:'POST', headers:{Authorization:`Token ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({input:{input_image:imageUrl,prompt,aspect_ratio:'1:1',output_format:'jpg',output_quality:90,safety_tolerance:2}})
    })
    if(!pred.ok) return null
    const r=await poll((await pred.json()).id,token)
    if(r.status!=='succeeded'||!r.output) return null
    return Array.isArray(r.output)?r.output[0]:r.output
  } catch(e){console.error('Flux:',e);return null}
}

async function overlayCardText(sceneUrl: string, name: string, bullets: string[], cardPreset: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const satori = (await import('satori')).default

  const imgBuf = Buffer.from(await (await fetch(sceneUrl)).arrayBuffer())
  const meta = await sharp(imgBuf).metadata()
  const W = meta.width || 768, H = meta.height || 1024

  const preset = CARD_STYLES[cardPreset] || CARD_STYLES.urban
  const { accent, titleColor, bulletBg, bottomColor, bottomText } = preset

  function loadFont(bold: boolean): ArrayBuffer | null {
    const names = bold ? ['ARIALBD.TTF','ARIBLK.TTF','arialbd.ttf','DejaVuSans-Bold.ttf'] : ['ARIAL.TTF','arial.ttf','DejaVuSans.ttf']
    const dirs = ['/vercel/path0/kartka-ai/public/fonts', path.join(process.cwd(),'public/fonts')]
    for (const dir of dirs) {
      for (const n of names) {
        const p = path.join(dir, n)
        try { if (fs.existsSync(p)) { const buf = fs.readFileSync(p); console.log('Font:', p, buf.length); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } } catch {}
      }
    }
    return null
  }

  const boldFont = loadFont(true)
  const regFont  = loadFont(false)
  const fonts: any[] = []
  if (boldFont) fonts.push({ name: 'Card', data: boldFont, weight: 700, style: 'normal' })
  if (regFont)  fonts.push({ name: 'Card', data: regFont,  weight: 400, style: 'normal' })
  const FF = fonts.length ? 'Card' : 'sans-serif'

  const bs = bullets.filter(Boolean).slice(0, 5)
  const titleWords = name.toUpperCase().split(' ')
  const titleLines: string[] = []
  let cur = ''
  for (const w of titleWords) {
    if ((cur + ' ' + w).trim().length > 16 && cur) { titleLines.push(cur); cur = w } else cur = (cur + ' ' + w).trim()
  }
  if (cur) titleLines.push(cur)
  const tLines = titleLines.slice(0, 3)
  const tFS = Math.max(44, Math.min(66, Math.round(H * 0.063)))
  const titleH = tLines.length * (tFS + 8)
  const bulletStart = 80 + titleH + 30
  const bulletSpacing = Math.round((H * 0.78 - bulletStart) / Math.max(bs.length, 1))

  // satori renders to SVG string - no binary deps needed
  const svgStr = await satori(
    {
      type: 'div',
      props: {
        style: { display: 'flex', flexDirection: 'column', width: W, height: H, fontFamily: `${FF}, Arial, sans-serif`, position: 'relative' },
        children: [
          // Gradients
          { type: 'div', props: { style: { position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.58) 52%, rgba(0,0,0,0) 100%)' }, children: [] } },
          { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: H * 0.2, background: 'linear-gradient(to bottom, rgba(0,0,0,0.70), transparent)' }, children: [] } },
          { type: 'div', props: { style: { position: 'absolute', bottom: 68, left: 0, right: 0, height: H * 0.2, background: 'linear-gradient(to top, rgba(0,0,0,0.88), transparent)' }, children: [] } },
          // Accent bar
          { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, width: 8, height: H, background: accent }, children: [] } },
          // Title
          ...tLines.map((line, i) => ({
            type: 'div', props: { style: { position: 'absolute', top: 80 + i * (tFS + 8), left: 28, fontSize: tFS, fontWeight: 700, color: titleColor, whiteSpace: 'nowrap' as const }, children: [line] }
          })),
          // Accent line
          { type: 'div', props: { style: { position: 'absolute', top: 80 + titleH + 6, left: 28, width: 180, height: 5, background: accent, borderRadius: 3 }, children: [] } },
          // Bullets
          ...bs.map((b, i) => ({
            type: 'div',
            props: {
              style: { position: 'absolute', top: bulletStart + i * bulletSpacing, left: 16, display: 'flex', alignItems: 'center', gap: 10 },
              children: [
                { type: 'div', props: { style: { width: 46, height: 46, borderRadius: 23, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: bottomText, flexShrink: 0 }, children: [String(i + 1)] } },
                { type: 'div', props: { style: { background: bulletBg, borderRadius: 10, padding: '8px 12px', fontSize: 17, fontWeight: 600, color: 'white', maxWidth: Math.round(W * 0.46) }, children: [b.replace(/^[•✓\-]\s*/, '').slice(0, 36)] } }
              ]
            }
          })),
          // Bottom bar
          { type: 'div', props: { style: { position: 'absolute', bottom: 0, left: 0, width: W, height: 68, background: bottomColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: bottomText }, children: ['XS · S · M · L · XL · 2XL · 3XL'] } },
        ]
      }
    },
    { width: W, height: H, fonts }
  )

  // sharp can render SVG directly via its built-in librsvg
  const overlayBuf = await sharp(Buffer.from(svgStr)).png().toBuffer()
  return sharp(imgBuf).composite([{ input: overlayBuf, top: 0, left: 0 }]).jpeg({ quality: 93 }).toBuffer()
}


async function uploadPhoto(supabase:any,b64:string,uid:string,folder:string):Promise<string|null>{
  try{const m=b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s);if(!m)return null;const buf=Buffer.from(m[2],'base64');const fn=`${folder}/${uid}/${Date.now()}.jpg`;const{error}=await supabase.storage.from('card-images').upload(fn,buf,{contentType:'image/jpeg'});if(error)return null;return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl}catch{return null}
}
async function saveBuf(supabase:any,buf:Buffer,uid:string,folder:string):Promise<string>{
  try{const fn=`${folder}/${uid}/${Date.now()}.jpg`;await supabase.storage.from('card-images').upload(fn,buf,{contentType:'image/jpeg'});return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl}catch{return `data:image/jpeg;base64,${buf.toString('base64')}`}
}
async function saveUrl(supabase:any,url:string,uid:string,folder:string):Promise<string>{
  try{const sharp=(await import('sharp')).default;const buf=Buffer.from(await(await fetch(url)).arrayBuffer());const fn=`${folder}/${uid}/${Date.now()}.jpg`;await supabase.storage.from('card-images').upload(fn,await sharp(buf).jpeg({quality:93}).toBuffer(),{contentType:'image/jpeg'});return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl}catch{return url}
}
async function makeCatalog(b64:string,rmbgKey?:string):Promise<Buffer>{
  const sharp=(await import('sharp')).default;const m=b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s);let p=m?Buffer.from(m[2],'base64'):Buffer.from(b64,'base64')
  if(rmbgKey){try{const fd=new FormData();fd.append('image_file',new Blob([p],{type:m?.[1]||'image/jpeg'}),'p.jpg');fd.append('size','auto');const r=await fetch('https://api.remove.bg/v1.0/removebg',{method:'POST',headers:{'X-Api-Key':rmbgKey},body:fd});if(r.ok)p=Buffer.from(await r.arrayBuffer())}catch{}}
  const S=1200,PAD=100;const rs=await sharp(p).resize(S-PAD*2,S-PAD*2,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer()
  return sharp({create:{width:S,height:S,channels:4,background:{r:248,g:248,b:248,alpha:255}}}).composite([{input:rs,top:PAD,left:PAD}]).jpeg({quality:95}).toBuffer()
}

export async function POST(req: NextRequest) {
  try {
    const token=req.headers.get('authorization')?.replace('Bearer ','')
    if(!token) return NextResponse.json({error:'Unauthorized'},{status:401})
    const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}}})
    const{data:{user}}=await supabase.auth.getUser(token)
    if(!user) return NextResponse.json({error:'Unauthorized'},{status:401})

    const{mode='photo',displayStyle='catalog',cardPreset='urban',productPhoto,productPhotos,productPhotoUrl,productName='',category='',wishes='',count=1,bullets=[]}=await req.json()
    if(!productName.trim()) return NextResponse.json({error:'Введіть назву товару'},{status:400})

    const allPhotos:string[]=productPhotos?.length?productPhotos:(productPhoto?[productPhoto]:[])
    if(!allPhotos.length&&productPhotoUrl){try{const r=await fetch(productPhotoUrl);const buf=Buffer.from(await r.arrayBuffer());allPhotos.push(`data:${r.headers.get('content-type')||'image/jpeg'};base64,${buf.toString('base64')}`)}catch{}}
    if(!allPhotos.length) return NextResponse.json({error:'Завантажте фото товару'},{status:400})

    const qty=Math.min(Math.max(1,count),4)
    const{data:profile}=await supabase.from('users').select('stars_balance').eq('id',user.id).single()
    const balance=profile?.stars_balance??0
    if(balance<COST*qty) return NextResponse.json({error:`Недостатньо зорь (${COST*qty} ⭐)`,needStars:true,balance},{status:402})

    const REPLICATE=process.env.REPLICATE_API_TOKEN, RMBG=process.env.REMOVE_BG_API_KEY
    const results:string[]=[]

    if(mode==='card'){
      const cardBullets=(bullets as string[]).filter(Boolean)
      if(!cardBullets.length) return NextResponse.json({error:'Додайте переваги товару'},{status:400})
      if(!REPLICATE) return NextResponse.json({error:'Карточка потребує REPLICATE_API_TOKEN'},{status:503})

      // Upload product photo for Flux Kontext (preserves exact product)
      const photoUrl=await uploadPhoto(supabase,allPhotos[0],user.id,'card-input')
      if(!photoUrl) return NextResponse.json({error:'Помилка завантаження фото'},{status:500})

      const preset=CARD_STYLES[cardPreset]||CARD_STYLES.urban
      const cardScenePrompts=[
        `Keep this exact product/person/clothing completely unchanged. Change only the background to ${preset.ideogramStyle}. Add dramatic gradient on the left side darker than right. Portrait composition, product on right side. Preserve ALL details: colors, prints, logo, textures.`,
        `Keep this exact product/person/clothing completely unchanged. Transform background to ${preset.ideogramStyle}. Moody atmospheric lighting. Product prominently featured on right. Preserve ALL details exactly.`,
        `Keep this exact product/person/clothing completely unchanged. Background: ${preset.ideogramStyle}. Dynamic composition, product center-right. Preserve ALL colors, prints, logos unchanged.`,
        `Keep this exact product/person/clothing completely unchanged. Scene: ${preset.ideogramStyle}. Dark left area for text. Product on right side. Preserve every detail exactly as in original photo.`,
      ]

      for(let i=0;i<qty;i++){
        try{
          const fluxPrompt=cardScenePrompts[i%cardScenePrompts.length]
          console.log(`[card ${i+1}] Flux prompt:`,fluxPrompt.slice(0,80))
          const sceneUrl=await runFlux(photoUrl,fluxPrompt,REPLICATE)
          if(!sceneUrl){console.warn(`Card ${i+1}: Flux failed`);continue}
          const cardBuf=await overlayCardText(sceneUrl,productName,cardBullets,cardPreset)
          results.push(await saveBuf(supabase,cardBuf,user.id,'cards'))
          console.log(`[card ${i+1}] done`)
        }catch(e){console.error(`card ${i}:`,e)}
      }
    } else {
      const STYLES:Record<string,string>={
        model:'Keep this exact person and clothing completely unchanged. Change only the background to urban city street. Preserve EVERY detail.',
        store:'Keep this exact clothing completely unchanged. Show on premium hanger in boutique. Preserve EVERY detail.',
        flatlay:'Keep this exact clothing completely unchanged. Show ONLY clothing (NO people) top-down on white marble. Preserve EVERY detail.',
        catalog:'Keep this exact clothing and person completely unchanged. Pure white studio background. Preserve EVERY detail.',
        outdoor:'Keep this exact person and clothing completely unchanged. Outdoor nature mountains, golden hour. Preserve EVERY detail.',
        dark:'Keep this exact person and clothing completely unchanged. Dark moody studio, dramatic rim lighting. Preserve EVERY detail.',
        lifestyle:'Keep this exact person and clothing completely unchanged. Warm lifestyle interior, bokeh. Preserve EVERY detail.',
      }
      const VARS=['','slightly different angle','alternative lighting','different atmosphere']
      if(displayStyle==='catalog'&&!REPLICATE){
        for(let i=0;i<qty;i++){try{const buf=await makeCatalog(allPhotos[i%allPhotos.length],RMBG);results.push(await saveBuf(supabase,buf,user.id,'studio'))}catch(e){console.error(e)}}
      } else if(REPLICATE){
        let wishEn=''
        if(wishes.trim()){try{const r=await openai.chat.completions.create({model:'gpt-4o-mini',messages:[{role:'user',content:`Translate to English: "${wishes}"`}],max_tokens:60});wishEn=r.choices[0]?.message?.content?.trim()||wishes}catch{wishEn=wishes}}
        const photoUrls:string[]=[]
        for(const p of allPhotos){const u=await uploadPhoto(supabase,p,user.id,'replicate-input');if(u)photoUrls.push(u)}
        if(!photoUrls.length) return NextResponse.json({error:'Помилка завантаження фото'},{status:500})
        for(let i=0;i<qty;i++){
          try{
            const base=STYLES[displayStyle]||STYLES.catalog
            let prompt=wishEn?`${wishEn}. ${base}`:base
            if(i>0) prompt+=`. ${VARS[i]||`variation ${i+1}`}`
            const url=await runFlux(photoUrls[i%photoUrls.length],prompt.slice(0,600),REPLICATE)
            if(url) results.push(await saveUrl(supabase,url,user.id,'studio'))
          }catch(e){console.error(e)}
        }
      } else {
        return NextResponse.json({error:'Потрібен REPLICATE_API_TOKEN.',needReplicate:true},{status:503})
      }
    }

    if(!results.length) return NextResponse.json({error:'Генерація не вдалась. Спробуйте ще раз.'},{status:500})
    const spent=COST*results.length
    await supabase.rpc('deduct_stars',{p_user_id:user.id,p_amount:spent})
    await supabase.from('star_transactions').insert({user_id:user.id,type:'spend',amount:-spent,description:`Студія: ${productName.slice(0,35)} (${mode} x${results.length})`})
    await supabase.from('studio_results').insert({user_id:user.id,product_name:productName.slice(0,100),mode:mode==='card'?'card':displayStyle,urls:results,stars_spent:spent,settings:{displayStyle,mode,cardPreset,count:results.length}}).then(()=>{})
    return NextResponse.json({results,starsSpent:spent,newBalance:balance-spent,count:results.length})
  }catch(err:unknown){
    const msg=err instanceof Error?err.message:'Server error'
    console.error('Studio error:',msg)
    return NextResponse.json({error:msg},{status:500})
  }
}
