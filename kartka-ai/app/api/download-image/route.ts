import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');
  const filename = searchParams.get('filename') || 'infographic.jpg';

  if (!imageUrl) {
    return NextResponse.json({ error: 'No URL' }, { status: 400 });
  }

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error('Failed to fetch image');

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (e) {
    console.error('Download proxy error:', e);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
