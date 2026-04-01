import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Fields that can be edited via chat
type EditableField = 'title' | 'description' | 'bullets' | 'keywords';

interface CardDiff {
  title?:       string;
  description?: string;
  bullets?:     string[];
  keywords?:    string[];
  explanation:  string;  // what was changed and why
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      cardId,
      userMessage,
      card, // current card state: { title, description, bullets, keywords, platform, product_name }
      history = [], // [{role, content}] previous chat turns
    } = await req.json();

    if (!userMessage?.trim()) return NextResponse.json({ error: 'Порожнє повідомлення' }, { status: 400 });
    if (!card) return NextResponse.json({ error: 'Немає даних картки' }, { status: 400 });

    // Build system prompt with current card context
    const platformHints: Record<string, string> = {
      prom:    'Prom.ua: заголовок до 80 символів, SEO-ключові слова',
      rozetka: 'Rozetka: до 70 символів, технічні характеристики',
      olx:     'OLX: до 60 символів, розмовний стиль',
      general: 'Універсальна платформа',
    };

    const systemPrompt = `Ти — AI-асистент для редагування продаючих карток товарів на українських маркетплейсах.

ПОТОЧНА КАРТКА (${platformHints[card.platform] ?? 'Загальний'}):
Товар: "${card.product_name}"
Платформа: ${card.platform}

ЗАГОЛОВОК (${card.title.length}/80 симв.):
${card.title}

ОПИС:
${card.description}

ПЕРЕВАГИ:
${(card.bullets as string[]).map((b: string, i: number) => `${i + 1}. ${b}`).join('\n')}

КЛЮЧОВІ СЛОВА:
${(card.keywords as string[]).join(', ')}

ТВОЯ РОЛЬ:
- Вноси тільки ті зміни, про які просить користувач
- Якщо просять змінити заголовок — міняй тільки заголовок
- Якщо просять переписати все — міняй все
- Завжди зберігай тональність і стиль відповідно до платформи
- Заголовок НЕ може перевищувати 80 символів для Prom/general, 70 для Rozetka, 60 для OLX
- Відповідай ТІЛЬКИ валідним JSON без markdown

ФОРМАТ ВІДПОВІДІ:
{
  "title": "новий заголовок або null якщо не змінювався",
  "description": "новий опис або null",
  "bullets": ["перевага 1", "перевага 2", ...] або null,
  "keywords": ["слово1", "слово2", ...] або null,
  "explanation": "Коротко що змінив і чому (1-2 речення українською)"
}

Якщо поле не змінювалося — встановлюй null. НЕ повертай незмінені поля.`;

    // Build messages array with chat history
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map((m: { role: 'user' | 'assistant'; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let diff: CardDiff;
    try {
      diff = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Помилка парсингу відповіді AI' }, { status: 500 });
    }

    // Validate title length
    if (diff.title) {
      const maxLen = card.platform === 'rozetka' ? 70 : card.platform === 'olx' ? 60 : 80;
      if (diff.title.length > maxLen) {
        diff.title = diff.title.slice(0, maxLen).trim();
      }
    }

    // Build the actual update — only changed fields
    const updates: Partial<Record<EditableField, string | string[]>> = {};
    if (diff.title       !== null && diff.title       !== undefined) updates.title       = diff.title;
    if (diff.description !== null && diff.description !== undefined) updates.description = diff.description;
    if (diff.bullets     !== null && diff.bullets     !== undefined) updates.bullets     = diff.bullets;
    if (diff.keywords    !== null && diff.keywords    !== undefined) updates.keywords    = diff.keywords;

    // Save to Supabase if there are actual changes
    if (Object.keys(updates).length > 0 && cardId) {
      const { error: updateError } = await supabase
        .from('cards')
        .update(updates)
        .eq('id', cardId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Card update error:', updateError);
        // Don't fail — return diff anyway so UI can update locally
      }
    }

    return NextResponse.json({
      diff: updates,
      explanation: diff.explanation ?? 'Зміни внесено',
      changedFields: Object.keys(updates) as EditableField[],
    });

  } catch (err: unknown) {
    console.error('Edit card error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка редагування' },
      { status: 500 },
    );
  }
}
