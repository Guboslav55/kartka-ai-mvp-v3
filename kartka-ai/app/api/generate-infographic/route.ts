import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

interface TextElement {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
  bgColor: string | null;
  bgPadding: number;
  bgRadius: number;
  align: 'left' | 'center' | 'right';
  maxWidth: number;
}

interface TextOverlay {
  elements: TextElement[];
}

type SupabaseClient = ReturnType<typeof createClient>;

async function uploadToStorage(
  supabase: SupabaseClient,
  buf: Buffer,
  userId: string,
): Promise<string> {
  try {
    const fileName = `infographics/${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${buf.toString('base64')}`;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch {
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
}

async function uploadImageForFlux(
  supabase: SupabaseClient,
  base64: string,
  userId: string,
): Promise<string | null> {
  try {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return null;
    const mimeType = match[1];
    const ext = mimeType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    const fileName = `temp/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });
    if (error) return null;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch {
    return null;
  }
}

async function buildFluxPrompt(
  imageBase64: string,
  productName: string,
  bullets: string[],
  category: string,
  variant: 'lifestyle' | 'benefits' | 'studio',
): Promise<string> {
  const bulletText = bullets.slice(0, 4).map((b, i) => `${i + 1}. ${b}`).join('\n');

  const variantInstructions =
    variant === 'lifestyle'
      ? 'LIFESTYLE: Transform background into dramatic atmospheric scene matching the product. Keep product centered and clearly visible. NO TEXT. NO labels. NO annotations. Only change background and lighting.'
      : variant === 'studio'
      ? 'STUDIO PHOTO: Transform into professional studio product photography. Pure white or light grey seamless background. Perfect soft studio lighting from multiple angles. Product centered, sharp focus, commercial e-commerce quality. NO TEXT.'
      : 'BENEFITS: Dynamic colorful graphic background with geometric shapes and energy. Product hero centered. Vivid contrasting colors. Modern marketplace infographic style. NO TEXT. NO labels. NO written words.';

  const imageData = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageMediaType = (imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg') as
    | 'image/jpeg'
    | 'image/png'
    | 'image/webp'
    | 'image/gif';

  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    temperature: 0.7,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageMediaType, data: imageData } },
          {
            type: 'text',
            text: `You are a professional Ukrainian marketplace infographic designer. Analyze this product and create ONE editing prompt for Flux Kontext image editor.

Product: "${productName}"
Category: ${category}
Key features:
${bulletText}

${variantInstructions}

CRITICAL RULES:
- Keep the ORIGINAL product from the photo - do NOT replace or alter it
- DO NOT add any text, letters, words, labels or annotations anywhere
- DO NOT modify hands, fingers or any body parts - keep human anatomy exactly as original
- Only modify: background, lighting, composition, decorative graphic elements
- NO text overlays, NO callout text, NO written words of any kind
- Professional marketplace quality, square 1024x1024
- Write the prompt in English for Flux Kontext

Return ONLY the prompt text, no JSON, no explanation.`,
          },
        ],
      },
    ],
  });

  const block = response.content[0];
  return block?.type === 'text' ? block.text.trim() : '';
}

async function runFluxKontext(imageUrl: string, prompt: string): Promise<Buffer | null> {
  if (!REPLICATE_TOKEN) return null;
  try {
    const createRes = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json',
          Prefer: 'wait',
        },
        body: JSON.stringify({
          input: { prompt, input_image: imageUrl, output_format: 'jpg', output_quality: 90, safety_tolerance: 2, aspect_ratio: '1:1' },
        }),
      },
    );

    const prediction = await createRes.json() as { id?: string; status?: string; output?: string | string[]; error?: string };

    if (prediction.status === 'succeeded') {
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!outputUrl) return null;
      return Buffer.from(await (await fetch(outputUrl)).arrayBuffer());
    }

    if (!prediction.id) { console.error('Flux create failed:', JSON.stringify(prediction)); return null; }

    let current = prediction;
    let attempts = 0;
    while (current.status !== 'succeeded' && current.status !== 'failed' && current.status !== 'canceled' && attempts < 30) {
      await new Promise((r) => setTimeout(r, 3000));
      current = await (await fetch(`https://api.replicate.com/v1/predictions/${current.id}`, { headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` } })).json() as typeof prediction;
      attempts++;
    }

    if (current.status !== 'succeeded') { console.error('Flux failed:', current.error); return null; }
    const outputUrl = Array.isArray(current.output) ? current.output[0] : current.output;
    if (!outputUrl) return null;
    return Buffer.from(await (await fetch(outputUrl)).arrayBuffer());
  } catch (e) {
    console.error('Flux error:', e);
    return null;
  }
}

async function getTextOverlayFromClaude(
  productImageBase64: string,
  fluxImageUrl: string,
  productName: string,
  bullets: string[],
  variant: string,
): Promise<TextOverlay | null> {
  try {
    const fluxRes = await fetch(fluxImageUrl);
    const fluxBase64 = Buffer.from(await fluxRes.arrayBuffer()).toString('base64');
    const fluxMime = (fluxRes.headers.get('content-type') || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    const productBase64Clean = productImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const productMime = (productImageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

    const variantHint =
      variant === 'lifestyle' ? 'lifestyle atmospheric background — product large in frame, dramatic lighting'
      : variant === 'studio' ? 'clean studio white/grey background — product centered, professional e-commerce'
      : 'colorful graphic background with geometric elements — energetic marketplace style';

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: productMime, data: productBase64Clean } },
            { type: 'image', source: { type: 'base64', media_type: fluxMime, data: fluxBase64 } },
            {
              type: 'text',
              text: `You are a professional Ukrainian marketplace infographic designer (Prom.ua, Rozetka).

You see TWO images:
1. Original product photo
2. AI-generated infographic background (${variantHint})

Product name: "${productName}"
Key benefits: ${bullets.slice(0, 3).join(' | ')}

Design text overlays for a 1024x1024 marketplace infographic.

RULES:
- Product is the HERO occupying 75-85% of the image
- Text NEVER covers product face or body
- Use empty areas only: corners, edges, bottom strip, top strip
- Lifestyle: minimal text — brand name + 1-2 key specs max
- Studio: characteristics in small cards on the sides
- Benefits: bold numbers/stats as main argument
- All text in UKRAINIAN
- Font sizes: title 36-52px, subtitle 18-24px, specs 14-16px
- Colors must contrast with the background you see

Return ONLY valid JSON (no markdown, no explanation):
{"elements":[{"text":"string","x":number,"y":number,"fontSize":number,"fontWeight":"bold","color":"#ffffff","bgColor":"#000000","bgPadding":8,"bgRadius":6,"align":"left","maxWidth":300}]}

Place 2-4 elements maximum. Keep it clean and professional.`,
            },
          ],
        },
      ],
    });

    const block = response.content[0];
    const raw = block?.type === 'text' ? block.text : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as TextOverlay;
  } catch (e) {
    console.error('Claude overlay error:', e);
    return null;
  }
}

