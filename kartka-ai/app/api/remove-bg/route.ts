import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { imageBase64 } = await req.json()
  if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

  const REMOVE_BG_KEY = process.env.REMOVE_BG_API_KEY
  if (!REMOVE_BG_KEY) {
    return NextResponse.json({ imageBase64, skipped: true, reason: 'No REMOVE_BG_API_KEY' })
  }

  try {
    const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/s)
    if (!match) return NextResponse.json({ imageBase64 })

    const imgBuf = Buffer.from(match[2], 'base64')

    // Call Remove.bg
    const formData = new FormData()
    formData.append('image_file', new Blob([imgBuf], { type: match[1] }), 'image.jpg')
    formData.append('size', 'auto')

    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': REMOVE_BG_KEY },
      body: formData,
    })

    if (!res.ok) {
      const err = await res.text()
      console.warn('Remove.bg error:', res.status, err)
      return NextResponse.json({ imageBase64 }) // return original
    }

    const result = await res.arrayBuffer()
    const base64 = Buffer.from(result).toString('base64')

    return NextResponse.json({ imageBase64: `data:image/png;base64,${base64}` })
  } catch (e: any) {
    console.warn('Remove.bg error:', e.message)
    return NextResponse.json({ imageBase64 }) // return original
  }
}
