import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const STARS_FOR_TEXT = 2;

const PLATFORM_HINTS: Record<string, string> = {
  prom: 'Prom.ua: заголовок до 80 символів, SEO-ключові слова у тексті, опис 150-300 слів',
  rozetka: 'Rozetka: заголовок до 70 символів, технічні характеристики важливі, опис 100-250 слів',
  olx: 'OLX: заголовок до 60 символів, розмовний стиль, опис 80-150 слів',
  general: 'Універсальна картка: заголовок до 80 символів, опис 150-200 слів',
};
const TONE_HINTS: Record<string, string> = {
  professional: 'Професійний діловий тон',
  friendly: 'Дружній теплий тон, звернення на "ти"',
  premium: 'Преміальний вишуканий стиль, акцент на якості та статусі',
  simple: 'Простий зрозумілий стиль без складних термінів',
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

async function uploadDalleUrl(supabase: ReturnType<typeof createClient>, tempUrl: string, userId: string): Promise<string> {
  try {
    const res = await fetch(tempUrl);
    const blob = await res.arrayBuffer();
    const fileName = `${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('card-images').upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) return tempUrl;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch (e) { console.warn('Image upload failed:', e); return tempUrl; }
}

async function uploadBase64Photo(supabase: ReturnType<typeof createClient>, base64DataUri: string, userId: string, suffix = ''): Promise<string | null> {
  try {
    const match = base64DataUri.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return null;
    const mimeType = match[1];
    const ext = mimeType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    const fileName = `${userId}/${Date.now()}${suffix}.${ext}`;
    const { error } = await supabase.storage.from('card-images').upload(fileName, buffer, { contentType: mimeType, upsert: false });
    if (error) { console.warn('Photo storage error:', error); return null; }
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch (e) { console.warn('Base64 upload failed:', e); return null; }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });

    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'Профіль не знайдено' }, { status: 404 });

    const starsBalance = profile.stars_balance ?? 0;
    const hasEnoughStars = starsBalance >= STARS_FOR_TEXT;
    const hasCardsLeft = (profile.cards_left ?? 0) > 0;

    if (!hasEnoughStars && !hasCardsLeft) {
      return NextResponse.json({
        error: `Недостатньо зорь ⭐ (потрібно ${STARS_FOR_TEXT}, є ${starsBalance}). Поповни баланс.`,
        needStars: true,
        balance: starsBalance,
      }, { status: 402 });
    }

    const { productName, category, features, platform, tone, lang, generateImage, uploadedPhoto, originalPhoto } = await req.json();
    if (!productName?.trim()) return NextResponse.json({ error: "Назва товару обов'язкова" }, { status: 400 });

    let processedImageUrl: string | null = null;
    let persistedPhotoUrl: string | null = null;
    const hasProcessed = typeof uploadedPhoto === 'string' && uploadedPhoto.startsWith('data:');
    const hasOriginal = typeof originalPhoto === 'string' && originalPhoto.startsWith('data:');
    if (hasProcessed) { processedImageUrl = await uploadBase64Photo(supabase, uploadedPhoto, user.id, '-processed'); persistedPhotoUrl = processedImageUrl; }
    if (hasOriginal && !persistedPhotoUrl) { persistedPhotoUrl = await uploadBase64Photo(supabase, originalPhoto, user.id, '-original'); }

    const cta = CTA[lang] ?? CTA.uk;
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];
    if (hasProcessed) userContent.push({ type: 'image_url', image_url: { url: uploadedPhoto, detail: 'high' } });
    userContent.push({ type: 'text', text: `Ти — топовий копірайтер для українських маркетплейсів з 10-річним досвідом.
${LANG_HINTS[lang] ?? LANG_HINTS.uk}
${PLATFORM_HINTS[platform] ?? PLATFORM_HINTS.general}
${TONE_HINTS[tone] ?? TONE_HINTS.professional}
${hasProcessed ? `ФОТО ТОВАРУ ДОДАНО. Уважно проаналізуй:
- Колір, матеріал, текстуру, форму
- Видимі написи, логотипи, бренди
- Комплектацію якщо видно
Використай ці конкретні деталі в тексті — НЕ вигадуй характеристики яких не видно на фото.` : ''}

ТОВАР: ${productName}
${category ? `КАТЕГОРІЯ: ${category}` : ''}
${features ? `ХАРАКТЕРИСТИКИ ВІД ПРОДАВЦЯ: ${features}` : ''}

ПРАВИЛА:
1. Заголовок — починай з ключового слова, включи бренд/модель якщо є, конкретні параметри (розмір, колір, матеріал)
2. Опис — 4-5 речень: вигода покупця → конкретні характеристики → для кого → якість/матеріал → заклик: "${cta}"
3. Переваги — КОНКРЕТНІ з деталями. НЕ "висока якість", а "подвійне прошивання витримує 50 кг". НЕ "зручний", а "ергономічна форма зменшує навантаження на руку"
4. Ключові слова — реальні пошукові запити українських покупців

Відповідай ТІЛЬКИ валідним JSON без markdown:
{"title":"SEO-заголовок до 80 символів","description":"Опис 4-5 речень","bullets":["Конкретна перевага 1","Конкретна перевага 2","Конкретна перевага 3","Конкретна перевага 4","Конкретна перевага 5"],"keywords":["слово1","слово2","слово3","слово4","слово5","слово6"]}` });

    const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: userContent }], max_tokens: 1000, response_format: { type: 'json_object' } });
    const cardData = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    if (!cardData.title || !cardData.description) throw new Error('Неповна відповідь від AI. Спробуй ще раз.');

    let imageUrl: string | null = persistedPhotoUrl;
    if (!imageUrl && generateImage) {
      try {
        const imgPrompt = `Ultra-high quality professional product photography of "${productName}"${category ? ` (${category})` : ''}. Pure white seamless background. Soft studio lighting. Sharp focus. Commercial e-commerce style. STRICT: NO text, NO letters, NO words.`;
        const imgRes = await openai.images.generate({ model: 'dall-e-3', prompt: imgPrompt, size: '1024x1024', quality: 'standard', n: 1 });
        const tempUrl = imgRes.data[0]?.url;
        if (tempUrl) imageUrl = await uploadDalleUrl(supabase, tempUrl, user.id);
      } catch (e) { console.warn('Image generation failed:', e); }
    }

    const [insertResult] = await Promise.all([
      supabase.from('cards').insert({ user_id: user.id, product_name: productName, platform: platform ?? 'general', title: cardData.title, description: cardData.description, bullets: cardData.bullets, keywords: cardData.keywords ?? [], image_url: imageUrl, processed_image_url: processedImageUrl }).select('id').single(),
      supabase.from('users').update({ cards_left: Math.max(0, (profile.cards_left ?? 0) - (hasCardsLeft && !hasEnoughStars ? 1 : 0)), cards_total: (profile.cards_total ?? 0) + 1 }).eq('id', user.id),
    ]);

    const cardId = insertResult?.data?.id ?? null;

    if (hasEnoughStars) {
      await supabase.rpc('deduct_stars', { p_user_id: user.id, p_amount: STARS_FOR_TEXT });
      await supabase.from('star_transactions').insert({ user_id: user.id, type: 'spend', amount: -STARS_FOR_TEXT, description: `Генерація картки: ${productName}`, generation_id: cardId });
    }

    return NextResponse.json({ ...cardData, imageUrl, cardId, starsSpent: hasEnoughStars ? STARS_FOR_TEXT : 0, newBalance: hasEnoughStars ? starsBalance - STARS_FOR_TEXT : starsBalance });

  } catch (err: unknown) {
    console.error('Generate error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка сервера' }, { status: 500 });
  }
}
