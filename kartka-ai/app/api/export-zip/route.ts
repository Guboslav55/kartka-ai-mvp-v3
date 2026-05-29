import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  const { imageUrls = [], format = 'jpeg', quality = 90 } = await req.json()
  if (!imageUrls.length) return NextResponse.json({ error: 'Немає зображень' }, { status: 400 })

  const sharp = (await import('sharp')).default
  // @ts-ignore
  const JSZip = (await import('jszip')).default

  const zip = new JSZip()
  const folder = zip.folder('kartka-ai-export')!

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const r = await fetch(imageUrls[i])
      if (!r.ok) continue
      const buf = Buffer.from(await r.arrayBuffer())

      let processed: Buffer
      const ext = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg'

      if (format === 'png') {
        processed = await sharp(buf).png().toBuffer()
      } else if (format === 'webp') {
        processed = await sharp(buf).webp({ quality }).toBuffer()
      } else {
        processed = await sharp(buf).jpeg({ quality, mozjpeg: true }).toBuffer()
      }

      folder.file(`image-${i + 1}.${ext}`, processed)
    } catch (e) { console.warn('skip image', i, e) }
  }

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })

  return new NextResponse(zipBuf, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="kartka-ai-${new Date().toISOString().slice(0,10)}.zip"`,
      'Content-Length': String(zipBuf.length),
    }
  })
}
