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

// ── Upload helpers ────────────────────────────────────────────────────────────

/** Upload a DALL-E temp URL (https://...) to Supabase Storage */
async function uploadDalleUrl(
  supabase: ReturnType<typeof createClient>,
  tempUrl: string,
  userId: string,
): Promise<string> {
  try {
    const res = await fetch(tempUrl);
    const blob = await res.arrayBuffer();
    const fileName = `${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) { console.warn('Storage upload error:', error); return tempUrl; }
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch (e) {
    console.warn('Image upload failed, using temp URL:', e);
    return tempUrl;
  }
}

/** Upload a base64 data URI (data:image/...;base64,...) to Supabase Storage */
async function uploadBase64Photo(
  supabase: ReturnType<typeof createClient>,
  base64DataUri: string,
  userId: string,
): Promise<string | null> {
  try {
    const match = base64DataUri.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return null;
    const mimeType = match[1];                        // e.g. "image/png"
    const ext      = mimeType.split('/')[1] || 'jpg'; // "png" | "jpeg" | "jpg"
    const buffer   = Buffer.from(match[2], 'base64');

    const fileName = `${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: mimeType, upsert: false });
    if (error) { console.warn('Photo storage error:', error); return null; }
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch (e) {
    console.warn('Base64 upload failed:', e);
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });

    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (!profile)               return NextResponse.json({ error: 'Профіль не знайдено' },             { status: 404 });
    if (profile.cards_left <= 0) return NextResponse.json({ error: 'Ліміт карточок вичерпано. Підвищ тариф.' }, { status: 403 });

    const {
      productName,
      category,
      features,
      platform,
      tone,
      lang,
      generateImage,    // boolean — user wants DALL-E image (only when no photo)
      uploadedPhoto,    // base64 data URI — processed photo (cropped + no bg) from frontend
    } = await req.json();

    if (!productName?.trim()) return NextResponse.json({ error: "Назва товару обов'язкова" }, { status: 400 });

    // ── Step 1: Save uploaded photo to permanent Supabase URL ──────────────────
    // Do this BEFORE text generation so we have a stable URL for the card record.
    let persistedPhotoUrl: string | null = null;
    const hasUploadedPhoto = typeof uploadedPhoto === 'string' && uploadedPhoto.startsWith('data:');

    if (hasUploadedPhoto) {
      persistedPhotoUrl = await uploadBase64Photo(supabase, uploadedPhoto, user.id);
    }

    // ── Step 2: Generate text (GPT-4o) ─────────────────────────────────────────
    const cta = CTA[lang] ?? CTA.uk;
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

    if (hasUploadedPhoto) {
      // Pass base64 to GPT-4o vision — it reads the actual product
      userContent.push({ type: 'image_url', image_url: { url: uploadedPhoto, detail: 'high' } });
    }

    userContent.push({
      type: 'text',
      text: `Ти — експерт-копірайтер для українських маркетплейсів.
${LANG_HINTS[lang] ?? LANG_HINTS.uk}
${PLATFORM_HINTS[platform] ?? PLATFORM_HINTS.general}
${TONE_HINTS[tone] ?? TONE_HINTS.professional}
${hasUploadedPhoto ? 'На фото — товар клієнта. Уважно опиши деталі з фото.' : ''}

Товар: ${productName}
${category ? `Категорія: ${category}` : ''}
${features ? `Характеристики: ${features}` : ''}

ВАЖЛИВО: В кінці опису ОБОВ'ЯЗКОВО додай: "${cta}"

Відповідай ТІЛЬКИ валідним JSON без markdown:
{"title":"SEO-заголовок","description":"Опис 3-5 речень + заклик до дії","bullets":["Перевага 1","Перевага 2","Перевага 3","Перевага 4","Перевага 5"],"keywords":["слово1","слово2","слово3","слово4","слово5","слово6"]}`,
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: userContent }],
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const cardData = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    if (!cardData.title || !cardData.description) throw new Error('Неповна відповідь від AI. Спробуй ще раз.');

    // ── Step 3: Determine final imageUrl ───────────────────────────────────────
    // Priority: persistedPhotoUrl > DALL-E generated > null
    let imageUrl: string | null = persistedPhotoUrl;

    if (!imageUrl && generateImage) {
      // Only generate DALL-E image when user explicitly asked AND no photo was uploaded
      try {
        const imgPrompt = `Ultra-high quality professional product photography of "${productName}"${category ? ` (${category})` : ''}.
Pure white seamless background. Soft studio lighting. Sharp focus. Commercial e-commerce style.
STRICT: NO text, NO letters, NO words, NO watermarks anywhere in the image.`;

        const imgRes = await openai.images.generate({
          model: 'dall-e-3',
          prompt: imgPrompt,
          size: '1024x1024',
          quality: 'hd',
          style: 'natural',
          n: 1,
        });

        const tempUrl = imgRes.data[0]?.url;
        if (tempUrl) {
          imageUrl = await uploadDalleUrl(supabase, tempUrl, user.id);
        }
      } catch (e) {
        console.warn('Image generation failed:', e);
      }
    }

    // ── Step 4: Save to Supabase ────────────────────────────────────────────────
    const [insertResult] = await Promise.all([
      supabase.from('cards').insert({
        user_id:      user.id,
        product_name: productName,
        platform:     platform ?? 'general',
        title:        cardData.title,
        description:  cardData.description,
        bullets:      cardData.bullets,
        keywords:     cardData.keywords ?? [],
        image_url:    imageUrl,
      }),
      supabase.from('users').update({
        cards_left:  profile.cards_left - 1,
        cards_total: (profile.cards_total ?? 0) + 1,
      }).eq('id', user.id),
    ]);

    if (insertResult.error) {
      // Log but don't fail the request — user still gets the card content
      console.error('Card insert error:', insertResult.error);
    }

    return NextResponse.json({ ...cardData, imageUrl });

  } catch (err: unknown) {
    console.error('Generate error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка сервера' }, { status: 500 });
  }
}

