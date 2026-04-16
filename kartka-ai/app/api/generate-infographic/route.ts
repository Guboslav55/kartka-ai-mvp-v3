import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

async function uploadToStorage(supabase, buf, userId) {
  try {
    const fileName = `infographics/${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('card-images').upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${buf.toString('base64')}`;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch { return `data:image/jpeg;base64,${buf.toString('base64')}`; }
}

async function uploadImageForFlux(supabase, base64, userId) {
  try {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return null;
    const mimeType = match[1]; const ext = mimeType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    const fileName = `temp/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('card-images').upload(fileName, buffer, { contentType: mimeType, upsert: true });
    if (error) return null;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch { return null; }
}

async function getTextOverlayFromClaude(productImageBase64, fluxImageUrl, productName, bullets, variant) {
  try {
    const fluxRes = await fetch(fluxImageUrl);
    const fluxBuf = await fluxRes.arrayBuffer();
    const fluxBase64 = Buffer.from(fluxBuf).toString('base64');
    const fluxMime = fluxRes.headers.get('content-type') || 'image/jpeg';
    const productBase64Clean = productImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const productMime = productImageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/jpeg';
    const variantHint = variant === 'lifestyle' ? 'lifestyle atmospheric background' : variant === 'studio' ? 'clean studio white background' : 'colorful graphic background';
    const prompt = `You are a professional Ukrainian marketplace infographic designer (Prom.ua, Rozetka). You see TWO images: 1. Original product photo 2. AI-generated background (${variantHint}). Product: "${productName}". Key benefits: ${bullets.slice(0,3).join(' | ')}. Design text overlays for 1024x1024 marketplace infographic. RULES: Product is HERO occupying 75-85%. Text NEVER covers product face/body. Use corners/edges/strips only. All text in UKRAINIAN. Lifestyle: minimal - brand name + 1-2 specs. Studio: characteristics in small cards on sides. Benefits: bold numbers/stats. Return ONLY valid JSON: {"elements":[{"text":"string","x":number,"y":number,"fontSize":number,"fontWeight":"bold","color":"#hex","bgColor":"#hex","bgPadding":8,"bgRadius":6,"align":"left","maxWidth":300}]}. Max 3 elements. Keep clean.`;
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: productMime, data: productBase64Clean } },
        { type: 'image', source: { type: 'base64', media_type: fluxMime, data: fluxBase64 } },
        { type: 'text', text: prompt }
      ]}]
    });
    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch(e) { console.error('Claude overlay error:', e); return null; }
}

async function addTextOverlay(imageBuf, overlay) {
  const sharp = (await import('sharp')).default;
  const svgElements = overlay.elements.map(el => {
    const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
    const fw = el.fontWeight === 'bold' ? '700' : '400';
    const maxW = el.maxWidth || 350;
    const words = el.text.split(' ');
    const cpl = Math.floor(maxW / (el.fontSize * 0.55));
    const lines = []; let cur = '';
    for (const w of words) { if ((cur+' '+w).trim().length > cpl) { if(cur) lines.push(cur.trim()); cur=w; } else cur=(cur+' '+w).trim(); }
    if(cur) lines.push(cur.trim());
    const lh = el.fontSize * 1.25;
    const pad = el.bgPadding || 8; const rx = el.bgRadius || 6;
    let bg = '';
    if(el.bgColor && el.bgColor !== 'null' && el.bgColor !== null) {
      const bx = el.align==='center' ? el.x-(maxW/2)-pad : el.align==='right' ? el.x-maxW-pad : el.x-pad;
      bg = `<rect x="${bx}" y="${el.y-el.fontSize-pad}" width="${maxW+pad*2}" height="${lines.length*lh+pad*2}" rx="${rx}" fill="${el.bgColor}" fill-opacity="0.82"/>`;
    }
    const ts = lines.map((l,i)=>`<tspan x="${el.x}" dy="${i===0?0:lh}">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</tspan>`).join('');
    return `${bg}<text x="${el.x}" y="${el.y}" font-family="Arial,sans-serif" font-size="${el.fontSize}" font-weight="${fw}" fill="${el.color}" text-anchor="${anchor}" dominant-baseline="auto">${ts}</text>`;
  }).join('');
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">${svgElements}</svg>`;
  return sharp(imageBuf).composite([{input:Buffer.from(svg),top:0,left:0}]).jpeg({quality:92}).toBuffer();
}

async function buildFluxPrompt(imageBase64, productName, bullets, category, variant) {
  const bulletText = bullets.slice(0,4).map((b,i)=>`${i+1}. ${b}`).join('\n');
  const vi = variant==='lifestyle'
    ? 'LIFESTYLE: Transform background into dramatic atmospheric scene. Keep product centered and clearly visible. NO TEXT. NO labels. Only change background and lighting.'
    : variant==='studio'
    ? 'STUDIO PHOTO: Transform into professional studio photography. Pure white or light grey seamless background. Perfect soft lighting. Product centered, sharp focus, e-commerce quality. NO TEXT.'
    : 'BENEFITS: Dynamic colorful graphic background with geometric shapes. Product hero centered. Vivid contrasting colors. Modern marketplace style. NO TEXT. NO labels. NO written words.';
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 350,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: (imageBase64.match(/^data:(image\/\w+);base64,/)?.[1]||'image/jpeg'), data: imageBase64.replace(/^data:image\/\w+;base64,/,'') } },
      { type: 'text', text: `Professional Ukrainian marketplace infographic designer. Analyze this product and create ONE editing prompt for Flux Kontext image editor. Product: "${productName}". Category: ${category}. Features:\n${bulletText}\n\n${vi}\n\nCRITICAL: Keep ORIGINAL product from photo - do NOT replace it. DO NOT add any text, letters, words anywhere. DO NOT modify hands/fingers. Only modify: background, lighting, decorative elements. Professional marketplace quality, square 1024x1024. Write prompt in English for Flux Kontext. Return ONLY the prompt text.` }
    ]}],
    temperature: 0.7
  });
  return response.content[0]?.type==='text' ? response.content[0].text.trim() : '';
}

