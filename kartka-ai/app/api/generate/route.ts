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
const CTA: Record<string, string> = {
  uk: 'Замовляйте зараз — швидка доставка по всій Україні! 🇺🇦',
  ru: 'Заказывайте сейчас — быстрая доставка по всей Украине!',
  en: 'Order now — fast delivery across Ukraine!',
};
 
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });
 
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
 
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });
 
    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'Профіль не знайдено' }, { status: 404 });
    if (profile.cards_left <= 0) return NextResponse.json({ error: 'Ліміт карточок вичерпано. Підвищ тариф.' }, { status: 403 });
 
    const { productName, category, features, platform, tone, lang, generateImage, uploadedPhoto } = await req.json();
    if (!productName?.trim()) return NextResponse.json({ error: "Назва товару обов'язкова" }, { status: 400 });
 
    const cta = CTA[lang] ?? CTA.uk;
 
    // Build messages — if photo uploaded, use vision to analyze it
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];
 
    if (uploadedPhoto) {
      userContent.push({
        type: 'image_url',
        image_url: { url: uploadedPhoto, detail: 'low' },
      });
    }
 
    userContent.push({
      type: 'text',
      text: `Ти — експерт-копірайтер для українських маркетплейсів.
${LANG_HINTS[lang] ?? LANG_HINTS.uk}
${PLATFORM_HINTS[platform] ?? PLATFORM_HINTS.general}
${TONE_HINTS[tone] ?? TONE_HINTS.professional}
${uploadedPhoto ? 'На фото вище — товар клієнта. Використай деталі з фото для опису.' : ''}
 
Товар: ${productName}
${category ? `Категорія: ${category}` : ''}
${features ? `Характеристики: ${features}` : ''}
 
ВАЖЛИВО: В кінці опису ЗАВЖДИ додай заклик до дії: "${cta}"
 
Відповідай ТІЛЬКИ валідним JSON (без markdown):
{"title":"SEO-заголовок","description":"Опис 3-5 речень + заклик до дії в кінці","bullets":["Перевага 1","Перевага 2","Перевага 3","Перевага 4","Перевага 5"],"keywords":["слово1","слово2","слово3","слово4","слово5","слово6"]}`,
    });
 
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: userContent }],
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });
 
    const cardData = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    if (!cardData.title || !cardData.description) throw new Error('Неповна відповідь від AI. Спробуй ще раз.');
 
    // Generate banner image
    let imageUrl: string | undefined;
    if (generateImage || uploadedPhoto) {
      try {
        let imgPrompt: string;
        if (uploadedPhoto) {
          // Art-direct the uploaded photo into a beautiful banner
          imgPrompt = `Create a stunning professional product banner for "${productName}"${category ? ` (${category})` : ''}. 
Style: Clean e-commerce banner with elegant gradient background (dark navy to black), dramatic studio lighting highlighting the product, subtle gold accent lines, professional Ukrainian market aesthetic. 
The product should be the hero element, centered, sharp and crisp. Add a subtle texture overlay. No text, no watermarks. High-end commercial photography style.`;
        } else {
          imgPrompt = `Professional product photo for "${productName}"${category ? `, ${category}` : ''}. Pure white background, studio lighting, sharp focus, commercial quality. No text.`;
        }
 
        const imgRes = await openai.images.generate({
          model: 'dall-e-3',
          prompt: imgPrompt,
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка сервера' }, { status: 500 });
  }
}
