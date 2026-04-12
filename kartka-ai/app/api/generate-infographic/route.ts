import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  buf: Buffer, userId: string,
): Promise<string> {
  try {
    const fileName = `infographics/${userId}/${Date.now()}.jpg`;
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

async function buildPrompt(
  imageBase64: string, productName: string,
  bullets: string[], category: string, variant: 'lifestyle' | 'benefits',
): Promise<string> {
  const bulletText = bullets.slice(0, 4).map((b, i) => `${i + 1}. ${b}`).join('\n');

  const variantInstructions = variant === 'lifestyle'
    ? `LIFESTYLE CALLOUT STYLE:
Transform into professional lifestyle marketplace infographic.
Add dramatic atmospheric background matching the product category (outdoor scene, studio, etc).
Add 3-4 annotation callout lines with arrows pointing to key product features with short Ukrainian text labels.
Keep product clearly visible and centered. Add bold Ukrainian title at top on dark semi-transparent bar.
Style: professional marketplace photography, cinematic lighting.`
    : `BENEFITS GRID STYLE:
Transform into bold graphic infographic with vibrant colored background matching the product.
Surround product with 3-4 benefit badge blocks showing Ukrainian feature text.
Dynamic modern composition with geometric elements. Energetic marketplace style.
Product hero centered, Ukrainian title at top, benefits arranged around it.`;

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
Analyze this product and create ONE editing prompt for Flux Kontext image editor.

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
    }],
    max_tokens: 400, temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || '';
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

    if (prediction.status === 'succeeded') {
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!outputUrl) return null;
      const imgRes = await fetch(outputUrl);
      return Buffer.from(await imgRes.arrayBuffer());
    }

    let current = prediction;
    let attempts = 0;
    while (current.status !== 'succeeded' && current.status !== 'failed' && current.status !== 'canceled' && attempts < 30) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${current.id}`,
        { headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` } },
      );
      current = await pollRes.json();
      attempts++;
    }

    if (current.status !== 'succeeded') {
      console.error('Flux failed:', current.error);
      return null;
    }

    const outputUrl = Array.isArray(current.output) ? current.output[0] : current.output;
    if (!outputUrl) return null;
    const imgRes = await fetch(outputUrl);
    return Buffer.from(await imgRes.arrayBuffer());

  } catch (e) {
    console.error('Flux error:', e);
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
      bullets = [], category = 'general',
      variant = 'lifestyle', // 'lifestyle' | 'benefits'
      cardId,
      allVariants, // ÃÂÃÂ¼ÃÂÃÂ°ÃÂÃÂÃÂÃÂ¸ÃÂÃÂ² ÃÂÃÂ²ÃÂÃÂ¶ÃÂÃÂµ ÃÂÃÂ·ÃÂÃÂ³ÃÂÃÂµÃÂÃÂ½ÃÂÃÂµÃÂÃÂÃÂÃÂ¾ÃÂÃÂ²ÃÂÃÂ°ÃÂÃÂ½ÃÂÃÂ¸ÃÂÃÂ ÃÂÃÂ²ÃÂÃÂ°ÃÂÃÂÃÂÃÂÃÂÃÂ°ÃÂÃÂ½ÃÂÃÂÃÂÃÂÃÂÃÂ² ÃÂÃÂ´ÃÂÃÂ»ÃÂÃÂ ÃÂÃÂ·ÃÂÃÂ±ÃÂÃÂµÃÂÃÂÃÂÃÂµÃÂÃÂ¶ÃÂÃÂµÃÂÃÂ½ÃÂÃÂ½ÃÂÃÂ ÃÂÃÂ² DB
    } = await req.json();

    // ÃÂÃÂ¯ÃÂÃÂºÃÂÃÂÃÂÃÂ¾ ÃÂÃÂ¿ÃÂÃÂµÃÂÃÂÃÂÃÂµÃÂÃÂ´ÃÂÃÂ°ÃÂÃÂ½ÃÂÃÂ¾ allVariants ÃÂ¢ÃÂÃÂ ÃÂÃÂ¿ÃÂÃÂÃÂÃÂ¾ÃÂÃÂÃÂÃÂÃÂÃÂ¾ ÃÂÃÂ·ÃÂÃÂ±ÃÂÃÂµÃÂÃÂÃÂÃÂÃÂÃÂ³ÃÂÃÂ°ÃÂÃÂÃÂÃÂ¼ÃÂÃÂ¾ ÃÂÃÂ² DB ÃÂÃÂ ÃÂÃÂ²ÃÂÃÂ¸ÃÂÃÂÃÂÃÂ¾ÃÂÃÂ´ÃÂÃÂ¸ÃÂÃÂ¼ÃÂÃÂ¾
    if (allVariants && cardId) {
      const { error } = await supabase
        .from('cards')
        .update({ infographic_urls: allVariants })
        .eq('id', cardId)
        .eq('user_id', user.id);
      if (error) console.error('Save error:', error);
      return NextResponse.json({ saved: true });
    }

    if (!productName.trim())
      return NextResponse.json({ error: 'ÃÂÃÂÃÂÃÂ¾ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ±ÃÂÃÂ½ÃÂÃÂ° ÃÂÃÂ½ÃÂÃÂ°ÃÂÃÂ·ÃÂÃÂ²ÃÂÃÂ° ÃÂÃÂÃÂÃÂ¾ÃÂÃÂ²ÃÂÃÂ°ÃÂÃÂÃÂÃÂ' }, { status: 400 });

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
      return NextResponse.json({ error: 'ÃÂÃÂÃÂÃÂ¾ÃÂÃÂÃÂÃÂÃÂÃÂÃÂÃÂ±ÃÂÃÂ½ÃÂÃÂµ ÃÂÃÂÃÂÃÂ¾ÃÂÃÂÃÂÃÂ¾ ÃÂÃÂÃÂÃÂ¾ÃÂÃÂ²ÃÂÃÂ°ÃÂÃÂÃÂÃÂ' }, { status: 400 });

    const cleanBullets = (bullets as string[])
      .filter(x => x.trim()).slice(0, 4)
      .map(x => x.replace(/^[ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ¢]\s*/, '').trim());

    const publicImageUrl = await uploadImageForFlux(supabase, resolvedBase64, user.id);
    if (!publicImageUrl)
      return NextResponse.json({ error: 'ÃÂÃÂÃÂÃÂµ ÃÂÃÂ²ÃÂÃÂ´ÃÂÃÂ°ÃÂÃÂ»ÃÂÃÂ¾ÃÂÃÂÃÂÃÂ ÃÂÃÂ·ÃÂÃÂ°ÃÂÃÂ²ÃÂÃÂ°ÃÂÃÂ½ÃÂÃÂÃÂÃÂ°ÃÂÃÂ¶ÃÂÃÂ¸ÃÂÃÂÃÂÃÂ¸ ÃÂÃÂÃÂÃÂ¾ÃÂÃÂÃÂÃÂ¾' }, { status: 500 });

    const prompt = await buildPrompt(
      resolvedBase64, productName, cleanBullets, category,
      variant as 'lifestyle' | 'benefits',
    );
    if (!prompt)
      return NextResponse.json({ error: 'ÃÂÃÂÃÂÃÂµ ÃÂÃÂ²ÃÂÃÂ´ÃÂÃÂ°ÃÂÃÂ»ÃÂÃÂ¾ÃÂÃÂÃÂÃÂ ÃÂÃÂ¿ÃÂÃÂ¾ÃÂÃÂ±ÃÂÃÂÃÂÃÂ´ÃÂÃÂÃÂÃÂ²ÃÂÃÂ°ÃÂÃÂÃÂÃÂ¸ ÃÂÃÂ¿ÃÂÃÂÃÂÃÂ¾ÃÂÃÂ¼ÃÂÃÂ¿ÃÂÃÂ' }, { status: 500 });

    const buf = await runFluxKontext(publicImageUrl, prompt);
    if (!buf)
      return NextResponse.json({ error: 'Flux Kontext ÃÂÃÂ½ÃÂÃÂµ ÃÂÃÂ·ÃÂÃÂ¼ÃÂÃÂÃÂÃÂ³ ÃÂÃÂ·ÃÂÃÂ³ÃÂÃÂµÃÂÃÂ½ÃÂÃÂµÃÂÃÂÃÂÃÂÃÂÃÂ²ÃÂÃÂ°ÃÂÃÂÃÂÃÂ¸ ÃÂÃÂ·ÃÂÃÂ¾ÃÂÃÂ±ÃÂÃÂÃÂÃÂ°ÃÂÃÂ¶ÃÂÃÂµÃÂÃÂ½ÃÂÃÂ½ÃÂÃÂ' }, { status: 500 });

    const url = await uploadToStorage(supabase, buf, user.id);
    const label = variant === 'lifestyle' ? 'Lifestyle' : 'ÃÂÃÂÃÂÃÂµÃÂÃÂÃÂÃÂµÃÂÃÂ²ÃÂÃÂ°ÃÂÃÂ³ÃÂÃÂ¸';

    return NextResponse.json({ url, label });

  } catch (err: unknown) {
    console.error('Infographic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ÃÂÃÂÃÂÃÂ¾ÃÂÃÂ¼ÃÂÃÂ¸ÃÂÃÂ»ÃÂÃÂºÃÂÃÂ° ÃÂÃÂ³ÃÂÃÂµÃÂÃÂ½ÃÂÃÂµÃÂÃÂÃÂÃÂ°ÃÂÃÂÃÂÃÂÃÂÃÂ' },
      { status: 500 },
    );
  }
}
