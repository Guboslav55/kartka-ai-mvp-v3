import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import satori from 'satori';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Load font for satori ───────────────────────────────────────────────────
function loadFont(filename: string): ArrayBuffer | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', filename));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
}

// ── Upload to Supabase ─────────────────────────────────────────────────────
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
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: `Product photography art director. Create 3 background-only DALL-E 3 prompts.
Product: "${productName}", Category: ${category}, Features: ${bullets.slice(0,3).join(', ')}

V1 LIFESTYLE: Realistic environment where product is used. Dramatic atmospheric lighting. NO text, NO product, NO people.
V2 STUDIO: Clean studio gradient matching product colors. Subtle texture, premium lighting, soft floor shadow. NO text, NO product.
V3 DYNAMIC: Bold geometric shapes/color blocks. Modern abstract design matching product. NO text, NO product.

ALL: No text/letters/words. No product. Center area less busy. Square 1024x1024. High quality.

JSON only: {"v1":"...","v2":"...","v3":"..."}`,
        },
      ],
    }],
    max_tokens: 600,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  try {
    const p = JSON.parse(response.choices[0]?.message?.content ?? '{}');
    return { v1: p.v1 || '', v2: p.v2 || '', v3: p.v3 || '' };
  } catch {
    return { v1: '', v2: '', v3: '' };
  }
}

// ── Step 2: Generate background via DALL-E ─────────────────────────────────
async function generateBackground(prompt: string): Promise<Buffer | null> {
  try {
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt + ' CRITICAL: NO text, NO letters, NO words. Pure background only.',
      size: '1024x1024', quality: 'hd', style: 'vivid', n: 1,
      response_format: 'b64_json',
    });
    const b64 = res.data[0]?.b64_json;
    return b64 ? Buffer.from(b64, 'base64') : null;
  } catch (e) {
    console.error('BG gen failed:', e);
    return null;
  }
}

// ── Step 3: Render text overlay via satori → PNG ───────────────────────────
async function renderOverlay(
  productName: string,
  bullets: string[],
  style: 'lifestyle' | 'studio' | 'dynamic',
  fontRegular: ArrayBuffer,
  fontBold: ArrayBuffer,
): Promise<Buffer> {
  const SIZE = 1024;

  const schemes = {
    lifestyle: { accent: '#FFD700', headerBg: 'rgba(0,0,0,0.78)', pillBg: 'rgba(0,0,0,0.65)', text: '#fff' },
    studio:    { accent: '#4FC3F7', headerBg: 'rgba(8,18,40,0.88)', pillBg: 'rgba(8,18,40,0.72)', text: '#fff' },
    dynamic:   { accent: '#FF6B35', headerBg: 'rgba(22,8,0,0.84)', pillBg: 'rgba(22,8,0,0.68)', text: '#fff' },
  };
  const s = schemes[style];

  const shortName = productName.length > 42 ? productName.slice(0, 39) + '...' : productName;
  const topBullets = bullets.slice(0, 3);

  // Build satori element tree (React-like but plain objects)
  const pillHeight = 50;
  const pillGap    = 10;

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: SIZE, height: SIZE,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: 'transparent',
        },
        children: [
          // Header
          {
            type: 'div',
            props: {
              style: {
                width: '100%', height: 96,
                backgroundColor: s.headerBg,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center',
                borderBottom: `5px solid ${s.accent}`,
              },
              children: [{
                type: 'span',
                props: {
                  style: { fontFamily: 'DVS', fontSize: 27, fontWeight: 700, color: s.text, textAlign: 'center', padding: '0 20px' },
                  children: shortName,
                },
              }],
            },
          },
          // Spacer
          { type: 'div', props: { style: { flex: 1 }, children: [] } },
          // Bullets
          {
            type: 'div',
            props: {
              style: {
                display: 'flex', flexDirection: 'column',
                gap: pillGap, padding: '0 24px 20px',
              },
              children: topBullets.map(b => ({
                type: 'div',
                props: {
                  style: {
                    height: pillHeight, backgroundColor: s.pillBg,
                    borderRadius: 14, display: 'flex', alignItems: 'center',
                    borderLeft: `7px solid ${s.accent}`,
                    paddingLeft: 16, paddingRight: 12,
                  },
                  children: [{
                    type: 'span',
                    props: {
                      style: { fontFamily: 'DVS', fontSize: 22, color: s.text },
                      children: `✓ ${b.length > 44 ? b.slice(0, 41) + '...' : b}`,
                    },
                  }],
                },
              })),
            },
          },
          // Bottom bar
          {
            type: 'div',
            props: {
              style: { width: '100%', height: 8, backgroundColor: s.accent },
              children: [],
            },
          },
        ],
      },
    },
    {
      width: SIZE, height: SIZE,
      fonts: [
        { name: 'DVS', data: fontRegular, weight: 400, style: 'normal' },
        { name: 'DVS', data: fontBold,    weight: 700, style: 'normal' },
      ],
    },
  );

  // SVG → PNG via sharp
  return await sharp(Buffer.from(svg)).png().toBuffer();
}

