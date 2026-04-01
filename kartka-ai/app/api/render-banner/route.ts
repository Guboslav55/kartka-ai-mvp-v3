import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

// ─────────────────────────────────────────────────────────────────────────────
// Category → visual identity map
// Each category gets: bg colors, accent, label text, optional layout hint
// ─────────────────────────────────────────────────────────────────────────────
interface CategoryStyle {
  bg1: string; bg2: string;
  accent: string; accentDim: string;
  panelBg: string;
  textColor: string; subColor: string;
  isDark: boolean;
  label: string;          // badge shown on banner, e.g. "ТАКТИКА"
  ctaLabel: string;       // CTA button text
  accentShape: 'circle' | 'diamond' | 'square' | 'none';
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  // ── Тактичне спорядження / армія ──────────────────────────────────────────
  'Тактичне спорядження': {
    bg1: '#0a0f08', bg2: '#141e0f',
    accent: '#5a8a3c', accentDim: '#3d6028',
    panelBg: '#0d1509',
    textColor: '#e8f0e0', subColor: '#8aa87a',
    isDark: true,
    label: 'ТАКТИКА',
    ctaLabel: 'ЗАМОВИТИ ЗАРАЗ',
    accentShape: 'square',
  },
  // ── Одяг та взуття ────────────────────────────────────────────────────────
  'Одяг та взуття': {
    bg1: '#080808', bg2: '#141414',
    accent: '#c8a84b', accentDim: '#8a7030',
    panelBg: '#0d0d0d',
    textColor: '#ffffff', subColor: '#999999',
    isDark: true,
    label: 'СТИЛЬ',
    ctaLabel: 'ОБРАТИ РОЗМІР',
    accentShape: 'diamond',
  },
  // ── Електроніка ──────────────────────────────────────────────────────────
  'Електроніка': {
    bg1: '#050b18', bg2: '#0a1628',
    accent: '#4a9eff', accentDim: '#1e5faa',
    panelBg: '#070e1d',
    textColor: '#e8f2ff', subColor: '#6699cc',
    isDark: true,
    label: 'ТЕХНОЛОГІЯ',
    ctaLabel: 'КУПИТИ ЗАРАЗ',
    accentShape: 'circle',
  },
  // ── Краса та здоров'я ────────────────────────────────────────────────────
  "Краса та здоров'я": {
    bg1: '#160a10', bg2: '#241018',
    accent: '#e87aa0', accentDim: '#a04060',
    panelBg: '#1a0c14',
    textColor: '#fce8f0', subColor: '#cc8899',
    isDark: true,
    label: 'КРАСА',
    ctaLabel: 'СПРОБУВАТИ',
    accentShape: 'circle',
  },
  // ── Спорт та хобі ────────────────────────────────────────────────────────
  'Спорт та хобі': {
    bg1: '#080d18', bg2: '#0e1828',
    accent: '#ff6b35', accentDim: '#aa4020',
    panelBg: '#0a1020',
    textColor: '#fff0e8', subColor: '#cc8866',
    isDark: true,
    label: 'СПОРТ',
    ctaLabel: 'ЗАМОВИТИ',
    accentShape: 'square',
  },
  // ── Дім та сад ───────────────────────────────────────────────────────────
  'Дім та сад': {
    bg1: '#080c08', bg2: '#101810',
    accent: '#6ab04c', accentDim: '#3d7830',
    panelBg: '#0a0e0a',
    textColor: '#f0f8e8', subColor: '#88aa77',
    isDark: true,
    label: 'ДІМ',
    ctaLabel: 'ЗАМОВИТИ',
    accentShape: 'circle',
  },
  // ── Авто та мото ─────────────────────────────────────────────────────────
  'Авто та мото': {
    bg1: '#0a0a0a', bg2: '#1a1a1a',
    accent: '#e0a020', accentDim: '#987010',
    panelBg: '#111111',
    textColor: '#f5f0e0', subColor: '#aa9966',
    isDark: true,
    label: 'АВТО',
    ctaLabel: 'ЗАМОВИТИ',
    accentShape: 'diamond',
  },
  // ── Іграшки ──────────────────────────────────────────────────────────────
  'Іграшки': {
    bg1: '#08080f', bg2: '#12122a',
    accent: '#8855ee', accentDim: '#5530aa',
    panelBg: '#0e0e22',
    textColor: '#f0e8ff', subColor: '#9977cc',
    isDark: true,
    label: 'ДЛЯ ДІТЕЙ',
    ctaLabel: 'ОБРАТИ',
    accentShape: 'circle',
  },
  // ── Fallback (Інше / не задано) ───────────────────────────────────────────
  'default': {
    bg1: '#0d0d0d', bg2: '#1a1a1a',
    accent: '#c8a84b', accentDim: '#8a7030',
    panelBg: '#111111',
    textColor: '#ffffff', subColor: '#aaaaaa',
    isDark: true,
    label: 'ТОВАР',
    ctaLabel: 'ЗАМОВИТИ ЗАРАЗ',
    accentShape: 'circle',
  },
};

