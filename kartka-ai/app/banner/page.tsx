'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const PLATFORMS = [
  { id: 'prom',    label: 'Prom.ua'   },
  { id: 'rozetka', label: 'Rozetka'   },
  { id: 'olx',     label: 'OLX'       },
  { id: 'general', label: 'Загальний' },
];

const STEPS = [
  '🔍 Аналізую фото товару...',
  '🎨 Розробляю унікальний дизайн...',
  '⚡ Генерую банер...',
  '✓ Готово!',
];

export default function BannerPage() {
  const router  = useRouter();
  const supabase = createClient();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [accessToken,  setAccessToken]  = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoB64,     setPhotoB64]     = useState<string | null>(null);
  const [productName,  setProductName]  = useState('');
  const [bullets,      setBullets]      = useState(['', '', '', '']);
  const [price,        setPrice]        = useState('');
  const [platform,     setPlatform]     = useState('prom');

  const [generating, setGenerating] = useState(false);
  const [stepIdx,    setStepIdx]    = useState(0);
  const [finalUrl,   setFinalUrl]   = useState<string | null>(null);
  const [error,      setError]      = useState('');

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
    });
  }, []);

  // Compress photo before sending (max 1024px, JPEG 88%)
  function compressPhoto(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width  = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    const b64 = await compressPhoto(file);
    setPhotoB64(b64);
  }

  function updateBullet(i: number, val: string) {
    setBullets(prev => prev.map((b, idx) => idx === i ? val : b));
  }

  // Step animation during generation
  function animateSteps() {
    setStepIdx(0);
    const timings = [0, 2000, 5000, 8000];
    timings.forEach((t, i) => {
      setTimeout(() => setStepIdx(i), t);
    });
  }

  async function generate() {
    if (!photoB64)       { setError('Завантажте фото товару'); return; }
    if (!productName.trim()) { setError('Вкажіть назву товару'); return; }

    setGenerating(true);
    setError('');
    setFinalUrl(null);
    animateSteps();

    try {
      const res = await fetch('/api/generate-banner', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({
          productB64:  photoB64,
          productName: productName.trim(),
          bullets:     bullets.filter(b => b.trim()),
          price:       price.trim(),
          platform,
          category:    '', // will be auto-detected by GPT-4o from photo
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка генерації');

      setFinalUrl(data.imageB64 || data.imageUrl);
      setStepIdx(3);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Помилка сервера');
    }

    setGenerating(false);
  }

  function download() {
    if (!finalUrl) return;
    Object.assign(document.createElement('a'), {
      href:     finalUrl,
      download: `banner-${productName.replace(/\s+/g, '-').slice(0, 40)}.jpg`,
    }).click();
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors">
          ← Кабінет
        </Link>
        <Link href="/generate" className="text-white/40 text-sm hover:text-white transition-colors">
          Генератор тексту →
        </Link>
      </div>

      <h1 className="font-display font-black text-2xl sm:text-3xl mb-1 tracking-tight">
        🖼️ AI Банер товару
      </h1>
      <p className="text-white/40 text-sm mb-8">
        GPT-4o аналізує фото → gpt-image-1 створює унікальний банер
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT: Form ── */}
        <div className="space-y-4">

          {/* Photo upload */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">
              Фото товару *
            </label>
            <input
              ref={fileRef} type="file" accept="image/*"
              onChange={handleFile} className="hidden"
            />
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                photoPreview
                  ? 'border-gold/40 bg-gold/5'
                  : 'border-white/10 hover:border-white/25'
              }`}
            >
              {photoPreview ? (
                <div className="relative">
                  <img src={photoPreview} alt="Product" className="max-h-48 mx-auto rounded-lg object-contain" />
                  <p className="text-white/40 text-xs mt-2">Натисни щоб змінити</p>
                </div>
              ) : (
                <div className="py-6">
                  <p className="text-4xl mb-2">📸</p>
                  <p className="text-white/50 text-sm">Завантаж фото товару</p>
                  <p className="text-white/25 text-xs mt-1">JPG, PNG — до 10MB</p>
                </div>
              )}
            </div>
          </div>

          {/* Product name */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">
              Назва товару *
            </label>
            <input
              type="text"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              placeholder="Наприклад: Кросівки тактичні оливкові"
              className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold/40 transition-colors"
            />
          </div>

          {/* Features */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">
              Переваги товару
            </label>
            <div className="space-y-2">
              {bullets.map((b, i) => (
                <input
                  key={i}
                  type="text"
                  value={b}
                  onChange={e => updateBullet(i, e.target.value)}
                  placeholder={`Перевага ${i + 1}`}
                  className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold/40 transition-colors"
                />
              ))}
            </div>
          </div>

          {/* Price + Platform */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
                Ціна (₴)
              </label>
              <input
                type="text"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="2 499"
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold/40 transition-colors"
              />
            </div>
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
                Платформа
              </label>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold/40 transition-colors"
              >
                {PLATFORMS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={generating}
            className="w-full bg-gold text-black font-black py-4 rounded-xl text-base hover:bg-gold/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-3">
                <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                {STEPS[stepIdx]}
              </span>
            ) : (
              '✦ Створити унікальний банер'
            )}
          </button>

          {generating && (
            <div className="flex gap-2 justify-center">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i <= stepIdx ? 'bg-gold w-8' : 'bg-white/20 w-4'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Result ── */}
        <div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden sticky top-6">
            <div className="px-5 py-3 border-b border-white/[0.08] flex items-center justify-between">
              <span className="text-gold text-xs font-bold uppercase tracking-wider">Результат</span>
              {finalUrl && (
                <button
                  onClick={download}
                  className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600 transition-colors flex items-center gap-1"
                >
                  ⬇ Завантажити
                </button>
              )}
            </div>

            <div
              className="relative bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#141414_0%_50%)] bg-[length:24px_24px]"
              style={{ minHeight: '420px' }}
            >
              {/* Loading state */}
              {generating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                  <div className="w-16 h-16 border-[3px] border-gold/20 border-t-gold rounded-full animate-spin" />
                  <div className="text-center">
                    <p className="text-white/70 text-sm font-medium">{STEPS[stepIdx]}</p>
                    <p className="text-white/30 text-xs mt-1">
                      {stepIdx === 0 && 'GPT-4o аналізує ваш товар'}
                      {stepIdx === 1 && 'Створюю унікальну концепцію'}
                      {stepIdx === 2 && 'gpt-image-1 генерує зображення (~20-30 сек)'}
                      {stepIdx === 3 && 'Зберігаємо результат'}
                    </p>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!generating && !finalUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/20">
                  <span className="text-6xl">🖼️</span>
                  <span className="text-sm">Тут з'явиться ваш унікальний банер</span>
                  <span className="text-xs text-white/15">Кожен банер — окремий дизайн</span>
                </div>
              )}

              {/* Result image */}
              {finalUrl && !generating && (
                <img src={finalUrl} alt="Generated banner" className="w-full block" />
              )}
            </div>

            {/* Regenerate button */}
            {finalUrl && !generating && (
              <div className="p-4 border-t border-white/[0.08]">
                <button
                  onClick={generate}
                  className="w-full border border-white/15 text-white/60 py-2.5 rounded-xl text-sm font-semibold hover:border-gold/40 hover:text-gold/80 transition-all"
                >
                  ↺ Перегенерувати (інший дизайн)
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
