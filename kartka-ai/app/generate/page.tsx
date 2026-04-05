'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import type { CardResult, Platform, Tone, Lang } from '@/types';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'prom',    label: 'Prom.ua'   },
  { value: 'rozetka', label: 'Rozetka'   },
  { value: 'olx',     label: 'OLX'       },
  { value: 'general', label: 'Загальний' },
];

// ── Photo pipeline steps ────────────────────────────────────────────────────
type PhotoStep =
  | 'idle'
  | 'analyzing'   // GPT-4o analyze-product
  | 'cropping'    // sharp crop via crop-product
  | 'removing_bg' // remove.bg
  | 'done'
  | 'error';

const STEP_LABELS: Record<PhotoStep, string> = {
  idle:        '',
  analyzing:   'AI аналізує товар...',
  cropping:    'Обрізаю зображення...',
  removing_bg: 'Видаляю фон...',
  done:        'Фото готове ✓',
  error:       'Помилка обробки',
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setOk(true);
    setTimeout(() => setOk(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all border ${
        ok
          ? 'bg-green-600 text-white border-green-600'
          : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'
      }`}
    >
      {ok ? '✓' : label}
    </button>
  );
}

function PhotoStepBadge({ step }: { step: PhotoStep }) {
  if (step === 'idle' || step === 'done') return null;
  const isError = step === 'error';
  return (
    <div
      className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full mt-2 ${
        isError
          ? 'bg-red-500/15 text-red-400'
          : 'bg-gold/10 text-gold'
      }`}
    >
      {!isError && (
        <span className="w-3 h-3 border border-gold border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {STEP_LABELS[step]}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function GeneratePage() {
  const router    = useRouter();
  const supabase  = createClient();
  const fileRef   = useRef<HTMLInputElement>(null);

  const [ready,       setReady]       = useState(false);
  const [cardsLeft,   setCardsLeft]   = useState(0);
  const [accessToken, setAccessToken] = useState('');

  // Form fields
  const [productName, setProductName] = useState('');
  const [category,    setCategory]    = useState('');
  const [features,    setFeatures]    = useState('');
  const [platform,    setPlatform]    = useState<Platform>('prom');
  const [tone,        setTone]        = useState<Tone>('professional');
  const [lang,        setLang]        = useState<Lang>('uk');
  const [genImage,    setGenImage]    = useState(true);

  // Photo pipeline state
  const [photoStep,        setPhotoStep]        = useState<PhotoStep>('idle');
  const [photoError,       setPhotoError]       = useState('');
  const [originalPhoto,    setOriginalPhoto]    = useState<string | null>(null); // raw base64 from user
  const [processedPhoto,   setProcessedPhoto]   = useState<string | null>(null); // after crop + remove-bg
  const [uploadedPhotoName, setUploadedPhotoName] = useState('');
  const [analyzeData,      setAnalyzeData]      = useState<Record<string, unknown> | null>(null);

  // Generation state
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<CardResult | null>(null);
  const [error,      setError]      = useState('');
  const [allCopied,  setAllCopied]  = useState(false);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
      supabase
        .from('users')
        .select('cards_left')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => {
          if (data) setCardsLeft(data.cards_left);
          setReady(true);
        });
    });
  }, []);

  // ── Photo pipeline ────────────────────────────────────────────────────────
  async function runPhotoPipeline(base64: string) {
    setPhotoError('');
    setProcessedPhoto(null);
    setAnalyzeData(null);

    try {
      // Step 1 — analyze: GPT-4o returns bbox + category + bullets
      setPhotoStep('analyzing');
      const analyzeRes = await fetch('/api/analyze-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: base64, lang }),
      });
      const analyzed = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzed.error || 'Помилка аналізу фото');

      // Auto-fill form fields from AI analysis
      if (analyzed.productName && !productName) setProductName(analyzed.productName);
      if (analyzed.category)                    setCategory(analyzed.category);
      if (analyzed.bullets?.length && !features)
        setFeatures(analyzed.bullets.slice(0, 3).join(', '));
      setAnalyzeData(analyzed);

      const shouldSkipProcessing =
        analyzed.keepBackground ||
        (analyzed.bbox?.w > 0.92 && analyzed.bbox?.h > 0.92);

      if (shouldSkipProcessing) {
        // White/clean background — skip crop + remove-bg, use original
        setProcessedPhoto(base64);
        setPhotoStep('done');
        return;
      }

      // Step 2 — crop: sharp cuts out the product bbox
      setPhotoStep('cropping');
      const cropRes = await fetch('/api/crop-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: base64 }),
      });
      const cropData = await cropRes.json();
      if (!cropRes.ok) throw new Error(cropData.error || 'Помилка обрізки');
      const cropped = cropData.croppedBase64 as string;

      // Step 3 — remove background via Remove.bg
      setPhotoStep('removing_bg');
      const bgRes = await fetch('/api/remove-bg', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: cropped }),
      });
      const bgData = await bgRes.json();

      if (!bgRes.ok) {
        // Remove.bg failed → fallback to cropped without bg removal, don't block user
        console.warn('Remove.bg failed, using cropped:', bgData.error);
        setProcessedPhoto(cropped);
      } else {
        setProcessedPhoto(bgData.imageBase64 as string);
      }

      setPhotoStep('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Помилка обробки фото';
      setPhotoError(msg);
      setPhotoStep('error');
      // Don't block — user can still generate with original photo
      setProcessedPhoto(base64);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setOriginalPhoto(b64);
      runPhotoPipeline(b64);
    };
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setOriginalPhoto(null);
    setProcessedPhoto(null);
    setAnalyzeData(null);
    setPhotoStep('idle');
    setPhotoError('');
    setUploadedPhotoName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  // ── Compress image for API (max 1024px, JPEG 85%) to avoid 413 / timeout ───
  function compressForApi(base64: string): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        // White background for PNG with transparency (remove-bg output)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(base64); // fallback: send as-is
      img.src = base64;
    });
  }

  // ── Generate card ─────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (!productName.trim() || loading) return;
    if (cardsLeft <= 0) { setError('Ліміт вичерпано. Підвищ тариф.'); return; }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Use processed photo (cropped + no-bg), compress to avoid 413 on Vercel
      const rawPhoto = processedPhoto ?? originalPhoto ?? null;
      const photoToSend = rawPhoto ? await compressForApi(rawPhoto) : null;

      const res = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({
          productName,
          category,
          features,
          platform,
          tone,
          lang,
          generateImage: genImage && !photoToSend,
          uploadedPhoto: photoToSend,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка генерації');
      setResult(data);
      setCardsLeft(c => Math.max(0, c - 1));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка сервера. Спробуй ще раз.');
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, category, features, platform, tone, lang,
    genImage, processedPhoto, originalPhoto, cardsLeft, loading, accessToken]);

  function copyAll() {
    if (!result) return;
    const text = [
      result.title, '',
      result.description, '',
      'Переваги:',
      ...result.bullets.map(b => '• ' + b), '',
      'Ключові слова: ' + result.keywords.join(', '),
    ].join('\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  }

  function downloadCSV() {
    if (!result) return;
    const rows = [
      ['Назва', 'Опис', 'Переваги', 'Ключові слова', 'Платформа', 'Зображення'],
      [
        result.title,
        result.description,
        result.bullets.join(' | '),
        result.keywords.join(', '),
        platform,
        result.imageUrl || '',
      ],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `kartka-${Date.now()}.csv`,
    });
    a.click();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const noCards      = cardsLeft <= 0;
  const platformLabel = PLATFORMS.find(p => p.value === platform)?.label ?? platform;
  const pipelineActive = photoStep !== 'idle' && photoStep !== 'done' && photoStep !== 'error';

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-3">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors shrink-0">
          ← Кабінет
        </Link>
        <span className={`text-sm font-bold ${noCards ? 'text-red-400' : 'text-gold'}`}>
          Залишок: {cardsLeft === 99999 ? '∞' : cardsLeft} карточок
        </span>
      </div>

      <h1 className="font-display font-black text-2xl sm:text-3xl mb-6 tracking-tight">✦ Генератор картки</h1>

      {noCards && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-red-300 text-sm">Ліміт карточок вичерпано.</p>
          <Link href="/pricing" className="bg-gold text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-gold-light transition-colors shrink-0">
            Підвищити →
          </Link>
        </div>
      )}

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 sm:p-7 mb-5">
        <div className="space-y-5">

          {/* ── Photo upload ── */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              Фото товару{' '}
              <span className="text-white/30 font-normal normal-case tracking-normal">
                — AI розпізнає, обріже та видалить фон автоматично
              </span>
            </label>

            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

            <div
              onClick={() => !originalPhoto && fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 transition-all ${
                originalPhoto
                  ? 'border-gold/50 bg-gold/5 cursor-default'
                  : 'border-white/10 hover:border-white/25 cursor-pointer'
              }`}
            >
              {originalPhoto ? (
                <div className="flex items-start gap-4">

                  {/* Left: original → processed preview */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Original */}
                    <div className="relative">
                      <img
                        src={originalPhoto}
                        alt="original"
                        className="w-16 h-16 object-cover rounded-lg opacity-40"
                      />
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/40 whitespace-nowrap">
                        оригінал
                      </span>
                    </div>

                    <span className="text-white/20 text-lg">→</span>

                    {/* Processed */}
                    <div className="relative">
                      {processedPhoto ? (
                        <>
                          <img
                            src={processedPhoto}
                            alt="processed"
                            className="w-16 h-16 object-contain rounded-lg bg-white/5"
                          />
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-gold whitespace-nowrap">
                            готове
                          </span>
                        </>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center">
                          <span className="w-5 h-5 border-2 border-gold/50 border-t-gold rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: info + pipeline status */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{uploadedPhotoName}</p>

                    {/* Pipeline steps progress */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {(['analyzing', 'cropping', 'removing_bg'] as PhotoStep[]).map((s, i) => {
                        const steps: PhotoStep[] = ['analyzing', 'cropping', 'removing_bg'];
                        const currentIdx = steps.indexOf(photoStep);
                        const isDone  = photoStep === 'done' || currentIdx > i;
                        const isActive = photoStep === s;
                        return (
                          <div key={s} className="flex items-center gap-1.5">
                            <div
                              className={`w-2 h-2 rounded-full transition-all ${
                                isDone   ? 'bg-gold' :
                                isActive ? 'bg-gold/60 animate-pulse' :
                                           'bg-white/15'
                              }`}
                            />
                            {i < 2 && <div className="w-4 h-px bg-white/10" />}
                          </div>
                        );
                      })}
                    </div>

                    <PhotoStepBadge step={photoStep} />

                    {photoStep === 'done' && (
                      <p className="text-gold text-xs mt-2 font-medium">
                        ✓ Фон видалено, товар готовий до банеру
                      </p>
                    )}

                    {/* Analyzed data preview */}
                    {analyzeData && photoStep === 'done' && (
                      <p className="text-white/40 text-xs mt-1 truncate">
                        AI визначив: {analyzeData.category as string}
                      </p>
                    )}

                    {photoError && (
                      <p className="text-red-400 text-xs mt-1">{photoError} — використаю оригінал</p>
                    )}

                    <button
                      onClick={e => { e.stopPropagation(); clearPhoto(); }}
                      className="text-white/30 text-xs hover:text-red-400 mt-2 transition-colors"
                    >
                      Видалити фото ×
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-3xl mb-2">📸</div>
                  <p className="text-white/50 text-sm">Натисни щоб завантажити фото товару</p>
                  <p className="text-white/25 text-xs mt-1">JPG, PNG до 10 МБ · AI обріже та видалить фон</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Product name ── */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              Назва товару *{' '}
              {analyzeData && (
                <span className="text-white/30 font-normal normal-case tracking-normal">
                  — заповнено AI з фото
                </span>
              )}
            </label>
            <input
              value={productName}
              onChange={e => setProductName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="наприклад: Тактична футболка selion veteran чорна"
              disabled={noCards}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors disabled:opacity-40"
            />
          </div>

          {/* ── Category + Lang ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Категорія</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40"
              >
                <option value="">— вибери —</option>
                {[
                  'Електроніка', 'Одяг та взуття', 'Тактичне спорядження',
                  'Дім та сад', "Краса та здоров'я", 'Спорт та хобі',
                  'Авто та мото', 'Іграшки', 'Інше',
                ].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Мова</label>
              <select
                value={lang}
                onChange={e => setLang(e.target.value as Lang)}
                disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40"
              >
                <option value="uk">Українська</option>
                <option value="ru">Російська</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* ── Features ── */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              Особливості{' '}
              <span className="text-white/30 font-normal normal-case tracking-normal">(необов&apos;язково)</span>
            </label>
            <textarea
              value={features}
              onChange={e => setFeatures(e.target.value)}
              rows={2}
              disabled={noCards}
              placeholder="наприклад: швидке висихання, якісний принт TDF, підходить для служби"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors resize-none disabled:opacity-40"
            />
          </div>

          {/* ── Platform ── */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Платформа</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PLATFORMS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPlatform(p.value)}
                  disabled={noCards}
                  className={`shrink-0 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    platform === p.value
                      ? 'bg-gold/15 border-gold text-gold'
                      : 'border-white/10 text-white/50 hover:border-white/25'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tone ── */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Тон</label>
            <div className="flex flex-wrap gap-2">
              {([['professional', 'Професійний'], ['friendly', 'Дружній'], ['premium', 'Преміум'], ['simple', 'Простий']] as const).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setTone(v as Tone)}
                  disabled={noCards}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    tone === v
                      ? 'bg-gold/15 border-gold text-gold'
                      : 'border-white/10 text-white/50 hover:border-white/25'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* ── DALL-E toggle — hide if photo uploaded ── */}
          {!originalPhoto && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setGenImage(v => !v)}
                disabled={noCards}
                className={`w-10 h-6 rounded-full transition-colors shrink-0 relative ${genImage ? 'bg-gold' : 'bg-white/15'}`}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                  style={{ left: genImage ? '18px' : '2px' }}
                />
              </button>
              <span className="text-white/60 text-sm">Генерувати зображення (DALL-E 3)</span>
            </label>
          )}
        </div>

        {/* ── Generate button ── */}
        <button
          onClick={generate}
          disabled={loading || noCards || !productName.trim() || pipelineActive}
          className="mt-6 w-full sm:w-auto bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 px-8 rounded-xl text-base hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Генерую...
            </>
          ) : pipelineActive ? (
            <>
              <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Обробляю фото...
            </>
          ) : (
            '✦ Згенерувати картку'
          )}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-300 text-sm mb-5 flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          {error.includes('тариф') && (
            <Link href="/pricing" className="text-gold underline">Підвищити →</Link>
          )}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="bg-white rounded-2xl p-6 sm:p-8">
          <div className="skeleton h-5 w-2/3 mb-6 rounded" />
          <div className="skeleton h-3 w-full mb-2 rounded" />
          <div className="skeleton h-3 w-11/12 mb-2 rounded" />
          <div className="skeleton h-3 w-4/5 mb-6 rounded" />
          <div className="skeleton h-3 w-1/2 mb-2 rounded" />
          <div className="skeleton h-3 w-2/5 rounded" />
        </div>
      )}

      {/* ── Result card ── */}
      {result && !loading && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">

          {/* Header bar */}
          <div className="bg-navy px-5 py-3.5 flex items-center justify-between gap-2">
            <span className="bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full">{platformLabel}</span>
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-xs">{result.title.length}/80 симв.</span>
              <button
                onClick={copyAll}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                  allCopied ? 'bg-green-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {allCopied ? '✓ Скопійовано!' : '📋 Копіювати все'}
              </button>
            </div>
          </div>

          <div className="p-5 sm:p-7 space-y-5">

            {/* Product image — processed or generated */}
            {(processedPhoto || result.imageUrl) && (
              <div className="relative group">
                <img
                  src={processedPhoto ?? result.imageUrl}
                  alt={result.title}
                  className={`w-full rounded-xl object-contain ${
                    processedPhoto ? 'h-56 bg-gray-50' : 'h-48 sm:h-64 object-cover'
                  }`}
                />
                <a
                  href={processedPhoto ?? result.imageUrl}
                  download={`product-${Date.now()}.${processedPhoto ? 'png' : 'jpg'}`}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity font-semibold"
                >
                  ⬇ Завантажити
                </a>
              </div>
            )}

            {/* Title */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Заголовок</span>
                <CopyBtn text={result.title} label="Копіювати" />
              </div>
              <h2 className="font-display font-bold text-lg text-navy leading-tight">{result.title}</h2>
            </div>

            {/* Description */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Опис</span>
                <CopyBtn text={result.description} label="Копіювати" />
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">{result.description}</p>
            </div>

            {/* Bullets */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Переваги</span>
                <CopyBtn text={result.bullets.map(b => '• ' + b).join('\n')} label="Копіювати" />
              </div>
              <ul className="space-y-2">
                {result.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-navy font-bold mt-0.5 shrink-0">✓</span>{b}
                  </li>
                ))}
              </ul>
            </div>

            {/* Keywords */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ключові слова</span>
                <CopyBtn text={result.keywords.join(', ')} label="Копіювати" />
              </div>
              <div className="flex flex-wrap gap-2">
                {result.keywords.map(k => (
                  <button
                    key={k}
                    onClick={() => navigator.clipboard.writeText(k)}
                    className="bg-blue-50 text-navy text-xs font-medium px-3 py-1 rounded-full hover:bg-blue-100 transition-colors cursor-copy"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 sm:px-7 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={copyAll}
              className={`px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                allCopied ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'
              }`}
            >
              {allCopied ? '✓ Все скопійовано!' : '📋 Копіювати все'}
            </button>
            <button
              onClick={downloadCSV}
              className="bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              ⬇ Завантажити CSV
            </button>
            <button
              onClick={generate}
              className="border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              ↺ Інший варіант
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
