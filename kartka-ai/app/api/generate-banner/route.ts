import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  buffer: Buffer,
  userId: string,
): Promise<string | null> {
  try {
    const fileName = `banners/${userId}/${Date.now()}-ai.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (error) { console.warn('Storage error:', error.message); return null; }
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch (e) { console.warn('Upload failed:', e); return null; }
}

// ── Step 1: GPT-4o Vision analyzes the product photo ─────────────────────────
// Returns a detailed English prompt for gpt-image-1
async function analyzeAndBuildPrompt(
  imageBase64: string,
  productName: string,
  bullets: string[],
  price: string,
  platform: string,
  category: string,
): Promise<string> {

  const platformContext: Record<string, string> = {
    prom:    'Ukrainian marketplace Prom.ua — buyers are practical, price-sensitive',
    rozetka: 'Ukrainian marketplace Rozetka — tech-savvy, quality-focused buyers',
    olx:     'Ukrainian classifieds OLX — casual, conversational style',
    general: 'Ukrainian e-commerce — wide audience',
  };

  const systemPrompt = `You are an expert Ukrainian marketplace banner designer.
Analyze the product photo and create a detailed image generation prompt for a professional marketing banner.

The banner must look like a premium, professionally designed marketplace infographic — similar to top sellers on Rozetka or Prom.ua.
NOT a template with color stripes. A REAL designed banner where the product photo is integrated into the design.

Rules:
- The product must remain clearly visible and be the hero of the banner
- Text elements must be part of the visual design, not overlaid after
- Style must match the product category and target audience
- The result should look different every time — no repeating layouts
- Output ONLY the image generation prompt in English, nothing else`;

  const userPrompt = `Product: "${productName}"
Category: ${category}
Platform: ${platformContext[platform] ?? platformContext.general}
Price: ${price ? price + ' UAH' : 'not specified'}
Key features:
${bullets.slice(0, 4).map((b, i) => `${i + 1}. ${b}`).join('\n')}

Analyze the product in the photo. Then write a detailed image generation prompt for gpt-image-1 that will create a unique, professional marketing banner for Ukrainian marketplace.

The prompt must specify:
- Exact visual layout (how the product is positioned)
- Background style (gradient, texture, scene — NOT solid dark panel)  
- How feature text/icons appear integrated into the design
- Color palette (extracted from the product itself)
- Lighting and atmosphere
- Overall design style (premium, sporty, tech, natural — based on product)
- Text placement areas for: product name, 3-4 feature bullets, price

Write the prompt as if instructing a world-class designer. Be very specific.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
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
          { type: 'text', text: userPrompt },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.9,
  });

  return response.choices[0]?.message?.content ?? '';
}

// ── Step 2: Add Ukrainian text overlay instructions ───────────────────────────
function buildFinalPrompt(
  basePrompt: string,
  productName: string,
  bullets: string[],
  price: string,
): string {
  const featuresText = bullets.slice(0, 4).join(' • ');
  const priceText = price ? `${price} ₴` : '';

  return `${basePrompt}

CRITICAL TEXT REQUIREMENTS — these exact texts must appear in the banner:
- Product name (large, bold): "${productName.slice(0, 60)}"
- Feature highlights: "${featuresText}"
${priceText ? `- Price (prominent): "${priceText}"` : ''}
- All text must be in Ukrainian language
- Text must be legible, properly sized, and part of the overall design
- Ukrainian Cyrillic characters must be perfectly rendered

The final image should be 1024x1024 pixels, suitable for Ukrainian marketplace product listings.
Professional, modern, visually striking. NOT a generic template.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
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
      productB64,
      productName = '',
      bullets = [],
      price = '',
      platform = 'general',
      category = '',
    } = await req.json();

    if (!productB64) {
      return NextResponse.json({ error: 'Потрібне фото товару' }, { status: 400 });
    }

    const b = (bullets as string[])
      .filter((x: string) => x.trim())
      .slice(0, 4)
      .map((x: string) => x.replace(/^[✓•]\s*/, '').trim());

    // ── Step 1: GPT-4o analyzes photo → builds unique prompt ─────────────────
    let designPrompt: string;
    try {
      const basePrompt = await analyzeAndBuildPrompt(
        productB64, productName, b, price, platform, category,
      );
      designPrompt = buildFinalPrompt(basePrompt, productName, b, price);
    } catch (e) {
      console.error('Vision analysis failed:', e);
      // Fallback: generic but still uses gpt-image-1
      designPrompt = buildFinalPrompt(
        `Create a professional marketing banner for a ${category || 'product'} on Ukrainian marketplace. 
        The product should be prominently displayed with a modern, premium design. 
        Use colors extracted from the product photo. 
        Include feature highlights in styled graphic elements.`,
        productName, b, price,
      );
    }

    // ── Step 2: gpt-image-1 generates the banner ─────────────────────────────
    // Write photo to temp file (required by SDK for images.edit)
    const b64data = productB64.replace(/^data:image\/\w+;base64,/, '');
    const photoBuf = Buffer.from(b64data, 'base64');
    const tmpPath = path.join(os.tmpdir(), `product-${Date.now()}.jpg`);
    fs.writeFileSync(tmpPath, photoBuf);

    let imageBuffer: Buffer;

    try {
      // Use images.edit — takes original product photo as reference
      // gpt-image-1 will transform it into a marketing banner
      const response = await openai.images.edit({
        model: 'gpt-image-1',
        image: fs.createReadStream(tmpPath) as unknown as File,
        prompt: designPrompt,
        size: '1024x1024',
        quality: 'high',
        n: 1,
      });

      if (response.data[0]?.b64_json) {
        imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');
      } else if (response.data[0]?.url) {
        const imgRes = await fetch(response.data[0].url);
        imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        throw new Error('No image data in response');
      }

    } finally {
      // Clean up temp file
      try { fs.unlinkSync(tmpPath); } catch {}
    }

    // ── Step 3: Upload to Supabase ────────────────────────────────────────────
    const permanent = await uploadToStorage(supabase, imageBuffer, user.id);
    const b64Out = imageBuffer.toString('base64');

    return NextResponse.json({
      imageUrl:  permanent ?? `data:image/jpeg;base64,${b64Out}`,
      imageB64:  `data:image/jpeg;base64,${b64Out}`,
      prompt:    designPrompt.slice(0, 200) + '...', // for debugging
    });

  } catch (err: unknown) {
    console.error('Generate banner error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка генерації' },
      { status: 500 },
    );
  }
}
