import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageBase64, productName, lang = 'uk' } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 });

    const langHint = lang === 'ru' ? 'російською мовою' : lang === 'en' ? 'in English' : 'українською мовою';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
          {
            type: 'text',
            text: `Ти — експерт з e-commerce та маркетингу для українських маркетплейсів (Prom.ua, Rozetka).

Уважно розглянь фото товару${productName ? ` (${productName})` : ''}.
Визнач: що це за товар, з якого матеріалу, які характеристики видно на фото.

Відповідай ${langHint} ТІЛЬКИ валідним JSON:
{
  "productName": "точна назва товару з фото (якщо не вказана)",
  "category": "категорія товару",
  "bullets": [
    "Конкретна перевага 1 з фактом/цифрою що ПРОДАЄ",
    "Конкретна перевага 2 з матеріалом/технологією",
    "Конкретна перевага 3 що знімає заперечення покупця",
    "Конкретна перевага 4 про зручність/використання",
    "Конкретна перевага 5 про якість/гарантію"
  ],
  "material": "основний матеріал якщо видно",
  "color": "колір товару",
  "style": "стиль/призначення товару"
}`
          }
        ]
      }]
    });

    const data = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    return NextResponse.json(data);

  } catch (err: unknown) {
    console.error('Analyze error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

