'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const TEMPLATES = [
  { id: 'smart',       name: '✦ AI Унікальний',   desc: 'Claude розробляє дизайн під товар' },
  { id: 'benefits',    name: '✓ Переваги справа',  desc: 'Фото + панель переваг' },
  { id: 'callout',     name: '◎ Callout стрілки',  desc: 'Фото + підписи зі стрілками' },
  { id: 'cta',         name: '💰 Ціна + CTA',      desc: 'Фото + заклик купити' },
  { id: 'infographic', name: '📊 Інфографіка',     desc: 'AI розробляє дизайн під категорію товару' },
];

const BG_STYLES = [
  { id: 'dark',  label: '⚫ Авто / Темний' },
  { id: 'white', label: '⬜ Білий' },
  { id: 'navy',  label: '🌑 Синій' },
  { id: 'gold',  label: '✨ Золотий' },
];

// Visual identity per category — for UI preview badge only
const CATEGORY_ACCENT: Record<string, { color: string; label: string }> = {
  'Тактичне спорядження': { color: '#5a8a3c', label: 'ТАКТИКА' },
  'Одяг та взуття':       { color: '#c8a84b', label: 'СТИЛЬ' },
  'Електроніка':          { color: '#4a9eff', label: 'ТЕХНОЛОГІЯ' },
  "Краса та здоров'я":    { color: '#e87aa0', label: 'КРАСА' },
  'Спорт та хобі':        { color: '#ff6b35', label: 'СПОРТ' },
  'Дім та сад':           { color: '#6ab04c', label: 'ДІМ' },
  'Авто та мото':         { color: '#e0a020', label: 'АВТО' },
  'Іграшки':              { color: '#8855ee', label: 'ДІТИ' },
};

