import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');
  const filename = searchParams.get('filename') || 'infographic.jpg';
  if (!imageUrl) return NextResponse.json({ error: 'No URL' }, { status: 400 });
  try {
    const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error('Failed: ' + res.status);
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error('Download error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}