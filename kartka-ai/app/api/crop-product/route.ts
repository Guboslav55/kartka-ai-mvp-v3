import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { imageBase64 } = await req.json()
  if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

  try {
    const sharp = (await import('sharp')).default
    const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/s)
    if (!match) return NextResponse.json({ croppedBase64: imageBase64 })

    const buf = Buffer.from(match[2], 'base64')
    const meta = await sharp(buf).metadata()
    const { width = 0, height = 0 } = meta

    // Add padding and ensure square crop
    const size = Math.min(width, height)
    const left = Math.round((width - size) / 2)
    const top = Math.round((height - size) / 2)

    const cropped = await sharp(buf)
      .extract({ left, top, width: size, height: size })
      .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .jpeg({ quality: 92 })
      .toBuffer()

    return NextResponse.json({
      croppedBase64: `data:image/jpeg;base64,${cropped.toString('base64')}`
    })
  } catch (e: any) {
    // On error return original
    return NextResponse.json({ croppedBase64: imageBase64 })
  }
}