async function runFluxKontext(imageUrl, prompt) {
  if(!REPLICATE_TOKEN) return null;
  try {
    const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions', {
      method:'POST',
      headers:{'Authorization':`Bearer ${REPLICATE_TOKEN}`,'Content-Type':'application/json','Prefer':'wait'},
      body:JSON.stringify({input:{prompt,input_image:imageUrl,output_format:'jpg',output_quality:90,safety_tolerance:2,aspect_ratio:'1:1'}})
    });
    const prediction = await createRes.json();
    if(prediction.status==='succeeded') {
      const url=Array.isArray(prediction.output)?prediction.output[0]:prediction.output;
      if(!url) return null;
      return Buffer.from(await(await fetch(url)).arrayBuffer());
    }
    let current=prediction; let attempts=0;
    while(current.status!=='succeeded'&&current.status!=='failed'&&current.status!=='canceled'&&attempts<30) {
      await new Promise(r=>setTimeout(r,3000));
      current=await(await fetch(`https://api.replicate.com/v1/predictions/${current.id}`,{headers:{'Authorization':`Bearer ${REPLICATE_TOKEN}`}})).json();
      attempts++;
    }
    if(current.status!=='succeeded'){console.error('Flux failed:',current.error);return null;}
    const url=Array.isArray(current.output)?current.output[0]:current.output;
    if(!url) return null;
    return Buffer.from(await(await fetch(url)).arrayBuffer());
  } catch(e){console.error('Flux error:',e);return null;}
}

export async function POST(req) {
  try {
    const token=req.headers.get('authorization')?.replace('Bearer ','');
    if(!token) return NextResponse.json({error:'Unauthorized'},{status:401});
    const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const {data:{user}}=await supabase.auth.getUser(token);
    if(!user) return NextResponse.json({error:'Unauthorized'},{status:401});
    const {imageBase64,imageUrl,productName='',bullets=[],category='general',variant='lifestyle',cardId,allVariants}=await req.json();
    if(allVariants&&cardId) {
      const {error}=await supabase.from('cards').update({infographic_urls:allVariants}).eq('id',cardId).eq('user_id',user.id);
      if(error) console.error('Save error:',error);
      return NextResponse.json({saved:true});
    }
    if(!productName.trim()) return NextResponse.json({error:'No product name'},{status:400});
    let resolvedBase64=imageBase64||'';
    if(!resolvedBase64&&imageUrl) {
      try { const r=await fetch(imageUrl); const buf=await r.arrayBuffer(); const mime=r.headers.get('content-type')||'image/jpeg'; resolvedBase64=`data:${mime};base64,${Buffer.from(buf).toString('base64')}`; }
      catch(e){console.warn('fetch imageUrl failed:',e);}
    }
    if(!resolvedBase64) return NextResponse.json({error:'No image'},{status:400});
    const cleanBullets=(bullets).filter(x=>x.trim()).slice(0,4).map(x=>x.replace(/^[✓✔•]\s*/,'').trim());
    const publicImageUrl=await uploadImageForFlux(supabase,resolvedBase64,user.id);
    if(!publicImageUrl) return NextResponse.json({error:'Upload failed'},{status:500});
    const prompt=await buildFluxPrompt(resolvedBase64,productName,cleanBullets,category,variant);
    if(!prompt) return NextResponse.json({error:'Prompt failed'},{status:500});
    const fluxBuf=await runFluxKontext(publicImageUrl,prompt);
    if(!fluxBuf) return NextResponse.json({error:'Flux failed'},{status:500});
    const fluxFileName=`temp/${user.id}/flux-${Date.now()}.jpg`;
    await supabase.storage.from('card-images').upload(fluxFileName,fluxBuf,{contentType:'image/jpeg',upsert:true});
    const fluxPublicUrl=supabase.storage.from('card-images').getPublicUrl(fluxFileName).data.publicUrl;
    const overlay=await getTextOverlayFromClaude(resolvedBase64,fluxPublicUrl,productName,cleanBullets,variant);
    let finalBuf=fluxBuf;
    if(overlay&&overlay.elements?.length>0) {
      try{finalBuf=await addTextOverlay(fluxBuf,overlay);}
      catch(e){console.error('Overlay failed, using without text:',e);finalBuf=fluxBuf;}
    }
    const url=await uploadToStorage(supabase,finalBuf,user.id);
    const label=variant==='lifestyle'?'Lifestyle':variant==='studio'?'Студійне фото':'Переваги';
    return NextResponse.json({url,label});
  } catch(err) {
    console.error('Infographic error:',err);
    return NextResponse.json({error:err instanceof Error?err.message:'Generation error'},{status:500});
  }
}
