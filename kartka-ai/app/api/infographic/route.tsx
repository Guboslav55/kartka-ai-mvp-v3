import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function uploadAndGetUrl(
  supabase: ReturnType<typeof createClient>,
  base64: string,
  userId: string
): Promise<string | null> {
  try {
    const b64data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Uint8Array.from(atob(b64data), c => c.charCodeAt(0));
    const fileName = `tmp/${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch { return null; }
}

async function analyzeProduct(photoUrl: string, productName: string) {
  const prompt = `Ти — експерт з інфографіки для маркетплейсів.

Розглянь фото товару${productName ? ` (${productName})` : ''}.
Визнач категорію і підбери МАКСИМАЛЬНО РЕЛЕВАНТНІ характеристики.

Відповідай ТІЛЬКИ валідним JSON:
{
  "title": "КОРОТКИЙ ЗАГОЛОВОК 2-3 СЛОВА",
  "accent": "#hex колір акценту під товар",
  "bg": "#hex темний фон",
  "specs": [
    {"icon": "🔒", "label": "МАТЕРІАЛ", "value": "назва матеріалу"},
    {"icon": "📐", "label": "РОЗМІР/ОБ'ЄМ", "value": "значення"},
    {"icon": "⚡", "label": "КЛЮЧОВА ПЕРЕВАГА", "value": "коротко"},
    {"icon": "✅", "label": "ОСОБЛИВІСТЬ", "value": "коротко"}
  ]
}

Правила для specs по категоріях:
- Одяг: матеріал, розміри, сезон, посадка
- Техніка: потужність, автономність, вага, сумісність  
- Рюкзак: об'єм в л, матеріал, відділення, навантаження
- Косметика: ефект, тип шкіри, тривалість, склад
- Взуття: матеріал, підошва, сезон, захист
- value максимум 18 символів`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 400,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: photoUrl, detail: 'low' } },
        { type: 'text', text: prompt }
      ]
    }]
  });
  return JSON.parse(completion.choices[0]?.message?.content ?? '{}');
}

export async function POST(req: NextRequest) {
  const [fontReg, fontBold] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNjXhFVZNyBx2pqPIif.woff2').then(r=>r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/notosans/v36/o-0NipQlx3QUlC5A4PNjThZVZNyBx2pqPIif.woff2').then(r=>r.arrayBuffer()),
  ]);

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  const { productName = '', productB64 = null } = await req.json();

  const W = 1024, H = 1024;

  // Upload photo first to get public URL
  let photoUrl: string | null = null;
  if (productB64 && token) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) photoUrl = await uploadAndGetUrl(supabase, productB64, user.id);
    } catch {}
  }

  // AI analyzes product
  let data: any = {
    title: productName.slice(0, 25).toUpperCase() || 'ТОВАР',
    accent: '#c8a84b', bg: '#0d0d0d',
    specs: [
      { icon: '✅', label: 'ЯКІСТЬ', value: 'Преміум' },
      { icon: '🚚', label: 'ДОСТАВКА', value: 'По Україні' },
      { icon: '🛡️', label: 'ГАРАНТІЯ', value: '12 місяців' },
      { icon: '⭐', label: 'РЕЙТИНГ', value: '5.0 / 5.0' },
    ]
  };

  if (photoUrl) {
    try { data = await analyzeProduct(photoUrl, productName); } catch {}
  }

  const accent = data.accent || '#c8a84b';
  const bgColor = data.bg || '#0d0d0d';
  const specs = (data.specs || []).slice(0, 4);
  const titleWords = (data.title || '').split(' ');
  const titleLine1 = titleWords.slice(0, 2).join(' ');
  const titleLine2 = titleWords.slice(2).join(' ');

  const el = (
    <div style={{ width:W, height:H, display:'flex', flexDirection:'column', background:bgColor, fontFamily:'"NotoSans"', position:'relative' }}>
      {/* BG photo faded */}
      {photoUrl && (
        <img src={photoUrl} width={1024} height={1024}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:0.12}} />
      )}
      {/* Dark overlay */}
      <div style={{position:'absolute',inset:0,background:`linear-gradient(150deg, ${bgColor}f0, ${bgColor}b0 50%, ${bgColor}e0)`,display:'flex'}} />

      {/* Product hero right */}
      {photoUrl && (
        <div style={{position:'absolute',right:32,top:100,width:440,height:480,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <img src={photoUrl} width={440} height={480}
            style={{maxWidth:440,maxHeight:480,objectFit:'contain',filter:'drop-shadow(0 20px 60px rgba(0,0,0,0.85))'}} />
        </div>
      )}

      {/* Content */}
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',padding:'50px 48px 44px'}}>
        {/* Accent bar */}
        <div style={{width:56,height:5,background:accent,borderRadius:3,marginBottom:22,display:'flex'}} />

        {/* Big title */}
        <div style={{display:'flex',flexDirection:'column',marginBottom:8}}>
          <div style={{fontSize:58,fontWeight:700,color:'#ffffff',lineHeight:1.05,display:'flex'}}>{titleLine1}</div>
          {titleLine2 && <div style={{fontSize:58,fontWeight:700,color:accent,lineHeight:1.05,display:'flex'}}>{titleLine2}</div>}
        </div>
        <div style={{width:70,height:3,background:accent,borderRadius:2,marginBottom:36,display:'flex'}} />

        {/* Specs */}
        <div style={{display:'flex',flexDirection:'column',gap:14,maxWidth:460}}>
          {specs.map((spec: any, i: number) => (
            <div key={i} style={{
              display:'flex',alignItems:'center',gap:16,
              background:'rgba(255,255,255,0.07)',
              borderRadius:14,padding:'15px 20px',
              borderLeft:`4px solid ${accent}`,
            }}>
              <div style={{fontSize:26,width:36,display:'flex',alignItems:'center',justifyContent:'center'}}>{spec.icon}</div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                <div style={{fontSize:11,fontWeight:700,color:accent,letterSpacing:1.5,display:'flex'}}>{spec.label}</div>
                <div style={{fontSize:19,fontWeight:700,color:'#ffffff',display:'flex'}}>{spec.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div style={{position:'absolute',bottom:40,left:48,right:48,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.38)',display:'flex'}}>Доставка по всій Україні 🇺🇦</div>
          <div style={{background:accent,borderRadius:50,padding:'9px 22px',fontSize:14,fontWeight:700,color:'#000',display:'flex'}}>ЗАМОВИТИ</div>
        </div>
      </div>
    </div>
  );

  return new ImageResponse(el, {
    width: W, height: H,
    fonts: [
      { name: 'NotoSans', data: fontReg,  weight: 400, style: 'normal' },
      { name: 'NotoSans', data: fontBold, weight: 700, style: 'normal' },
    ],
  });
}

