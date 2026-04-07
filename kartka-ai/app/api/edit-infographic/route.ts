import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  b64: string, userId: string,
): Promise<string> {
  try {
    const buf = Buffer.from(b64, 'base64');
    const fileName = `infographics/${userId}/${Date.now()}-edited.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${b64}`;
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return `data:image/jpeg;base64,${b64}`;
  }
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
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      userMessage,         // what user wants to change
      currentImageUrl,     // current infographic URL
      originalPrompt,      // original DALL-E prompt used
      productName = '',
      bullets = [],
      history = [],        // chat history [{role, content}]
    } = await req.json();

    if (!userMessage?.trim()) return NextResponse.json({ error: 'Порожнє повідомлення' }, { status: 400 });

    const b = (bullets as string[]).filter((x: string) => x.trim()).slice(0, 4)
      .map((x: string) => x.replace(/^[✓•]\s*/, '').trim());

    // Step 1: GPT-4o builds updated prompt based on user request
    const systemPrompt = `You are a professional infographic designer for Ukrainian marketplaces.

The user has an existing infographic for: "${productName}"
Original infographic prompt: "${originalPrompt?.slice(0, 300) || 'not available'}"
Product features: ${b.join(', ')}

The user wants to modify the infographic. Based on their request, create a NEW improved DALL-E 3 prompt.

Rules:
- Keep the same overall style/variant as the original
- Apply the user's requested changes
- All text must be in Ukrainian
- 1024x1024 square format
- Professional marketplace quality
- Be specific and detailed

Respond with JSON:
{
  "newPrompt": "complete new DALL-E 3 prompt with all changes applied...",
  "explanation": "Що змінено (1-2 речення українською)"
}`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-4).map((m: { role: 'user' | 'assistant'; content: string }) => ({
        role: m.role, content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 600,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);
    const newPrompt = parsed.newPrompt || '';
    const explanation = parsed.explanation || 'Зміни внесено';

    if (!newPrompt) return NextResponse.json({ error: 'Не вдалося побудувати промпт' }, { status: 500 });

    // Step 2: Generate updated infographic
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt: newPrompt + '\n\nIMPORTANT: Square 1024x1024. Ukrainian text only. Professional marketplace infographic.',
      size: '1024x1024',
      quality: 'hd',
      style: 'vivid',
      n: 1,
      response_format: 'b64_json',
    });

    const b64 = res.data[0]?.b64_json;
    if (!b64) return NextResponse.json({ error: 'DALL-E 3 не повернув зображення' }, { status: 500 });

    const imageUrl = await uploadToStorage(supabase, b64, user.id);

    return NextResponse.json({
      imageUrl,
      explanation,
      newPrompt,
    });

  } catch (err: unknown) {
    console.error('Edit infographic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка редагування' },
      { status: 500 },
    );
  }
}
