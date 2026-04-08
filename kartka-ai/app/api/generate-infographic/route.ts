import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import satori from 'satori';
import React from 'react';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

// ── Load font ──────────────────────────────────────────────────────────────
function loadFont(filename: string): ArrayBuffer | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', filename));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch { return null; }
}

// ── Generate background via Flux (Replicate) ───────────────────────────────
async function generateBackgroundFlux(prompt: string): Promise<Buffer | null> {
  if (!REPLICATE_TOKEN) {
    console.error('REPLICATE_API_TOKEN not set');
    return null;
  }
  try {
    // Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: prompt + ' Professional product photography background. No text, no letters, no words.',
          width: 1024,
          height: 1024,
          output_format: 'webp',
          output_quality: 90,
          safety_tolerance: 2,
        },
      }),
    });

    const prediction = await createRes.json();

    // If not done yet — poll
    if (prediction.status !== 'succeeded') {
      let pollUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;
      let attempts = 0;
      while (attempts < 30) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(pollUrl, {
          headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` },
        });
        const polled = await pollRes.json();
        if (polled.status === 'succeeded') {
          const imageUrl = Array.isArray(polled.output) ? polled.output[0] : polled.output;
          if (!imageUrl) return null;
          const imgRes = await fetch(imageUrl);
          return Buffer.from(await imgRes.arrayBuffer());
        }
        if (polled.status === 'failed' || polled.status === 'canceled') {
          console.error('Flux prediction failed:', polled.error);
          return null;
        }
        attempts++;
        pollUrl = `https://api.replicate.com/v1/predictions/${polled.id}`;
      }
      return null;
    }

    // Succeeded immediately
    const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!imageUrl) return null;
    const imgRes = await fetch(imageUrl);
    return Buffer.from(await imgRes.arrayBuffer());

  } catch (e) {
    console.error('Flux generation failed:', e);
    return null;
  }
}

