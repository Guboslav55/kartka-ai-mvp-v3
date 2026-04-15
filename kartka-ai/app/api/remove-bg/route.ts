import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageBase64 } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    if (!REPLICATE_TOKEN) return NextResponse.json({ error: 'Replicate token not configured' }, { status: 500 });

    // Get user for Supabase upload
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Upload image to Supabase to get a public URL for Replicate
    const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return NextResponse.json({ error: 'Invalid image format' }, { status: 400 });

    const mimeType = match[1];
    const ext = mimeType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(match[2], 'base64');
    const fileName = `temp/rembg/${user.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    const publicUrl = supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;

    // Call Replicate background remover with public URL
    const createRes = await fetch(
      'https://api.replicate.com/v1/models/851-labs/background-remover/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({ input: { image: publicUrl } }),
      }
    );

    const prediction = await createRes.json();

    // Handle immediate success
    if (prediction.status === 'succeeded' && prediction.output) {
      const imgRes = await fetch(prediction.output);
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      return NextResponse.json({ imageBase64: `data:image/png;base64,${b64}` });
    }

    // Poll
    let current = prediction;
    let attempts = 0;
    while (
      current.status !== 'succeeded' &&
      current.status !== 'failed' &&
      current.status !== 'canceled' &&
      attempts < 20
    ) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${current.id}`,
        { headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` } }
      );
      current = await pollRes.json();
      attempts++;
    }

    if (current.status !== 'succeeded' || !current.output) {
      console.error('Replicate remove-bg failed:', JSON.stringify(current.error));
      return NextResponse.json({ error: 'Failed to remove background' }, { status: 500 });
    }

    const imgRes = await fetch(current.output);
    const buf = await imgRes.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    return NextResponse.json({ imageBase64: `data:image/png;base64,${b64}` });

  } catch (err: unknown) {
    console.error('Remove BG error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error removing background' },
      { status: 500 }
    );
  }
}
