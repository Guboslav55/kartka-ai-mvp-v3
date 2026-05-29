import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const COST = 4

const STYLE_PROMPTS: Record<string, string> = {
  catalog:   'The exact same clothing item placed on pure white background, no shadows, professional ecommerce catalog photography, clean studio look',
  model:     'The exact same clothing outfit worn by a fashion model, urban lifestyle setting, soft natural bokeh background, magazine style photography, preserve all prints and colors exactly',
  store:     'The exact same clothing item hanging on a premium metal hanger in a boutique store, minimal white interior, soft lighting, retail photography',
  flatlay:   'The exact same clothing items arranged in a flat lay composition, aerial top-down view, clean light marble surface, soft even studio lighting, ecommerce photography, preserve all prints',
  lifestyle: 'The exact same clothing worn in an outdoor lifestyle scene, natural environment, mountains or park, golden hour lighting, dynamic realistic photography',
  outdoor:   'The exact same clothing in an outdoor urban street setting, city background blurred, natural daylight, street fashion photography style',
  dark:      'The exact same clothing on a dramatic dark studio background, professional rim lighting, luxury fashion photography, moody cinematic atmosphere',
}

async function buildFluxPrompt(photo: string, name: string, category: string, style: string, wishes: string): Promise<string> {
  const base = STYLE_PROMPTS[style] || STYLE_PROMPTS.catalog
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: photo, detail: 'low' } },
        { type: 'text', text: `Product: "${name}", Category: "${category}". Style: "${style}". ${wishes ? `Extra: "${wishes}"` : ''}\n\nEnhance this Flux image-editing prompt (must preserve EXACT product/colors/prints/logos):\n"${base}"\n\nReturn ONLY enhanced English prompt under 80 words:` }
      ]}],
      max_tokens: 120, temperature: 0.5,
    })
    return res.choices[0]?.message?.content?.trim() || base
  } catch { return base }
}

async function uploadForReplicate(supabase: ReturnType<typeof createClient>, b64: string, uid: string): Promise<string | null> {
  try {
    const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
    if (!m) return null
    const buf = Buffer.from(m[2], 'base64')
    const fn = `replicate-input/${uid}/${Date.now()}.${m[1].split('/')[1]}`
    const { error } = await supabase.storage.from('card-images').upload(fn, buf, { contentType: m[1] })
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
    // Use models endpoint for Flux Kontext Pro (official deployment)
    const pred = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
      body: JSON.stringify({
        input: { input_image: imageUrl, prompt, aspect_ratio: '1:1', output_format: 'jpg', output_quality: 90, safety_tolerance: 2 }
      })
    })
    if (!pred.ok) { const e = await pred.json(); console.error('Flux error:', e.detail); return null }
    const result = await pollReplicate((await pred.json()).id, token)
    if (result.status !== 'succeeded' || !result.output) return null
    return Array.isArray(result.output) ? result.output[0] : result.output
  } catch (e) { console.error('Flux exception:', e); return null }
}

async function makeCatalogPhoto(b64: string, rmbgKey?: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const m = b64.match(/^data:(image\/[\w+]+);base64,(.+)$/s)
  let prodBuf = m ? Buffer.from(m[2], 'base64') : Buffer.from(b64, 'base64')
  if (rmbgKey) {
    try {
      const fd = new FormData()
      fd.append('image_file', new Blob([prodBuf], { type: m?.[1] || 'image/jpeg' }), 'p.jpg')
      fd.append('size', 'auto')
      const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': rmbgKey }, body: fd })
      if (r.ok) { prodBuf = Buffer.from(await r.arrayBuffer()); console.log('BG removed') }
    } catch {}
  }
  const SIZE = 1200, PAD = 96
  const resized = await sharp(prodBuf).resize(SIZE - PAD*2, SIZE - PAD*2, { fit: 'contain', background: { r:0, g:0, b:0, alpha:0 } }).png().toBuffer()
  const shadow = Buffer.from(`<svg width="${SIZE}" height="${SIZE}"><ellipse cx="${SIZE/2}" cy="${SIZE-PAD*0.6}" rx="${SIZE*0.28}" ry="${SIZE*0.025}" fill="rgba(0,0,0,0.07)"/></svg>`)
  return sharp({ create: { width:SIZE, height:SIZE, channels:4, background:{r:248,g:248,b:248,alpha:255} } })
    .composite([{ input:resized, top:PAD, left:PAD }, { input:shadow, top:0, left:0 }])
    .jpeg({ quality:95 }).toBuffer()
}