export default function BannerPage() {
  const router   = useRouter();
  const supabase = createClient();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl,     setPhotoUrl]     = useState<string | null>(null);
  const [photoName,    setPhotoName]    = useState('');

  const [productName,     setProductName]     = useState('');
  const [price,           setPrice]           = useState('');
  const [bullets,         setBullets]         = useState(['', '', '']);
  const [bgStyle,         setBgStyle]         = useState('dark');
  const [template,        setTemplate]        = useState('benefits');
  const [keepBackground,  setKeepBackground]  = useState(false);
  const [detectedCategory, setDetectedCategory] = useState(''); // from analyze-product
  const [accessToken,     setAccessToken]     = useState('');

  const [uploading,   setUploading]   = useState(false);
  const [analyzing,   setAnalyzing]   = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [finalUrl,    setFinalUrl]    = useState<string | null>(null);
  const [error,       setError]       = useState('');
  const [step,        setStep]        = useState('');
  const [appliedStyle, setAppliedStyle]   = useState('');
  const [aiDesignInfo, setAiDesignInfo]   = useState<{layout?: string; headline?: string} | null>(null);

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
    setAppliedStyle('');

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setPhotoPreview(base64);
      // Always auto-analyze to detect category + bullets
      await analyzePhoto(base64);
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
        headers: { Authorization: `Bearer ${accessToken}` },
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: src, productName, lang: 'uk' }),
      });
      const d = await res.json();
      if (d.bullets?.length)         setBullets([d.bullets[0] || '', d.bullets[1] || '', d.bullets[2] || '']);
      if (!productName && d.productName) setProductName(d.productName);
      if (d.category)                setDetectedCategory(d.category);
    } catch {}
    setAnalyzing(false);
  }

  async function generate() {
    if (!productName.trim() && !photoFile) return;
    setGenerating(true); setError(''); setFinalUrl(null); setAppliedStyle(''); setAiDesignInfo(null);

    try {
      // Step 1: Upload original photo
      let uploadedUrl = photoUrl;
      if (photoFile && !uploadedUrl) {
        setStep('📤 Завантажую фото в оригінальній якості...');
        uploadedUrl = await uploadPhoto(photoFile);
        if (uploadedUrl) setPhotoUrl(uploadedUrl);
      }

      // Step 2: Remove bg (only for sharp render-banner, not infographic)
      let finalPhotoB64 = photoPreview; // base64 for render-banner
      if (photoPreview && !keepBackground && template !== 'infographic') {
        setStep('🔮 Видаляю фон...');
        try {
          const res = await fetch('/api/remove-bg', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body:    JSON.stringify({ imageBase64: photoPreview }),
          });
          if (res.ok) {
            const d = await res.json();
            if (d.imageBase64) finalPhotoB64 = d.imageBase64;
          }
        } catch { /* fallback to original */ }
      }

      // Step 3: Render
      const isInfographic = template === 'infographic';
      const isSmart       = template === 'smart';
      setStep(isSmart ? '✦ Claude розробляє дизайн...' : isInfographic ? '📊 Генерую інфографіку...' : '🎨 Рендерю банер...');

      if (isSmart) {
        // ── Smart AI banner: Claude designs, sharp renders ──────────────────
        const res = await fetch('/api/smart-banner', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body:    JSON.stringify({
            productName,
            category: detectedCategory,
            bullets,
            price,
            platform: 'general',
            productB64: finalPhotoB64,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Помилка генерації');
        const d = await res.json();
        setFinalUrl(d.imageB64 || d.imageUrl);
        if (d.design) setAiDesignInfo({ layout: d.design.layout, headline: d.design.headline });

      } else if (isInfographic) {
        // ── Smart infographic: analyze photo → category-aware layout ──────────
        // Step A: analyze for accent color, callouts, extra specs
        setStep('🔍 AI аналізує деталі товару...');
        let infographicMeta = { detectedAccent: '', callouts: [], extraSpecs: [] as {key:string;val:string}[] };
        try {
          const analyzeRes = await fetch('/api/analyze-infographic', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body:    JSON.stringify({
              imageBase64: photoPreview,
              category: detectedCategory,
              productName,
              bullets: bullets.filter(Boolean),
            }),
          });
          if (analyzeRes.ok) infographicMeta = await analyzeRes.json();
        } catch { /* use defaults */ }

        // Step B: render with new infographic route
        setStep('🎨 Створюю інфографіку...');
        const infRes = await fetch('/api/infographic', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body:    JSON.stringify({
            productName,
            bullets: bullets.filter(Boolean),
            photoUrl:  uploadedUrl,
            productB64: finalPhotoB64,
            category:   detectedCategory,
            detectedAccent: infographicMeta.detectedAccent,
            callouts:       infographicMeta.callouts,
            extraSpecs:     infographicMeta.extraSpecs,
          }),
        });
        if (!infRes.ok) throw new Error((await infRes.json().catch(() => ({}))).error || 'Помилка інфографіки');
        const infBlob = await infRes.blob();
        if (infBlob.size === 0) throw new Error('Сервер повернув порожній файл');
        setFinalUrl(URL.createObjectURL(new Blob([infBlob], { type: 'image/png' })));
        if (infographicMeta.detectedAccent) setAppliedStyle('AI ДИЗАЙН');

      } else {
        // All other templates use render-banner (sharp compositing + category styles)
        const res = await fetch('/api/render-banner', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body:    JSON.stringify({
            productName,
            price,
            bullets,
            bgStyle,
            template,
            productB64: finalPhotoB64,
            category: detectedCategory,   // ← передаємо категорію з аналізу фото
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Помилка генерації');
        const d = await res.json();
        setFinalUrl(d.imageB64 || d.imageUrl);
        if (d.appliedStyle) setAppliedStyle(d.appliedStyle);
      }

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка. Спробуй ще раз.');
    }
    setGenerating(false); setStep('');
  }

  function download() {
    if (!finalUrl) return;
    const a = document.createElement('a');
    a.href = finalUrl;
    a.download = `banner-${(productName || 'tovar').replace(/\s/g, '-').slice(0, 40)}.${template === 'infographic' ? 'png' : 'jpg'}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // Category accent badge (UI only)
  const catAccent = detectedCategory ? CATEGORY_ACCENT[detectedCategory] : null;

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        <Link href="/generate"  className="text-white/40 text-sm hover:text-white">Генератор тексту →</Link>
      </div>

      <h1 className="font-display font-black text-2xl sm:text-3xl mb-1 tracking-tight">🖼️ Банер товару</h1>
      <p className="text-white/40 text-sm mb-8">Унікальний стиль під кожну категорію · оригінальна якість фото</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">

          {/* ── Photo upload ── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Фото товару</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                photoPreview ? 'border-gold/40 bg-gold/5' : 'border-white/10 hover:border-white/25'
              }`}
            >
              {photoPreview ? (
                <div className="flex items-center gap-3">
                  <img src={photoPreview} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold truncate">{photoName}</p>
                    {analyzing ? (
                      <p className="text-gold text-xs flex items-center gap-1 mt-0.5">
                        <span className="w-3 h-3 border border-gold border-t-transparent rounded-full animate-spin" />
                        AI визначає категорію...
                      </p>
                    ) : (
                      <p className="text-green-400 text-xs mt-0.5">✓ Аналіз завершено</p>
                    )}

                    {/* Category badge — shown after analysis */}
                    {catAccent && !analyzing && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"
                        style={{ background: catAccent.color + '22', color: catAccent.color, border: `1px solid ${catAccent.color}55` }}
                      >
                        ● {catAccent.label}
                      </span>
                    )}

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setPhotoFile(null); setPhotoPreview(null);
                        setPhotoUrl(null); setPhotoName('');
                        setFinalUrl(null); setDetectedCategory('');
                        setAppliedStyle(''); setAiDesignInfo(null);
                      }}
                      className="text-white/25 text-xs hover:text-red-400 mt-1 block"
                    >
                      видалити ×
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-3xl mb-2">📸</div>
                  <p className="text-white/50 text-sm">Завантажити фото товару</p>
                  <p className="text-white/25 text-xs mt-1">AI визначить категорію і підбере стиль</p>
                </div>
              )}
            </div>

            {photoPreview && template !== 'infographic' && (
              <label className="flex items-center gap-3 mt-3 cursor-pointer select-none">
                <button
                  type="button"
                  onClick={() => setKeepBackground(v => !v)}
                  className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${keepBackground ? 'bg-gold' : 'bg-white/15'}`}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    style={{ left: keepBackground ? '17px' : '2px' }}
                  />
                </button>
                <span className="text-white/50 text-xs">
                  {keepBackground ? '✓ Зберегти оригінальний фон' : 'Видалити фон (Remove.bg)'}
                </span>
              </label>
            )}
          </div>

          {/* ── Template ── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Тип банеру</label>
            <div className="space-y-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${
                    template === t.id ? 'border-gold bg-gold/10' : 'border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <span className="text-sm font-semibold text-white">{t.name}</span>
                  <span className="block text-xs text-white/35 mt-0.5">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Data ── */}
          {template !== 'infographic' && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-gold text-xs font-bold uppercase tracking-widest">Дані товару</label>
                {photoPreview && (
                  <button
                    onClick={() => analyzePhoto()}
                    disabled={analyzing}
                    className="text-xs text-gold/60 hover:text-gold border border-gold/20 hover:border-gold/40 px-3 py-1 rounded-lg disabled:opacity-40 flex items-center gap-1"
                  >
                    {analyzing
                      ? <><span className="w-3 h-3 border border-gold/40 border-t-gold rounded-full animate-spin" />Аналізую...</>
                      : '🤖 Визначити з фото'}
                  </button>
                )}
              </div>
              <input
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="Назва товару *"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors"
              />
              <input
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="Ціна (наприклад: 2 499)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors"
              />
              <p className="text-white/25 text-xs">Переваги (або залиш — AI визначить):</p>
              {bullets.map((b, i) => (
                <div key={i} className="relative">
                  <input
                    value={b}
                    onChange={e => { const nb = [...bullets]; nb[i] = e.target.value; setBullets(nb); }}
                    placeholder={`Перевага ${i + 1}`}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors pr-8"
                  />
                  {b && (
                    <button
                      onClick={() => { const nb = [...bullets]; nb[i] = ''; setBullets(nb); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Infographic data ── */}
          {template === 'infographic' && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Назва товару</label>
              <input
                value={productName}
                onChange={e => setProductName(e.target.value)}
                placeholder="Необов'язково — AI визначить з фото"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors mb-3"
              />
              <p className="text-white/25 text-xs mb-2">Переваги для інфографіки:</p>
              <div className="space-y-2">
                {bullets.map((b, i) => (
                  <div key={i} className="relative">
                    <input
                      value={b}
                      onChange={e => { const nb = [...bullets]; nb[i] = e.target.value; setBullets(nb); }}
                      placeholder={`Перевага ${i + 1}`}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors pr-8"
                    />
                    {b && (
                      <button
                        onClick={() => { const nb = [...bullets]; nb[i] = ''; setBullets(nb); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50"
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Style ── */}
          {template !== 'infographic' && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <label className="text-gold text-xs font-bold uppercase tracking-widest">Стиль фону</label>
                {/* Category style hint */}
                {catAccent && bgStyle === 'dark' && (
                  <span className="text-xs text-white/35">
                    Авто →{' '}
                    <span style={{ color: catAccent.color }} className="font-semibold">
                      {detectedCategory}
                    </span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BG_STYLES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setBgStyle(s.id)}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                      bgStyle === s.id
                        ? 'border-gold bg-gold/10 text-gold'
                        : 'border-white/10 text-white/50 hover:border-white/25'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {bgStyle === 'dark' && catAccent && (
                <p className="text-white/30 text-xs mt-2">
                  ✦ Категорія &quot;{detectedCategory}&quot; — унікальна кольорова схема буде застосована автоматично
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={generate}
            disabled={generating || uploading || (!productName.trim() && !photoFile)}
            className="w-full bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 text-base"
          >
            {generating || uploading ? (
              <>
                <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                {step || 'Завантажую...'}
              </>
            ) : template === 'smart' ? (
              '✦ AI — зробити унікальний банер'
            ) : template === 'infographic' ? (
              '📊 Згенерувати інфографіку'
            ) : (
              '✦ Згенерувати банер'
            )}
          </button>
          <p className="text-white/20 text-xs text-center">
            Оригінальна якість фото · унікальний стиль під категорію
          </p>
        </div>

        {/* ── Result panel ── */}
        <div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden sticky top-6">
            <div className="px-5 py-3 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-gold text-xs font-bold uppercase tracking-wider">Результат</span>
                {appliedStyle && (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: (catAccent?.color ?? '#c8a84b') + '22',
                      color: catAccent?.color ?? '#c8a84b',
                    }}
                  >
                    {appliedStyle}
                  </span>
                )}
                {aiDesignInfo && (
                  <span className="text-[10px] text-white/40 font-mono">
                    AI: {aiDesignInfo.layout}
                  </span>
                )}
              </div>
              {finalUrl && (
                <button
                  onClick={download}
                  className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600"
                >
                  ⬇ Завантажити
                </button>
              )}
            </div>

            <div
              className="relative bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#141414_0%_50%)] bg-[length:24px_24px]"
              style={{ minHeight: '360px' }}
            >
              {(generating || uploading) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                  <div className="w-12 h-12 border-[3px] border-gold/20 border-t-gold rounded-full animate-spin" />
                  <p className="text-white/60 text-sm text-center px-4">{step}</p>
                </div>
              )}
              {!generating && !uploading && !finalUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/20">
                  <span className="text-5xl">🖼️</span>
                  <span className="text-sm">Тут з&apos;явиться банер</span>
                  {catAccent && (
                    <span
                      className="text-xs px-3 py-1 rounded-full font-medium"
                      style={{ color: catAccent.color, background: catAccent.color + '15' }}
                    >
                      Стиль: {catAccent.label}
                    </span>
                  )}
                </div>
              )}
              {finalUrl && <img src={finalUrl} alt="Banner" className="w-full block" />}
            {finalUrl && aiDesignInfo?.headline && (
              <div className="px-4 py-2 bg-black/30 border-t border-white/[0.06]">
                <p className="text-white/40 text-[11px]">
                  AI headline: <span className="text-white/60 italic">&ldquo;{aiDesignInfo.headline}&rdquo;</span>
                </p>
              </div>
            )}
            </div>

            {finalUrl && (
              <div className="px-5 py-4 border-t border-white/[0.08] flex gap-3">
                <button
                  onClick={download}
                  className="flex-1 bg-green-700 text-white py-3 rounded-xl font-bold hover:bg-green-600 text-sm flex items-center justify-center gap-2"
                >
                  ⬇ Завантажити
                </button>
                <button
                  onClick={generate}
                  className="flex-1 border border-white/15 text-white/60 py-3 rounded-xl font-semibold hover:border-gold hover:text-gold text-sm"
                >
                  ↺ Перегенерувати
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
