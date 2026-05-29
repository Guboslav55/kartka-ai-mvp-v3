import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Download image with format and size conversion
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl, format = 'jpeg', width, height, quality = 90 } = await req.json()
  if (!imageUrl) return NextResponse.json({ error: 'Потрібен URL зображення' }, { status: 400 })

  // Fetch original image
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) return NextResponse.json({ error: 'Не вдалось завантажити зображення' }, { status: 500 })
  const buf = Buffer.from(await imgRes.arrayBuffer())

  // Process with sharp
  const sharp = (await import('sharp')).default
  let pipeline = sharp(buf)

  // Resize if specified
  if (width || height) {
    pipeline = pipeline.resize(width || null, height || null, { fit: 'inside', withoutEnlargement: true })
  }

  // Convert format
  let outputBuf: Buffer
  let mimeType: string
  let ext: string

  if (format === 'png') {
    outputBuf = await pipeline.png({ compressionLevel: 9 }).toBuffer()
    mimeType = 'image/png'; ext = 'png'
  } else if (format === 'webp') {
    outputBuf = await pipeline.webp({ quality }).toBuffer()
    mimeType = 'image/webp'; ext = 'webp'
  } else {
    outputBuf = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
    mimeType = 'image/jpeg'; ext = 'jpg'
  }

  // Add watermark for free users
  if (isFree) {
    try {
      const meta = await sharp(outputBuf).metadata()
      const w = meta.width || 800
      const h = meta.height || 800
      const fontSize = Math.round(w * 0.025)
      const watermark = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <text x="${w-10}" y="${h-10}" text-anchor="end" font-family="Arial" font-size="${fontSize}" fill="rgba(255,255,255,0.5)" font-weight="bold">КарткаАІ</text>
      </svg>`)
      outputBuf = await sharp(outputBuf).composite([{ input: watermark, gravity: 'southeast' }]).jpeg({ quality }).toBuffer()
    } catch {}
  }

  // Add watermark for free users
  if (isFree) {
    try {
      const meta = await sharp(outputBuf).metadata()
      const w = meta.width || 800
      const h = meta.height || 800
      const fontSize = Math.round(w * 0.025)
      const watermark = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <text x="${w-10}" y="${h-10}" text-anchor="end" font-family="Arial" font-size="${fontSize}" fill="rgba(255,255,255,0.5)" font-weight="bold">КарткаАІ</text>
      </svg>`)
      outputBuf = await sharp(outputBuf).composite([{ input: watermark, gravity: 'southeast' }]).jpeg({ quality }).toBuffer()
    } catch {}
  }

  return new NextResponse(outputBuf, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="kartka-${Date.now()}.${ext}"`,
      'Content-Length': String(outputBuf.length),
    }
  })
}
