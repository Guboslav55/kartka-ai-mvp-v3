import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Load fonts from public/fonts/ ─────────────────────────────────────────
function loadFont(filename: string): string {
  try {
    const fontPath = path.join(process.cwd(), 'public', 'fonts', filename);
    return fs.readFileSync(fontPath).toString('base64');
  } catch {
    return '';
  }
}

// ── Upload to Supabase Storage ─────────────────────────────────────────────
async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  buf: Buffer,
  userId: string,
  idx: number,
): Promise<string> {
  try {
    const fileName = `infographics/${userId}/${Date.now()}-v${idx}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${buf.toString('base64')}`;
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
}

// ── Step 1: GPT-4o → 3 background prompts ─────────────────────────────────
async function buildBackgroundPrompts(
  imageBase64: string,
  productName: string,
  bullets: string[],
  category: string,
): Promise<{ v1: string; v2: string; v3: string }> {
  const bulletText = bullets.slice(0, 4).join(', ');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: imageBase64.startsWith('data:')
              ? imageBase64
              : `data:image/jpeg;base64,${imageBase64}`,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: `You are a professional product photography art director.
Analyze this product and create 3 DIFFERENT background-only prompts for DALL-E 3.

Product: "${productName}"
Category: ${category}
Key features: ${bulletText}

VARIANT 1 — LIFESTYLE SCENE:
A realistic environment where this product is used.
Dramatic lighting, atmosphere matching the product category.
NO text, NO product, NO people — just the environment/scene.

VARIANT 2 — STUDIO GRADIENT:
Clean professional studio. Soft gradient matching product colors.
Subtle texture, premium feel, soft shadow on floor.
NO text, NO product.

VARIANT 3 — DYNAMIC GRAPHIC:
Bold geometric shapes, color blocks complementing the product.
Modern, energetic, abstract. Marketplace-ready.
NO text, NO product.

CRITICAL FOR ALL 3:
- Absolutely NO text, NO letters, NO words anywhere in the image
- NO product visible — pure background only
- Center area should be slightly less busy (product placed there later)
- Square 1024x1024 format
- High quality photorealistic or semi-realistic rendering

Respond ONLY with JSON:
{
  "v1": "DALL-E prompt for lifestyle background...",
  "v2": "DALL-E prompt for studio gradient background...",
  "v3": "DALL-E prompt for dynamic graphic background..."
}`,
        },
      ],
    }],
    max_tokens: 700,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(raw);
    return {
      v1: parsed.v1 || '',
      v2: parsed.v2 || '',
      v3: parsed.v3 || '',
    };
  } catch {
    return { v1: '', v2: '', v3: '' };
  }
}

// ── Step 2: Generate background via DALL-E ─────────────────────────────────
async function generateBackground(prompt: string): Promise<Buffer | null> {
  try {
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt + '\n\nCRITICAL: Absolutely NO text, NO letters, NO words anywhere. Pure background only. Square format.',
      size: '1024x1024',
      quality: 'hd',
      style: 'vivid',
      n: 1,
      response_format: 'b64_json',
    });
    const b64 = res.data[0]?.b64_json;
    if (!b64) return null;
    return Buffer.from(b64, 'base64');
  } catch (e) {
    console.error('Background generation failed:', e);
    return null;
  }
}