async function saveResult(supabase: ReturnType<typeof createClient>, data: Buffer | string, uid: string, folder = 'studio'): Promise<string> {
  try {
    const sharp = (await import('sharp')).default
    let buf: Buffer
    if (typeof data === 'string') { const r = await fetch(data); buf = Buffer.from(await r.arrayBuffer()) }
    else buf = data
    const fn = `${folder}/${uid}/${Date.now()}.jpg`
    const processed = await sharp(buf).jpeg({ quality:93 }).toBuffer()
    await supabase.storage.from('card-images').upload(fn, processed, { contentType:'image/jpeg' })
    return supabase.storage.from('card-images').getPublicUrl(fn).data.publicUrl
  } catch { return typeof data === 'string' ? data : `data:image/jpeg;base64,${data.toString('base64')}` }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { style: rawStyle, displayStyle, productPhoto, productPhotoUrl, productName='', category='', wishes='', count=1, marketplace='general' } = await req.json()
    // Studio page sends displayStyle (from style selector) or photoStyle
    const style = displayStyle || rawStyle || 'catalog'
    console.log('Style received:', { rawStyle, displayStyle, resolvedStyle: style })
    if (!productName.trim()) return NextResponse.json({ error: 'Введіть назву товару' }, { status: 400 })

    let prodB64 = productPhoto || ''
    if (!prodB64 && productPhotoUrl) {
      try { const r = await fetch(productPhotoUrl); const buf = Buffer.from(await r.arrayBuffer()); prodB64 = `data:${r.headers.get('content-type')||'image/jpeg'};base64,${buf.toString('base64')}` } catch {}
    }
    if (!prodB64) return NextResponse.json({ error: 'Завантажте фото товару' }, { status: 400 })

    const qty = Math.min(Math.max(1, count), 4)
    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < COST * qty) return NextResponse.json({ error: `Недостатньо зорь (${COST*qty} ⭐)`, needStars:true, balance }, { status: 402 })

    const REPLICATE = process.env.REPLICATE_API_TOKEN
    const RMBG = process.env.REMOVE_BG_API_KEY
    const results: string[] = []

    if (style === 'catalog') {
      // Catalog: just remove bg + white background, no AI generation
      for (let i = 0; i < qty; i++) {
        try { const buf = await makeCatalogPhoto(prodB64, RMBG); results.push(await saveResult(supabase, buf, user.id)) }
        catch (e) { console.error('catalog:', e) }
      }
    } else if (REPLICATE) {
      // All other styles: Flux Kontext transforms scene preserving product
      const publicUrl = await uploadForReplicate(supabase, prodB64, user.id)
      if (!publicUrl) return NextResponse.json({ error: 'Помилка завантаження фото' }, { status: 500 })
      for (let i = 0; i < qty; i++) {
        try {
          const prompt = await buildFluxPrompt(prodB64, productName, category, style, wishes)
          const url = await runFluxKontext(publicUrl, prompt, REPLICATE)
          if (url) results.push(await saveResult(supabase, url, user.id))
        } catch (e) { console.error(`flux ${i}:`, e) }
      }
    } else {
      return NextResponse.json({ error: 'Для цього стилю потрібен REPLICATE_API_TOKEN у Vercel. Стиль "Каталог" доступний без нього.', needReplicate: true }, { status: 503 })
    }

    if (!results.length) return NextResponse.json({ error: 'Генерація не вдалась. Спробуйте ще раз.' }, { status: 500 })
    const spent = COST * results.length
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: spent })
    await supabase.from('star_transactions').insert({ user_id:user.id, type:'spend', amount:-spent, description:`AI Студія: ${productName.slice(0,35)} (${style} x${results.length})` })
    await supabase.from('studio_results').insert({ user_id:user.id, product_name:productName.slice(0,100), mode:style, urls:results, stars_spent:spent, settings:{style,count:results.length,marketplace} }).then(()=>{})
    return NextResponse.json({ results, starsSpent:spent, newBalance:balance-spent, count:results.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    console.error('Studio error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
