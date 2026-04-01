'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const TEMPLATES = [
  { id: 'benefits',    name: '✓ Переваги справа', desc: 'Фото + панель переваг' },
  { id: 'callout',     name: '◎ Callout стрілки', desc: 'Фото + підписи зі стрілками' },
  { id: 'cta',         name: '💰 Ціна + CTA',     desc: 'Фото + заклик купити' },
  { id: 'infographic', name: '📊 Інфографіка',    desc: 'AI підбирає шаблон під товар' },
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

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null); // Supabase public URL
  const [photoName, setPhotoName] = useState('');
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [bullets, setBullets] = useState(['', '', '']);
  const [bgStyle, setBgStyle] = useState('dark');
  const [template, setTemplate] = useState('benefits');
  const [keepBackground, setKeepBackground] = useState(false);
  const [accessToken, setAccessToken] = useState('');

  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
    });
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoName(file.name);
    setPhotoFile(file);
    setPhotoUrl(null);
    setFinalUrl(null);

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setPhotoPreview(base64);
      // Auto-analyze if bullets empty
      if (bullets.every(b => !b.trim())) {
        await analyzePhoto(base64);
      }
    };
    reader.readAsDataURL(file);
  }

  async function uploadPhoto(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-photo', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: formData,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.url || null;
    } catch { return null; }
    finally { setUploading(false); }
  }

  async function analyzePhoto(base64?: string) {
    const src = base64 || photoPreview;
    if (!src || !accessToken) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ imageBase64: src, productName, lang: 'uk' }),
      });
      const d = await res.json();
      if (d.bullets?.length) setBullets([d.bullets[0]||'', d.bullets[1]||'', d.bullets[2]||'']);
      if (!productName && d.productName) setProductName(d.productName);
    } catch {}
    setAnalyzing(false);
  }

  async function generate() {
    if (!productName.trim() && !photoFile) return;
    setGenerating(true); setError(''); setFinalUrl(null);

    try {
      // Step 1: Upload original photo to Supabase Storage
      let uploadedUrl = photoUrl;
      if (photoFile && !uploadedUrl) {
        setStep('📤 Завантажую фото в оригінальній якості...');
        uploadedUrl = await uploadPhoto(photoFile);
        if (uploadedUrl) setPhotoUrl(uploadedUrl);
      }

      // Step 2: Remove bg from original if needed
      let finalPhotoUrl = uploadedUrl;
      if (uploadedUrl && !keepBackground && template !== 'infographic') {
        setStep('🔮 Видаляю фон...');
        try {
          // For remove-bg we still need base64 (their API limitation)
          const res = await fetch('/api/remove-bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ imageBase64: photoPreview }),
          });
          if (res.ok) {
            const d = await res.json();
            if (d.imageBase64) {
              // Upload the no-bg version to storage
              const blob = await (await fetch(d.imageBase64)).blob();
              const noBgFile = new File([blob], 'nobg.png', { type: 'image/png' });
              const noBgUrl = await uploadPhoto(noBgFile);
              if (noBgUrl) finalPhotoUrl = noBgUrl;
            }
          }
        } catch {}
      }

      // Step 3: Generate banner using public URL
      const isInfographic = template === 'infographic';
      setStep(isInfographic ? '📊 Генерую інфографіку...' : '🎨 Рендерю банер...');

      const endpoint = isInfographic ? '/api/infographic' : '/api/og-banner';
      const body = isInfographic
        ? { productName, photoUrl: finalPhotoUrl, bullets, accent: '#c8a84b', bg: '#0d0d0d' }
        : { productName, price, bullets, bgStyle, template, photoUrl: finalPhotoUrl };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Помилка генерації');
      }

      const blob = await res.blob();
      if (blob.size === 0) throw new Error('Сервер повернув порожній файл');
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'image/png' }));
      setFinalUrl(blobUrl);

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка. Спробуй ще раз.');
    }
    setGenerating(false); setStep('');
  }

  function download() {
    if (!finalUrl) return;
    const a = document.createElement('a');
    a.href = finalUrl;
    a.download = `banner-${(productName||'tovar').replace(/\s/g,'-').slice(0,40)}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        <Link href="/generate" className="text-white/40 text-sm hover:text-white">Генератор тексту →</Link>
      </div>
      <h1 className="font-display font-black text-2xl sm:text-3xl mb-2 tracking-tight">🖼️ Банер товару</h1>
      <p className="text-white/40 text-sm mb-8">Фото завантажується в оригінальній якості — без стиснення</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">

          {/* Upload */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Фото товару</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden"/>
            <div onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${photoPreview ? 'border-gold/40 bg-gold/5' : 'border-white/10 hover:border-white/25'}`}>
              {photoPreview ? (
                <div className="flex items-center gap-3">
                  <img src={photoPreview} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0"/>
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold truncate">{photoName}</p>
                    {analyzing
                      ? <p className="text-gold text-xs flex items-center gap-1 mt-0.5"><span className="w-3 h-3 border border-gold border-t-transparent rounded-full animate-spin"/>AI аналізує...</p>
                      : <p className="text-green-400 text-xs mt-0.5">✓ Готово</p>}
                    {photoUrl && <p className="text-blue-400 text-xs">✓ Завантажено в оригінальній якості</p>}
                    <button onClick={e => { e.stopPropagation(); setPhotoFile(null); setPhotoPreview(null); setPhotoUrl(null); setPhotoName(''); setFinalUrl(null); }}
                      className="text-white/25 text-xs hover:text-red-400 mt-1">видалити ×</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-3xl mb-2">📸</div>
                  <p className="text-white/50 text-sm">Завантажити фото товару</p>
                  <p className="text-white/25 text-xs mt-1">Оригінальна якість — без стиснення</p>
                </div>
              )}
            </div>
            {photoPreview && template !== 'infographic' && (
              <label className="flex items-center gap-3 mt-3 cursor-pointer select-none">
                <button type="button" onClick={() => setKeepBackground(v => !v)}
                  className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${keepBackground ? 'bg-gold' : 'bg-white/15'}`}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: keepBackground ? '17px' : '2px' }}/>
                </button>
                <span className="text-white/50 text-xs">{keepBackground ? '✓ Зберегти оригінальний фон' : 'Видалити фон (Remove.bg)'}</span>
              </label>
            )}
          </div>

          {/* Template */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Тип банеру</label>
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

          {/* Data */}
          {template !== 'infographic' && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-gold text-xs font-bold uppercase tracking-widest">Дані товару</label>
                {photoPreview && (
                  <button onClick={() => analyzePhoto()} disabled={analyzing}
                    className="text-xs text-gold/60 hover:text-gold border border-gold/20 hover:border-gold/40 px-3 py-1 rounded-lg disabled:opacity-40 flex items-center gap-1">
                    {analyzing ? <><span className="w-3 h-3 border border-gold/40 border-t-gold rounded-full animate-spin"/>Аналізую...</> : '🤖 Визначити з фото'}
                  </button>
                )}
              </div>
              <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Назва товару *"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors"/>
              <input value={price} onChange={e => setPrice(e.target.value)} placeholder="Ціна (наприклад: 2 499 ₴)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors"/>
              <p className="text-white/25 text-xs">Переваги (або залиш — AI визначить):</p>
              {bullets.map((b, i) => (
                <div key={i} className="relative">
                  <input value={b} onChange={e => { const nb = [...bullets]; nb[i] = e.target.value; setBullets(nb); }}
                    placeholder={`Перевага ${i + 1}`}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors pr-8"/>
                  {b && <button onClick={() => { const nb = [...bullets]; nb[i] = ''; setBullets(nb); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">×</button>}
                </div>
              ))}
            </div>
          )}

          {/* Infographic note */}
          {template === 'infographic' && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Назва товару</label>
              <input value={productName} onChange={e => setProductName(e.target.value)}
                placeholder="Необов'язково — AI визначить з фото"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors mb-3"/>
              <p className="text-white/25 text-xs">Переваги для інфографіки:</p>
              <div className="space-y-2 mt-2">
                {bullets.map((b, i) => (
                  <div key={i} className="relative">
                    <input value={b} onChange={e => { const nb = [...bullets]; nb[i] = e.target.value; setBullets(nb); }}
                      placeholder={`Перевага ${i + 1}`}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors pr-8"/>
                    {b && <button onClick={() => { const nb = [...bullets]; nb[i] = ''; setBullets(nb); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">×</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Style */}
          {template !== 'infographic' && (
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
          )}

          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">⚠️ {error}</div>}

          <button onClick={generate} disabled={generating || uploading || (!productName.trim() && !photoFile)}
            className="w-full bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 text-base">
            {generating || uploading
              ? <><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"/>{step || 'Завантажую...'}</>
              : template === 'infographic' ? '📊 Згенерувати інфографіку' : '✦ Згенерувати банер'}
          </button>
          <p className="text-white/20 text-xs text-center">Оригінальна якість фото · без стиснення</p>
        </div>

        {/* Result */}
        <div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden sticky top-6">
            <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
              <span className="text-gold text-xs font-bold uppercase tracking-wider">Результат</span>
              {finalUrl && <button onClick={download} className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600">⬇ Завантажити PNG</button>}
            </div>
            <div className="relative bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#141414_0%_50%)] bg-[length:24px_24px]" style={{ minHeight: '360px' }}>
              {(generating || uploading) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                  <div className="w-12 h-12 border-[3px] border-gold/20 border-t-gold rounded-full animate-spin"/>
                  <p className="text-white/60 text-sm text-center px-4">{step}</p>
                </div>
              )}
              {!generating && !uploading && !finalUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/20">
                  <span className="text-5xl">🖼️</span>
                  <span className="text-sm">Тут з'явиться банер</span>
                </div>
              )}
              {finalUrl && <img src={finalUrl} alt="Banner" className="w-full block"/>}
            </div>
            {finalUrl && (
              <div className="px-5 py-4 border-t border-white/8 flex gap-3">
                <button onClick={download} className="flex-1 bg-green-700 text-white py-3 rounded-xl font-bold hover:bg-green-600 text-sm flex items-center justify-center gap-2">⬇ Завантажити PNG</button>
                <button onClick={generate} className="flex-1 border border-white/15 text-white/60 py-3 rounded-xl font-semibold hover:border-gold hover:text-gold text-sm">↺ Перегенерувати</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

