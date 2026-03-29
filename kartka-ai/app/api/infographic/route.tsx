import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Category detection and template selection
async function detectCategoryAndData(imageBase64: string, productName: string): Promise<{
  category: string;
  template: string;
  title: string;
  specs: Array<{ icon: string; label: string; value: string }>;
  accent: string;
  bg: string;
}> {
  const prompt = `Ти — експерт з інфографіки для маркетплейсів.

Уважно розглянь фото товару${productName ? ` (${productName})` : ''}.

Визнач категорію і підбери МАКСИМАЛЬНО РЕЛЕВАНТНІ характеристики для інфографіки.

Відповідай ТІЛЬКИ валідним JSON:
{
  "category": "одна з: clothing|footwear|electronics|tech|backpack|bag|cosmetics|food|sport|furniture|auto|tools|toys|home|other",
  "template": "одна з: specs_grid|feature_list|comparison|minimal_bold",
  "title": "КОРОТКИЙ ЗАГОЛОВОК ВЕЛИКИМИ 2-4 СЛОВА ЩО ПРОДАЄ",
  "accent": "hex колір акценту підібраний під товар і категорію",
  "bg": "hex темний фон підібраний під товар",
  "specs": [
    {"icon": "🔒", "label": "МАТЕРІАЛ", "value": "конкретна назва матеріалу"},
    {"icon": "📐", "label": "РОЗМІР", "value": "конкретне значення"},
    {"icon": "⚡", "label": "КЛЮЧОВА ПЕРЕВАГА", "value": "коротко"},
    {"icon": "✅", "label": "ОСОБЛИВІСТЬ", "value": "коротко"}
  ]
}

ПРАВИЛА для specs:
- Для одягу: матеріал, розміри, сезон, тип посадки
- Для техніки: потужність/об'єм/швидкість з цифрами, автономність, вага
- Для рюкзака: об'єм в літрах, матеріал, кількість відділень, вага
- Для косметики: ефект, склад, тривалість дії, тип шкіри
- Для їжі: білки/жири/вуглеводи, калорії, об'єм/вага, склад
- Іконки ТІЛЬКИ базові emoji що є у всіх системах
- value КОРОТКО — максимум 20 символів`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 600,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
        { type: 'text', text: prompt }
      ]
    }]
  });

  return JSON.parse(completion.choices[0]?.message?.content ?? '{}');
}

export async function POST(req: NextRequest) {
  const [fontRegular, fontBold] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNjXhFVZNyBx2pqPIif.woff2').then(r => r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/notosans/v36/o-0NipQlx3QUlC5A4PNjThZVZNyBx2pqPIif.woff2').then(r => r.arrayBuffer()),
  ]);

  const { productName = '', productB64 = null, bgStyle = 'auto' } = await req.json();

  // AI detects category and builds spec data
  let data: Awaited<ReturnType<typeof detectCategoryAndData>>;
  try {
    data = await detectCategoryAndData(productB64 || 'data:image/png;base64,iVBORw0KGgo=', productName);
  } catch {
    data = {
      category: 'other', template: 'feature_list',
      title: productName.slice(0, 30).toUpperCase(),
      accent: '#c8a84b', bg: '#0d0d0d',
      specs: [
        { icon: '✅', label: 'ЯКІСТЬ', value: 'Преміум' },
        { icon: '🚚', label: 'ДОСТАВКА', value: 'По Україні' },
        { icon: '🛡️', label: 'ГАРАНТІЯ', value: '12 місяців' },
        { icon: '⭐', label: 'РЕЙТИНГ', value: '5.0 / 5.0' },
      ]
    };
  }

  const accent = data.accent || '#c8a84b';
  const bgColor = data.bg || '#0d0d0d';
  const W = 1024, H = 1024;

  const element = (
    <div style={{
      width: W, height: H, display: 'flex', flexDirection: 'column',
      background: bgColor, fontFamily: '"NotoSans"', position: 'relative',
    }}>
      {/* Background image (full bleed, darkened) */}
      {productB64 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={productB64} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18 }} />
        </div>
      )}

      {/* Dark overlay gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(160deg, ${bgColor}ee 0%, ${bgColor}aa 50%, ${bgColor}dd 100%)`,
        display: 'flex',
      }} />

      {/* Product image - main hero */}
      {productB64 && (
        <div style={{
          position: 'absolute', right: 40, top: 120, width: 420, height: 420,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={productB64} style={{
            maxWidth: 420, maxHeight: 420, objectFit: 'contain',
            filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.8))',
          }} />
        </div>
      )}

      {/* Content */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '48px 48px 40px' }}>

        {/* Accent top bar */}
        <div style={{ width: 60, height: 5, background: accent, borderRadius: 3, marginBottom: 24, display: 'flex' }} />

        {/* Title */}
        <div style={{ fontSize: 52, fontWeight: 700, color: '#ffffff', lineHeight: 1.1, maxWidth: 560, display: 'flex', flexDirection: 'column' }}>
          {data.title.split(' ').reduce((acc: string[][], word, i) => {
            const lineIdx = Math.floor(i / 3);
            if (!acc[lineIdx]) acc[lineIdx] = [];
            acc[lineIdx].push(word);
            return acc;
          }, []).map((line, i) => (
            <span key={i}>{line.join(' ')}</span>
          ))}
        </div>

        {/* Accent underline */}
        <div style={{ width: 80, height: 3, background: accent, borderRadius: 2, marginTop: 16, marginBottom: 40, display: 'flex' }} />

        {/* Specs grid - 2x2 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
          {data.specs.slice(0, 4).map((spec, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 18,
              background: 'rgba(255,255,255,0.07)',
              borderRadius: 14, padding: '16px 22px',
              borderLeft: `4px solid ${accent}`,
            }}>
              <div style={{ fontSize: 28, width: 40, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {spec.icon}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: 1.5, display: 'flex' }}>
                  {spec.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', display: 'flex' }}>
                  {spec.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{
          position: 'absolute', bottom: 40, left: 48, right: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
            Доставка по всій Україні 🇺🇦
          </div>
          <div style={{
            background: accent, borderRadius: 50, padding: '8px 20px',
            fontSize: 14, fontWeight: 700, color: '#000',
            display: 'flex', alignItems: 'center',
          }}>
            ЗАМОВИТИ
          </div>
        </div>
      </div>
    </div>
  );

  return new ImageResponse(element, {
    width: W, height: H,
    fonts: [
      { name: 'NotoSans', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'NotoSans', data: fontBold,    weight: 700, style: 'normal' },
    ],
  });
}

