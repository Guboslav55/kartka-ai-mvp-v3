import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const COSTS = { photo: 4, card: 4, video: 16 } as const

const DISPLAY_STYLES = {
  model:   'Realistic lifestyle photo: professional model wearing/holding the product. Natural lighting, urban or studio background.',
  store:   'Professional store display: product on elegant mannequin or display stand. Clean retail environment, soft lighting.',
  flatlay: 'Overhead flat lay: product neatly arranged from directly above on clean surface. Minimalist composition.',
  catalog: 'Studio catalog photo: product on pure white background. Perfect studio lighting, no shadows, sharp details.',
}

const PHOTO_STYLES = {
  commercial: 'Commercial photography: perfect lighting, professional composition, vibrant colors, studio quality',
  home:       'Lifestyle photography: natural light, authentic environment, warm tones, relatable setting',
}

async function buildPhotoPrompt(
  productBase64: string, productName: string, category: string,
  displayStyle: string, wishes: string, photoStyle: string, format: string
): Promise<string> {
  const styleGuide = DISPLAY_STYLES[displayStyle as keyof typeof DISPLAY_STYLES] || DISPLAY_STYLES.catalog
  const photoGuide = PHOTO_STYLES[photoStyle as keyof typeof PHOTO_STYLES] || PHOTO_STYLES.commercial
  const aspectNote = format === '9:16' ? 'vertical portrait' : format === '16:9' ? 'horizontal landscape' : 'square format'

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: productBase64, detail: 'high' } },
        { type: 'text', text: `You are a professional product photographer. Analyze this product.
Product: "${productName}", Category: "${category}"
Create a detailed DALL-E 3 prompt for: ${styleGuide}
Photography style: ${photoGuide}
Format: ${aspectNote}
${wishes ? `Requirements: ${wishes}` : ''}
The product must be the main subject. NO text, NO labels, NO watermarks.
Return ONLY the prompt text, max 300 words.` }
      ]
    }],
    max_tokens: 400,
  })
  return res.choices[0]?.message?.content?.trim() || `Professional product photo of ${productName} on white background`
}

async function buildCardBgPrompt(
  productBase64: string, productName: string, bullets: string[],
  cardStyle: string, format: string
): Promise<string> {
  const styleNote = cardStyle === 'premium'
    ? 'Dark elegant premium design with gold accents, luxury feel, dark gradient background'
    : 'Clean modern commercial design with light background, space for product and text'
  const aspectNote = format === '9:16' ? '9:16 vertical' : format === '16:9' ? '16:9 horizontal' : format

  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: productBase64, detail: 'low' } },
        { type: 'text', text: `Create a DALL-E 3 background for a product infographic card.
Product: "${productName}", Benefits: ${bullets.slice(0,3).join(', ')}
Style: ${styleNote}, Format: ${aspectNote}
Background only — leave space for product image and text overlays.
CRITICAL: NO text, NO words, NO letters anywhere. Background design only.
Return ONLY the prompt, max 200 words.` }
      ]
    }],
    max_tokens: 300,
  })
  return res.choices[0]?.message?.content?.trim() || `Clean ${cardStyle === 'premium' ? 'dark premium' : 'white modern'} infographic background`
}

async function generateDalle(prompt: string, format: string): Promise<string | null> {
  const sizeMap: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
    '1:1': '1024x1024', '4:3': '1792x1024', '3:4': '1024x1792',
    '16:9': '1792x1024', '9:16': '1024x1792',
  }
  try {
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt: `${prompt}\n\nIMPORTANT: Absolutely NO text, letters, words, labels anywhere in the image.`,
      size: sizeMap[format] || '1024x1024',
      quality: 'hd', style: 'natural', n: 1,
    })
    return res.data[0]?.url ?? null
  } catch (e) { console.error('DALL-E error:', e); return null }
}

