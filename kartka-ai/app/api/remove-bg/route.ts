import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageBase64 } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    // Convert base64 to blob
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Call Remove.bg API
    const formData = new FormData();
    formData.append('image_file', new Blob([imageBuffer]), 'image.jpg');
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.REMOVE_BG_API_KEY!,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Remove.bg error:', err);
      throw new Error('Не вдалося видалити фон. Спробуй інше фото.');
    }

    const resultBuffer = await response.arrayBuffer();
    const resultBase64 = Buffer.from(resultBuffer).toString('base64');

    return NextResponse.json({
      imageBase64: `data:image/png;base64,${resultBase64}`,
    });

  } catch (err: unknown) {
    console.error('Remove BG error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Помилка видалення фону'
    }, { status: 500 });
  }
}