async function addTextOverlay(imageBuf: Buffer, overlay: TextOverlay): Promise<Buffer> {
  const sharp = (await import('sharp')).default;

  const svgParts = overlay.elements.map((el) => {
    const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
    const fw = el.fontWeight === 'bold' ? '700' : '400';
    const maxW = el.maxWidth || 350;
    const pad = el.bgPadding || 8;
    const rx = el.bgRadius || 6;

    const words = el.text.split(' ');
    const charsPerLine = Math.floor(maxW / (el.fontSize * 0.55));
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > charsPerLine) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);

    const lineHeight = el.fontSize * 1.25;
    const totalHeight = lines.length * lineHeight;

    let bgRect = '';
    if (el.bgColor && el.bgColor !== 'null') {
      const bgX = el.align === 'center' ? el.x - maxW / 2 - pad : el.align === 'right' ? el.x - maxW - pad : el.x - pad;
      bgRect = `<rect x="${bgX}" y="${el.y - el.fontSize - pad}" width="${maxW + pad * 2}" height="${totalHeight + pad * 2}" rx="${rx}" fill="${el.bgColor}" fill-opacity="0.82"/>`;
    }

    const tspans = lines
      .map((line, i) => `<tspan x="${el.x}" dy="${i === 0 ? 0 : lineHeight}">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</tspan>`)
      .join('');

    return `${bgRect}<text x="${el.x}" y="${el.y}" font-family="Arial,sans-serif" font-size="${el.fontSize}" font-weight="${fw}" fill="${el.color}" text-anchor="${anchor}" dominant-baseline="auto">${tspans}</text>`;
  });

  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">${svgParts.join('')}</svg>`;
  return sharp(imageBuf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 92 }).toBuffer();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

    const body = await req.json() as {
      imageBase64?: string;
      imageUrl?: string;
      productName?: string;
      bullets?: string[];
      category?: string;
      variant?: string;
      cardId?: string;
      allVariants?: Array<{ url: string; label: string }>;
    };

    const { imageBase64, imageUrl, productName = '', bullets = [], category = 'general', variant = 'lifestyle', cardId, allVariants } = body;

    if (allVariants && cardId) {
      const { error } = await supabase.from('cards').update({ infographic_urls: allVariants }).eq('id', cardId).eq('user_id', user.id);
      if (error) console.error('Save error:', error);
      return NextResponse.json({ saved: true });
    }

    if (!productName.trim()) return NextResponse.json({ error: 'No product name' }, { status: 400 });

    let resolvedBase64 = imageBase64 || '';
    if (!resolvedBase64 && imageUrl) {
      try {
        const r = await fetch(imageUrl);
        const buf = await r.arrayBuffer();
        const mime = r.headers.get('content-type') || 'image/jpeg';
        resolvedBase64 = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
      } catch (e) { console.warn('fetch imageUrl failed:', e); }
    }
    if (!resolvedBase64) return NextResponse.json({ error: 'No image' }, { status: 400 });

    const cleanBullets = (bullets as string[]).filter((x) => x.trim()).slice(0, 4).map((x) => x.replace(/^[✓✔•]\s*/, '').trim());
    const typedVariant: 'lifestyle' | 'benefits' | 'studio' =
      variant === 'benefits' ? 'benefits' : variant === 'studio' ? 'studio' : 'lifestyle';

    const publicImageUrl = await uploadImageForFlux(supabase, resolvedBase64, user.id);
    if (!publicImageUrl) return NextResponse.json({ error: 'Upload failed' }, { status: 500 });

    const prompt = await buildFluxPrompt(resolvedBase64, productName, cleanBullets, category, typedVariant);
    if (!prompt) return NextResponse.json({ error: 'Prompt failed' }, { status: 500 });

    const fluxBuf = await runFluxKontext(publicImageUrl, prompt);
    if (!fluxBuf) return NextResponse.json({ error: 'Flux failed' }, { status: 500 });

    const fluxFileName = `temp/${user.id}/flux-${Date.now()}.jpg`;
    await supabase.storage.from('card-images').upload(fluxFileName, fluxBuf, { contentType: 'image/jpeg', upsert: true });
    const fluxPublicUrl = supabase.storage.from('card-images').getPublicUrl(fluxFileName).data.publicUrl;

    const overlay = await getTextOverlayFromClaude(resolvedBase64, fluxPublicUrl, productName, cleanBullets, variant);

    let finalBuf = fluxBuf;
    if (overlay && overlay.elements.length > 0) {
      try { finalBuf = await addTextOverlay(fluxBuf, overlay); }
      catch (e) { console.error('Text overlay failed, using image without text:', e); finalBuf = fluxBuf; }
    }

    const url = await uploadToStorage(supabase, finalBuf, user.id);
    const label = typedVariant === 'lifestyle' ? 'Lifestyle' : typedVariant === 'studio' ? 'Студійне фото' : 'Переваги';

    return NextResponse.json({ url, label });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : '';
    console.error('Infographic error FULL:', errMsg, errStack);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
