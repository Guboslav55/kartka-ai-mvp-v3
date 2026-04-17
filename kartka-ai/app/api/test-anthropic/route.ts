import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: 'NO KEY' });
  
  // Test simple text request (no images) to check key validity
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    }),
  });
  
  const status = resp.status;
  const body = await resp.text();
  return NextResponse.json({ status, keyPrefix: key.slice(0,8)+'...', body: body.slice(0,300) });
}