// ── Step 3: Composite product + background + text via sharp ────────────────
async function compositeCard(
  backgroundBuf: Buffer,
  productBase64: string,
  productName: string,
  bullets: string[],
  variantStyle: 'lifestyle' | 'studio' | 'dynamic',
): Promise<Buffer> {
  const SIZE = 1024;

  // Resize background to 1024x1024
  const bg = await sharp(backgroundBuf)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .toBuffer();

  // Decode product image (bg already removed by remove-bg pipeline)
  const rawProduct = productBase64.startsWith('data:')
    ? Buffer.from(productBase64.split(',')[1], 'base64')
    : Buffer.from(productBase64, 'base64');

  // Resize product — 54% of card width, preserve transparency
  const productSize = Math.round(SIZE * 0.54);
  const productBuf = await sharp(rawProduct)
    .resize(productSize, productSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const productLeft = Math.round((SIZE - productSize) / 2);
  const productTop  = Math.round(SIZE * 0.18);

  // Load DejaVu fonts (support Cyrillic)
  const fontBoldB64    = loadFont('DejaVuSans-Bold.ttf');
  const fontRegularB64 = loadFont('DejaVuSans.ttf');

  const fontFace = fontBoldB64
    ? `<style>
        @font-face {
          font-family: 'DVS';
          src: url('data:font/truetype;base64,${fontBoldB64}');
          font-weight: bold;
        }
        @font-face {
          font-family: 'DVS';
          src: url('data:font/truetype;base64,${fontRegularB64}');
          font-weight: normal;
        }
      </style>`
    : '';

  const fontFamily = fontBoldB64 ? 'DVS' : 'sans-serif';

  // Color schemes per variant
  const schemes = {
    lifestyle: {
      accent:   '#FFD700',
      headerBg: 'rgba(0,0,0,0.75)',
      pillBg:   'rgba(0,0,0,0.62)',
      text:     '#FFFFFF',
    },
    studio: {
      accent:   '#4FC3F7',
      headerBg: 'rgba(8,18,40,0.86)',
      pillBg:   'rgba(8,18,40,0.70)',
      text:     '#FFFFFF',
    },
    dynamic: {
      accent:   '#FF6B35',
      headerBg: 'rgba(20,8,0,0.82)',
      pillBg:   'rgba(20,8,0,0.66)',
      text:     '#FFFFFF',
    },
  };
  const s = schemes[variantStyle];

  // Truncate product name
  const shortName = productName.length > 40
    ? productName.substring(0, 37) + '...'
    : productName;

  // Bullet pills
  const topBullets  = bullets.slice(0, 3);
  const pillH       = 48;
  const pillGap     = 10;
  const totalPillsH = topBullets.length * (pillH + pillGap);
  const pillsStartY = SIZE - 24 - totalPillsH;

  const bulletsSvg = topBullets.map((b, i) => {
    const text = b.length > 42 ? b.substring(0, 39) + '...' : b;
    const y    = pillsStartY + i * (pillH + pillGap);
    return `
      <rect x="24" y="${y}" width="${SIZE - 48}" height="${pillH}" rx="12" fill="${s.pillBg}"/>
      <rect x="24" y="${y}" width="6" height="${pillH}" rx="3" fill="${s.accent}"/>
      <text x="46" y="${y + 32}"
        font-family="${fontFamily}" font-size="21" font-weight="normal" fill="${s.text}">✓ ${text}</text>
    `;
  }).join('');

  const svgOverlay = `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>${fontFace}</defs>

    <!-- Header bar -->
    <rect x="0" y="0" width="${SIZE}" height="92" fill="${s.headerBg}"/>

    <!-- Product name centered -->
    <text x="${SIZE / 2}" y="60"
      font-family="${fontFamily}" font-size="27" font-weight="bold"
      fill="${s.text}" text-anchor="middle">${shortName}</text>

    <!-- Accent line under header -->
    <rect x="0" y="92" width="${SIZE}" height="5" fill="${s.accent}"/>

    <!-- Bullet pills at bottom -->
    ${bulletsSvg}

    <!-- Bottom accent bar -->
    <rect x="0" y="${SIZE - 7}" width="${SIZE}" height="7" fill="${s.accent}"/>
  </svg>`;

  const svgBuf = Buffer.from(svgOverlay);

  // Final composite: bg → product (transparent) → text overlay
  return await sharp(bg)
    .composite([
      { input: productBuf, top: productTop, left: productLeft, blend: 'over' },
      { input: svgBuf,     top: 0,          left: 0,           blend: 'over' },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// ── Main handler ────────────────────────────────────────────────────────────
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
      imageBase64,  // processedPhoto (bg removed) preferred, fallback to original
      imageUrl,
      productName = '',
      bullets = [],
      category = 'general',
    } = await req.json();

    if (!productName.trim())
      return NextResponse.json({ error: 'Потрібна назва товару' }, { status: 400 });

    // Resolve product image
    let resolvedImage = imageBase64 || '';
    if (!resolvedImage && imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        const buf    = await imgRes.arrayBuffer();
        const mime   = imgRes.headers.get('content-type') || 'image/jpeg';
        resolvedImage = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
      } catch (e) {
        console.warn('Failed to fetch imageUrl:', e);
      }
    }
    if (!resolvedImage)
      return NextResponse.json({ error: 'Потрібне фото товару' }, { status: 400 });

    const cleanBullets = (bullets as string[])
      .filter((x: string) => x.trim())
      .slice(0, 3)
      .map((x: string) => x.replace(/^[✓•]\s*/, '').trim());

    // Step 1: GPT-4o → 3 background prompts
    const prompts = await buildBackgroundPrompts(
      resolvedImage,
      productName,
      cleanBullets,
      category,
    );

    if (!prompts.v1 && !prompts.v2 && !prompts.v3)
      return NextResponse.json({ error: 'Не вдалося проаналізувати товар' }, { status: 500 });

    // Step 2: Generate all 3 backgrounds in parallel
    const [bg1, bg2, bg3] = await Promise.all([
      prompts.v1 ? generateBackground(prompts.v1) : Promise.resolve(null),
      prompts.v2 ? generateBackground(prompts.v2) : Promise.resolve(null),
      prompts.v3 ? generateBackground(prompts.v3) : Promise.resolve(null),
    ]);

    // Step 3: Composite all 3 cards in parallel
    const styles: Array<'lifestyle' | 'studio' | 'dynamic'> = ['lifestyle', 'studio', 'dynamic'];
    const bgs    = [bg1, bg2, bg3];
    const labels = ['Lifestyle', 'Студія', 'Динамічний'];

    const composited = await Promise.all(
      bgs.map(async (bg, i) => {
        if (!bg) return null;
        try {
          return await compositeCard(bg, resolvedImage, productName, cleanBullets, styles[i]);
        } catch (e) {
          console.error(`Composite ${i} failed:`, e);
          return null;
        }
      }),
    );

    // Step 4: Upload to storage
    const uploaded = await Promise.all(
      composited.map((buf, i) =>
        buf ? uploadToStorage(supabase, buf, user.id, i + 1) : Promise.resolve(null),
      ),
    );

    const variants = uploaded
      .map((url, i) => url ? ({ url, label: labels[i] }) : null)
      .filter(Boolean);

    if (variants.length === 0)
      return NextResponse.json({ error: 'Не вдалося згенерувати жоден варіант' }, { status: 500 });

    return NextResponse.json({ variants });

  } catch (err: unknown) {
    console.error('Generate infographic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка генерації' },
      { status: 500 },
    );
  }
}

