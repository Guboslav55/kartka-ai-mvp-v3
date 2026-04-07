import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// ── Step 1: GPT-4o аналізує товар → 3 промпти ТІЛЬКИ для фону ────────────
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
Analyze this product image and create 3 DIFFERENT background prompts for DALL-E 3.

Product: "${productName}"
Category: ${category}
Key features: ${bulletText}

Create 3 background-only prompts. The backgrounds will have the product photo composited on top later.

VARIANT 1 — LIFESTYLE SCENE:
A realistic lifestyle environment where this product would be used. 
Example: for tactical gear → outdoor field, military environment, dramatic sky.
NO text, NO product, NO people — just the environment/scene.

VARIANT 2 — STUDIO GRADIENT:
Clean professional studio background. Soft gradient from dark to light, 
matching the product color palette. Subtle texture. Premium feel.
NO text, NO product.

VARIANT 3 — DYNAMIC COMPOSITION:
Bold graphic background with geometric shapes, color blocks, or abstract elements
that complement the product category. Modern, energetic, marketplace-ready.
NO text, NO product.

CRITICAL: 
- Backgrounds must be 1024x1024 square
- NO text, NO letters, NO words anywhere in the image
- NO product visible — just pure background
- Leave center area slightly less busy for product placement
- High quality, photorealistic or semi-realistic

Respond ONLY with JSON:
{
  "v1": "DALL-E prompt for lifestyle background...",
  "v2": "DALL-E prompt for studio gradient background...", 
  "v3": "DALL-E prompt for dynamic composition background..."
}`,
        },
      ],
    }],
    max_tokens: 800,
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
      prompt: prompt + '\n\nIMPORTANT: NO text, NO letters, NO words anywhere. Pure background only. Square 1024x1024.',
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
  productBase64: string,        // already bg-removed
  productName: string,
  bullets: string[],
  variantStyle: 'lifestyle' | 'studio' | 'dynamic',
): Promise<Buffer> {
  const SIZE = 1024;

  // Resize background to 1024x1024
  const bg = await sharp(backgroundBuf)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .toBuffer();

  // Decode product image
  const rawProduct = productBase64.startsWith('data:')
    ? Buffer.from(productBase64.split(',')[1], 'base64')
    : Buffer.from(productBase64, 'base64');

  // Resize product to fit nicely — 50% of card width, centered
  const productSize = Math.round(SIZE * 0.52);
  const productBuf = await sharp(rawProduct)
    .resize(productSize, productSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Product position — center horizontally, slightly lower than center
  const productLeft = Math.round((SIZE - productSize) / 2);
  const productTop = Math.round(SIZE * 0.22);

  // ── Build text overlay as SVG ──────────────────────────────────────────
  const topBullets = bullets.slice(0, 3);
  const shortName = productName.length > 38
    ? productName.substring(0, 35) + '...'
    : productName;

  // Color scheme per variant
  const schemes = {
    lifestyle: { accent: '#FFD700', bg: 'rgba(0,0,0,0.72)', pill: 'rgba(0,0,0,0.55)' },
    studio:    { accent: '#4FC3F7', bg: 'rgba(10,20,40,0.82)', pill: 'rgba(10,20,40,0.65)' },
    dynamic:   { accent: '#FF6B35', bg: 'rgba(20,10,0,0.78)', pill: 'rgba(20,10,0,0.6)' },
  };
  const scheme = schemes[variantStyle];

  // Build bullet pills SVG
  const pillHeight = 44;
  const pillGap = 12;
  const pillY = SIZE - 20 - (topBullets.length * (pillHeight + pillGap));

  const bulletsSvg = topBullets.map((b, i) => {
    const text = b.length > 36 ? b.substring(0, 33) + '...' : b;
    const y = pillY + i * (pillHeight + pillGap);
    return `
      <rect x="32" y="${y}" width="960" height="${pillHeight}" rx="10" fill="${scheme.pill}"/>
      <text x="64" y="${y + 29}" font-family="Arial, sans-serif" font-size="20" font-weight="600" fill="white">✓ ${text}</text>
    `;
  }).join('');

  const svgOverlay = `
    <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <!-- Top header bar -->
      <rect x="0" y="0" width="${SIZE}" height="90" fill="${scheme.bg}"/>
      
      <!-- Product name -->
      <text 
        x="${SIZE / 2}" y="58" 
        font-family="Arial, sans-serif" 
        font-size="26" 
        font-weight="800" 
        fill="white" 
        text-anchor="middle"
        dominant-baseline="middle"
      >${shortName}</text>

      <!-- Accent line under header -->
      <rect x="0" y="90" width="${SIZE}" height="4" fill="${scheme.accent}"/>

      <!-- Bullet pills at bottom -->
      ${bulletsSvg}

      <!-- Bottom accent line -->
      <rect x="0" y="${SIZE - 6}" width="${SIZE}" height="6" fill="${scheme.accent}"/>
    </svg>
  `;

  const svgBuf = Buffer.from(svgOverlay);

  // Composite: bg → product → text overlay
  const result = await sharp(bg)
    .composite([
      { input: productBuf, top: productTop, left: productLeft, blend: 'over' },
      { input: svgBuf,     top: 0,          left: 0,           blend: 'over' },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return result;
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
      imageBase64,
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
        const buf = await imgRes.arrayBuffer();
        const mime = imgRes.headers.get('content-type') || 'image/jpeg';
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

    // Step 3: Composite cards in parallel
    const styles: Array<'lifestyle' | 'studio' | 'dynamic'> = ['lifestyle', 'studio', 'dynamic'];
    const bgs = [bg1, bg2, bg3];
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

    // Step 4: Upload all to storage
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

