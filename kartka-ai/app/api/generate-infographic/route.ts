import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

type SupabaseClient = ReturnType<typeof createClient>;

async function uploadToStorage(supabase: SupabaseClient, buf: Buffer, userId: string): Promise<string> {
  try {
    const fileName = `infographics/${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('card-images').upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${buf.toString('base64')}`;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch { return `data:image/jpeg;base64,${buf.toString('base64')}`; }
}

async function uploadImageForFlux(supabase: SupabaseClient, base64: string, userId: string): Promise<string | null> {
  try {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return null;
    const mimeType = match[1];
    const ext = mimeType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    const fileName = `temp/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('card-images').upload(fileName, buffer, { contentType: mimeType, upsert: true });
    if (error) return null;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch { return null; }
}

async function buildFluxPrompt(imageBase64: string, productName: string, bullets: string[], category: string, variant: 'lifestyle' | 'benefits' | 'studio'): Promise<string> {
  const bulletText = bullets.slice(0, 4).map((b, i) => `${i + 1}. ${b}`).join('\n');
  const variantInstructions = variant === 'lifestyle'
    ? `LIFESTYLE: Transform background into dramatic atmospheric scene matching the product. Keep product centered and clearly visible. NO TEXT. NO labels. NO annotations. Only change background and lighting.`
    : variant === 'studio'
    ? `STUDIO PHOTO: Transform into professional studio product photography. Pure white or light grey seamless background. Perfect soft studio lighting from multiple angles. Product centered, sharp focus, commercial e-commerce quality. Clean minimal composition. NO TEXT.`
    : `BENEFITS: Dynamic colorful graphic background with geometric shapes and energy. Product hero centered. Vivid contrasting colors. Modern marketplace infographic style. NO TEXT. NO labels. NO written words.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`, detail: 'high' } },
      { type: 'text', text: `You are a professional Ukrainian marketplace infographic designer. Analyze this product and create ONE editing prompt for Flux Kontext image editor.

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

Return ONLY the prompt text, no JSON, no explanation.` }
    ] }],
    max_tokens: 400,
    temperature: 0.7,
  });
  return response.choices[0]?.message?.content?.trim() || '';
}

async function runFluxKontext(imageUrl: string, prompt: string): Promise<Buffer | null> {
  if (!REPLICATE_TOKEN) return null;
  try {
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
      body: JSON.stringify({ input: { prompt, input_image: imageUrl, output_format: 'jpg', output_quality: 90, safety_tolerance: 2, aspect_ratio: '1:1' } }),
    });
    const p = await res.json() as { id?: string; status?: string; output?: string | string[]; error?: string };
    const getOut = async (x: typeof p) => {
      const url = Array.isArray(x.output) ? x.output[0] : x.output;
      if (!url) return null;
      return Buffer.from(await (await fetch(url)).arrayBuffer());
    };
    if (p.status === 'succeeded') return getOut(p);
    if (!p.id) { console.error('Flux no id:', p.error); return null; }
    let cur = p;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      cur = await (await fetch(`https://api.replicate.com/v1/predictions/${cur.id}`, { headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` } })).json() as typeof p;
      if (cur.status === 'succeeded' || cur.status === 'failed' || cur.status === 'canceled') break;
    }
    if (cur.status !== 'succeeded') { console.error('Flux failed:', cur.error); return null; }
    return getOut(cur);
  } catch (e) { console.error('Flux error:', e); return null; }
}

interface TextEl { text: string; x: number; y: number; fontSize: number; fontWeight: 'normal'|'bold'; color: string; bgColor: string|null; bgPadding: number; align: 'left'|'center'|'right'; maxWidth: number; }
interface Layout { accentColor: string; elements: TextEl[]; }