async function uploadUrl(supabase: ReturnType<typeof createClient>, url: string, userId: string): Promise<string> {
  try {
    const res = await fetch(url)
    const buf = Buffer.from(await res.arrayBuffer())
    const fileName = `studio/${userId}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('card-images').upload(fileName, buf, { contentType: 'image/jpeg' })
    if (error) return url
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl
  } catch { return url }
}

async function compositeCard(
  supabase: ReturnType<typeof createClient>,
  bgUrl: string, productBase64: string, productName: string,
  bullets: string[], userId: string, cardStyle: string
): Promise<string> {
  const sharp = (await import('sharp')).default
  const bgRes = await fetch(bgUrl)
  const bgBuf = Buffer.from(await bgRes.arrayBuffer())
  const match = productBase64.match(/^data:(image\/\w+);base64,(.+)$/s)
  if (!match) return bgUrl
  const prodBuf = Buffer.from(match[2], 'base64')
  const prodResized = await sharp(prodBuf).resize(420, 420, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer()
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const shortName = productName.slice(0, 45)
  const topBullets = bullets.slice(0, 3).map(b => b.replace(/^[•✓]\s*/,'').slice(0,40))
  const accent = cardStyle === 'premium' ? '#c9a84c' : '#6366f1'
  const textColor = cardStyle === 'premium' ? '#ffffff' : '#1a1a2e'
  const textBg = cardStyle === 'premium' ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.93)'
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
<rect x="0" y="0" width="6" height="1024" fill="${accent}"/>
<rect x="20" y="20" width="${Math.min(shortName.length*17+40,700)}" height="56" rx="10" fill="${textBg}"/>
<text x="40" y="58" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="${textColor}">${esc(shortName)}</text>
${topBullets.map((b,i)=>`<rect x="20" y="${880+i*42}" width="${Math.min(b.length*13+50,700)}" height="36" rx="6" fill="${textBg}"/><text x="50" y="${904+i*42}" font-family="Arial,sans-serif" font-size="19" fill="${textColor}">✓ ${esc(b)}</text>`).join('')}
<rect x="1018" y="0" width="6" height="1024" fill="${accent}"/>
</svg>`
  const finalBuf = await sharp(bgBuf)
    .composite([{ input: prodResized, top: 280, left: 302, blend: 'over' }, { input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 }).toBuffer()
  const fileName = `studio/${userId}/${Date.now()}-card.jpg`
  const { error } = await supabase.storage.from('card-images').upload(fileName, finalBuf, { contentType: 'image/jpeg' })
  if (error) return `data:image/jpeg;base64,${finalBuf.toString('base64')}`
  return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
      mode = 'photo',
      productPhoto,
      productName = '',
      category = '',
      displayStyle = 'catalog',
      wishes = '',
      photoStyle = 'commercial',
      cardStyle = 'classic',
      bullets = [],
      format = '1:1',
      count = 1,
    } = await req.json()

    if (!productName.trim()) return NextResponse.json({ error: "Назва товару обов'язкова" }, { status: 400 })
    if (!productPhoto) return NextResponse.json({ error: 'Завантажте фото товару' }, { status: 400 })
    if (mode === 'video') return NextResponse.json({ error: 'Відео-генерація буде доступна незабаром' }, { status: 400 })

    const cost = COSTS[mode as keyof typeof COSTS] || 4
    const qty = Math.min(count, 4)
    const totalCost = cost * qty

    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single()
    const balance = profile?.stars_balance ?? 0
    if (balance < totalCost) {
      return NextResponse.json({ error: `Недостатньо зорь (потрібно ${totalCost}, є ${balance})`, needStars: true, balance }, { status: 402 })
    }

    const results: string[] = []

    for (let i = 0; i < qty; i++) {
      if (mode === 'photo') {
        const prompt = await buildPhotoPrompt(productPhoto, productName, category, displayStyle, wishes, photoStyle, format)
        const url = await generateDalle(prompt + (i > 0 ? ` Variation ${i+1}, different angle or composition.` : ''), format)
        if (url) results.push(await uploadUrl(supabase, url, user.id))
      } else if (mode === 'card') {
        const bgPrompt = await buildCardBgPrompt(productPhoto, productName, bullets, cardStyle, format)
        const bgUrl = await generateDalle(bgPrompt, format)
        if (bgUrl) {
          const composited = await compositeCard(supabase, bgUrl, productPhoto, productName, bullets, user.id, cardStyle)
          results.push(composited)
        }
      }
    }

    if (results.length === 0) return NextResponse.json({ error: 'Не вдалось згенерувати. Спробуйте ще раз.' }, { status: 500 })

    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: totalCost })
    await supabase.from('star_transactions').insert({
      user_id: user.id, type: 'spend', amount: -totalCost,
      description: `AI Студія: ${productName.slice(0,30)} (${mode} ×${results.length})`
    })

    // Save results to gallery DB
    await supabase.from('studio_results').insert({
      user_id: user.id,
      product_name: productName.slice(0, 100),
      mode,
      urls: results,
      stars_spent: totalCost,
      settings: { displayStyle, photoStyle, cardStyle, format, count },
    }).then(() => {})

    return NextResponse.json({ results, starsSpent: totalCost, newBalance: balance - totalCost })
  } catch (err: unknown) {
    console.error('Studio error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка сервера' }, { status: 500 })
  }
}
