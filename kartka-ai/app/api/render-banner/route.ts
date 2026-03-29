import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

// ─── FONTS (base64 embedded) ───────────────────────────────────────────────
// We use system fonts via SVG text rendering

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  buffer: Buffer,
  userId: string
): Promise<string | null> {
  try {
    const fileName = `banners/${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (error) { console.warn('Storage error:', error.message); return null; }
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch (e) { console.warn('Upload failed:', e); return null; }
}

const BG_COLORS: Record<string, { bg1: string; bg2: string; accent: string; panel: string; text: string; sub: string }> = {
  dark:  { bg1: '#0d0d0d', bg2: '#1a1a1a', accent: '#c8a84b', panel: 'rgba(0,0,0,0.78)', text: '#ffffff', sub: 'rgba(255,255,255,0.55)' },
  white: { bg1: '#ffffff', bg2: '#f0f0f0', accent: '#1a3a5c', panel: 'rgba(255,255,255,0.92)', text: '#1a1a1a', sub: 'rgba(0,0,0,0.5)' },
  navy:  { bg1: '#060e1a', bg2: '#0d1b2a', accent: '#4a9eff', panel: 'rgba(6,14,26,0.85)', text: '#ffffff', sub: 'rgba(255,255,255,0.55)' },
  gold:  { bg1: '#0d0800', bg2: '#1a1000', accent: '#c8a84b', panel: 'rgba(13,8,0,0.85)', text: '#f5e6c8', sub: 'rgba(245,230,200,0.5)' },
};

function escXml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars && current) {
      lines.push(current.trim()); current = w;
    } else current = (current + ' ' + w).trim();
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function buildSVG(
  W: number, H: number,
  template: string,
  productName: string,
  price: string,
  bullets: string[],
  bgStyle: string,
  productB64: string | null
): string {
  const C = BG_COLORS[bgStyle] ?? BG_COLORS.dark;
  const b = bullets.filter(x=>x.trim()).slice(0,3).map(x=>x.replace(/^[✓•]\s*/,'').trim());
  const isDark = bgStyle !== 'white';

  const nameLines = wrapWords(productName || 'Товар', 22);

  let productImg = '';
  if (productB64) {
    if (template === 'benefits') {
      productImg = `<image href="${productB64}" x="30" y="60" width="460" height="460" preserveAspectRatio="xMidYMid meet" style="filter:drop-shadow(0px 20px 40px rgba(0,0,0,0.6))"/>`;
    } else if (template === 'callout') {
      productImg = `<image href="${productB64}" x="162" y="130" width="500" height="500" preserveAspectRatio="xMidYMid meet" style="filter:drop-shadow(0px 24px 48px rgba(0,0,0,0.7))"/>`;
    } else {
      productImg = `<image href="${productB64}" x="20" y="100" width="380" height="420" preserveAspectRatio="xMidYMid meet" style="filter:drop-shadow(0px 20px 40px rgba(0,0,0,0.6))"/>`;
    }
  }

  if (template === 'benefits') {
    const px = 510, py = 50, pw = 490, ph = 924;
    const bulletItems = b.map((bull, i) => {
      const lines = wrapWords(bull, 28);
      const cy = 380 + i * 130;
      return `
        <circle cx="${px+36}" cy="${cy+2}" r="16" fill="${C.accent}"/>
        <text x="${px+36}" y="${cy+7}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="${isDark?'#000':'#fff'}">✓</text>
        ${lines.map((line, li) => `<text x="${px+66}" y="${cy+li*22}" font-family="Arial,sans-serif" font-size="18" font-weight="500" fill="${C.text}">${escXml(line)}</text>`).join('')}
        ${i<b.length-1?`<line x1="${px+20}" y1="${cy+lines.length*22+10}" x2="${px+pw-20}" y2="${cy+lines.length*22+10}" stroke="${isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)'}" stroke-width="1"/>`:''}`;
    }).join('');

    const priceBlock = price ? `
      <rect x="${px+20}" y="${py+ph-90}" width="${pw-40}" height="68" rx="12" fill="${C.accent}" opacity="0.15"/>
      <rect x="${px+20}" y="${py+ph-90}" width="${pw-40}" height="68" rx="12" fill="none" stroke="${C.accent}" stroke-width="1.5"/>
      <text x="${px+pw/2}" y="${py+ph-44}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="38" font-weight="900" fill="${C.accent}">${escXml(price)} ₴</text>` : '';

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.bg2}"/>
      <stop offset="100%" stop-color="${C.bg1}"/>
    </linearGradient>
    <radialGradient id="glow" cx="30%" cy="50%" r="60%">
      <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${C.bg1}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${productImg}
  <!-- Right panel -->
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="20" fill="${isDark?'#000':'#fff'}" opacity="${isDark?'0.72':'0.88'}"/>
  <rect x="${px}" y="${py}" width="${pw}" height="5" rx="3" fill="${C.accent}"/>
  <!-- Category label -->
  <text x="${px+24}" y="${py+36}" font-family="Arial,sans-serif" font-size="13" font-weight="700" letter-spacing="2" fill="${C.accent}" text-transform="uppercase">ПЕРЕВАГИ</text>
  <!-- Product name -->
  ${nameLines.map((line,i)=>`<text x="${px+24}" y="${py+80+i*34}" font-family="Arial Black,Arial,sans-serif" font-size="${nameLines.length>1?26:30}" font-weight="900" fill="${C.text}">${escXml(line)}</text>`).join('')}
  <!-- Divider -->
  <line x1="${px+20}" y1="${py+145}" x2="${px+pw-20}" y2="${py+145}" stroke="${C.accent}" stroke-width="1" opacity="0.4"/>
  <!-- Benefits -->
  ${bulletItems}
  ${priceBlock}
</svg>`;
  }

  if (template === 'callout') {
    const callouts = [
      { x: 80,  y: 180, ax: 240, ay: 280, text: b[0]||'Якісний матеріал', dir: 'right' },
      { x: 700, y: 210, ax: 580, ay: 300, text: b[1]||'Ергономічний дизайн', dir: 'left' },
      { x: 680, y: 650, ax: 580, ay: 580, text: b[2]||'Надійна конструкція', dir: 'left' },
    ].slice(0, Math.max(b.length, 2));

    const calloutSVG = callouts.map(c => {
      const lines = wrapWords(c.text, 18);
      const bw = 196, bh = 20 + lines.length * 24;
      const bx = c.dir === 'right' ? c.x : c.x - bw;
      const lx2 = c.dir === 'right' ? bx + bw : bx;
      return `
        <circle cx="${c.ax}" cy="${c.ay}" r="7" fill="${C.accent}"/>
        <circle cx="${c.ax}" cy="${c.ay}" r="14" fill="${C.accent}" opacity="0.2"/>
        <line x1="${c.ax}" y1="${c.ay}" x2="${c.x + (c.dir==='right'?0:bw)}" y2="${c.y + bh/2}" stroke="${C.accent}" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>
        <rect x="${bx}" y="${c.y}" width="${bw}" height="${bh}" rx="8" fill="${isDark?'rgba(0,0,0,0.8)':'rgba(255,255,255,0.92)'}"/>
        <rect x="${bx}" y="${c.y}" width="4" height="${bh}" rx="2" fill="${C.accent}"/>
        ${lines.map((line,i)=>`<text x="${bx+14}" y="${c.y+20+i*24}" font-family="Arial,sans-serif" font-size="15" font-weight="500" fill="${C.text}">${escXml(line)}</text>`).join('')}`;
    }).join('');

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.bg2}"/>
      <stop offset="100%" stop-color="${C.bg1}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${productImg}
  <!-- Top title bar -->
  <rect x="100" y="30" width="624" height="52" rx="26" fill="${isDark?'rgba(0,0,0,0.7)':'rgba(255,255,255,0.88)'}"/>
  <text x="412" y="63" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="22" font-weight="900" fill="${C.accent}">${escXml(productName||'Товар')}</text>
  ${calloutSVG}
  ${price ? `<rect x="256" y="880" width="312" height="64" rx="12" fill="${isDark?'rgba(0,0,0,0.75)':'rgba(255,255,255,0.9)'}"/>
  <text x="412" y="922" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="36" font-weight="900" fill="${C.accent}">${escXml(price)} ₴</text>` : ''}
</svg>`;
  }

  // CTA
  const bulletCTA = b.map((bull,i) => {
    const lines = wrapWords(bull, 26);
    return `
      <text x="445" y="${340+i*52}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="${C.accent}">✓</text>
      ${lines.map((line,li)=>`<text x="468" y="${340+i*52+li*20}" font-family="Arial,sans-serif" font-size="15" font-weight="500" fill="${C.sub}">${escXml(line)}</text>`).join('')}`;
  }).join('');

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.bg2}"/>
      <stop offset="100%" stop-color="${C.bg1}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${productImg}
  <!-- Right text area -->
  <text x="430" y="165" font-family="Arial,sans-serif" font-size="13" font-weight="700" letter-spacing="2" fill="${C.accent}">НОВА КОЛЕКЦІЯ</text>
  ${nameLines.map((line,i)=>`<text x="430" y="${210+i*38}" font-family="Arial Black,Arial,sans-serif" font-size="${nameLines.length>1?28:32}" font-weight="900" fill="${C.text}">${escXml(line)}</text>`).join('')}
  ${bulletCTA}
  ${price?`<text x="430" y="514" font-family="Arial Black,Arial,sans-serif" font-size="54" font-weight="900" fill="${C.accent}">${escXml(price)} ₴</text>`:''}
  <rect x="430" y="${price?'548':'500'}" width="360" height="64" rx="14" fill="${C.accent}"/>
  <text x="610" y="${price?'590':'542'}" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="20" font-weight="900" fill="${isDark?'#0a0a0a':'#fff'}">ЗАМОВИТИ ЗАРАЗ</text>
  <text x="610" y="${price?'638':'590'}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="${C.sub}">🚚 Доставка по всій Україні</text>
</svg>`;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { productName, price, bullets, bgStyle = 'dark', template = 'benefits', productB64 } = await req.json();

    const svg = buildSVG(1024, 1024, template, productName || '', price || '', bullets || [], bgStyle, productB64 || null);

    const jpgBuffer = await sharp(Buffer.from(svg))
      .jpeg({ quality: 92 })
      .toBuffer();

    const permanent = await uploadToStorage(supabase, jpgBuffer, user.id);

    if (permanent) {
      return NextResponse.json({ imageUrl: permanent });
    }

    // Fallback: return as base64
    const b64 = jpgBuffer.toString('base64');
    return NextResponse.json({ imageUrl: `data:image/jpeg;base64,${b64}` });

  } catch (err: unknown) {
    console.error('Render banner error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Помилка рендерингу' }, { status: 500 });
  }
}