async function getLayoutFromClaude(fluxImageUrl: string, productName: string, bullets: string[], variant: string): Promise<Layout> {
  const fluxRes = await fetch(fluxImageUrl);
  const fluxB64 = Buffer.from(await fluxRes.arrayBuffer()).toString('base64');
  const fluxMime = (fluxRes.headers.get('content-type') || 'image/jpeg') as 'image/jpeg'|'image/png'|'image/webp'|'image/gif';
  const colorHint = variant === 'studio' ? 'dark text #1a1a1a, light or null bgColor' : 'white text #ffffff, dark semi-transparent bgColor like #000000aa';
  const variantHint = variant === 'lifestyle' ? 'dark atmospheric' : variant === 'studio' ? 'white/grey studio' : 'colorful graphic';

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: fluxMime, data: fluxB64 } },
          { type: 'text', text:
            'Ukrainian marketplace infographic designer. Flux background: ' + variantHint + '.\n' +
            'Product: "' + productName + '". Benefits: ' + bullets.slice(0,3).join(', ') + '.\n\n' +
            'Design 2-3 text overlays for 1024x1024. STRICT:\n' +
            '- Product in CENTER (x:200-824, y:100-900) - NO text there\n' +
            '- Use ONLY: top strip y<90, bottom strip y>920, edges x<100 or x>924\n' +
            '- ALL text in Ukrainian. Colors: ' + colorHint + '\n' +
            '- title: product name, bottom center x:512 y:960, fontSize:42, bold\n' +
            '- badge: key spec top-right x:950 y:55 align:right fontSize:16\n\n' +
            'Return JSON only, no markdown, no code blocks:\n' +
            '{"accentColor":"#hex","elements":[{"text":"...","x":n,"y":n,"fontSize":n,"fontWeight":"bold","color":"#hex","bgColor":"#hex or null","bgPadding":10,"align":"left","maxWidth":500}]}'
          }
        ]
      }]
    }),
  });

  if (!resp.ok) { const e = await resp.text(); throw new Error('Claude: ' + resp.status + ' ' + e.slice(0,200)); }
  const data = await resp.json() as { content: Array<{type:string;text:string}> };
  const raw = data.content[0]?.type === 'text' ? data.content[0].text : '';
  console.log('Claude raw:', raw.slice(0,200));

  // Strip ANY markdown code blocks
  const clean = raw.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
  const m = clean.match(/\{[\s\S]*\}/);
  if (!m) { console.error('No JSON in:', clean.slice(0,300)); throw new Error('No JSON from Claude'); }
  const parsed = JSON.parse(m[0]) as Layout;
  console.log('Layout ok, elements:', parsed.elements?.length);
  return parsed;
}

