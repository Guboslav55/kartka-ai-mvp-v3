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

    const langHint = lang === 'ru' ? 'російською' : lang === 'en' ? 'in English' : 'українською';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 800,
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
  "productName": "ПРОДАЮЧА SEO назва для Prom.ua. Формула: [Тип] [Характеристика] [Об'єм/Розмір якщо видно] [Колір] / [Призначення] для [ЦА]. Приклади: 'Рюкзак тактичний військовий 45л чорний / армійський похідний для ЗСУ', 'Кросівки тактичні шкіряні чорні / берці для військових та активного відпочинку', 'Футболка тактична Coolmax чорна / армійська для ЗСУ та служби'. Назва 60-80 символів, з ключовими словами які шукають покупці.",
  "category": "категорія товару",
  "bullets": [
    "Конкретна перевага 1 що ПРОДАЄ — з матеріалом/цифрою/фактом",
    "Перевага 2 що знімає головне заперечення покупця",
    "Перевага 3 про практичність та зручність використання",
    "Перевага 4 про якість/довговічність/гарантію",
    "Перевага 5 унікальна фішка що відрізняє від конкурентів"
  ],
  "material": "матеріал якщо видно",
  "color": "колір",
  "keepBackground": false
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
