import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  buffer: Buffer,
  userId: string
): Promise<string | null> {
  try {
    const fileName = `banners/${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (error) { console.warn('Storage error:', error.message); return null; }
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch (e) { console.warn('Upload failed:', e); return null; }
}

const BG_COLORS: Record<string, {
  bg1: string; bg2: string; accent: string;
  panelBg: string; textColor: string; subColor: string; isDark: boolean;
}> = {
  dark:  { bg1: '#0d0d0d', bg2: '#1a1a1a', accent: '#c8a84b', panelBg: '#111111', textColor: '#ffffff', subColor: '#aaaaaa', isDark: true },
  white: { bg1: '#f5f5f5', bg2: '#ffffff', accent: '#1a3a5c', panelBg: '#ffffff', textColor: '#1a1a1a', subColor: '#555555', isDark: false },
  navy:  { bg1: '#060e1a', bg2: '#0d1b2a', accent: '#4a9eff', panelBg: '#080f1c', textColor: '#ffffff', subColor: '#8899bb', isDark: true },
  gold:  { bg1: '#0d0800', bg2: '#1a1000', accent: '#c8a84b', panelBg: '#100a00', textColor: '#f5e6c8', subColor: '#aa9966', isDark: true },
};

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function makeRect(x: number, y: number, w: number, h: number, r: number, color: string, opacity = 1): Buffer {
  const [cr, cg, cb] = hexToRgb(color);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" rx="${r}" fill="rgb(${cr},${cg},${cb})" opacity="${opacity}"/>
  </svg>`;
  return Buffer.from(svg);
}

// Build text as SVG with latin fallback encoding trick
// We use a data URI with the SVG and embed cyrillic via XML entities
function textToSvgBuffer(
  text: string, fontSize: number, color: string,
  maxWidth: number, bold = false, align: 'left'|'center' = 'left'
): { svg: Buffer; height: number } {
  // Split text into lines
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.6));
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > charsPerLine && current) {
      lines.push(current.trim()); current = w;
    } else current = (current + ' ' + w).trim();
  }
  if (current) lines.push(current);
  const lineH = Math.round(fontSize * 1.35);
  const h = lines.length * lineH + 4;
  const [r, g, b] = hexToRgb(color);

  const textEls = lines.map((line, i) => {
    const x = align === 'center' ? maxWidth / 2 : 0;
    const anchor = align === 'center' ? 'middle' : 'start';
    // Escape XML
    const safe = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<text x="${x}" y="${(i+1)*lineH - 4}" text-anchor="${anchor}"
      font-family="DejaVu Sans, Liberation Sans, Arial Unicode MS, sans-serif"
      font-size="${fontSize}" font-weight="${bold?'bold':'normal'}"
      fill="rgb(${r},${g},${b})">${safe}</text>`;
  }).join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${maxWidth}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  ${textEls}
</svg>`;
  return { svg: Buffer.from(svg, 'utf-8'), height: h };
}

function gradientBg(w: number, h: number, c1: string, c2: string): Buffer {
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="${c1}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
  </svg>`;
  return Buffer.from(svg);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { productName, price, bullets, bgStyle = 'dark', template = 'benefits', productB64 } = await req.json();

    const C = BG_COLORS[bgStyle] ?? BG_COLORS.dark;
    const W = 1024, H = 1024;
    const b = (bullets as string[]).filter((x: string) => x.trim()).slice(0, 3)
      .map((x: string) => x.replace(/^[✓•]\s*/, '').trim());

    // ── Step 1: Background ──
    let canvas = sharp(gradientBg(W, H, C.bg1, C.bg2))
      .jpeg({ quality: 92 });

    const composites: sharp.OverlayOptions[] = [];

    // ── Step 2: Product photo ──
    if (productB64) {
      const b64data = productB64.replace(/^data:image\/\w+;base64,/, '');
      const photoBuf = Buffer.from(b64data, 'base64');

      let photoX: number, photoY: number, photoSize: number;
      if (template === 'benefits') { photoX = 20; photoY = 60; photoSize = 480; }
      else if (template === 'callout') { photoX = 162; photoY = 130; photoSize = 500; }
      else { photoX = 20; photoY = 100; photoSize = 380; }

      const resizedPhoto = await sharp(photoBuf)
        .resize(photoSize, photoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      composites.push({ input: resizedPhoto, left: photoX, top: photoY });
    }

    if (template === 'benefits') {
      const px = 510, py = 50, pw = 490, ph = 924;

      // Panel background
      const panelBuf = await sharp(makeRect(0, 0, pw, ph, 20, C.panelBg, 0.88))
        .png().toBuffer();
      composites.push({ input: panelBuf, left: px, top: py });

      // Accent top bar
      const accentBar = await sharp(makeRect(0, 0, pw, 5, 3, C.accent))
        .png().toBuffer();
      composites.push({ input: accentBar, left: px, top: py });

      // Label "ПЕРЕВАГИ"
      const { svg: labelSvg } = textToSvgBuffer('ПЕРЕВАГИ', 13, C.accent, pw - 40, true);
      const labelBuf = await sharp(labelSvg).png().toBuffer();
      composites.push({ input: labelBuf, left: px + 24, top: py + 20 });

      // Product name
      const { svg: nameSvg, height: nameH } = textToSvgBuffer(productName || 'Товар', 26, C.textColor, pw - 40, true);
      const nameBuf = await sharp(nameSvg).png().toBuffer();
      composites.push({ input: nameBuf, left: px + 24, top: py + 52 });

      // Divider
      const divSvg = Buffer.from(`<svg width="${pw-40}" height="2" xmlns="http://www.w3.org/2000/svg"><rect width="${pw-40}" height="2" fill="${C.accent}" opacity="0.4"/></svg>`);
      const divBuf = await sharp(divSvg).png().toBuffer();
      composites.push({ input: divBuf, left: px + 20, top: py + 52 + nameH + 10 });

      // Bullets
      let bulletY = py + 52 + nameH + 30;
      for (let i = 0; i < b.length; i++) {
        // Check circle
        const circleSvg = Buffer.from(`<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="14" fill="${C.accent}"/>
          <text x="16" y="21" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="${C.isDark?'#000':'#fff'}">✓</text>
        </svg>`);
        const circleBuf = await sharp(circleSvg).png().toBuffer();
        composites.push({ input: circleBuf, left: px + 20, top: bulletY });

        // Bullet text
        const { svg: bullSvg, height: bullH } = textToSvgBuffer(b[i], 17, C.textColor, pw - 80, false);
        const bullBuf = await sharp(bullSvg).png().toBuffer();
        composites.push({ input: bullBuf, left: px + 62, top: bulletY });

        bulletY += Math.max(bullH, 32) + 24;

        // Separator
        if (i < b.length - 1) {
          const sepSvg = Buffer.from(`<svg width="${pw-40}" height="1" xmlns="http://www.w3.org/2000/svg"><rect width="${pw-40}" height="1" fill="${C.isDark?'#333':'#ccc'}"/></svg>`);
          const sepBuf = await sharp(sepSvg).png().toBuffer();
          composites.push({ input: sepBuf, left: px + 20, top: bulletY });
          bulletY += 16;
        }
      }

      // Price
      if (price) {
        const priceBoxBuf = await sharp(makeRect(0, 0, pw - 40, 68, 12, C.accent, 0.15))
          .png().toBuffer();
        composites.push({ input: priceBoxBuf, left: px + 20, top: py + ph - 90 });

        const { svg: priceSvg } = textToSvgBuffer(`${price} ₴`, 36, C.accent, pw - 40, true, 'center');
        const priceBuf = await sharp(priceSvg).png().toBuffer();
        composites.push({ input: priceBuf, left: px + 20, top: py + ph - 82 });
      }

    } else if (template === 'callout') {
      // Title bar
      const titleBarBuf = await sharp(makeRect(0, 0, 624, 52, 26, C.panelBg, 0.82))
        .png().toBuffer();
      composites.push({ input: titleBarBuf, left: 100, top: 30 });

      const { svg: titleSvg } = textToSvgBuffer(productName || 'Товар', 22, C.accent, 600, true, 'center');
      const titleBuf = await sharp(titleSvg).png().toBuffer();
      composites.push({ input: titleBuf, left: 112, top: 40 });

      // Callouts
      const callouts = [
        { bx: 40,  by: 155, text: b[0] || 'Висока якість' },
        { bx: 648, by: 200, text: b[1] || 'Ергономічний дизайн' },
        { bx: 620, by: 620, text: b[2] || 'Надійна конструкція' },
      ].slice(0, Math.max(b.length, 2));

      for (const c of callouts) {
        const { svg: cSvg, height: cH } = textToSvgBuffer(c.text, 15, C.textColor, 190, false);
        const cBoxBuf = await sharp(makeRect(0, 0, 204, cH + 16, 8, C.panelBg, 0.9))
          .png().toBuffer();
        composites.push({ input: cBoxBuf, left: c.bx, top: c.by });
        const accentLineBuf = await sharp(makeRect(0, 0, 4, cH + 16, 2, C.accent))
          .png().toBuffer();
        composites.push({ input: accentLineBuf, left: c.bx, top: c.by });
        const cTextBuf = await sharp(cSvg).png().toBuffer();
        composites.push({ input: cTextBuf, left: c.bx + 12, top: c.by + 8 });
      }

      if (price) {
        const pBoxBuf = await sharp(makeRect(0, 0, 312, 64, 12, C.panelBg, 0.9))
          .png().toBuffer();
        composites.push({ input: pBoxBuf, left: 356, top: 900 });
        const { svg: pSvg } = textToSvgBuffer(`${price} ₴`, 36, C.accent, 312, true, 'center');
        const pBuf = await sharp(pSvg).png().toBuffer();
        composites.push({ input: pBuf, left: 356, top: 908 });
      }

    } else {
      // CTA template
      const { svg: nameSvg } = textToSvgBuffer(productName || 'Товар', 30, C.textColor, 540, true);
      const nameBuf = await sharp(nameSvg).png().toBuffer();
      composites.push({ input: nameBuf, left: 440, top: 180 });

      let bulletY = 320;
      for (const bull of b) {
        const { svg: bSvg, height: bH } = textToSvgBuffer(`✓  ${bull}`, 16, C.subColor, 540, false);
        const bBuf = await sharp(bSvg).png().toBuffer();
        composites.push({ input: bBuf, left: 440, top: bulletY });
        bulletY += bH + 16;
      }

      if (price) {
        const { svg: pSvg } = textToSvgBuffer(`${price} ₴`, 52, C.accent, 540, true);
        const pBuf = await sharp(pSvg).png().toBuffer();
        composites.push({ input: pBuf, left: 440, top: 510 });
      }

      // CTA button
      const btnBuf = await sharp(makeRect(0, 0, 360, 64, 14, C.accent))
        .png().toBuffer();
      composites.push({ input: btnBuf, left: 440, top: price ? 590 : 510 });
      const { svg: ctaSvg } = textToSvgBuffer('ЗАМОВИТИ ЗАРАЗ', 20, C.isDark ? '#000000' : '#ffffff', 360, true, 'center');
      const ctaBuf = await sharp(ctaSvg).png().toBuffer();
      composites.push({ input: ctaBuf, left: 440, top: price ? 600 : 520 });

      const { svg: delSvg } = textToSvgBuffer('Доставка по всій Україні', 14, C.subColor, 360, false, 'center');
      const delBuf = await sharp(delSvg).png().toBuffer();
      composites.push({ input: delBuf, left: 440, top: price ? 668 : 590 });
    }

    // ── Render final image ──
    const bgBuf = await sharp(gradientBg(W, H, C.bg1, C.bg2)).png().toBuffer();
    const jpgBuffer = await sharp(bgBuf)
      .composite(composites)
      .jpeg({ quality: 92 })
      .toBuffer();

    const permanent = await uploadToStorage(supabase, jpgBuffer, user.id);

    // Always return base64 so client can download directly (no new tab)
    const b64Out = jpgBuffer.toString('base64');
    return NextResponse.json({
      imageUrl: permanent ?? `data:image/jpeg;base64,${b64Out}`,
      imageB64: `data:image/jpeg;base64,${b64Out}`,
    });

  } catch (err: unknown) {
    console.error('Render banner error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Помилка рендерингу'
    }, { status: 500 });
  }
}
