import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  buf: Buffer, userId: string,
): Promise<string> {
  try {
    const fileName = `infographics/${userId}/${Date.now()}-edited.jpg`;
    const { error } = await supabase.storage.from('card-images')
      .upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${buf.toString('base64')}`;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch {
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  }
}

async function uploadImageForFlux(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string, userId: string,
): Promise<string | null> {
  try {
    // Fetch the current infographic
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const fileName = `temp/${userId}/${Date.now()}-edit-input.jpg`;
    const { error } = await supabase.storage.from('card-images')
      .upload(fileName, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch { return null; }
}

async function runFluxKontext(imageUrl: string, prompt: string): Promise<Buffer | null> {
  if (!REPLICATE_TOKEN) return null;
  try {
    const createRes = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({
          input: {
            prompt,
            input_image: imageUrl,
            output_format: 'jpg',
            output_quality: 90,
            safety_tolerance: 2,
            aspect_ratio: '1:1',
          },
        }),
      },
    );

    const prediction = await createRes.json();

    if (prediction.status === 'succeeded') {
      const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
      if (!outputUrl) return null;
      const imgRes = await fetch(outputUrl);
      return Buffer.from(await imgRes.arrayBuffer());
    }

    let current = prediction;
    let attempts = 0;
    while (current.status !== 'succeeded' && current.status !== 'failed' && current.status !== 'canceled' && attempts < 30) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${current.id}`,
        { headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` } },
      );
      current = await pollRes.json();
      attempts++;
    }

    if (current.status !== 'succeeded') return null;
    const outputUrl = Array.isArray(current.output) ? current.output[0] : current.output;
    if (!outputUrl) return null;
    const imgRes = await fetch(outputUrl);
    return Buffer.from(await imgRes.arrayBuffer());
  } catch (e) {
    console.error('Flux edit error:', e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { userMessage, currentImageUrl, productName = '', bullets = [], history = [] } = await req.json();

    if (!userMessage?.trim())
      return NextResponse.json({ error: 'Порожнє повідомлення' }, { status: 400 });

    const b = (bullets as string[]).filter(x => x.trim()).slice(0, 4)
      .map(x => x.replace(/^[✓•]\s*/, '').trim());

    // Step 1: GPT-4o builds Flux Kontext editing instruction
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a professional infographic designer for Ukrainian marketplaces.
The user has an existing infographic for product: "${productName}"
Product features: ${b.join(', ')}
Create a Flux Kontext editing instruction based on the user's request.
Flux Kontext is an image EDITOR — it modifies the existing image while keeping the product.
Rules:
- Keep the original product in the image
- Apply ONLY what user requested
- Be specific about what to change
- All text in the image must be in Ukrainian
Respond with JSON: {"editPrompt": "specific Flux Kontext instruction...", "explanation": "Що змінено (1-2 речення українською)"}`,
        },
        ...history.slice(-4).map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role, content: m.content,
        })),
        { role: 'user', content: userMessage },
      ],
      max_tokens: 400,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    const editPrompt = parsed.editPrompt || '';
    const explanation = parsed.explanation || 'Зміни внесено';

    if (!editPrompt)
      return NextResponse.json({ error: 'Не вдалося побудувати інструкцію редагування' }, { status: 500 });

    // Step 2: Upload current infographic for Flux input
    const fluxInputUrl = await uploadImageForFlux(supabase, currentImageUrl, user.id);
    if (!fluxInputUrl)
      return NextResponse.json({ error: 'Не вдалося підготувати зображення' }, { status: 500 });

    // Step 3: Run Flux Kontext to edit the existing infographic
    const buf = await runFluxKontext(fluxInputUrl, editPrompt);
    if (!buf)
      return NextResponse.json({ error: 'Flux Kontext не зміг відредагувати зображення' }, { status: 500 });

    const imageUrl = await uploadToStorage(supabase, buf, user.id);

    return NextResponse.json({ imageUrl, explanation, newPrompt: editPrompt });

  } catch (err: unknown) {
    console.error('Edit infographic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка редагування' },
      { status: 500 },
    );
  }
}
