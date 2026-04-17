import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

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


// ── Claude text overlay ───────────────────────────────────────────────────────

async function getTextOverlay(
  productBase64: string,
  fluxImageUrl: string,
  productName: string,
  bullets: string[],
  variant: string,
): Promise<Array<{text:string;x:number;y:number;fontSize:number;fontWeight:string;color:string;bgColor:string|null;bgPadding:number;bgRadius:number;align:string;maxWidth:number}>> {
  try {
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) { console.error('No ANTHROPIC_API_KEY'); return []; }

    const name = productName.slice(0, 30);
    const spec1 = bullets[0] ? bullets[0].replace(/^[\u2713\u2714\u2022]\s*/, '').trim().slice(0, 35) : '';
    const spec2 = bullets[1] ? bullets[1].replace(/^[\u2713\u2714\u2022]\s*/, '').trim().slice(0, 35) : '';

    const bgHint = variant === 'lifestyle' ? 'dark forest/atmospheric' : variant === 'studio' ? 'white/grey studio' : 'colorful graphic';
    const colorHint = variant === 'studio' ? 'dark (#1a1a1a) text, light or null background' : 'white (#ffffff) text, dark semi-transparent background';

    const userMsg = 'Design text overlays for a 1024x1024 marketplace infographic. ' +
      'Product: ' + name + '. ' +
      'Key specs: ' + spec1 + (spec2 ? ', ' + spec2 : '') + '. ' +
      'Background: ' + bgHint + '. ' +
      'Color scheme: ' + colorHint + '. ' +
      'RULES: place text only in corners/edges/strips (y<100 or y>900 or x<120 or x>900), NEVER in center where product stands, all text in Ukrainian, max 3 elements. ' +
      'Return ONLY a JSON array with objects having these exact fields: text, x, y, fontSize, fontWeight, color, bgColor, bgPadding, bgRadius, align, maxWidth. ' +
      'Example: [{"text":"ПОМСТА","x":40,"y":970,"fontSize":40,"fontWeight":"bold","color":"#ffffff","bgColor":"#000000","bgPadding":10,"bgRadius":6,"align":"left","maxWidth":450}]';

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: userMsg }]
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Claude API error:', resp.status, errText.slice(0, 400));
      return [];
    }

    const data = await resp.json() as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === 'text' ? data.content[0].text : '';
    console.log('Claude overlay raw:', raw.slice(0, 200));
    const m = raw.match(/\[[\s\S]*?\]/);
    if (!m) { console.error('No JSON array found in:', raw.slice(0, 300)); return []; }
    const parsed = JSON.parse(m[0]);
    console.log('Claude overlay elements:', parsed.length);
    return parsed;
  } catch(e) {
    console.error('getTextOverlay error:', e);
    return [];
  }
}

async function addTextOverlay(imageBuf: Buffer, elements: Array<{text:string;x:number;y:number;fontSize:number;fontWeight:string;color:string;bgColor:string|null;bgPadding:number;bgRadius:number;align:string;maxWidth:number}>): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const parts = elements.map(el => {
    const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
    const fw = el.fontWeight === 'bold' ? '700' : '400';
    const maxW = el.maxWidth || 350;
    const pad = el.bgPadding || 8;
    const rx = el.bgRadius || 6;
    const words = el.text.split(' ');
    const cpl = Math.floor(maxW / (el.fontSize * 0.55));
    const lines: string[] = []; let cur = '';
    for (const w of words) { const c = cur ? cur+' '+w : w; if(c.length>cpl){if(cur)lines.push(cur);cur=w;}else cur=c; }
    if(cur) lines.push(cur);
    const lh = el.fontSize * 1.25;
    let bg = '';
    if(el.bgColor && el.bgColor !== 'null') {
      const bx = el.align==='center'?el.x-maxW/2-pad:el.align==='right'?el.x-maxW-pad:el.x-pad;
      bg = `<rect x="${bx}" y="${el.y-el.fontSize-pad}" width="${maxW+pad*2}" height="${lines.length*lh+pad*2}" rx="${rx}" fill="${el.bgColor}" fill-opacity="0.82"/>`;
    }
    const ts = lines.map((l,i)=>`<tspan x="${el.x}" dy="${i===0?0:lh}">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</tspan>`).join('');
    return `${bg}<text x="${el.x}" y="${el.y}" font-family="Arial,sans-serif" font-size="${el.fontSize}" font-weight="${fw}" fill="${el.color}" text-anchor="${anchor}" dominant-baseline="auto">${ts}</text>`;
  });
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  return sharp(imageBuf).composite([{input:Buffer.from(svg),top:0,left:0}]).jpeg({quality:92}).toBuffer();
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

    // Claude adds text overlay
  let finalBuf = buf;
  try {
    const fluxTempName = `temp/${user.id}/flux-ov-${Date.now()}.jpg`;
    await supabase.storage.from('card-images').upload(fluxTempName, buf, { contentType: 'image/jpeg', upsert: true });
    const fluxPubUrl = supabase.storage.from('card-images').getPublicUrl(fluxTempName).data.publicUrl;
    const elements = await getTextOverlay(resolvedBase64, fluxPubUrl, productName, cleanBullets, variant);
    if (elements.length > 0) finalBuf = await addTextOverlay(buf, elements);
  } catch(e) { console.error('Overlay pipeline failed, using image without text:', e); }
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