// Legacy bgStyle overrides (keep backward compat with existing UI)
const LEGACY_BG_OVERRIDE: Record<string, Partial<CategoryStyle>> = {
  white: {
    bg1: '#f5f5f5', bg2: '#ffffff',
    accent: '#1a3a5c', accentDim: '#0d2040',
    panelBg: '#ffffff',
    textColor: '#1a1a1a', subColor: '#555555',
    isDark: false,
  },
  navy: {
    bg1: '#060e1a', bg2: '#0d1b2a',
    accent: '#4a9eff', accentDim: '#1e5faa',
    panelBg: '#080f1c',
    textColor: '#ffffff', subColor: '#8899bb',
    isDark: true,
  },
  gold: {
    bg1: '#0d0800', bg2: '#1a1000',
    accent: '#c8a84b', accentDim: '#8a7030',
    panelBg: '#100a00',
    textColor: '#f5e6c8', subColor: '#aa9966',
    isDark: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  buffer: Buffer,
  userId: string,
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

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function makeRect(w: number, h: number, rx: number, color: string, opacity = 1): Buffer {
  const [r, g, b] = hexToRgb(color);
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" rx="${rx}" fill="rgb(${r},${g},${b})" opacity="${opacity}"/>
    </svg>`,
  );
}

function makeDiamond(size: number, color: string): Buffer {
  const half = size / 2;
  const [r, g, b] = hexToRgb(color);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <polygon points="${half},2 ${size-2},${half} ${half},${size-2} 2,${half}"
        fill="rgb(${r},${g},${b})"/>
    </svg>`,
  );
}

function makeCircle(size: number, color: string, opacity = 1): Buffer {
  const [r, g, b] = hexToRgb(color);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-1}"
        fill="rgb(${r},${g},${b})" opacity="${opacity}"/>
    </svg>`,
  );
}

function gradientBg(w: number, h: number, c1: string, c2: string): Buffer {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c2}"/>
          <stop offset="100%" stop-color="${c1}"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
    </svg>`,
  );
}

