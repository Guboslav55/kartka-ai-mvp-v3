import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  b64: string, userId: string, idx: number,
): Promise<string> {
  try {
    const buf = Buffer.from(b64, 'base64');
    const fileName = `infographics/${userId}/${Date.now()}-v${idx}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${b64}`;
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return `data:image/jpeg;base64,${b64}`;
  }
}

// ── Step 1: GPT-4o аналізує товар → 3 різних промпти ────────────────────────
async function buildThreePrompts(
  imageBase64: string,
  productName: string,
  description: string,
  bullets: string[],
  platform: string,
): Promise<string[]> {

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

Analyze this product image and create 3 DIFFERENT infographic prompts for DALL-E 3.

Product: "${productName}"
Key features:
${bulletText}
Platform: ${platform}

Create exactly 3 prompts, each for a completely different infographic style:

VARIANT 1 — LIFESTYLE: Show the product being used in real life. Person using it, environment matching the product category, emotional atmosphere. Product prominently featured. Style: photorealistic, warm lighting.

VARIANT 2 — TECHNICAL CALLOUT: Product centered on clean background, with 3-4 annotation arrows pointing to key details/features. Labels next to arrows showing feature names. Clean, minimalist, professional design. Style: technical diagram aesthetic.

VARIANT 3 — BENEFITS GRID: Product in center, surrounded by 4 benefit icons/illustrations in corners. Each corner has a small icon + 2-3 word label. Bold typography. Dynamic composition. Style: modern graphic design, bold colors matching the product.

CRITICAL RULES FOR ALL 3:
- All text must be in Ukrainian language
- Product must be clearly visible and be the hero
- 1024x1024 square format
- High quality, professional marketplace infographic
- NO generic lorem ipsum — use real product features from above

Respond with ONLY a JSON object:
{
  "v1": "detailed DALL-E 3 prompt for lifestyle variant...",
  "v2": "detailed DALL-E 3 prompt for technical callout variant...",
  "v3": "detailed DALL-E 3 prompt for benefits grid variant..."
}`,
        },
      ],
    }],
    max_tokens: 1200,
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(raw);
    return [
      parsed.v1 || '',
      parsed.v2 || '',
      parsed.v3 || '',
    ].filter(Boolean);
  } catch {
    return [];
  }
}

// ── Step 2: Generate one variant ─────────────────────────────────────────────
async function generateVariant(prompt: string, variantLabel: string): Promise<string | null> {
  try {
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt + `\n\nIMPORTANT: Square 1024x1024 format. Ukrainian text only. Professional marketplace infographic quality.`,
      size: '1024x1024',
      quality: 'hd',
      style: 'vivid',
      n: 1,
      response_format: 'b64_json',
    });
    return res.data[0]?.b64_json ?? null;
  } catch (e) {
    console.error(`Variant ${variantLabel} failed:`, e);
    return null;
  }
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
      imageBase64,   // base64 string OR null
      imageUrl,      // Supabase URL OR null
      productName = '',
      description = '',
      bullets = [],
      platform = 'general',
    } = await req.json();

    if (!productName.trim()) return NextResponse.json({ error: 'Потрібна назва товару' }, { status: 400 });

    // Resolve image — accept base64 or Supabase URL
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
    if (!resolvedImage) return NextResponse.json({ error: 'Потрібне фото товару' }, { status: 400 });

    const b = (bullets as string[]).filter((x: string) => x.trim()).slice(0, 4)
      .map((x: string) => x.replace(/^[✓•]\s*/, '').trim());

    // Step 1: GPT-4o builds 3 unique prompts
    const prompts = await buildThreePrompts(resolvedImage, productName, description, b, platform);

    if (prompts.length === 0) {
      return NextResponse.json({ error: 'Не вдалося проаналізувати товар' }, { status: 500 });
    }

    // Step 2: Generate all 3 variants in parallel
    const [b64_1, b64_2, b64_3] = await Promise.all([
      generateVariant(prompts[0], 'lifestyle'),
      generateVariant(prompts[1] || prompts[0], 'technical'),
      generateVariant(prompts[2] || prompts[0], 'benefits'),
    ]);

    // Step 3: Upload all to storage in parallel
    const results = await Promise.all([
      b64_1 ? uploadToStorage(supabase, b64_1, user.id, 1) : Promise.resolve(null),
      b64_2 ? uploadToStorage(supabase, b64_2, user.id, 2) : Promise.resolve(null),
      b64_3 ? uploadToStorage(supabase, b64_3, user.id, 3) : Promise.resolve(null),
    ]);

    const variants = results
      .map((url, i) => url ? ({
        url,
        label: ['Lifestyle', 'Технічний', 'Переваги'][i],
        prompt: prompts[i] || '',
      }) : null)
      .filter(Boolean);

    if (variants.length === 0) {
      return NextResponse.json({ error: 'Не вдалося згенерувати жоден варіант' }, { status: 500 });
    }

    return NextResponse.json({ variants });

  } catch (err: unknown) {
    console.error('Generate infographic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка генерації' },
      { status: 500 },
    );
  }
}

