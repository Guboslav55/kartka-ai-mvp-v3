import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  buf: Buffer,
  userId: string,
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
    const { error } = await supabase.storage.from('card-images')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });
    if (error) return null;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch {
    return null;
  }
}

async function buildPrompt(
  imageBase64: string,
  productName: string,
  bullets: string[],
  category: string,
  variant: 'lifestyle' | 'benefits' | 'studio',
): Promise<string> {
  const bulletText = bullets.slice(0, 4).map((b, i) => `${i + 1}. ${b}`).join('\n');

  const variantInstructions = variant === 'lifestyle'
    ? `LIFESTYLE: Transform background into dramatic atmospheric scene matching the product. Keep product centered and clearly visible. NO TEXT. NO labels. NO annotations. Only change background and lighting.`
    : variant === 'studio'
    ? `STUDIO PHOTO: Transform into professional studio product photography. Pure white or light grey seamless background. Perfect soft studio lighting from multiple angles. Product centered, sharp focus, commercial e-commerce quality. Clean minimal composition. NO TEXT.`
    : `BENEFITS: Dynamic colorful graphic background with geometric shapes and energy. Product hero centered. Vivid contrasting colors. Modern marketplace infographic style. NO TEXT. NO labels. NO written words.`;

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
    }],
    max_tokens: 400,
    temperature: 0.7,
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
    while (
      current.status !== 'succeeded' &&
      current.status !== 'failed' &&
      current.status !== 'canceled' &&
      attempts < 30
    ) {
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


// ─── Claude designs text layout ──────────────────────────────────────────────

interface TextEl { text:string; x:number; y:number; fontSize:number; fontWeight:'normal'|'bold'; color:string; bgColor:string|null; bgPadding:number; align:'left'|'center'|'right'; maxWidth:number; }
interface Layout { accentColor:string; elements:TextEl[]; }

async function getLayoutFromClaude(fluxImageUrl:string, productName:string, bullets:string[], variant:string): Promise<Layout|null> {
  if (!ANTHROPIC_KEY) { console.error('No ANTHROPIC_API_KEY'); return null; }
  try {
    const fluxRes = await fetch(fluxImageUrl);
    const fluxB64 = Buffer.from(await fluxRes.arrayBuffer()).toString('base64');
    const fluxMime = (fluxRes.headers.get('content-type')||'image/jpeg') as 'image/jpeg'|'image/png'|'image/webp'|'image/gif';
    const colorHint = variant==='studio' ? 'dark text #1a1a1a, null bgColor' : 'white text #ffffff, dark bgColor #000000aa';
    const variantHint = variant==='lifestyle' ? 'dark atmospheric' : variant==='studio' ? 'white studio' : 'colorful graphic';

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},
      body:JSON.stringify({
        model:'claude-haiku-4-5-20251001', max_tokens:600,
        messages:[{role:'user',content:[
          {type:'image',source:{type:'base64',media_type:fluxMime,data:fluxB64}},
          {type:'text',text:'Ukrainian marketplace infographic designer. Background: '+variantHint+'. Product: "'+productName+'". Benefits: '+bullets.slice(0,3).join(', ')+'. Design 2-3 text overlays for 1024x1024. RULES: product in center x:200-824 y:100-900 - NO text there. Use only: top y<90, bottom y>920, edges x<100 or x>924. ALL text Ukrainian. Colors: '+colorHint+'. title: product name, x:512 y:965 align:center fontSize:44 bold. badge: spec, x:950 y:55 align:right fontSize:16 bgColor:accent. Return JSON only no markdown: {"accentColor":"#hex","elements":[{"text":"...","x":n,"y":n,"fontSize":n,"fontWeight":"bold","color":"#hex","bgColor":"#hex or null","bgPadding":10,"align":"left","maxWidth":500}]}'}
        ]}]
      })
    });
    if (!resp.ok) { console.error('Claude error:',resp.status,await resp.text()); return null; }
    const data = await resp.json() as {content:Array<{type:string;text:string}>};
    const raw = data.content[0]?.type==='text' ? data.content[0].text : '';
    const clean = raw.replace(/```[a-z]*/gi,'').replace(/```/g,'').trim();
    const m = clean.match(/\{[\s\S]*\}/);
    if (!m) { console.error('No JSON:',clean.slice(0,200)); return null; }
    const parsed = JSON.parse(m[0]) as Layout;
    console.log('Claude layout ok, elements:',parsed.elements?.length);
    return parsed;
  } catch(e) { console.error('getLayoutFromClaude error:',e); return null; }
}

