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
  explanation:  string;
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: aErr } = await supabase.auth.getUser(token);
    if (aErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { cardId, userMessage, card, history = [] } = await req.json();
    if (!userMessage?.trim()) return NextResponse.json({ error: 'Порожнє повідомлення' }, { status: 400 });
    if (!card) return NextResponse.json({ error: 'Немає даних картки' }, { status: 400 });
    const platformHints: Record<string, string> = { prom: 'Prom.ua: заголовок до 80 символів', rozetka: 'Rozetka: 070 символів', olx: 'OLX: до 60 символів', general: 'Універсальна' };
    const systemPrompt = `Ти ─ AI-асистент для редагування.\n\nПОТОчНА КАРТКА (${platformHints[card.platform] ?? 'Загальний'}):\nТовар: "${card.product_name}"\n\nЗАГОЛОВОК (${card.title.length}/80):\n${card.title}\n\n��пИС:\n${card.description}\n\nПЕРЕВАГЙ:\n${(card.bullets as string[]).map((b: string, i: number) => `${i + 1}. ${b}`).join('\n')}\n\nКЛЪЧОВЇ�СЛОВБ:\n${(card.keywords as string[]).join(', ')}\n\nЭволюйти внесені тільки зміни, про які просить користувач.\n\nОдновно відповідах ЕРсАН�#:\n{"title":null,"description":null,"bullets":null,"keywords":null,"explanation":""}`;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }, ...history.slice(-6).map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content })), { role: 'user', content: userMessage }];
    const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages, max_tokens: 1200, response_format: { type: 'json_object' }, temperature: 0.7 });
    let diff: CardDiff;
    try { diff = JSON.parse(completion.choices[0]?.message?.content ?? '{}'); } catch { return NextResponse.json({ error: 'Помилка парсингу відповіді AI' }, { status: 500 }); }
    if (diff.title) { const maxLen = card.platform === 'rozetka' ? 70 : card.platform === 'olx' ? 60 : 80; if (diff.title.length > maxLen) diff.title = diff.title.slice(0, maxLen).trim(); }
    const updates: Partial<Record<EditableField, string | string[]>> = {};
    if (diff.title != null && diff.title != undefined) updates.title = diff.title;
    if (diff.description != null && diff.description != undefined) updates.description = diff.description;
    if (diff.bullets != null && diff.bullets != undefined) updates.bullets = diff.bullets;
    if (diff.keywords != null && diff.keywords != undefined) updates.keywords = diff.keywords;
    if (Object.keys(updates).length > 0 && cardId) { await supabase.from('cards').update(updates).eq('id', cardId).eq('user_id', user.id); }
    return NextResponse.json({ diff: updates, explanation: diff.explanation ?? 'Зміни внесено', changedFields: Object.keys(updates) as EditableField[] });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка редагування' }, { status: 500 });
  }
}
