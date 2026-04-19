import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

const SCENE_PROMPTS: Record<string, string> = {
  studio_white: 'professional studio photography with pure white seamless background, soft studio lighting from multiple angles, clean commercial look',
  studio_gray: 'professional studio photography with light grey seamless background, soft diffused studio lighting, elegant minimalist setting',
  loft: 'modern loft interior with exposed brick walls, large windows with natural light, industrial style furniture in background',
  street: 'urban street setting, city background slightly blurred, natural daylight, modern city environment',
  nature: 'outdoor nature setting, green park or forest background, soft natural sunlight, fresh outdoor atmosphere',
  cafe: 'cozy cafe interior, warm ambient lighting, coffee shop atmosphere, bokeh background',
};

const MODEL_PROMPTS: Record<string, string> = {
  woman_young: 'worn by a young woman in her mid-20s, confident pose, professional fashion model',
  man_young: 'worn by a young man in his mid-20s, confident pose, professional fashion model',
  woman_mid: 'worn by a woman in her late 30s, elegant pose, professional appearance',
  man_mid: 'worn by a man in his late 30s, confident business pose, professional appearance',
  no_model: 'displayed as a flat lay or on a mannequin, no model, product-focused photography',
};

async function uploadImageForReplicate(
  supabase: ReturnType<typeof createClient>,
  base64: string,
  userId: string,
): Promise<string | null> {
  try {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return null;
    const mimeType = match[1];
    const ext = mimeType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    const fileName = `tryon/${userId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });
    if (error) return null;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch { return null; }
}

async function buildTryOnPrompt(
  imageBase64: string,
  scene: string,
  model: string,
): Promise<string> {
  const sceneDesc = SCENE_PROMPTS[scene] || SCENE_PROMPTS.studio_white;
  const modelDesc = MODEL_PROMPTS[model] || MODEL_PROMPTS.woman_young;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: `You are a professional fashion photographer creating marketplace product photos.

Analyze this clothing/product image and create a Flux Kontext editing prompt.

Target scene: ${sceneDesc}
Target model: ${modelDesc}

Create a prompt that will:
1. Show the EXACT SAME clothing/product from the photo
2. Place it in the described scene with the described model type
3. Make it look like a professional marketplace photo
4. Keep all product details, colors, and design perfectly intact

CRITICAL RULES:
- Keep the EXACT clothing/product - same colors, patterns, design
- Do NOT change or alter the product itself
- Only change: background, model, lighting, setting
- Result must look like a professional e-commerce photo
- Square 1:1 format, 1024x1024

Return ONLY the English prompt for Flux Kontext, no explanation.`,
        },
      ],
    }],
    max_tokens: 500,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

async function runFluxKontext(imageUrl: string, prompt: string): Promise<string | null> {
  if (!REPLICATE_TOKEN) return null;
  try {
    const res = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait' },
        body: JSON.stringify({
          input: { prompt, input_image: imageUrl, output_format: 'jpg', output_quality: 92, safety_tolerance: 2, aspect_ratio: '1:1' },
        }),
      },
    );
    const p = await res.json() as { id?: string; status?: string; output?: string | string[]; error?: string };
    const getOutput = (pred: typeof p) => {
      const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      return url || null;
    };
    if (p.status === 'succeeded') return getOutput(p);
    if (!p.id) { console.error('Flux no id:', p.error); return null; }
    let cur = p;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      cur = await (await fetch(`https://api.replicate.com/v1/predictions/${cur.id}`, { headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` } })).json() as typeof p;
      if (cur.status === 'succeeded' || cur.status === 'failed' || cur.status === 'canceled') break;
    }
    if (cur.status !== 'succeeded') { console.error('Flux failed:', cur.error); return null; }
    return getOutput(cur);
  } catch (e) { console.error('Flux error:', e); return null; }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {},
    );
    let userId = 'anonymous';
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }
    const { imageBase64, scene = 'studio_white', model = 'woman_young' } =
      await req.json() as { imageBase64?: string; scene?: string; model?: string };
    if (!imageBase64) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    const publicImageUrl = await uploadImageForReplicate(supabase, imageBase64, userId);
    if (!publicImageUrl) return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    const prompt = await buildTryOnPrompt(imageBase64, scene, model);
    if (!prompt) return NextResponse.json({ error: 'Failed to build prompt' }, { status: 500 });
    console.log('TryOn prompt:', prompt.slice(0, 200));
    const resultUrl = await runFluxKontext(publicImageUrl, prompt);
    if (!resultUrl) return NextResponse.json({ error: 'Flux generation failed' }, { status: 500 });
    return NextResponse.json({ url: resultUrl, urls: [resultUrl] });
  } catch (err: unknown) {
    console.error('TryOn error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
