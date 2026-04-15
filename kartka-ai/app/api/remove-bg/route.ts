import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageBase64 } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    if (!REPLICATE_TOKEN) {
      return NextResponse.json({ error: 'Replicate token not configured' }, { status: 500 });
    }

    // Upload image to Replicate as data URI
    const input = {
      image: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
    };

    // Call Replicate background remover (851-labs/background-remover)
    const createRes = await fetch(
      'https://api.replicate.com/v1/models/851-labs/background-remover/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({ input }),
      }
    );

    const prediction = await createRes.json();

    // If already done
    if (prediction.status === 'succeeded' && prediction.output) {
      const outputUrl = prediction.output;
      const imgRes = await fetch(outputUrl);
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      return NextResponse.json({ imageBase64: `data:image/png;base64,${b64}` });
    }

    // Poll if needed
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
      console.error('Replicate remove-bg failed:', current.error);
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
