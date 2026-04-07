import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  b64: string, userId: string, idx: number,
): Promise<string> {
  try {
    const buf = Buffer.from(b64, 'base64');
    const fileName = `infographics/${userId}/${Date.now()}-v${idx}.jpg`;
    const { error } = await supabase.storage.from('card-images').upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${b64}`;
    return supabase.storage.from('card-images').getPublicUrl(fileName).data.publicUrl;
  } catch { return `data:image/jpeg;base64,${b64}`; }
}

aSync function buildThreePrompts(imageBase64: string, productName: string, description: string, bullets: string[], platform: string): Promise<string[]> { return []; }