// ── Upload to Supabase ─────────────────────────────────────────────────────
async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  buf: Buffer, userId: string, idx: number,
): Promise<string> {
  try {
    const fileName = `infographics/${userId}/${Date.now()}-v${idx}.jpg`;
    const { error } = await supabase.storage.from('card-images')
      .upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${buf.toString('base64')}`;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch {
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
}

// ── GPT-4o → 3 background prompts ─────────────────────────────────────────
async function buildBackgroundPrompts(
  imageBase64: string, productName: string, bullets: string[], category: string,
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
          text: `Product photography art director. Create 3 background prompts for Flux AI image generator.
Product: "${productName}", Category: ${category}, Features: ${bullets.slice(0,3).join(', ')}

V1 LIFESTYLE: Photorealistic outdoor/indoor scene where this product is used. Rich atmosphere, cinematic lighting. No text, no product, no people.
V2 STUDIO: Premium studio photography background. Elegant gradient, subtle texture, professional soft lighting with gentle floor reflection. No text, no product.
V3 DYNAMIC: Bold modern graphic background. Geometric shapes, vibrant color blocks matching product palette. Abstract, energetic. No text, no product.

ALL VARIANTS: No text, no letters, no product. Center area less busy. Square format. Hyper-realistic or stylized — very high quality.

JSON only: {"v1":"...","v2":"...","v3":"..."}`,
        },
      ],
    }],
    max_tokens: 600, temperature: 0.7, response_format: { type: 'json_object' },
  });
  try {
    const p = JSON.parse(response.choices[0]?.message?.content ?? '{}');
    return { v1: p.v1 || '', v2: p.v2 || '', v3: p.v3 || '' };
  } catch { return { v1: '', v2: '', v3: '' }; }
}

// ── Render text overlay via satori → PNG ───────────────────────────────────
async function renderTextOverlay(
  productName: string, bullets: string[],
  style: 'lifestyle' | 'studio' | 'dynamic',
  fontRegular: ArrayBuffer, fontBold: ArrayBuffer,
): Promise<Buffer> {
  const SIZE = 1024;
  const schemes = {
    lifestyle: { accent: '#FFD700', headerBg: '#000000c8', pillBg: '#000000a8', text: '#ffffff' },
    studio:    { accent: '#4FC3F7', headerBg: '#08123ac8', pillBg: '#08123aa0', text: '#ffffff' },
    dynamic:   { accent: '#FF6B35', headerBg: '#160800c8', pillBg: '#160800a8', text: '#ffffff' },
  };
  const s = schemes[style];
  const shortName = productName.length > 42 ? productName.slice(0, 39) + '...' : productName;
  const topBullets = bullets.slice(0, 3);
  const pillH = 50, pillGap = 10;

  const element = React.createElement('div', {
    style: { width: SIZE, height: SIZE, display: 'flex', flexDirection: 'column', backgroundColor: 'transparent' },
  },
    // Header
    React.createElement('div', {
      style: {
        width: '100%', height: 96, backgroundColor: s.headerBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: `5px solid ${s.accent}`, padding: '0 20px',
      },
    },
      React.createElement('span', {
        style: { fontFamily: 'DVS', fontSize: 27, fontWeight: 700, color: s.text, textAlign: 'center' },
      }, shortName),
    ),
    // Spacer
    React.createElement('div', { style: { flex: 1 } }),
    // Bullets
    React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: pillGap, padding: '0 24px 16px 24px' },
    },
      ...topBullets.map(b =>
        React.createElement('div', {
          style: {
            height: pillH, backgroundColor: s.pillBg, borderRadius: 14,
            display: 'flex', alignItems: 'center',
            borderLeft: `7px solid ${s.accent}`, paddingLeft: 18, paddingRight: 12,
          },
        },
          React.createElement('span', {
            style: { fontFamily: 'DVS', fontSize: 21, color: s.text, fontWeight: 400 },
          }, `✓ ${b.length > 44 ? b.slice(0, 41) + '...' : b}`),
        ),
      ),
    ),
    // Bottom bar
    React.createElement('div', { style: { width: '100%', height: 8, backgroundColor: s.accent } }),
  );

  const svg = await satori(element, {
    width: SIZE, height: SIZE,
    fonts: [
      { name: 'DVS', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'DVS', data: fontBold,    weight: 700, style: 'normal' },
    ],
  });

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

// ── Composite card ─────────────────────────────────────────────────────────
async function compositeCard(
  bgBuf: Buffer, productBase64: string,
  productName: string, bullets: string[],
  style: 'lifestyle' | 'studio' | 'dynamic',
  fontRegular: ArrayBuffer, fontBold: ArrayBuffer,
): Promise<Buffer> {
  const SIZE = 1024;
  const bg = await sharp(bgBuf).resize(SIZE, SIZE, { fit: 'cover' }).toBuffer();

  const rawProduct = productBase64.startsWith('data:')
    ? Buffer.from(productBase64.split(',')[1], 'base64')
    : Buffer.from(productBase64, 'base64');

  const productSize = Math.round(SIZE * 0.52);
  const productBuf = await sharp(rawProduct)
    .resize(productSize, productSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();

  const overlayPng = await renderTextOverlay(productName, bullets, style, fontRegular, fontBold);

  return await sharp(bg)
    .composite([
      { input: productBuf, top: Math.round(SIZE * 0.20), left: Math.round((SIZE - productSize) / 2), blend: 'over' },
      { input: overlayPng, top: 0, left: 0, blend: 'over' },
    ])
    .jpeg({ quality: 92 }).toBuffer();
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
    if (!productName.trim()) return NextResponse.json({ error: 'Потрібна назва товару' }, { status: 400 });

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

    const fontRegular = loadFont('DejaVuSans.ttf');
    const fontBold    = loadFont('DejaVuSans-Bold.ttf');
    if (!fontRegular || !fontBold)
      return NextResponse.json({ error: 'Шрифти не знайдено' }, { status: 500 });

    // Step 1: prompts
    const prompts = await buildBackgroundPrompts(resolvedImage, productName, cleanBullets, category);
    if (!prompts.v1 && !prompts.v2 && !prompts.v3)
      return NextResponse.json({ error: 'Не вдалося проаналізувати товар' }, { status: 500 });

    // Step 2: Flux backgrounds in parallel
    const [bg1, bg2, bg3] = await Promise.all([
      prompts.v1 ? generateBackgroundFlux(prompts.v1) : Promise.resolve(null),
      prompts.v2 ? generateBackgroundFlux(prompts.v2) : Promise.resolve(null),
      prompts.v3 ? generateBackgroundFlux(prompts.v3) : Promise.resolve(null),
    ]);

    // Step 3: composite
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

    const variants = uploaded.map((url, i) => url ? ({ url, label: labels[i] }) : null).filter(Boolean);
    if (variants.length === 0)
      return NextResponse.json({ error: 'Не вдалося згенерувати жоден варіант' }, { status: 500 });

    return NextResponse.json({ variants });

  } catch (err: unknown) {
    console.error('Infographic error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка генерації' }, { status: 500 });
  }
}
