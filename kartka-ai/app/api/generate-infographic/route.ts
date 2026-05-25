import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const STARS_COST = 4; // 4 зорі за один варіант інфографіки
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function uploadToStorage(supabase: ReturnType<typeof createClient>, buf: Buffer, userId: string): Promise<string> {
  try {
    const fileName = `infographics/${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('card-images').upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${buf.toString('base64')}`;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch { return `data:image/jpeg;base64,${buf.toString('base64')}`; }
}

async function buildDallePrompt(imageBase64: string, productName: string, bullets: string[], variant: 'lifestyle' | 'benefits' | 'studio'): Promise<string> {
  const bulletText = bullets.slice(0, 3).map(b => b.replace(/^[✓✔•]\s*/, '')).join(', ');
  const variantMap = {
    lifestyle: `Vibrant lifestyle scene background perfectly matching "${productName}" product context. Atmospheric mood lighting, beautiful environment. NO product, NO text, NO people. Only stunning background.`,
    studio: `Professional studio photography background. Pure white seamless gradient, soft diffused lighting from multiple angles. High-end commercial product photo style. NO product, NO text.`,
    benefits: `Dynamic energetic graphic background with abstract geometric shapes, color gradient. Bold modern Ukrainian marketplace infographic style. Vivid colors matching product category. NO product, NO text, NO labels.`,
  };
  try {
    const analysis = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`, detail: 'low' } },
        { type: 'text', text: `Product type: "${productName}" (translate to English if needed). Features: ${bulletText}. Create a DALL-E 3 background image prompt for ${variant} infographic style. ${variantMap[variant]} CRITICAL: Write the prompt ONLY in English. Return only the English prompt, max 200 words.` },
      ]}],
      max_tokens: 200,
    });
    return analysis.choices[0]?.message?.content?.trim() || variantMap[variant];
  } catch { return variantMap[variant]; }
}

async function generateBackground(prompt: string): Promise<Buffer | null> {
  try {
    const res = await openai.images.generate({ model: 'dall-e-3', prompt: `${prompt} IMPORTANT: NO text, NO letters, NO words, NO labels anywhere.`, size: '1024x1024', quality: 'hd', style: 'natural', n: 1 });
    const url = res.data[0]?.url;
    if (!url) return null;
    return Buffer.from(await (await fetch(url)).arrayBuffer());
  } catch (e) { console.error('DALL-E error:', e); return null; }
}

function escapeXml(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

async function compositeWithProduct(bgBuf: Buffer, productBase64: string, productName: string, bullets: string[], variant: 'lifestyle' | 'benefits' | 'studio'): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const match = productBase64.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) return bgBuf;
  const productBuf = Buffer.from(match[2], 'base64');
  const productSize = 480;
  const productResized = await sharp(productBuf).resize(productSize, productSize, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer();
  const left = Math.round((1024 - productSize) / 2);
  const top = Math.round((1024 - productSize) / 2) + 40;
  const topBullets = bullets.slice(0, 3).map(b => b.replace(/^[✓✔•]\s*/, '').slice(0, 45));
  const accentColor = variant==='studio' ? '#1a1a2e' : variant==='lifestyle' ? '#6366f1' : '#f59e0b';
  const textColor = variant==='studio' ? '#1a1a2e' : '#ffffff';
  const textBg = variant==='studio' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.75)';
  const shortName = productName.slice(0, 50);
  const svgOverlay = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0.7)"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/></linearGradient>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.85)"/></linearGradient>
</defs>
<rect width="1024" height="160" fill="url(#tg)"/>
<rect y="864" width="1024" height="160" fill="url(#bg)"/>
<rect x="0" y="0" width="6" height="200" fill="${accentColor}"/>
<rect x="20" y="20" width="${Math.min(shortName.length*16+40,700)}" height="56" rx="8" fill="${textBg}"/>
<text x="40" y="58" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="${textColor}">${escapeXml(shortName)}</text>
${topBullets.map((b,i)=>`<rect x="20" y="${880+i*42}" width="${Math.min(b.length*13+50,700)}" height="36" rx="6" fill="${textBg}"/><text x="50" y="${904+i*42}" font-family="Arial,sans-serif" font-size="20" fill="${textColor}">✓ ${escapeXml(b)}</text>`).join('')}
<rect x="1018" y="824" width="6" height="200" fill="${accentColor}"/>
</svg>`;
  return sharp(bgBuf).composite([{ input: productResized, top, left, blend: 'over' }, { input: Buffer.from(svgOverlay), top: 0, left: 0 }]).jpeg({ quality: 92 }).toBuffer();
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

    const { imageBase64, imageUrl, productName = '', bullets = [], category = 'general', variant = 'lifestyle', cardId, allVariants } = await req.json();

    // Save mode
    if (allVariants && cardId) {
      await supabase.from('cards').update({ infographic_urls: allVariants }).eq('id', cardId).eq('user_id', user.id);
      return NextResponse.json({ saved: true });
    }

    if (!productName.trim()) return NextResponse.json({ error: 'Потрібна назва товару' }, { status: 400 });

    // Перевірка балансу зорь
    const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', user.id).single();
    const starsBalance = profile?.stars_balance ?? 0;
    if (starsBalance < STARS_COST) {
      return NextResponse.json({
        error: `Недостатньо зорь ⭐ (потрібно ${STARS_COST}, є ${starsBalance})`,
        needStars: true, balance: starsBalance,
      }, { status: 402 });
    }

    // Resolve image
    let resolvedBase64 = imageBase64 || '';
    if (!resolvedBase64 && imageUrl) {
      try {
        const r = await fetch(imageUrl);
        const buf = await r.arrayBuffer();
        const mime = r.headers.get('content-type') || 'image/jpeg';
        resolvedBase64 = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
      } catch (e) { console.warn('fetch imageUrl failed:', e); }
    }
    if (!resolvedBase64) return NextResponse.json({ error: 'Потрібне фото товару' }, { status: 400 });

    const cleanBullets = (bullets as string[]).filter(x => x.trim()).slice(0, 3);
    const variantType = variant as 'lifestyle' | 'benefits' | 'studio';

    // Генерація
    const prompt = await buildDallePrompt(resolvedBase64, productName, cleanBullets, variantType);
    const bgBuf = await generateBackground(prompt);
    if (!bgBuf) return NextResponse.json({ error: 'DALL-E не зміг згенерувати фон' }, { status: 500 });

    const finalBuf = await compositeWithProduct(bgBuf, resolvedBase64, productName, cleanBullets, variantType);
    const url = await uploadToStorage(supabase, finalBuf, user.id);

    // Списання зорь після успішної генерації
    await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: STARS_COST });
    await supabase.from('star_transactions').insert({
      user_id: user.id, type: 'spend', amount: -STARS_COST,
      description: `Інфографіка: ${productName.slice(0,40)} (${variantType})`,
      generation_id: cardId || null,
    });

    const label = variantType === 'lifestyle' ? 'Lifestyle' : variantType === 'studio' ? 'Студійне фото' : 'Переваги';
    const newBalance = starsBalance - STARS_COST;

    return NextResponse.json({ url, label, starsSpent: STARS_COST, newBalance });
  } catch (err: unknown) {
    console.error('Infographic error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка генерації' }, { status: 500 });
  }
}
