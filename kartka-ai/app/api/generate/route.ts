import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createServerSupabase } from '@/lib/supabase-server';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Необхідна авторизація' }, { status: 401 });

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
{"title":"SEO-заголовок","description":"Продаючий опис 3-5 речень","bullets":["Перевага 1","Перевага 2","Перевага 3","Перевага 4","Перевага 5"],"keywords":["слово1","слово2","слово3","слово4","слово5","слово6"]}`;

    const msg = await claude.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content.map(b => ('text' in b ? b.text : '')).join('').trim();
    let cardData;
    try {
      cardData = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Не вдалося розпізнати відповідь AI. Спробуй ще раз.');
      cardData = JSON.parse(match[0]);
    }

    if (!cardData.title || !cardData.description || !Array.isArray(cardData.bullets)) {
      throw new Error('Неповна відповідь від AI. Спробуй ще раз.');
    }

    let imageUrl: string | undefined;
    if (generateImage && process.env.OPENAI_API_KEY) {
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка сервера' }, { status: 500 });
  }
}
