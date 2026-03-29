import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeProduct(imageBase64: string, productName: string) {
  const prompt = `Ти — експерт з інфографіки для маркетплейсів. Розглянь фото товару${productName ? ` (${productName})` : ''}.

Відповідай ТІЛЬКИ валідним JSON:
{
  "title": "КОРОТКИЙ ЗАГОЛОВОК 2-3 СЛОВА ВЕЛИКИМИ",
  "accent": "#hex колір акценту під товар",
  "bg": "#hex темний фон",
  "specs": [
    {"icon": "🧤", "label": "МАТЕРІАЛ", "value": "назва"},
    {"icon": "📐", "label": "РОЗМІР", "value": "значення"},
    {"icon": "⚡", "label": "ПЕРЕВАГА", "value": "коротко"},
    {"icon": "✅", "label": "ОСОБЛИВІСТЬ", "value": "коротко"}
  ]
}
Правила: для одягу — матеріал/розміри/сезон, для техніки — потужність/об'єм/вага, для рюкзака — об'єм в л/матеріал/відділення. value максимум 18 символів.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 400,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageBase64, detail: 'low' } },
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

  const { productName = '', productB64 = null } = await req.json();
  const W = 1024, H = 1024;

  // AI analyzes using base64 directly
  let data: any = {
    title: (productName.slice(0,25) || 'ТОВАР').toUpperCase(),
    accent: '#c8a84b', bg: '#0d0d0d',
    specs: [
      { icon: '✅', label: 'ЯКІСТЬ', value: 'Преміум' },
      { icon: '🚚', label: 'ДОСТАВКА', value: 'По Україні' },
      { icon: '🛡️', label: 'ГАРАНТІЯ', value: '12 місяців' },
      { icon: '⭐', label: 'РЕЙТИНГ', value: '5.0 / 5.0' },
    ]
  };

  if (productB64) {
    try { data = await analyzeProduct(productB64, productName); } catch(e) { console.warn('analyze failed:', e); }
  }

  const accent = data.accent || '#c8a84b';
  const bgColor = data.bg || '#0d0d0d';
  const specs = (data.specs || []).slice(0, 4);
  const titleWords = (data.title || 'ТОВАР').split(' ');
  const titleLine1 = titleWords.slice(0, 2).join(' ');
  const titleLine2 = titleWords.slice(2).join(' ');

  const el = (
    <div style={{ width:W, height:H, display:'flex', background:bgColor, fontFamily:'"NotoSans"', position:'relative' }}>
      {/* Faded bg photo */}
      {productB64 && (
        <img src={productB64 as string} width={1024} height={1024}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:0.12}} />
      )}
      {/* Gradient overlay */}
      <div style={{position:'absolute',inset:0,background:`linear-gradient(150deg, ${bgColor}f0, ${bgColor}b0 50%, ${bgColor}e0)`,display:'flex'}} />
      {/* Product hero right */}
      {productB64 && (
        <div style={{position:'absolute',right:32,top:100,width:440,height:480,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <img src={productB64 as string} width={440} height={480}
            style={{maxWidth:440,maxHeight:480,objectFit:'contain',filter:'drop-shadow(0 20px 60px rgba(0,0,0,0.85))'}} />
        </div>
      )}
      {/* Content */}
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',padding:'50px 48px 44px'}}>
        <div style={{width:56,height:5,background:accent,borderRadius:3,marginBottom:22,display:'flex'}} />
        <div style={{display:'flex',flexDirection:'column',marginBottom:8}}>
          <div style={{fontSize:56,fontWeight:700,color:'#ffffff',lineHeight:1.05,display:'flex'}}>{titleLine1}</div>
          {titleLine2 && <div style={{fontSize:56,fontWeight:700,color:accent,lineHeight:1.05,display:'flex'}}>{titleLine2}</div>}
        </div>
        <div style={{width:70,height:3,background:accent,borderRadius:2,marginBottom:34,display:'flex'}} />
        <div style={{display:'flex',flexDirection:'column',gap:14,maxWidth:460}}>
          {specs.map((spec: any, i: number) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:16,background:'rgba(255,255,255,0.07)',borderRadius:14,padding:'15px 20px',borderLeft:`4px solid ${accent}`}}>
              <div style={{fontSize:26,width:36,display:'flex',alignItems:'center',justifyContent:'center'}}>{spec.icon}</div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                <div style={{fontSize:11,fontWeight:700,color:accent,letterSpacing:1.5,display:'flex'}}>{spec.label}</div>
                <div style={{fontSize:19,fontWeight:700,color:'#ffffff',display:'flex'}}>{spec.value}</div>
              </div>
            </div>
          ))}
        </div>
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