async function compositeText(fluxBuf: Buffer, layout: Layout): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const parts: string[] = [];

  // Gradient strips for readability
  parts.push(`<defs>
    <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity=".7"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".8"/></linearGradient>
  </defs>`);
  parts.push(`<rect x="0" y="0" width="1024" height="100" fill="url(#tg)"/>`);
  parts.push(`<rect x="0" y="924" width="1024" height="100" fill="url(#bg)"/>`);

  // Accent bars
  parts.push(`<rect x="1016" y="0" width="8" height="150" fill="${layout.accentColor}"/>`);
  parts.push(`<rect x="0" y="1016" width="150" height="8" fill="${layout.accentColor}"/>`);

  for (const el of layout.elements) {
    const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
    const fw = el.fontWeight === 'bold' ? '700' : '400';

    // Wrap text into lines
    const words = el.text.split(' ');
    const cpl = Math.floor(el.maxWidth / (el.fontSize * 0.6));
    const lines: string[] = []; let cur = '';
    for (const w of words) { const c = cur ? cur+' '+w : w; if(c.length>cpl){if(cur)lines.push(cur);cur=w;}else cur=c; }
    if(cur) lines.push(cur);
    const lh = el.fontSize * 1.3;

    // Background box
    if (el.bgColor && el.bgColor !== 'null' && el.bgColor !== null) {
      const pad = el.bgPadding||10;
      const aw = Math.min(el.maxWidth+pad*2, 980);
      const ah = lines.length*lh+pad*2;
      let bx = el.x-pad;
      if(anchor==='middle') bx=el.x-aw/2;
      if(anchor==='end') bx=el.x-aw+pad;
      parts.push(`<rect x="${Math.max(0,bx)}" y="${el.y-el.fontSize-pad}" width="${aw}" height="${ah}" rx="8" fill="${el.bgColor}" fill-opacity=".85"/>`);
    }

    // Text - using Latin characters rendered as base64 PNG via canvas alternative
    // Sharp SVG supports basic Latin well, Cyrillic needs special handling
    const tspans = lines.map((l,i)=>{
      const escaped = l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<tspan x="${el.x}" dy="${i===0?0:lh}">${escaped}</tspan>`;
    }).join('');

    parts.push(`<text x="${el.x}" y="${el.y}" font-family="Arial,Helvetica,sans-serif" font-size="${el.fontSize}" font-weight="${fw}" fill="${el.color}" text-anchor="${anchor}" dominant-baseline="auto" paint-order="stroke" stroke="#000000" stroke-width="3" stroke-linejoin="round">${tspans}</text>`);
  }

  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${parts.join('')}</svg>`;
  return sharp(fluxBuf).composite([{input:Buffer.from(svg),top:0,left:0}]).jpeg({quality:92}).toBuffer();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ','');
    if (!token) return NextResponse.json({error:'Unauthorized'},{status:401});
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const {data:{user}} = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});

    const {imageBase64,imageUrl,productName='',bullets=[],category='general',variant='lifestyle',cardId,allVariants} =
      await req.json() as {imageBase64?:string;imageUrl?:string;productName?:string;bullets?:string[];category?:string;variant?:string;cardId?:string;allVariants?:Array<{url:string;label:string}>};

    if (allVariants && cardId) {
      const {error} = await supabase.from('cards').update({infographic_urls:allVariants}).eq('id',cardId).eq('user_id',user.id);
      if(error) console.error('Save error:',error);
      return NextResponse.json({saved:true});
    }

    if (!productName.trim()) return NextResponse.json({error:'No product name'},{status:400});

    let resolvedBase64 = imageBase64||'';
    if (!resolvedBase64 && imageUrl) {
      try { const r=await fetch(imageUrl); resolvedBase64=`data:${r.headers.get('content-type')||'image/jpeg'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`; }
      catch(e){console.warn('fetch imageUrl failed:',e);}
    }
    if (!resolvedBase64) return NextResponse.json({error:'No image'},{status:400});

    const cleanBullets = (bullets as string[]).filter(x=>x.trim()).slice(0,4).map(x=>x.replace(/^[\u2713\u2714\u2022]\s*/,'').trim());
    const typedVariant: 'lifestyle'|'benefits'|'studio' = variant==='benefits'?'benefits':variant==='studio'?'studio':'lifestyle';

    // STEP 1: Upload → public URL for Flux
    const publicImageUrl = await uploadImageForFlux(supabase, resolvedBase64, user.id);
    if (!publicImageUrl) return NextResponse.json({error:'Upload failed'},{status:500});

    // STEP 2: GPT-4o builds Flux prompt
    const fluxPrompt = await buildFluxPrompt(resolvedBase64, productName, cleanBullets, category, typedVariant);
    if (!fluxPrompt) return NextResponse.json({error:'Prompt failed'},{status:500});

    // STEP 3: Flux generates photorealistic background
    const fluxBuf = await runFluxKontext(publicImageUrl, fluxPrompt);
    if (!fluxBuf) return NextResponse.json({error:'Flux failed'},{status:500});

    // Upload Flux result so Claude can see it
    const fluxFileName = `temp/${user.id}/flux-${Date.now()}.jpg`;
    await supabase.storage.from('card-images').upload(fluxFileName, fluxBuf, {contentType:'image/jpeg',upsert:true});
    const fluxPublicUrl = supabase.storage.from('card-images').getPublicUrl(fluxFileName).data.publicUrl;

    // STEP 4: Claude sees Flux image → designs text layout
    let finalBuf = fluxBuf;
    try {
      const layout = await getLayoutFromClaude(fluxPublicUrl, productName, cleanBullets, variant);
      console.log('Layout elements:', layout.elements.length, 'accent:', layout.accentColor);
      if (layout.elements.length > 0) {
        // STEP 5: sharp composites text + Noto Sans font onto Flux image
        finalBuf = await compositeText(fluxBuf, layout);
      }
    } catch(e) { console.error('Layout/composite failed, using Flux only:', e); }

    const url = await uploadToStorage(supabase, finalBuf, user.id);
    const label = typedVariant==='lifestyle'?'Lifestyle':typedVariant==='studio'?'\u0421\u0442\u0443\u0434\u0456\u0439\u043d\u0435 \u0444\u043e\u0442\u043e':'\u041f\u0435\u0440\u0435\u0432\u0430\u0433\u0438';
    return NextResponse.json({url,label});

  } catch(err:unknown) {
    console.error('Infographic error:',err);
    return NextResponse.json({error:err instanceof Error?err.message:'Error'},{status:500});
  }
}