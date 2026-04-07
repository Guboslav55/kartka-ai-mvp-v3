import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  b64: string, userId: string,
): Promise<string> {
  try {
    const buf = Buffer.from(b64, 'base64');
    const fileName = `infographics/${userId}/${Date.now()}-edited.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buf, { contentType: 'image/jpeg' });
    if (error) return `data:image/jpeg;base64,${b64}`;
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return `data:image/jpeg;base64,${b64}`;
  }
}