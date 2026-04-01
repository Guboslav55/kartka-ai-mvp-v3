import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Category → which details to extract
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_PROMPTS: Record<string, string> = {
  'Одяг та взуття': `Аналізуй взуття або одяг. Знайди:
- callouts: 3 конкретні деталі видимі на фото (підошва, матеріал верху, застібка, устілка, шнурівка тощо)
- extraSpecs: до 3 числових характеристики якщо видно (розмір, висота підошви мм, кількість пар шнурівок тощо)
- detectedAccent: домінантний колір товару у hex (наприклад оливкові кросівки → #5a7a3a, чорні → #1a1a2a, бежеві → #c8a878)`,

  'Тактичне спорядження': `Аналізуй тактичне спорядження (рюкзак, жилет, сумка). Знайди:
- callouts: 3 видимі деталі (система MOLLE, замки, відділення, ручки, пряжки)
- extraSpecs: числові параметри (об'єм в літрах, кількість відділень, вага якщо відома)
- detectedAccent: колір виробу у hex (чорний → #1a1a1a, олива → #4a6a2c, мультикам → #7a6a4a)`,

  'Електроніка': `Аналізуй електроніку. Знайди:
- callouts: 3 видимі елементи (кнопки, порти, дисплей, роз'єми, індикатори)
- extraSpecs: ключові цифрові характеристики (DPI, мГц, мАг, дюйми тощо)
- detectedAccent: основний колір пристрою у hex`,

  'default': `Аналізуй товар на фото. Знайди:
- callouts: 3 найважливіші деталі видимі на фото з конкретними описами
- extraSpecs: до 2 числових характеристики якщо є
- detectedAccent: домінантний колір товару у hex`,
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageBase64, category = '', productName = '', bullets = [] } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 });

    const categoryPrompt = CATEGORY_PROMPTS[category] ?? CATEGORY_PROMPTS['default'];

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
            text: `${categoryPrompt}

Товар: "${productName}"
Відомі переваги: ${bullets.slice(0, 3).join(', ')}

Відповідай ТІЛЬКИ валідним JSON (без markdown):
{
  "detectedAccent": "#hex_колір",
  "callouts": [
    { "text": "Конкретна деталь 1 яку видно на фото", "dir": "left" },
    { "text": "Конкретна деталь 2", "dir": "right" },
    { "text": "Конкретна деталь 3", "dir": "left" }
  ],
  "extraSpecs": [
    { "key": "НАЗВА", "val": "значення" }
  ],
  "layoutHint": "shoe|bag|tech|tactical|universal"
}

callouts.dir: "left" якщо деталь зліва/внизу, "right" якщо справа/вгорі.
Пиши callouts ТІЛЬКИ українською, конкретно (не "висока якість" а "шкіряна підошва 4мм").`,
          },
        ],
      }],
    });

    const data = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    return NextResponse.json({
      detectedAccent: data.detectedAccent ?? '',
      callouts:       data.callouts ?? [],
      extraSpecs:     data.extraSpecs ?? [],
      layoutHint:     data.layoutHint ?? 'universal',
    });

  } catch (err: unknown) {
    console.error('Analyze infographic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error', detectedAccent: '', callouts: [], extraSpecs: [] },
      { status: 500 },
    );
  }
}