// ── Step 4: Composite everything ───────────────────────────────────────────
async function compositeCard(
  bgBuf: Buffer,
  productBase64: string,
  productName: string,
  bullets: string[],
  style: 'lifestyle' | 'studio' | 'dynamic',
  fontRegular: ArrayBuffer,
  fontBold: ArrayBuffer,
): Promise<Buffer> {
  const SIZE = 1024;

  const bg = await sharp(bgBuf).resize(SIZE, SIZE, { fit: 'cover' }).toBuffer();

  const rawProduct = productBase64.startsWith('data:')
    ? Buffer.from(productBase64.split(',')[1], 'base64')
    : Buffer.from(productBase64, 'base64');

  const productSize = Math.round(SIZE * 0.52);
  const productBuf  = await sharp(rawProduct)
    .resize(productSize, productSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();

  const productLeft = Math.round((SIZE - productSize) / 2);
  const productTop  = Math.round(SIZE * 0.20);

  const overlayPng = await renderOverlay(productName, bullets, style, fontRegular, fontBold);

  return await sharp(bg)
    .composite([
      { input: productBuf, top: productTop, left: productLeft, blend: 'over' },
      { input: overlayPng, top: 0,          left: 0,           blend: 'over' },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

// ── Main handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageBase64, imageUrl, productName = '', bullets = [], category = 'general' } = await req.json();

    if (!productName.trim())
      return NextResponse.json({ error: 'Потрібна назва товару' }, { status: 400 });

    let resolvedImage = imageBase64 || '';
    if (!resolvedImage && imageUrl) {
      try {
        const r = await fetch(imageUrl);
        const buf = await r.arrayBuffer();
        const mime = r.headers.get('content-type') || 'image/jpeg';
        resolvedImage = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
      } catch (e) { console.warn('fetch imageUrl failed:', e); }
    }
    if (!resolvedImage) return NextResponse.json({ error: 'Потрібне фото товару' }, { status: 400 });

    const cleanBullets = (bullets as string[])
      .filter(x => x.trim()).slice(0, 3)
      .map(x => x.replace(/^[✓•]\s*/, '').trim());

    // Load fonts
    const fontRegular = loadFont('DejaVuSans.ttf');
    const fontBold    = loadFont('DejaVuSans-Bold.ttf');
    if (!fontRegular || !fontBold)
      return NextResponse.json({ error: 'Шрифти не знайдено' }, { status: 500 });

    // Step 1
    const prompts = await buildBackgroundPrompts(resolvedImage, productName, cleanBullets, category);
    if (!prompts.v1 && !prompts.v2 && !prompts.v3)
      return NextResponse.json({ error: 'Не вдалося проаналізувати товар' }, { status: 500 });

    // Step 2
    const [bg1, bg2, bg3] = await Promise.all([
      prompts.v1 ? generateBackground(prompts.v1) : Promise.resolve(null),
      prompts.v2 ? generateBackground(prompts.v2) : Promise.resolve(null),
      prompts.v3 ? generateBackground(prompts.v3) : Promise.resolve(null),
    ]);

    // Steps 3+4
    const styles = ['lifestyle', 'studio', 'dynamic'] as const;
    const labels = ['Lifestyle', 'Студія', 'Динамічний'];

    const composited = await Promise.all(
      [bg1, bg2, bg3].map(async (bg, i) => {
        if (!bg) return null;
        try {
          return await compositeCard(bg, resolvedImage, productName, cleanBullets, styles[i], fontRegular, fontBold);
        } catch (e) { console.error(`Composite ${i} failed:`, e); return null; }
      }),
    );

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
    console.error('Infographic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка генерації' },
      { status: 500 },
    );
  }
}