async function compositeText(fluxBuf: Buffer, layout: Layout): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const satori = (await import('satori')).default;

  // Завантажуємо woff шрифт для кирилиці (subset достатній для satori)
  let fontRegData: ArrayBuffer | null = null;
  let fontBoldData: ArrayBuffer | null = null;
  try {
    const [reg, bold] = await Promise.all([
      fetch('https://fonts.gstatic.com/s/notosans/v42/o-0bIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjc5aPdu2ui.woff2'),
      fetch('https://fonts.gstatic.com/s/notosans/v42/o-0NIpQlx3QUlC5A4PNjThbTkjc.woff2'),
    ]);
    fontRegData = await reg.arrayBuffer();
    fontBoldData = await bold.arrayBuffer();
    console.log('Fonts loaded reg:', fontRegData.byteLength, 'bold:', fontBoldData.byteLength);
  } catch(e) { console.error('Font fetch failed:', e); }

  if (!fontRegData) {
    // Fallback: повертаємо без тексту
    console.warn('No font, returning Flux image without text');
    return fluxBuf;
  }

  // Будуємо JSX дерево для satori
  const children = layout.elements.map(el => {
    const isCenter = el.align === 'center';
    const isRight = el.align === 'right';
    return {
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          left: isRight ? undefined : el.x,
          right: isRight ? (1024 - el.x) : undefined,
          top: el.y - el.fontSize - (el.bgPadding || 10),
          backgroundColor: el.bgColor && el.bgColor !== 'null' ? el.bgColor : 'transparent',
          color: el.color,
          fontSize: el.fontSize,
          fontWeight: el.fontWeight === 'bold' ? 700 : 400,
          fontFamily: 'NotoSans',
          padding: el.bgColor && el.bgColor !== 'null' ? el.bgPadding || 10 : 0,
          borderRadius: 8,
          maxWidth: el.maxWidth,
          textAlign: isCenter ? 'center' : isRight ? 'right' : 'left',
          lineHeight: 1.3,
          textShadow: '0 1px 3px rgba(0,0,0,0.9)',
        },
        children: el.text,
      }
    };
  });

  // Satori рендерить JSX → SVG з правильними шрифтами
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: { width: 1024, height: 1024, position: 'relative', display: 'flex' },
        children: [
          // Градієнти через div overlay
          { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 100, background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)' } } },
          { type: 'div', props: { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' } } },
          // Accent bars
          { type: 'div', props: { style: { position: 'absolute', top: 0, right: 0, width: 8, height: 150, backgroundColor: layout.accentColor } } },
          { type: 'div', props: { style: { position: 'absolute', bottom: 0, left: 0, width: 150, height: 8, backgroundColor: layout.accentColor } } },
          ...children,
        ],
      }
    },
    {
      width: 1024,
      height: 1024,
      fonts: [
        { name: 'NotoSans', data: fontRegData, weight: 400, style: 'normal' },
        { name: 'NotoSans', data: fontBoldData || fontRegData, weight: 700, style: 'normal' },
      ],
    }
  );

  // Sharp компонує: Flux зображення + satori SVG overlay
  return sharp(fluxBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
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
      imageBase64,
      imageUrl,
      productName = '',
      bullets = [],
      category = 'general',
      variant = 'lifestyle',
      cardId,
      allVariants,
    } = await req.json();

    if (allVariants && cardId) {
      const { error } = await supabase
        .from('cards')
        .update({ infographic_urls: allVariants })
        .eq('id', cardId)
        .eq('user_id', user.id);
      if (error) console.error('Save error:', error);
      return NextResponse.json({ saved: true });
    }

    if (!productName.trim()) return NextResponse.json({ error: 'Потрібна назва товару' }, { status: 400 });

    let resolvedBase64 = imageBase64 || '';
    if (!resolvedBase64 && imageUrl) {
      try {
        const r = await fetch(imageUrl);
        const buf = await r.arrayBuffer();
        const mime = r.headers.get('content-type') || 'image/jpeg';
        resolvedBase64 = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
      } catch (e) {
        console.warn('fetch imageUrl failed:', e);
      }
    }

    if (!resolvedBase64) return NextResponse.json({ error: 'Потрібне фото товару' }, { status: 400 });

    const cleanBullets = (bullets as string[])
      .filter(x => x.trim()).slice(0, 4)
      .map(x => x.replace(/^[✓✔•]s*/, '').trim());

    const publicImageUrl = await uploadImageForFlux(supabase, resolvedBase64, user.id);
    if (!publicImageUrl) return NextResponse.json({ error: 'Не вдалося завантажити фото' }, { status: 500 });

    const prompt = await buildPrompt(
      resolvedBase64,
      productName,
      cleanBullets,
      category,
      variant as 'lifestyle' | 'benefits' | 'studio',
    );
    if (!prompt) return NextResponse.json({ error: 'Не вдалося побудувати промпт' }, { status: 500 });

    const buf = await runFluxKontext(publicImageUrl, prompt);
    if (!buf) return NextResponse.json({ error: 'Flux Kontext не зміг згенерувати' }, { status: 500 });

    // Claude text overlay
  let finalBuf = buf;
  try {
    const fluxTmp = `temp/${user.id}/flux-${Date.now()}.jpg`;
    await supabase.storage.from('card-images').upload(fluxTmp, buf, {contentType:'image/jpeg',upsert:true});
    const fluxPubUrl = supabase.storage.from('card-images').getPublicUrl(fluxTmp).data.publicUrl;
    const layout = await getLayoutFromClaude(fluxPubUrl, productName, cleanBullets, variant);
    if (layout && layout.elements.length > 0) {
      finalBuf = await compositeText(buf, layout);
      console.log('Text overlay applied');
    }
  } catch(e) { console.error('Overlay failed, using Flux only:', e); }
  const url = await uploadToStorage(supabase, finalBuf, user.id);
    const label = variant === 'lifestyle' ? 'Lifestyle' : variant === 'studio' ? 'Студійне фото' : 'Переваги';

    return NextResponse.json({ url, label });
  } catch (err: unknown) {
    console.error('Infographic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка генерації' },
      { status: 500 },
    );
  }
}