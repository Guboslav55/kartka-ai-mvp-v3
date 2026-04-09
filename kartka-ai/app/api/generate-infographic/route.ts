import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

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

async function uploadImageForFlux(
  supabase: ReturnType<typeof createClient>,
  base64: string, userId: string,
): Promise<string | null> {
  try {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return null;
    const mimeType = match[1];
    const ext = mimeType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    const fileName = `temp/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('card-images')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });
    if (error) return null;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch { return null; }
}

async function buildKontextPrompts(
  imageBase64: string, productName: string,
  bullets: string[], category: string,
): Promise<{ v1: string; v2: string; v3: string }> {
  const bulletText = bullets.slice(0, 4).map((b, i) => `${i + 1}. ${b}`).join('\n');
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
          text: `You are a professional Ukrainian marketplace infographic designer.
Analyze this product photo and create 3 different editing prompts for Flux Kontext.
Flux Kontext will transform the product photo into a professional infographic while keeping the product visible.

Product: "${productName}"
Category: ${category}
Key features:
${bulletText}

VARIANT 1 — LIFESTYLE CALLOUT:
Transform into professional lifestyle infographic. Add dramatic atmospheric background matching product category.
Add 3-4 annotation callout lines pointing to key product features with short Ukrainian text labels.
Keep product clearly visible and centered. Bold Ukrainian title at top.
Style: professional marketplace photography, cinematic lighting.

VARIANT 2 — TECHNICAL DIAGRAM:
Transform into clean technical infographic on dark gradient background.
Add annotation arrows pointing to product details with Ukrainian feature labels.
Add feature icons or badges. Clean minimal design. Bold Ukrainian title at top, feature pills at bottom.
Style: technical product diagram, dark premium look.

VARIANT 3 — BENEFITS GRID:
Transform into bold graphic infographic with vibrant colored background.
Surround product with 3-4 benefit blocks/badges showing Ukrainian feature text.
Dynamic composition with geometric elements. Modern energetic marketplace style.
Product hero in center, benefits around it.

CRITICAL: Keep the ORIGINAL product from the photo. All text in Ukrainian. Professional quality. Square 1024x1024.

JSON only: {"v1":"...","v2":"...","v3":"..."}`,
        },
      ],
    }],
    max_tokens: 800, temperature: 0.7, response_format: { type: 'json_object' },
  });
  try {
    const p = JSON.parse(response.choices[0]?.message?.content ?? '{}');
    return { v1: p.v1 || '', v2: p.v2 || '', v3: p.v3 || '' };
  } catch { return { v1: '', v2: '', v3: '' }; }
}

async function runFluxKontext(imageUrl: string, prompt: string): Promise<Buffer | null> {
  if (!REPLICATE_TOKEN) return null;
  try {
    const createRes = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({
          input: {
            prompt,
            input_image: imageUrl,
            output_format: 'jpg',
            output_quality: 90,
            safety_tolerance: 2,
            aspect_ratio: '1:1',
          },
        }),
      },
    );

    const prediction = await createRes.json();

    // If succeeded immediately (Prefer: wait)
    if (prediction.status === 'succeeded') {
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!outputUrl) return null;
      const imgRes = await fetch(outputUrl);
      return Buffer.from(await imgRes.arrayBuffer());
    }

    // Poll if not done yet
    let current = prediction;
    let attempts = 0;
    while (current.status !== 'succeeded' && current.status !== 'failed' && current.status !== 'canceled' && attempts < 80) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${current.id}`,
        { headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` } },
      );
      current = await pollRes.json();
      attempts++;
    }

    if (current.status !== 'succeeded') {
      console.error('Flux Kontext failed:', current.error, 'status:', current.status);
      return null;
    }

    const outputUrl = Array.isArray(current.output) ? current.output[0] : current.output;
    if (!outputUrl) return null;
    const imgRes = await fetch(outputUrl);
    return Buffer.from(await imgRes.arrayBuffer());

  } catch (e) {
    console.error('Flux Kontext error:', e);
    return null;
  }
}

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

    const {
      imageBase64, imageUrl, productName = '',
      bullets = [], category = 'general', cardId,
    } = await req.json();

    if (!productName.trim())
      return NextResponse.json({ error: 'Потрібна назва товару' }, { status: 400 });

    let resolvedBase64 = imageBase64 || '';
    if (!resolvedBase64 && imageUrl) {
      try {
        const r = await fetch(imageUrl);
        const buf = await r.arrayBuffer();
        const mime = r.headers.get('content-type') || 'image/jpeg';
        resolvedBase64 = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
      } catch (e) { console.warn('fetch imageUrl failed:', e); }
    }
    if (!resolvedBase64)
      return NextResponse.json({ error: 'Потрібне фото товару' }, { status: 400 });

    const cleanBullets = (bullets as string[])
      .filter(x => x.trim()).slice(0, 4)
      .map(x => x.replace(/^[✓•]\s*/, '').trim());

    // Upload to get public URL for Flux
    const publicImageUrl = await uploadImageForFlux(supabase, resolvedBase64, user.id);
    if (!publicImageUrl)
      return NextResponse.json({ error: 'Не вдалося завантажити фото' }, { status: 500 });

    // Step 1: GPT-4o → prompts
    const prompts = await buildKontextPrompts(resolvedBase64, productName, cleanBullets, category);
    if (!prompts.v1 && !prompts.v2 && !prompts.v3)
      return NextResponse.json({ error: 'Не вдалося проаналізувати товар' }, { status: 500 });

    // Step 2: Flux Kontext — sequentially
    const labels = ['Lifestyle', 'Технічний', 'Переваги'];
    const promptList = [prompts.v1, prompts.v2, prompts.v3];
    const results: { url: string; label: string }[] = [];

    for (let i = 0; i < 3; i++) {
      if (!promptList[i]) continue;
      try {
        const buf = await runFluxKontext(publicImageUrl, promptList[i]);
        if (buf) {
          const url = await uploadToStorage(supabase, buf, user.id, i + 1);
          results.push({ url, label: labels[i] });
        }
      } catch (e) { console.error(`Variant ${i} failed:`, e); }
    }

    if (results.length === 0)
      return NextResponse.json({ error: 'Не вдалося згенерувати жоден варіант' }, { status: 500 });

    // Step 3: Save to DB
    if (cardId) {
      const { error } = await supabase
        .from('cards')
        .update({ infographic_urls: results.map(r => ({ url: r.url, label: r.label })) })
        .eq('id', cardId)
        .eq('user_id', user.id);
      if (error) console.error('Failed to save infographics:', error);
    }

    return NextResponse.json({ variants: results });

  } catch (err: unknown) {
    console.error('Infographic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка генерації' },
      { status: 500 },
    );
  }
}
