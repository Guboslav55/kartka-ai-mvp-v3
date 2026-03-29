import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STYLE_PROMPTS: Record<string, string> = {
  dark:  'very dark navy/black gradient, subtle golden rim light from top-right, premium dramatic studio atmosphere',
  white: 'pure white seamless gradient, soft diffused studio lighting from top-left, clean minimal',
  navy:  'deep navy blue to dark blue gradient, cool blue accent lighting, professional premium',
  gold:  'very dark charcoal background with warm golden ambient glow and bokeh, luxury feel',
};

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  b64: string,
  userId: string
): Promise<string | null> {
  try {
    const buffer = Buffer.from(b64, 'base64');
    const fileName = `banners/${userId}/${Date.now()}.png`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: 'image/png' });
    if (error) return null;
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch { return null; }
}

function buildBackgroundPrompt(template: string, productName: string, price: string, bullets: string[], bgStyle: string): string {
  const style = STYLE_PROMPTS[bgStyle] ?? STYLE_PROMPTS.dark;
  const b = bullets.filter(x => x.trim()).slice(0, 3).map(x => x.replace(/^[✓•]\s*/, '').trim());

  // IMPORTANT: We generate background + text overlay ONLY
  // The actual product photo will be composited on top via Canvas

  if (template === 'benefits') {
    return `Create a product card background layout for Ukrainian marketplace (1024x1024px).

IMPORTANT: This is BACKGROUND ONLY — left side must be EMPTY space (solid dark area) where product photo will be placed later.

LEFT HALF (x:0 to x:512): completely empty ${style} background — NO objects, NO product, just clean background with subtle lighting.

RIGHT HALF (x:512 to x:1024): elegant frosted glass dark panel with this exact text:
• Small label at top: "ПЕРЕВАГИ" in gold (#c8a84b) small caps, 14px
• Product name: "${productName}" in bold white, 22px, 2 lines max, Unbounded-style font
• Thin gold horizontal divider line
• 3 benefit rows, each with small gold circle ✓ icon on left:
  Row 1: "${b[0] || 'Висока якість матеріалів'}"
  Row 2: "${b[1] || 'Зручна конструкція'}"
  Row 3: "${b[2] || 'Надійність та довговічність'}"
• Text color: white, 16px, Golos Text style font
${price ? `• Bottom price block: gold rounded rectangle, "${price} ₴" in large bold gold font, 32px` : ''}

Panel style: dark frosted glass rgba(0,0,0,0.7), rounded corners 20px, gold top accent bar 4px.

Overall: ${style}. Professional Ukrainian e-commerce design. Sharp crisp text. No watermarks.`;
  }

  if (template === 'callout') {
    return `Create a product card background layout for Ukrainian marketplace (1024x1024px).

IMPORTANT: CENTER AREA must be EMPTY where product photo will be placed. Generate only the background and text annotations.

BACKGROUND: ${style}. Clean gradient. Product placeholder area in center (300x400px centered).

ANNOTATIONS around the empty center — 3 callout labels with thin lines pointing inward:
• Top-left callout at (120, 180): white rounded pill label, text "${b[0] || 'Якісний матеріал'}", gold left border 3px, dark background
• Top-right callout at (650, 220): same style, text "${b[1] || 'Ергономічний дизайн'}"
• Bottom-right callout at (620, 680): same style, text "${b[2] || 'Надійна підошва'}"

Each label: max 120px wide, white text 13px, semi-transparent dark background, thin dashed line from label edge pointing to center.

TOP BAR: semi-transparent frosted pill at top center, text "${productName}" bold white 18px.
${price ? `BOTTOM CENTER: "${price} ₴" large bold gold text 36px.` : ''}

No product, no objects in image center. Only background + UI elements. ${style}.`;
  }

  // CTA
  return `Create a product card background layout for Ukrainian marketplace (1024x1024px).

IMPORTANT: LEFT SIDE (x:0 to x:420) must be EMPTY background where product photo will be placed.

LEFT SIDE: clean ${style} background, empty, maybe subtle shadow vignette on right edge.

RIGHT SIDE (x:420 to x:1024): text layout on same background:
• Small gold label: "НОВА КОЛЕКЦІЯ"
• Product name: "${productName}" bold white 24px, 2 lines
• 3 benefits with gold checkmarks:
  ✓ "${b[0] || 'Преміум якість'}"  
  ✓ "${b[1] || 'Зручно та практично'}"
  ✓ "${b[2] || 'Гарантія якості'}"
${price ? `• Large price: "${price} ₴" very large bold gold 48px` : ''}
• Gold CTA button: rounded rectangle, text "ЗАМОВИТИ ЗАРАЗ" dark bold 18px
• Small text below: "🚚 Доставка по всій Україні" gray 13px

${style}. Sharp text. No watermarks. No product illustration on right side.`;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { productName, price, bullets, bgStyle = 'dark', template = 'benefits' } = await req.json();
    // NOTE: imageBase64 is NOT used here — product photo is composited client-side

    const prompt = buildBackgroundPrompt(template, productName || 'Товар', price || '', bullets || [], bgStyle);

    // Generate background only via DALL-E 3
    const result = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      size: '1024x1024',
      quality: 'hd',
      style: 'natural',
      n: 1,
    });

    const url = result.data[0]?.url;
    if (!url) throw new Error('Не вдалося згенерувати банер');

    // Download and store permanently
    const r = await fetch(url);
    const buf = await r.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const permanent = await uploadToStorage(supabase, b64, user.id);

    return NextResponse.json({
      backgroundUrl: permanent ?? url,
      template,
    });

  } catch (err: unknown) {
    console.error('Banner error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка генерації' }, { status: 500 });
  }
}

