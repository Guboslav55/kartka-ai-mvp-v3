import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
 
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 
const PLATFORM_HINTS: Record<string, string> = {
  prom:    'Prom.ua: заголовок до 80 символів, SEO-ключові слова у тексті, опис 150-300 слів',
  rozetka: 'Rozetka: заголовок до 70 символів, технічні характеристики важливі, опис 100-250 слів',
  olx:     'OLX: заголовок до 60 символів, розмовний стиль, опис 80-150 слів',
  general: 'Універсальна картка: заголовок до 80 символів, опис 150-200 слів',
};
const TONE_HINTS: Record<string, string> = {
  professional: 'Професійний діловий тон',
  friendly:     'Дружній теплий тон, звернення на "ти"',
  premium:      'Преміальний вишуканий стиль, акцент на якості та статусі',
  simple:       'Простий зрозумілий стиль без складних термінів',
};
const LANG_HINTS: Record<string, string> = {
  uk: 'Пиши ТІЛЬКИ українською мовою',
  ru: 'Пиши ТІЛЬКИ російською мовою',
  en: 'Write ONLY in English',
};
 
export async function POST(req: NextRequest) {
  try {
    // Get auth token from request header
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
 
    if (!token) {
      return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });
    }
 
    // Create supabase client with user token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
 
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });
    }
 
    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'Профіль не знайдено' }, { status: 404 });
    if (profile.cards_left <= 0) {
      return NextResponse.json({ error: 'Ліміт карточок вичерпано. Підвищ тариф.' }, { status: 403 });
    }
 
    const { productName, category, features, platform, tone, lang, generateImage } = await req.json();
    if (!productName?.trim()) return NextResponse.json({ error: "Назва товару обов'язкова" }, { status: 400 });
 
    const prompt = `Ти — експерт-копірайтер для українських маркетплейсів.
${LANG_HINTS[lang] ?? LANG_HINTS.uk}
${PLATFORM_HINTS[platform] ?? PLATFORM_HINTS.general}
${TONE_HINTS[tone] ?? TONE_HINTS.professional}
 
Товар: ${productName}
${category ? `Категорія: ${category}` : ''}
${features ? `Характеристики: ${features}` : ''}
 
Відповідай ТІЛЬКИ валідним JSON (без markdown, без пояснень):
{"title":"SEO-заголовок","description":"Продаючий опис 3-5 речень з перевагами та закликом до дії","bullets":["Перевага 1 з фактом","Перевага 2","Перевага 3","Перевага 4","Перевага 5"],"keywords":["слово1","слово2","слово3","слово4","слово5","слово6"]}`;
 
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });
 
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const cardData = JSON.parse(raw);
 
    if (!cardData.title || !cardData.description || !Array.isArray(cardData.bullets)) {
      throw new Error('Неповна відповідь від AI. Спробуй ще раз.');
    }
 
    let imageUrl: string | undefined;
    if (generateImage) {
      try {
        const imgRes = await openai.images.generate({
          model: 'dall-e-3',
          prompt: `Professional product photo for "${productName}"${category ? `, ${category}` : ''}. Pure white background, studio lighting, commercial quality. No text.`,
          size: '1024x1024',
          quality: 'standard',
          n: 1,
        });
        imageUrl = imgRes.data[0]?.url;
      } catch (e) {
        console.warn('Image generation failed:', e);
      }
    }
 
    await Promise.all([
      supabase.from('cards').insert({
        user_id: user.id,
        product_name: productName,
        platform: platform ?? 'general',
        title: cardData.title,
        description: cardData.description,
        bullets: cardData.bullets,
        keywords: cardData.keywords ?? [],
        image_url: imageUrl ?? null,
      }),
      supabase.from('users').update({
        cards_left: profile.cards_left - 1,
        cards_total: (profile.cards_total ?? 0) + 1,
      }).eq('id', user.id),
    ]);
 
    return NextResponse.json({ ...cardData, imageUrl });
 
  } catch (err: unknown) {
    console.error('Generate error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Помилка сервера'
    }, { status: 500 });
  }
}
