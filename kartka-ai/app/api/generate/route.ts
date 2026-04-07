import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });
    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'Профіль не знайдено' }, { status: 404 });
    if (profile.cards_left <= 0) return NextResponse.json({ error: 'Ліміт карточок вичерпано. Підвищ тариф.' }, { status: 403 });
    const { productName, category, features, platform, tone, lang, generateImage, uploadedPhoto } = await req.json();
    if (!productName?.trim()) return NextResponse.json({ error: "Назва товару обов'язкова" }, { status: 400 });
    const hasPhoto = typeof uploadedPhoto === 'string' && uploadedPhoto.startsWith('data:');
    let persistedPhotoUrl: string | null = null;
    if (hasPhoto) { try { const m = uploadedPhoto.match(/^data:(image\/\w+);base64,(.+)$/s); if (m) { const buf = Buffer.from(m[2], 'base64'); const ext = m[1].split('/')[1] || 'jpg'; const fileName = `${user.id}/${Date.now()}.${ext}`; const { error } = await supabase.storage.from('card-images').upload(fileName, buf, { contentType: m[1], upsert: false }); if (!error) persistedPhotoUrl = supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl; } } catch(e) { console.warn('oh', e); } }
    const langHints: Record<string, string> = { uk: 'Пиши ТІЛЬКИ українською мовою', ru: 'Пиши ТІЛЬКИ російською мовою', en: 'Write ONLY in English' };
    const platformHints: Record<string, string> = { prom: 'Prom.ua: до 80 символів', rozetka: 'Rozetka: 070 символів', olx: 'OLX: до 60 символів', general: 'Універсальна' };
    const toneHints: Record<string, string> = { professional: 'Професійний діловий 4он', friendly: 'Дружній теплий', premium: 'Преміальний вишуканий', simple: 'Простий зрозумілий' };
    const cta: Record<string, string> = { uk: 'Замовляйте зараз — швидка доставка по всій Україні! 🇺🇦', ru: 'Заказывайте сейчас, быстрая доставка по всей Украине!', en: 'Order now — fast delivery!'};
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];
    if (hasPhoto) userContent.push({ type: 'image_url', image_url: { url: uploadedPhoto, detail: 'high' } });
    userContent.push({ type: 'text', text: `Ти ─ eksPert-копірайтер для українських маркетплейсів.\n${langHints[lang] ?? langHints.uk}\n${platformHints[platform] ?? platformHints.general}\n${toneHints[tone] ?? toneHints.professional}\n${hasPhoto ? 'На фото — товар клієнта.' : ''}\n\nТовар: ${productName}\n${category ? `Категорія: ${category}` : ''}\n${features ? `Характеристики
${features}` : ''}\n\nВАЖЛИВО: В кінці опису ОБОВ-ЧТОН ${cta[lang] ?? cta.uk}\n\nВідповідай ТІЛЬКИ валідним JSON без markdown:{"title":"...","description":"...","bullets":["..."],"keywords":["..."]}` });
    const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: userContent }], max_tokens: 1000, response_format: { type: 'json_object' } });
    const cardData = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    if (!cardData.title || !cardData.description) throw new Error('Неповна відповідь від AI. Спробуй.');
    let imageUrl: string | null = persistedPhotoUrl;
    if (!imageUrl && generateImage) { try { const res = await openai.images.generate({ model: 'dall-e-3', prompt: `Professional product photo of "${productName}"${category ? ` (${category})` : ''}. Pure white background. No text.`, size: '1024x1024', quality: 'hd', style: 'natural', n: 1 }); const url = res.data[0]?.url; if (url) { const r = await fetch(url); const b = await r.arrayBuffer(); const f = `${user.id}/${Date.now()}.jpg`; const { error } = await supabase.storage.from('card-images').upload(f, b, { contentType: 'image/jpeg', upsert: false }); imageUrl = error ? url : supabase.storage.from('card-images').getPublicUrl(f).data.publicUrl; } } catch(e) { console.warn('Image gen failed:', e); } }
    const [insertResult] = await Promise.all([ supabase.from('cards').insert({ user_id: user.id, product_name: productName, platform: platform ?? 'general', title: cardData.title, description: cardData.description, bullets: cardData.bullets, keywords: cardData.keywords ?? [], image_url: imageUrl }).select('id').single(), supabase.from('users').update({ cards_left: profile.cards_left - 1, cards_total: (profile.cards_total ?? 0) + 1 }).eq('id', user.id) ]);
    if (insertResult.error) console.error('Card insert error:', insertResult.error);
    const cardId = insertResult?.data?.id ?? null;
    return NextResponse.json({ ...cardData, imageUrl, cardId });
  } catch (err: unknown) {
    console.error('Generate error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка сервера' }, { status: 500 });
  }
}
