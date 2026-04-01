import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import sharp from 'sharp';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { imageBase64 } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 });

    // ── Крок 1: GPT-4o визначає bbox товару ─────────────────────────────────
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
          {
            type: 'text',
            text: `Знайди головний товар на фото і поверни його bounding box у відносних координатах (0.0–1.0).
Відповідай ТІЛЬКИ валідним JSON без коментарів:
{
  "x": 0.1,
  "y": 0.05,
  "w": 0.8,
  "h": 0.9,
  "confidence": 0.95
}
x,y — верхній лівий кут; w,h — ширина та висота.
Якщо товар займає весь кадр, поверни {"x":0,"y":0,"w":1,"h":1,"confidence":1}.`,
          },
        ],
      }],
    });

    const bbox = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as {
      x: number; y: number; w: number; h: number; confidence: number;
    };

    // ── Крок 2: sharp кропає зображення ─────────────────────────────────────
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const inputBuffer = Buffer.from(base64Data, 'base64');

    const meta = await sharp(inputBuffer).metadata();
    const imgW = meta.width ?? 1000;
    const imgH = meta.height ?? 1000;

    // Padding 3% для природного обрізу, щоб товар не впирався в край
    const pad = 0.03;
    const cx = Math.max(0, bbox.x - pad);
    const cy = Math.max(0, bbox.y - pad);
    const cw = Math.min(1 - cx, bbox.w + pad * 2);
    const ch = Math.min(1 - cy, bbox.h + pad * 2);

    const left   = Math.round(cx * imgW);
    const top    = Math.round(cy * imgH);
    const width  = Math.round(cw * imgW);
    const height = Math.round(ch * imgH);

    // Якщо bbox майже весь кадр — не кропаємо, щоб не втратити якість
    const isFull = bbox.w > 0.9 && bbox.h > 0.9;

    let croppedBase64: string;

    if (isFull) {
      // Повертаємо оригінал без змін
      croppedBase64 = imageBase64;
    } else {
      const croppedBuffer = await sharp(inputBuffer)
        .extract({ left, top, width, height })
        .toFormat('jpeg', { quality: 95 })
        .toBuffer();
      croppedBase64 = `data:image/jpeg;base64,${croppedBuffer.toString('base64')}`;
    }

    return NextResponse.json({
      croppedBase64,
      bbox: { x: cx, y: cy, w: cw, h: ch },
      originalSize: { width: imgW, height: imgH },
      croppedSize: { width, height },
      confidence: bbox.confidence ?? 0,
      wasFullFrame: isFull,
    });

  } catch (err: unknown) {
    console.error('Crop error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Помилка обрізки' },
      { status: 500 },
    );
  }
}

