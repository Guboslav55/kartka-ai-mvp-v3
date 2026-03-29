import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STYLE_PROMPTS: Record<string, string> = {
  dark:  'dark navy/black premium background, subtle gold rim lighting, dramatic studio photography',
  white: 'pure white seamless background, soft diffused studio lighting, high-key photography',
  navy:  'deep navy blue gradient background, cool blue accent lighting, premium feel',
  gold:  'very dark background with warm golden bokeh and ambient glow, luxury look',
};

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  b64: string,
  userId: string
): Promise<string | null> {
  try {
    const buffer = Buffer.from(b64, 'base64');
    const fileName = `banners/${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (error) return null;
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch { return null; }
}

function buildPrompt(template: string, productName: string, price: string, bullets: string[], bgStyle: string): string {
  const style = STYLE_PROMPTS[bgStyle] ?? STYLE_PROMPTS.dark;
  const b = bullets.filter(x => x.trim()).slice(0, 3).map(x => x.replace(/^[✓•]\s*/, ''));

  if (template === 'benefits') {
    return `Professional e-commerce product card banner, 1024x1024 pixels.

DESIGN: Split layout. Left 58%: product photo with dramatic drop shadow on ${style}. Right 42%: elegant dark frosted glass panel.

RIGHT PANEL — render this text exactly:
• Header label: "ПЕРЕВАГИ" in small caps gold color
• Product title: "${productName}" in bold white sans-serif font, 2 lines max
• Thin gold divider line
• 3 benefit rows with gold circle checkmark icon:
  — "${b[0] || 'Висока якість матеріалів'}"
  — "${b[1] || 'Зручна та ергономічна конструкція'}"  
  — "${b[2] || 'Довговічність та надійність'}"
${price ? `• Price block at bottom: "${price} ₴" in very large bold gold Unbounded-style font, centered` : ''}

TYPOGRAPHY: Clean modern sans-serif. All text sharp and fully readable. No blurry text.
STYLE: ${style}. Ukrainian premium marketplace aesthetic. No watermarks. No placeholder text.`;
  }

  if (template === 'callout') {
    return `Professional e-commerce product card banner, 1024x1024 pixels.

DESIGN: Product centered (65% of frame). ${style}.

TOP BAR: Semi-transparent frosted panel, product name "${productName}" in bold centered white text.

CALLOUT ANNOTATIONS — 3 annotation labels with thin dashed lines pointing to product parts:
• Left callout: "${b[0] || 'Якісний матеріал'}" — small white label with gold left border
• Right callout: "${b[1] || 'Ергономічний дизайн'}" — same style  
• Bottom-left callout: "${b[2] || 'Надійна конструкція'}" — same style

Each callout: frosted dark pill label, text fully readable, thin dashed gold line to product.
${price ? `BOTTOM CENTER: Price "${price} ₴" in large bold gold font on frosted bar.` : ''}

All text must be sharp and fully readable. ${style}. No watermarks.`;
  }

  // CTA template
  return `Professional e-commerce product card banner, 1024x1024 pixels.

DESIGN: Left 45%: product photo, dramatic lighting, drop shadow. Right 55%: text layout on ${style}.

RIGHT SIDE — render this text exactly:
• Small label: "НОВА КОЛЕКЦІЯ" in gold small caps
• Product name: "${productName}" bold white 2-line title
• 3 benefit rows with gold checkmarks:
  ✓ "${b[0] || 'Преміум якість'}"
  ✓ "${b[1] || 'Зручно та практично'}"
  ✓ "${b[2] || 'Гарантія якості'}"
${price ? `• Large price: "${price} ₴" in very large bold gold font` : ''}
• CTA button: gold rounded rectangle with text "ЗАМОВИТИ ЗАРАЗ" in dark bold
• Below button: small text "🚚 Доставка по всій Україні"

TYPOGRAPHY: All text sharp, readable, professional. ${style}. No watermarks.`;
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

    const { productName, price, bullets, bgStyle = 'dark', template = 'benefits', imageBase64 } = await req.json();

    const prompt = buildPrompt(template, productName || 'Товар', price || '', bullets || [], bgStyle);

    let imageUrl: string | null = null;

    // Try gpt-image-1 with uploaded photo first
    if (imageBase64) {
      try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(base64Data, 'base64');
        const file = new File([buf], 'product.jpg', { type: 'image/jpeg' });

        const result = await (openai.images as any).edit({
          model: 'gpt-image-1',
          image: file,
          prompt: `${prompt}\n\nIMPORTANT: The uploaded image is the actual product photo. Composite it into the banner layout described above. Keep the product recognizable and sharp.`,
          n: 1,
          size: '1024x1024',
          quality: 'high',
        });

        const b64 = result.data[0]?.b64_json;
        if (b64) {
          const perm = await uploadToStorage(supabase, b64, user.id);
          imageUrl = perm ?? `data:image/png;base64,${b64}`;
        }
      } catch (err) {
        console.warn('gpt-image-1 failed, fallback to dall-e-3:', err);
      }
    }

    // Fallback: DALL-E 3 generation
    if (!imageUrl) {
      const result = await openai.images.generate({
        model: 'dall-e-3',
        prompt,
        size: '1024x1024',
        quality: 'hd',
        style: 'natural',
        n: 1,
      });
      const url = result.data[0]?.url;
      if (url) {
        const r = await fetch(url);
        const b = await r.arrayBuffer();
        const b64 = Buffer.from(b).toString('base64');
        const perm = await uploadToStorage(supabase, b64, user.id);
        imageUrl = perm ?? url;
      }
    }

    return NextResponse.json({ imageUrl });

  } catch (err: unknown) {
    console.error('Banner error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка генерації' }, { status: 500 });
  }
}

