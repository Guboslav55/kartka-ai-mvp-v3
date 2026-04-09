import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageBase64, productName, lang = 'uk' } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 });

    const langHint = lang === 'ru' ? 'російською' : lang === 'en' ? 'in English' : 'українською';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
          {
            type: 'text',
            text: `Ти — експерт з e-commerce та SEO для українських маркетплейсів Prom.ua та Rozetka.
Уважно розглянь фото товару${productName ? ` (${productName})` : ''}.
Відповідай ${langHint} ТІЛЬКИ валідним JSON:
{
  "productName": "ПРОДАЮЧА SEO назва для Prom.ua. Формула: [Тип] [Характеристика] [Об'єм/Розмір якщо видно] [Колір] / [Призначення] для [ЦА]. Назва 60-80 символів.",
  "category": "одна з: Електроніка | Одяг та взуття | Тактичне спорядження | Дім та сад | Краса та здоров'я | Спорт та хобі | Авто та мото | Іграшки | Інше",
  "bullets": [
    "Конкретна перевага 1 що ПРОДАЄ — з матеріалом/цифрою/фактом",
    "Перевага 2 що знімає головне заперечення покупця",
    "Перевага 3 про практичність та зручність використання",
    "Перевага 4 про якість/довговічність/гарантію",
    "Перевага 5 унікальна фішка що відрізняє від конкурентів"
  ],
  "material": "матеріал якщо видно або null",
  "color": "колір або null",
  "keepBackground": false,
  "bbox": { "x": 0.1, "y": 0.05, "w": 0.8, "h": 0.9 }
}

ВАЖЛИВО: keepBackground ЗАВЖДИ має бути false — ми завжди видаляємо фон.
bbox — відносні координати (0.0–1.0) де знаходиться товар на фото.`,
          },
        ],
      }],
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const data = JSON.parse(raw);
    // Force keepBackground false regardless of GPT response
    data.keepBackground = false;

    return NextResponse.json(data);

  } catch (err: unknown) {
    console.error('Analyze error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    );
  }
}
