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

  // Process all images
  const files: { name: string; data: Buffer }[] = []

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

      files.push({ name: `image-${String(i + 1).padStart(2, '0')}.${ext}`, data: processed })
    } catch (e) { console.warn('skip image', i, e) }
  }

  if (!files.length) return NextResponse.json({ error: 'Не вдалось обробити зображення' }, { status: 500 })

  // Build minimal ZIP file manually (using Node.js zlib)
  const { deflateRawSync } = await import('zlib')

  const buildZip = (entries: { name: string; data: Buffer }[]): Buffer => {
    const parts: Buffer[] = []
    const centralDir: Buffer[] = []
    let offset = 0

    for (const entry of entries) {
      const nameBytes = Buffer.from(entry.name, 'utf8')
      const compressed = deflateRawSync(entry.data, { level: 6 })
      const crc = crc32(entry.data)

      // Local file header
      const localHeader = Buffer.alloc(30 + nameBytes.length)
      localHeader.writeUInt32LE(0x04034b50, 0) // signature
      localHeader.writeUInt16LE(20, 4)          // version needed
      localHeader.writeUInt16LE(0, 6)           // flags
      localHeader.writeUInt16LE(8, 8)           // compression: deflate
      localHeader.writeUInt16LE(0, 10)          // mod time
      localHeader.writeUInt16LE(0, 12)          // mod date
      localHeader.writeUInt32LE(crc, 14)        // crc32
      localHeader.writeUInt32LE(compressed.length, 18) // compressed size
      localHeader.writeUInt32LE(entry.data.length, 22) // uncompressed size
      localHeader.writeUInt16LE(nameBytes.length, 26)  // name length
      localHeader.writeUInt16LE(0, 28)          // extra length
      nameBytes.copy(localHeader, 30)

      parts.push(localHeader, compressed)

      // Central directory entry
      const cdEntry = Buffer.alloc(46 + nameBytes.length)
      cdEntry.writeUInt32LE(0x02014b50, 0)  // signature
      cdEntry.writeUInt16LE(20, 4)           // version made by
      cdEntry.writeUInt16LE(20, 6)           // version needed
      cdEntry.writeUInt16LE(0, 8)            // flags
      cdEntry.writeUInt16LE(8, 10)           // compression
      cdEntry.writeUInt16LE(0, 12)           // mod time
      cdEntry.writeUInt16LE(0, 14)           // mod date
      cdEntry.writeUInt32LE(crc, 16)         // crc32
      cdEntry.writeUInt32LE(compressed.length, 20)   // compressed size
      cdEntry.writeUInt32LE(entry.data.length, 24)   // uncompressed size
      cdEntry.writeUInt16LE(nameBytes.length, 28)    // name length
      cdEntry.writeUInt16LE(0, 30)           // extra length
      cdEntry.writeUInt16LE(0, 32)           // comment length
      cdEntry.writeUInt16LE(0, 34)           // disk start
      cdEntry.writeUInt16LE(0, 36)           // int attrs
      cdEntry.writeUInt32LE(0, 38)           // ext attrs
      cdEntry.writeUInt32LE(offset, 42)      // local header offset
      nameBytes.copy(cdEntry, 46)

      centralDir.push(cdEntry)
      offset += localHeader.length + compressed.length
    }

    const cdBuffer = Buffer.concat(centralDir)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)         // signature
    eocd.writeUInt16LE(0, 4)                  // disk number
    eocd.writeUInt16LE(0, 6)                  // disk with cd
    eocd.writeUInt16LE(entries.length, 8)     // entries on disk
    eocd.writeUInt16LE(entries.length, 10)    // total entries
    eocd.writeUInt32LE(cdBuffer.length, 12)   // cd size
    eocd.writeUInt32LE(offset, 16)            // cd offset
    eocd.writeUInt16LE(0, 20)                 // comment length

    return Buffer.concat([...parts, cdBuffer, eocd])
  }

  const crc32 = (buf: Buffer): number => {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      table[i] = c
    }
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
  }

  const zipBuf = buildZip(files)
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(zipBuf, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="kartka-ai-${date}.zip"`,
      'Content-Length': String(zipBuf.length),
    }
  })
}