// Text → SVG lines with proper encoding
function textToSvgBuffer(
  text: string,
  fontSize: number,
  color: string,
  maxWidth: number,
  bold = false,
  align: 'left' | 'center' = 'left',
): { svg: Buffer; height: number } {
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.58));
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > charsPerLine && current) {
      lines.push(current.trim());
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current);

  const lineH = Math.round(fontSize * 1.35);
  const h = lines.length * lineH + 4;
  const [r, g, b] = hexToRgb(color);

  const textEls = lines.map((line, i) => {
    const x = align === 'center' ? maxWidth / 2 : 0;
    const anchor = align === 'center' ? 'middle' : 'start';
    const safe = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<text x="${x}" y="${(i + 1) * lineH - 4}" text-anchor="${anchor}"
      font-family="DejaVu Sans, Liberation Sans, Arial Unicode MS, sans-serif"
      font-size="${fontSize}" font-weight="${bold ? 'bold' : 'normal'}"
      fill="rgb(${r},${g},${b})">${safe}</text>`;
  }).join('\n');

  return {
    svg: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${maxWidth}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  ${textEls}
</svg>`,
      'utf-8',
    ),
    height: h,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Category badge — small pill shown top-right on every banner
// ─────────────────────────────────────────────────────────────────────────────
async function makeCategoryBadge(label: string, accent: string, isDark: boolean): Promise<Buffer> {
  const padX = 20, padY = 8, fontSize = 13;
  const estW = label.length * (fontSize * 0.65) + padX * 2;
  const h = fontSize + padY * 2;

  const bgBuf = await sharp(makeRect(estW, h, h / 2, accent, 0.9)).png().toBuffer();
  const textColor = isDark ? '#000000' : '#ffffff';
  const { svg: tSvg } = textToSvgBuffer(label, fontSize, textColor, estW, true, 'center');
  const tBuf = await sharp(tSvg).png().toBuffer();

  return sharp(bgBuf).composite([{ input: tBuf, left: 0, top: padY - 2 }]).png().toBuffer();
}

// ─────────────────────────────────────────────────────────────────────────────
// Decorative accent shape — top-left corner identifier per category
// ─────────────────────────────────────────────────────────────────────────────
async function makeAccentDecor(
  shape: CategoryStyle['accentShape'],
  accent: string,
): Promise<sharp.OverlayOptions[]> {
  if (shape === 'none') return [];
  const size = 56;
  let buf: Buffer;

  if (shape === 'diamond') {
    buf = await sharp(makeDiamond(size, accent)).png().toBuffer();
  } else if (shape === 'square') {
    buf = await sharp(makeRect(size, size, 4, accent, 0.7)).png().toBuffer();
  } else {
    // circle (default)
    buf = await sharp(makeCircle(size, accent, 0.7)).png().toBuffer();
  }

  return [{ input: buf, left: 24, top: 24 }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Template builders
// ─────────────────────────────────────────────────────────────────────────────
async function buildBenefitsTemplate(
  C: CategoryStyle,
  productName: string,
  price: string,
  b: string[],
  W: number,
  H: number,
): Promise<sharp.OverlayOptions[]> {
  const composites: sharp.OverlayOptions[] = [];
  const px = 510, py = 50, pw = 490, ph = 924;

  // Panel
  composites.push({
    input: await sharp(makeRect(pw, ph, 20, C.panelBg, 0.90)).png().toBuffer(),
    left: px, top: py,
  });

  // Accent top bar (thicker for non-default categories)
  composites.push({
    input: await sharp(makeRect(pw, 6, 3, C.accent)).png().toBuffer(),
    left: px, top: py,
  });

  // Category label (small caps)
  const { svg: labelSvg } = textToSvgBuffer(C.label, 13, C.accent, pw - 40, true);
  composites.push({
    input: await sharp(labelSvg).png().toBuffer(),
    left: px + 24, top: py + 22,
  });

  // Product name
  const { svg: nameSvg, height: nameH } = textToSvgBuffer(productName || 'Товар', 26, C.textColor, pw - 40, true);
  composites.push({
    input: await sharp(nameSvg).png().toBuffer(),
    left: px + 24, top: py + 54,
  });

  // Divider
  composites.push({
    input: await sharp(
      Buffer.from(`<svg width="${pw - 40}" height="2" xmlns="http://www.w3.org/2000/svg">
        <rect width="${pw - 40}" height="2" fill="${C.accent}" opacity="0.35"/>
      </svg>`),
    ).png().toBuffer(),
    left: px + 20, top: py + 54 + nameH + 12,
  });

  // Bullets
  let bulletY = py + 54 + nameH + 32;
  for (let i = 0; i < b.length; i++) {
    // Accent marker — shape varies by category
    let markerBuf: Buffer;
    if (C.accentShape === 'diamond') {
      markerBuf = await sharp(makeDiamond(28, C.accent)).png().toBuffer();
    } else if (C.accentShape === 'square') {
      markerBuf = await sharp(makeRect(28, 28, 4, C.accent)).png().toBuffer();
    } else {
      // circle with checkmark
      const circleSvg = Buffer.from(
        `<svg width="28" height="28" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="14" r="13" fill="${C.accent}"/>
          <text x="14" y="19" text-anchor="middle"
            font-family="Arial,sans-serif" font-size="12" font-weight="bold"
            fill="${C.isDark ? '#000' : '#fff'}">✓</text>
        </svg>`,
      );
      markerBuf = await sharp(circleSvg).png().toBuffer();
    }
    composites.push({ input: markerBuf, left: px + 20, top: bulletY + 2 });

    const { svg: bullSvg, height: bullH } = textToSvgBuffer(b[i], 17, C.textColor, pw - 72, false);
    composites.push({
      input: await sharp(bullSvg).png().toBuffer(),
      left: px + 58, top: bulletY,
    });

    bulletY += Math.max(bullH, 32) + 24;

    if (i < b.length - 1) {
      composites.push({
        input: await sharp(
          Buffer.from(`<svg width="${pw - 40}" height="1" xmlns="http://www.w3.org/2000/svg">
            <rect width="${pw - 40}" height="1" fill="${C.isDark ? '#2a2a2a' : '#cccccc'}"/>
          </svg>`),
        ).png().toBuffer(),
        left: px + 20, top: bulletY,
      });
      bulletY += 16;
    }
  }

  // Price
  if (price) {
    composites.push({
      input: await sharp(makeRect(pw - 40, 68, 12, C.accent, 0.15)).png().toBuffer(),
      left: px + 20, top: py + ph - 90,
    });
    // Accent border on price box
    composites.push({
      input: await sharp(
        Buffer.from(`<svg width="${pw - 40}" height="68" xmlns="http://www.w3.org/2000/svg">
          <rect width="${pw - 40}" height="68" rx="12" fill="none"
            stroke="${C.accent}" stroke-width="1.5" opacity="0.5"/>
        </svg>`),
      ).png().toBuffer(),
      left: px + 20, top: py + ph - 90,
    });
    const { svg: priceSvg } = textToSvgBuffer(`${price} ₴`, 36, C.accent, pw - 40, true, 'center');
    composites.push({
      input: await sharp(priceSvg).png().toBuffer(),
      left: px + 20, top: py + ph - 82,
    });
  }

  return composites;
}

async function buildCalloutTemplate(
  C: CategoryStyle,
  productName: string,
  price: string,
  b: string[],
): Promise<sharp.OverlayOptions[]> {
  const composites: sharp.OverlayOptions[] = [];

  // Title bar
  composites.push({
    input: await sharp(makeRect(624, 52, 26, C.panelBg, 0.84)).png().toBuffer(),
    left: 100, top: 30,
  });
  const { svg: titleSvg } = textToSvgBuffer(productName || 'Товар', 20, C.accent, 600, true, 'center');
  composites.push({ input: await sharp(titleSvg).png().toBuffer(), left: 112, top: 40 });

  // Callout positions
  const callouts = [
    { bx: 40,  by: 155, text: b[0] || 'Висока якість' },
    { bx: 648, by: 200, text: b[1] || 'Ергономічний дизайн' },
    { bx: 620, by: 620, text: b[2] || 'Надійна конструкція' },
  ];

  for (const co of callouts) {
    const { svg: cSvg, height: cH } = textToSvgBuffer(co.text, 15, C.textColor, 190, false);
    composites.push({
      input: await sharp(makeRect(204, cH + 16, 8, C.panelBg, 0.92)).png().toBuffer(),
      left: co.bx, top: co.by,
    });
    // Accent left border
    composites.push({
      input: await sharp(makeRect(4, cH + 16, 2, C.accent)).png().toBuffer(),
      left: co.bx, top: co.by,
    });
    composites.push({ input: await sharp(cSvg).png().toBuffer(), left: co.bx + 12, top: co.by + 8 });
  }

  if (price) {
    composites.push({
      input: await sharp(makeRect(312, 64, 12, C.panelBg, 0.9)).png().toBuffer(),
      left: 356, top: 900,
    });
    const { svg: pSvg } = textToSvgBuffer(`${price} ₴`, 36, C.accent, 312, true, 'center');
    composites.push({ input: await sharp(pSvg).png().toBuffer(), left: 356, top: 908 });
  }

  return composites;
}

async function buildCtaTemplate(
  C: CategoryStyle,
  productName: string,
  price: string,
  b: string[],
): Promise<sharp.OverlayOptions[]> {
  const composites: sharp.OverlayOptions[] = [];

  // "НОВА КОЛЕКЦІЯ" category badge variant
  const { svg: badgeSvg } = textToSvgBuffer(C.label, 13, C.accent, 300, true);
  composites.push({ input: await sharp(badgeSvg).png().toBuffer(), left: 440, top: 140 });

  const { svg: nameSvg } = textToSvgBuffer(productName || 'Товар', 30, C.textColor, 540, true);
  composites.push({ input: await sharp(nameSvg).png().toBuffer(), left: 440, top: 180 });

  let bulletY = 320;
  for (const bull of b) {
    const { svg: bSvg, height: bH } = textToSvgBuffer(`✓  ${bull}`, 16, C.subColor, 540, false);
    composites.push({ input: await sharp(bSvg).png().toBuffer(), left: 440, top: bulletY });
    bulletY += bH + 16;
  }

  if (price) {
    const { svg: pSvg } = textToSvgBuffer(`${price} ₴`, 52, C.accent, 540, true);
    composites.push({ input: await sharp(pSvg).png().toBuffer(), left: 440, top: 510 });
  }

  // CTA button
  const btnTop = price ? 590 : 510;
  composites.push({
    input: await sharp(makeRect(360, 64, 14, C.accent)).png().toBuffer(),
    left: 440, top: btnTop,
  });
  const { svg: ctaSvg } = textToSvgBuffer(C.ctaLabel, 20, C.isDark ? '#000000' : '#ffffff', 360, true, 'center');
  composites.push({ input: await sharp(ctaSvg).png().toBuffer(), left: 440, top: btnTop + 10 });

  const { svg: delSvg } = textToSvgBuffer('Доставка по всій Україні', 14, C.subColor, 360, false, 'center');
  composites.push({ input: await sharp(delSvg).png().toBuffer(), left: 440, top: btnTop + 78 });

  return composites;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      productName,
      price,
      bullets,
      bgStyle = 'dark',
      template = 'benefits',
      productB64,
      category = '',          // ← NEW: passed from frontend after analyze
    } = await req.json();

    const W = 1024, H = 1024;
    const b = (bullets as string[])
      .filter((x: string) => x.trim())
      .slice(0, 3)
      .map((x: string) => x.replace(/^[✓•]\s*/, '').trim());

    // ── Resolve style: category first, then legacy bgStyle override ──────────
    const baseStyle: CategoryStyle = CATEGORY_STYLES[category] ?? CATEGORY_STYLES['default'];
    const legacyOverride = bgStyle !== 'dark' ? (LEGACY_BG_OVERRIDE[bgStyle] ?? {}) : {};
    const C: CategoryStyle = { ...baseStyle, ...legacyOverride };

    // ── Build composites ─────────────────────────────────────────────────────
    const composites: sharp.OverlayOptions[] = [];

    // 1. Product photo
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

    // 2. Subtle corner decor — category shape top-left (behind photo)
    const decorItems = await makeAccentDecor(C.accentShape, C.accentDim);
    composites.push(...decorItems);

    // 3. Template-specific content
    let templateComposites: sharp.OverlayOptions[];
    if (template === 'benefits') {
      templateComposites = await buildBenefitsTemplate(C, productName, price, b, W, H);
    } else if (template === 'callout') {
      templateComposites = await buildCalloutTemplate(C, productName, price, b);
    } else {
      templateComposites = await buildCtaTemplate(C, productName, price, b);
    }
    composites.push(...templateComposites);

    // 4. Category badge — top-right corner
    const badgeBuf = await makeCategoryBadge(C.label, C.accent, C.isDark);
    const badgeLeft = W - badgeBuf.length > 0 ? W - 160 : W - 140; // approx right align
    composites.push({ input: badgeBuf, left: W - 160, top: 28 });

    // ── Render ───────────────────────────────────────────────────────────────
    const bgBuf = await sharp(gradientBg(W, H, C.bg1, C.bg2)).png().toBuffer();
    const jpgBuffer = await sharp(bgBuf)
      .composite(composites)
      .jpeg({ quality: 93 })
      .toBuffer();

    const permanent = await uploadToStorage(supabase, jpgBuffer, user.id);
    const b64Out = jpgBuffer.toString('base64');

    return NextResponse.json({
      imageUrl: permanent ?? `data:image/jpeg;base64,${b64Out}`,
      imageB64: `data:image/jpeg;base64,${b64Out}`,
      detectedCategory: category || 'default',
      appliedStyle: C.label,
    });

  } catch (err: unknown) {
    console.error('Render banner error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка рендерингу' },
      { status: 500 },
    );
  }
}

