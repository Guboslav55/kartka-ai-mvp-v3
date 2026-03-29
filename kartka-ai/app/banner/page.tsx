'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const TEMPLATES = [
  { id: 'benefits', name: '✓ Переваги справа', desc: 'Товар зліва + панель переваг' },
  { id: 'callout',  name: '◎ Callout стрілки', desc: 'Підписи навколо товару' },
  { id: 'cta',      name: '💰 Ціна + CTA',     desc: 'Велика ціна + замовити' },
];

const BG_STYLES = [
  { id: 'dark',  label: '⚫ Темний' },
  { id: 'white', label: '⬜ Білий' },
  { id: 'navy',  label: '🌑 Синій' },
  { id: 'gold',  label: '✨ Золотий' },
];

export default function BannerPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [photo, setPhoto] = useState<string | null>(null);
  const [noBgPhoto, setNoBgPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [bullets, setBullets] = useState(['', '', '']);
  const [bgStyle, setBgStyle] = useState('dark');
  const [template, setTemplate] = useState('benefits');
  const [accessToken, setAccessToken] = useState('');

  const [keepBackground, setKeepBackground] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
    });
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setPhoto(base64);
      setNoBgPhoto(null);
      setBackgroundUrl(null);
      setFinalUrl(null);
      const allEmpty = bullets.every(b => !b.trim());
      if (allEmpty) await analyzePhoto(base64);
    };
    reader.readAsDataURL(file);
  }

  async function analyzePhoto(base64?: string) {
    const src = base64 || photo;
    if (!src || !accessToken) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ imageBase64: src, productName, lang: 'uk' }),
      });
      const data = await res.json();
      if (data.bullets?.length) setBullets([data.bullets[0]||'', data.bullets[1]||'', data.bullets[2]||'']);
      if (!productName && data.productName) setProductName(data.productName);
    } catch (e) { console.error(e); }
    setAnalyzing(false);
  }

  async function doRemoveBg(): Promise<string | null> {
    if (!photo || !accessToken) return null;
    setRemovingBg(true);
    try {
      const res = await fetch('/api/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ imageBase64: photo }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const result = data.imageBase64 || null;
      if (result) setNoBgPhoto(result);
      return result;
    } catch { return null; }
    finally { setRemovingBg(false); }
  }

  // Composite product photo onto background using Canvas
  const composite = useCallback((bgUrl: string, productSrc: string, tmpl: string): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current!;
      canvas.width = 1024; canvas.height = 1024;
      const ctx = canvas.getContext('2d')!;

      const bg = new Image();
      bg.crossOrigin = 'anonymous';
      bg.onload = () => {
        ctx.drawImage(bg, 0, 0, 1024, 1024);

        const product = new Image();
        product.crossOrigin = 'anonymous';
        product.onload = () => {
          ctx.save();
          // Position based on template
          let px: number, py: number, psize: number;
          if (tmpl === 'benefits') {
            px = 256; py = 512; psize = 460;
          } else if (tmpl === 'callout') {
            px = 512; py = 490; psize = 520;
          } else {
            px = 210; py = 490; psize = 380;
          }
          // Drop shadow
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 50;
          ctx.shadowOffsetY = 20;
          ctx.drawImage(product, px - psize/2, py - psize/2, psize, psize);
          ctx.restore();
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        product.src = productSrc;
      };
      bg.src = bgUrl;
    });
  }, []);

  async function generate() {
    if (!productName.trim() && !photo) return;
    setGenerating(true); setError(''); setFinalUrl(null); setBackgroundUrl(null);

    try {
      // Step 1: Remove bg only if user wants it
      let productSrc = photo;
      if (photo && !keepBackground) {
        setStep('🔮 Видаляю фон товару...');
        const noBg = await doRemoveBg();
        if (noBg) productSrc = noBg;
      }

      // Step 2: Server-side SVG render (fast, precise, free)
      setStep('🎨 Рендерю банер на сервері...');
      const res = await fetch('/api/render-banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          productName, price, bullets, bgStyle, template,
          productB64: productSrc, // original or no-bg photo
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка генерації');
      // Always use base64 for download — never opens new tab
      setFinalUrl(data.imageB64 || data.imageUrl);

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка. Спробуй ще раз.');
    }
    setGenerating(false); setStep('');
  }

  function download() {
    if (!finalUrl) return;
    // Force download, not open in new tab
    const link = document.createElement('a');
    link.href = finalUrl;
    link.download = `banner-${(productName || 'tovar').replace(/\s/g, '-')}-${Date.now()}.jpg`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        <Link href="/generate" className="text-white/40 text-sm hover:text-white">Генератор тексту →</Link>
      </div>

      <h1 className="font-display font-black text-2xl sm:text-3xl mb-2 tracking-tight">🖼️ Банер товару</h1>
      <p className="text-white/40 text-sm mb-8">Оригінальне фото товару не змінюється — AI генерує тільки фон та інфографіку</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FORM */}
        <div className="space-y-4">
          {/* Upload */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Фото товару</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <div onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${photo ? 'border-gold/40 bg-gold/5' : 'border-white/10 hover:border-white/25'}`}>
              {photo ? (
                <div className="flex items-center gap-3">
                  <img src={photo} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold truncate">{photoName}</p>
                    {analyzing
                      ? <p className="text-gold text-xs mt-0.5 flex items-center gap-1"><span className="w-3 h-3 border border-gold border-t-transparent rounded-full animate-spin inline-block mr-1"/>AI аналізує...</p>
                      : <p className="text-green-400 text-xs mt-0.5">✓ Готово</p>}
                    {noBgPhoto && <p className="text-blue-400 text-xs">✓ Фон видалено</p>}
                    <button onClick={e => { e.stopPropagation(); setPhoto(null); setNoBgPhoto(null); setPhotoName(''); setFinalUrl(null); setBackgroundUrl(null); }}
                      className="text-white/25 text-xs hover:text-red-400 mt-1">видалити ×</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-3xl mb-2">📸</div>
                  <p className="text-white/50 text-sm">Натисни щоб завантажити фото</p>
                  <p className="text-white/25 text-xs mt-1">Фото товару залишиться оригінальним</p>
                </div>
              )}
            </div>

            {/* Keep background toggle */}
            {photo && (
              <label className="flex items-center gap-3 mt-3 cursor-pointer select-none">
                <button type="button" onClick={() => setKeepBackground(v => !v)}
                  className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${keepBackground ? 'bg-gold' : 'bg-white/15'}`}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: keepBackground ? '17px' : '2px' }} />
                </button>
                <span className="text-white/60 text-xs">
                  {keepBackground ? '✓ Залишити оригінальний фон товару' : 'Видалити фон (Remove.bg)'}
                </span>
              </label>
            )}
          </div>

          {/* Product data */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-gold text-xs font-bold uppercase tracking-widest">Дані товару</label>
              {photo && (
                <button onClick={() => analyzePhoto()} disabled={analyzing}
                  className="text-xs text-gold/60 hover:text-gold border border-gold/20 hover:border-gold/40 px-3 py-1 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1">
                  {analyzing ? <><span className="w-3 h-3 border border-gold/40 border-t-gold rounded-full animate-spin"/>Аналізую...</> : '🤖 Визначити з фото'}
                </button>
              )}
            </div>
            <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Назва товару *"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors" />
            <input value={price} onChange={e => setPrice(e.target.value)} placeholder="Ціна (наприклад: 2 499 ₴)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors" />
            <p className="text-white/25 text-xs">Переваги (або залиш — AI визначить із фото):</p>
            {bullets.map((b, i) => (
              <div key={i} className="relative">
                <input value={b} onChange={e => { const nb = [...bullets]; nb[i] = e.target.value; setBullets(nb); }} placeholder={`Перевага ${i + 1}`}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors pr-8" />
                {b && <button onClick={() => { const nb = [...bullets]; nb[i] = ''; setBullets(nb); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">×</button>}
              </div>
            ))}
          </div>

          {/* Style */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Стиль фону</label>
            <div className="grid grid-cols-2 gap-2">
              {BG_STYLES.map(s => (
                <button key={s.id} onClick={() => setBgStyle(s.id)}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all ${bgStyle === s.id ? 'border-gold bg-gold/10 text-gold' : 'border-white/10 text-white/50 hover:border-white/25'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Шаблон банеру</label>
            <div className="space-y-2">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplate(t.id)}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${template === t.id ? 'border-gold bg-gold/10' : 'border-white/8 hover:border-white/20'}`}>
                  <span className="text-sm font-semibold text-white">{t.name}</span>
                  <span className="block text-xs text-white/35 mt-0.5">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">⚠️ {error}</div>}

          <button onClick={generate} disabled={generating || (!productName.trim() && !photo)}
            className="w-full bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 text-base">
            {generating
              ? <><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"/>{step || 'Генерую...'}</>
              : '✦ Згенерувати банер'}
          </button>
          <p className="text-white/20 text-xs text-center">~2-5 секунд · Серверний рендер · Фото товару не змінюється</p>
        </div>

        {/* RESULT */}
        <div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden sticky top-6">
            <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
              <span className="text-gold text-xs font-bold uppercase tracking-wider">Результат</span>
              {finalUrl && (
                <button onClick={download}
                  className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600 transition-colors">
                  ⬇ Завантажити JPG
                </button>
              )}
            </div>

            <div className="relative bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#141414_0%_50%)] bg-[length:24px_24px]" style={{ minHeight: '360px' }}>
              {generating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                  <div className="w-12 h-12 border-[3px] border-gold/20 border-t-gold rounded-full animate-spin"/>
                  <p className="text-white/60 text-sm font-medium">{step}</p>
                  <p className="text-white/25 text-xs">~30-40 секунд</p>
                </div>
              )}
              {!generating && !finalUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/20">
                  <span className="text-5xl">🖼️</span>
                  <span className="text-sm">Тут з'явиться банер</span>
                </div>
              )}
              {finalUrl && (
                <img src={finalUrl} alt="Generated banner" className="w-full block" />
              )}
            </div>

            {finalUrl && (
              <div className="px-5 py-4 border-t border-white/8 flex gap-3">
                <button onClick={download}
                  className="flex-1 bg-green-700 text-white py-3 rounded-xl font-bold hover:bg-green-600 transition-colors text-sm flex items-center justify-center gap-2">
                  ⬇ Завантажити JPG
                </button>
                <button onClick={generate}
                  className="flex-1 border border-white/15 text-white/60 py-3 rounded-xl font-semibold hover:border-gold hover:text-gold transition-colors text-sm">
                  ↺ Інший варіант
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden canvas for compositing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

