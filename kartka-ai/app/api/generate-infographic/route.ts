import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

arsync function uploadToStorage(s: any, b64: string, userId: string, idx: number) { try { const buf = Buffer.from(b64, 'base64'); const f = `infographics/${userId}/${Date.now()}-v${idx}.jpg`; const { error } = await s.storage.from('card-images').upload(f, buf, { contentType: 'image/jpeg' }); if (error) return `data:image/jpeg;base64,${b64}`; return s.storage.from('card-images').getPublicUrl(f).data.publicUrl; } catch { return `data:image/jpeg;base64,${b64}`; } }