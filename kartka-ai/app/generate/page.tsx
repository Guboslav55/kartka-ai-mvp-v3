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
  { value: 'general', label: 'ÐÐ°Ð³Ð°Ð»ÑÐ½Ð¸Ð¹' },
];

// ââ Photo pipeline steps ââââââââââââââââââââââââââââââââââââââââââââââââââââ
type PhotoStep =
  | 'idle'
  | 'analyzing'   // GPT-4o analyze-product
  | 'cropping'    // sharp crop via crop-product
  | 'removing_bg' // remove.bg
  | 'done'
  | 'error';

const STEP_LABELS: Record<PhotoStep, string> = {
  idle:        '',
  analyzing:   'AI Ð°Ð½Ð°Ð»ÑÐ·ÑÑ ÑÐ¾Ð²Ð°Ñ...',
  cropping:    'ÐÐ±ÑÑÐ·Ð°Ñ Ð·Ð¾Ð±ÑÐ°Ð¶ÐµÐ½Ð½Ñ...',
  removing_bg: 'ÐÐ¸Ð´Ð°Ð»ÑÑ ÑÐ¾Ð½...',
  done:        'Ð¤Ð¾ÑÐ¾ Ð³Ð¾ÑÐ¾Ð²Ðµ â',
  error:       'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° Ð¾Ð±ÑÐ¾Ð±ÐºÐ¸',
};

// ââ Helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
      {ok ? 'â' : label}
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

// ââ Main component âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
  const [cardId,     setCardId]     = useState<string|null>(null);
  const [editOpen,   setEditOpen]   = useState(false);
  const [editMsgs,   setEditMsgs]   = useState<{role:'user'|'assistant';content:string;changedFields?:string[]}[]>([]);
  const [editInput,  setEditInput]  = useState('');
  const [editLoading,setEditLoading]= useState(false);
  const editEndRef = useRef<HTMLDivElement>(null);
  const [lastChanged, setLastChanged] = useState<string[]>([]);

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

  // ââ Photo pipeline ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  async function runPhotoPipeline(base64: string) {
    setPhotoError('');
    setProcessedPhoto(null);
    setAnalyzeData(null);

    try {
      // Step 1 â analyze: GPT-4o returns bbox + category + bullets
      setPhotoStep('analyzing');
      const analyzeRes = await fetch('/api/analyze-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: base64, lang }),
      });
      const analyzed = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzed.error || 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° Ð°Ð½Ð°Ð»ÑÐ·Ñ ÑÐ¾ÑÐ¾');

      // Auto-fill form fields from AI analysis
      if (analyzed.productName && !productName) setProductName(analyzed.productName);
      if (analyzed.category)                    setCategory(analyzed.category);
      if (analyzed.bullets?.length && !features)
        setFeatures(analyzed.bullets.slice(0, 3).join(', '));
      setAnalyzeData(analyzed);
        const shouldSkipProcessing = false; // Always remove bg
      const shouldSkipProcessing =
        analyzed.keepBackground ||
        (analyzed.bbox?.w > 0.92 && analyzed.bbox?.h > 0.92);

      if (shouldSkipProcessing) {
        // White/clean background â skip crop + remove-bg, use original
        setProcessedPhoto(base64);
        setPhotoStep('done');
        return;
      }

      // Step 2 â crop: sharp cuts out the product bbox
      setPhotoStep('cropping');
      const cropRes = await fetch('/api/crop-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: base64 }),
      });
      const cropData = await cropRes.json();
      if (!cropRes.ok) throw new Error(cropData.error || 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° Ð¾Ð±ÑÑÐ·ÐºÐ¸');
      const cropped = cropData.croppedBase64 as string;

      // Step 3 â remove background via Remove.bg
      setPhotoStep('removing_bg');
      const bgRes = await fetch('/api/remove-bg', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: cropped }),
      });
      const bgData = await bgRes.json();

      if (!bgRes.ok) {
        // Remove.bg failed â fallback to cropped without bg removal, don't block user
        console.warn('Remove.bg failed, using cropped:', bgData.error);
        setProcessedPhoto(cropped);
      } else {
        setProcessedPhoto(bgData.imageBase64 as string);
      }

      setPhotoStep('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° Ð¾Ð±ÑÐ¾Ð±ÐºÐ¸ ÑÐ¾ÑÐ¾';
      setPhotoError(msg);
      setPhotoStep('error');
      // Don't block â user can still generate with original photo
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

  // ââ Compress image for API (max 1024px, JPEG 85%) to avoid 413 / timeout âââ
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

  // ââ Generate card âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  const generate = useCallback(async () => {
    if (!productName.trim() || loading) return;
    if (cardsLeft <= 0) { setError('ÐÑÐ¼ÑÑ Ð²Ð¸ÑÐµÑÐ¿Ð°Ð½Ð¾. ÐÑÐ´Ð²Ð¸Ñ ÑÐ°ÑÐ¸Ñ.'); return; }

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
      if (!res.ok) throw new Error(data.error || 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° Ð³ÐµÐ½ÐµÑÐ°ÑÑÑ');
      setResult(data);
      setCardId(data.cardId ?? null);
      setEditMsgs([]);
      setEditOpen(false);
      setCardsLeft(c => Math.max(0, c - 1));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° ÑÐµÑÐ²ÐµÑÐ°. Ð¡Ð¿ÑÐ¾Ð±ÑÐ¹ ÑÐµ ÑÐ°Ð·.');
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, category, features, platform, tone, lang,
    genImage, processedPhoto, originalPhoto, cardsLeft, loading, accessToken]);

  async function sendEdit(text: string) {
    if (!text.trim() || !result || editLoading) return;
    setEditMsgs(prev => [...prev, { role: 'user' as const, content: text }]);
    setEditInput('');
    setEditLoading(true);
    setLastChanged([]);
    try {
      const res = await fetch('/api/edit-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ cardId, userMessage: text, card: { product_name: productName, platform, title: result.title, description: result.description, bullets: result.bullets, keywords: result.keywords }, history: editMsgs.slice(-6) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° AI');
      if (data.diff && Object.keys(data.diff).length > 0) { setResult(prev => prev ? { ...prev, ...data.diff } : prev); setLastChanged(data.changedFields ?? []); }
      setEditMsgs(prev => [...prev, { role: 'assistant' as const, content: data.explanation ?? 'ÐÐ¾ÑÐ¾Ð²Ð¾', changedFields: data.changedFields }]);
    } catch (err: unknown) {
      setEditMsgs(prev => [...prev, { role: 'assistant' as const, content: 'â ï¸ ' + (err instanceof Error ? err.message : 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ°') }]);
    }
    setEditLoading(false);
  }

  function copyAll() {
    if (!result) return;
    const text = [
      result.title, '',
      result.description, '',
      'ÐÐµÑÐµÐ²Ð°Ð³Ð¸:',
      ...result.bullets.map(b => 'â¢ ' + b), '',
      'ÐÐ»ÑÑÐ¾Ð²Ñ ÑÐ»Ð¾Ð²Ð°: ' + result.keywords.join(', '),
    ].join('\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  }

  function downloadCSV() {
    if (!result) return;
    const rows = [
      ['ÐÐ°Ð·Ð²Ð°', 'ÐÐ¿Ð¸Ñ', 'ÐÐµÑÐµÐ²Ð°Ð³Ð¸', 'ÐÐ»ÑÑÐ¾Ð²Ñ ÑÐ»Ð¾Ð²Ð°', 'ÐÐ»Ð°ÑÑÐ¾ÑÐ¼Ð°', 'ÐÐ¾Ð±ÑÐ°Ð¶ÐµÐ½Ð½Ñ'],
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

  // ââ Render âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
          â ÐÐ°Ð±ÑÐ½ÐµÑ
        </Link>
        <span className={`text-sm font-bold ${noCards ? 'text-red-400' : 'text-gold'}`}>
          ÐÐ°Ð»Ð¸ÑÐ¾Ðº: {cardsLeft === 99999 ? 'â' : cardsLeft} ÐºÐ°ÑÑÐ¾ÑÐ¾Ðº
        </span>
      </div>

      <h1 className="font-display font-black text-2xl sm:text-3xl mb-6 tracking-tight">â¦ ÐÐµÐ½ÐµÑÐ°ÑÐ¾Ñ ÐºÐ°ÑÑÐºÐ¸</h1>

      {noCards && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-red-300 text-sm">ÐÑÐ¼ÑÑ ÐºÐ°ÑÑÐ¾ÑÐ¾Ðº Ð²Ð¸ÑÐµÑÐ¿Ð°Ð½Ð¾.</p>
          <Link href="/pricing" className="bg-gold text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-gold-light transition-colors shrink-0">
            ÐÑÐ´Ð²Ð¸ÑÐ¸ÑÐ¸ â
          </Link>
        </div>
      )}

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 sm:p-7 mb-5">
        <div className="space-y-5">

          {/* ââ Photo upload ââ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              Ð¤Ð¾ÑÐ¾ ÑÐ¾Ð²Ð°ÑÑ{' '}
              <span className="text-white/30 font-normal normal-case tracking-normal">
                â AI ÑÐ¾Ð·Ð¿ÑÐ·Ð½Ð°Ñ, Ð¾Ð±ÑÑÐ¶Ðµ ÑÐ° Ð²Ð¸Ð´Ð°Ð»Ð¸ÑÑ ÑÐ¾Ð½ Ð°Ð²ÑÐ¾Ð¼Ð°ÑÐ¸ÑÐ½Ð¾
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

                  {/* Left: original â processed preview */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Original */}
                    <div className="relative">
                      <img
                        src={originalPhoto}
                        alt="original"
                        className="w-16 h-16 object-cover rounded-lg opacity-40"
                      />
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/40 whitespace-nowrap">
                        Ð¾ÑÐ¸Ð³ÑÐ½Ð°Ð»
                      </span>
                    </div>

                    <span className="text-white/20 text-lg">â</span>

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
                            Ð³Ð¾ÑÐ¾Ð²Ðµ
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
                        â Ð¤Ð¾Ð½ Ð²Ð¸Ð´Ð°Ð»ÐµÐ½Ð¾, ÑÐ¾Ð²Ð°Ñ Ð³Ð¾ÑÐ¾Ð²Ð¸Ð¹ Ð´Ð¾ Ð±Ð°Ð½ÐµÑÑ
                      </p>
                    )}

                    {/* Analyzed data preview */}
                    {analyzeData && photoStep === 'done' && (
                      <p className="text-white/40 text-xs mt-1 truncate">
                        AI Ð²Ð¸Ð·Ð½Ð°ÑÐ¸Ð²: {analyzeData.category as string}
                      </p>
                    )}

                    {photoError && (
                      <p className="text-red-400 text-xs mt-1">{photoError} â Ð²Ð¸ÐºÐ¾ÑÐ¸ÑÑÐ°Ñ Ð¾ÑÐ¸Ð³ÑÐ½Ð°Ð»</p>
                    )}

                    <button
                      onClick={e => { e.stopPropagation(); clearPhoto(); }}
                      className="text-white/30 text-xs hover:text-red-400 mt-2 transition-colors"
                    >
                      ÐÐ¸Ð´Ð°Ð»Ð¸ÑÐ¸ ÑÐ¾ÑÐ¾ Ã
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-3xl mb-2">ð¸</div>
                  <p className="text-white/50 text-sm">ÐÐ°ÑÐ¸ÑÐ½Ð¸ ÑÐ¾Ð± Ð·Ð°Ð²Ð°Ð½ÑÐ°Ð¶Ð¸ÑÐ¸ ÑÐ¾ÑÐ¾ ÑÐ¾Ð²Ð°ÑÑ</p>
                  <p className="text-white/25 text-xs mt-1">JPG, PNG Ð´Ð¾ 10 ÐÐ Â· AI Ð¾Ð±ÑÑÐ¶Ðµ ÑÐ° Ð²Ð¸Ð´Ð°Ð»Ð¸ÑÑ ÑÐ¾Ð½</p>
                </div>
              )}
            </div>
          </div>

          {/* ââ Product name ââ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              ÐÐ°Ð·Ð²Ð° ÑÐ¾Ð²Ð°ÑÑ *{' '}
              {analyzeData && (
                <span className="text-white/30 font-normal normal-case tracking-normal">
                  â Ð·Ð°Ð¿Ð¾Ð²Ð½ÐµÐ½Ð¾ AI Ð· ÑÐ¾ÑÐ¾
                </span>
              )}
            </label>
            <input
              value={productName}
              onChange={e => setProductName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="Ð½Ð°Ð¿ÑÐ¸ÐºÐ»Ð°Ð´: Ð¢Ð°ÐºÑÐ¸ÑÐ½Ð° ÑÑÑÐ±Ð¾Ð»ÐºÐ° selion veteran ÑÐ¾ÑÐ½Ð°"
              disabled={noCards}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors disabled:opacity-40"
            />
          </div>

          {/* ââ Category + Lang ââ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">ÐÐ°ÑÐµÐ³Ð¾ÑÑÑ</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40"
              >
                <option value="">â Ð²Ð¸Ð±ÐµÑÐ¸ â</option>
                {[
                  'ÐÐ»ÐµÐºÑÑÐ¾Ð½ÑÐºÐ°', 'ÐÐ´ÑÐ³ ÑÐ° Ð²Ð·ÑÑÑÑ', 'Ð¢Ð°ÐºÑÐ¸ÑÐ½Ðµ ÑÐ¿Ð¾ÑÑÐ´Ð¶ÐµÐ½Ð½Ñ',
                  'ÐÑÐ¼ ÑÐ° ÑÐ°Ð´', "ÐÑÐ°ÑÐ° ÑÐ° Ð·Ð´Ð¾ÑÐ¾Ð²'Ñ", 'Ð¡Ð¿Ð¾ÑÑ ÑÐ° ÑÐ¾Ð±Ñ',
                  'ÐÐ²ÑÐ¾ ÑÐ° Ð¼Ð¾ÑÐ¾', 'ÐÐ³ÑÐ°ÑÐºÐ¸', 'ÐÐ½ÑÐµ',
                ].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">ÐÐ¾Ð²Ð°</label>
              <select
                value={lang}
                onChange={e => setLang(e.target.value as Lang)}
                disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40"
              >
                <option value="uk">Ð£ÐºÑÐ°ÑÐ½ÑÑÐºÐ°</option>
                <option value="ru">Ð Ð¾ÑÑÐ¹ÑÑÐºÐ°</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* ââ Features ââ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              ÐÑÐ¾Ð±Ð»Ð¸Ð²Ð¾ÑÑÑ{' '}
              <span className="text-white/30 font-normal normal-case tracking-normal">(Ð½ÐµÐ¾Ð±Ð¾Ð²&apos;ÑÐ·ÐºÐ¾Ð²Ð¾)</span>
            </label>
            <textarea
              value={features}
              onChange={e => setFeatures(e.target.value)}
              rows={2}
              disabled={noCards}
              placeholder="Ð½Ð°Ð¿ÑÐ¸ÐºÐ»Ð°Ð´: ÑÐ²Ð¸Ð´ÐºÐµ Ð²Ð¸ÑÐ¸ÑÐ°Ð½Ð½Ñ, ÑÐºÑÑÐ½Ð¸Ð¹ Ð¿ÑÐ¸Ð½Ñ TDF, Ð¿ÑÐ´ÑÐ¾Ð´Ð¸ÑÑ Ð´Ð»Ñ ÑÐ»ÑÐ¶Ð±Ð¸"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors resize-none disabled:opacity-40"
            />
          </div>

          {/* ââ Platform ââ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">ÐÐ»Ð°ÑÑÐ¾ÑÐ¼Ð°</label>
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

          {/* ââ Tone ââ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Ð¢Ð¾Ð½</label>
            <div className="flex flex-wrap gap-2">
              {([['professional', 'ÐÑÐ¾ÑÐµÑÑÐ¹Ð½Ð¸Ð¹'], ['friendly', 'ÐÑÑÐ¶Ð½ÑÐ¹'], ['premium', 'ÐÑÐµÐ¼ÑÑÐ¼'], ['simple', 'ÐÑÐ¾ÑÑÐ¸Ð¹']] as const).map(([v, l]) => (
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

          {/* ââ DALL-E toggle â hide if photo uploaded ââ */}
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
              <span className="text-white/60 text-sm">ÐÐµÐ½ÐµÑÑÐ²Ð°ÑÐ¸ Ð·Ð¾Ð±ÑÐ°Ð¶ÐµÐ½Ð½Ñ (DALL-E 3)</span>
            </label>
          )}
        </div>

        {/* ââ Generate button ââ */}
        <button
          onClick={generate}
          disabled={loading || noCards || !productName.trim() || pipelineActive}
          className="mt-6 w-full sm:w-auto bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 px-8 rounded-xl text-base hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ÐÐµÐ½ÐµÑÑÑ...
            </>
          ) : pipelineActive ? (
            <>
              <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ÐÐ±ÑÐ¾Ð±Ð»ÑÑ ÑÐ¾ÑÐ¾...
            </>
          ) : (
            'â¦ ÐÐ³ÐµÐ½ÐµÑÑÐ²Ð°ÑÐ¸ ÐºÐ°ÑÑÐºÑ'
          )}
        </button>
      </div>

      {/* ââ Error ââ */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-300 text-sm mb-5 flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          {error.includes('ÑÐ°ÑÐ¸Ñ') && (
            <Link href="/pricing" className="text-gold underline">ÐÑÐ´Ð²Ð¸ÑÐ¸ÑÐ¸ â</Link>
          )}
        </div>
      )}

      {/* ââ Loading skeleton ââ */}
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

      {/* ââ Result card ââ */}
      {result && !loading && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">

          {/* Header bar */}
          <div className="bg-navy px-5 py-3.5 flex items-center justify-between gap-2">
            <span className="bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full">{platformLabel}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditOpen(v => !v)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${editOpen ? 'bg-gold text-black' : 'bg-white/15 text-white hover:bg-white/25'}`}>
                {editOpen ? 'â ÐÐ°ÐºÑÐ¸ÑÐ¸' : 'â¦ AI ÑÐµÐ´Ð°Ð³ÑÐ²Ð°Ð½Ð½Ñ'}
              </button>
              <span className="text-white/40 text-xs">{result.title.length}/80 ÑÐ¸Ð¼Ð².</span>
              <button
                onClick={copyAll}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                  allCopied ? 'bg-green-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {allCopied ? 'â Ð¡ÐºÐ¾Ð¿ÑÐ¹Ð¾Ð²Ð°Ð½Ð¾!' : 'ð ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸ Ð²ÑÐµ'}
              </button>
            </div>
          </div>

          <div className="p-5 sm:p-7 space-y-5">

            {/* Product image â processed or generated */}
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
                  â¬ ÐÐ°Ð²Ð°Ð½ÑÐ°Ð¶Ð¸ÑÐ¸
                </a>
              </div>
            )}

            {/* Title */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÐÐ°Ð³Ð¾Ð»Ð¾Ð²Ð¾Ðº</span>
                <CopyBtn text={result.title} label="ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸" />
              </div>
              <h2 className="font-display font-bold text-lg text-navy leading-tight">{result.title}</h2>
            </div>

            {/* Description */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÐÐ¿Ð¸Ñ</span>
                <CopyBtn text={result.description} label="ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸" />
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">{result.description}</p>
            </div>

            {/* Bullets */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÐÐµÑÐµÐ²Ð°Ð³Ð¸</span>
                <CopyBtn text={result.bullets.map(b => 'â¢ ' + b).join('\n')} label="ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸" />
              </div>
              <ul className="space-y-2">
                {result.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-navy font-bold mt-0.5 shrink-0">â</span>{b}
                  </li>
                ))}
              </ul>
            </div>

            {/* Keywords */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÐÐ»ÑÑÐ¾Ð²Ñ ÑÐ»Ð¾Ð²Ð°</span>
                <CopyBtn text={result.keywords.join(', ')} label="ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸" />
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
              {allCopied ? 'â ÐÑÐµ ÑÐºÐ¾Ð¿ÑÐ¹Ð¾Ð²Ð°Ð½Ð¾!' : 'ð ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸ Ð²ÑÐµ'}
            </button>
            <button
              onClick={downloadCSV}
              className="bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              â¬ ÐÐ°Ð²Ð°Ð½ÑÐ°Ð¶Ð¸ÑÐ¸ CSV
            </button>
            <button
              onClick={generate}
              className="border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              âº ÐÐ½ÑÐ¸Ð¹ Ð²Ð°ÑÑÐ°Ð½Ñ
            </button>
          </div>

          {/* AI Edit Panel */}
          {editOpen && (
            <div className="mx-5 sm:mx-7 mb-4 border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-navy/5 border-b border-gray-100">
                <p className="text-navy font-bold text-sm">â¦ AI ÑÐµÐ´Ð°Ð³ÑÐ²Ð°Ð½Ð½Ñ ÑÐµÐºÑÑÑ</p>
                <p className="text-gray-400 text-xs mt-0.5">Ð¡ÐºÐ°Ð¶Ð¸ ÑÐ¾ Ð·Ð¼ÑÐ½Ð¸ÑÐ¸ â AI Ð¾Ð½Ð¾Ð²Ð¸ÑÑ ÐºÐ°ÑÑÐºÑ</p>
              </div>
              <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
                {editMsgs.length === 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center py-2">
                    {['ÐÑÐ¾Ð±Ð¸ Ð·Ð°Ð³Ð¾Ð»Ð¾Ð²Ð¾Ðº ÐºÐ¾ÑÐ¾ÑÑÐ¸Ð¼','ÐÐµÑÐµÐ¿Ð¸ÑÐ¸ Ð¾Ð¿Ð¸Ñ Ð¿ÑÐ¾Ð´Ð°ÑÑÐ¸Ð¼','ÐÐ¾Ð´Ð°Ð¹ ÑÐ¸ÑÑÐ¸ Ð² Ð¿ÐµÑÐµÐ²Ð°Ð³Ð¸','ÐÑÐ¾Ð±Ð¸ Ð±ÑÐ»ÑÑ ÐµÐ¼Ð¾ÑÑÐ¹Ð½Ð¸Ð¼'].map(s => (
                      <button key={s} onClick={() => sendEdit(s)} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-navy/40 hover:text-navy">{s}</button>
                    ))}
                  </div>
                )}
                {editMsgs.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-navy text-white' : 'bg-gray-50 text-gray-700 border border-gray-100'}`}>
                      {msg.content}
                      {msg.changedFields && msg.changedFields.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {msg.changedFields.map((f: string) => (
                            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/20 text-navy/70">
                              {f === 'title' ? 'Ð·Ð°Ð³Ð¾Ð»Ð¾Ð²Ð¾Ðº' : f === 'description' ? 'Ð¾Ð¿Ð¸Ñ' : f === 'bullets' ? 'Ð¿ÐµÑÐµÐ²Ð°Ð³Ð¸' : 'ÐºÐ»ÑÑ.ÑÐ»Ð¾Ð²Ð°'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {editLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-navy/40 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                        <span className="w-1.5 h-1.5 bg-navy/40 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                        <span className="w-1.5 h-1.5 bg-navy/40 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={editEndRef} />
              </div>
              <div className="p-3 border-t border-gray-100 flex gap-2">
                <input type="text" value={editInput} onChange={e => setEditInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendEdit(editInput); }} placeholder="Ð©Ð¾ Ð·Ð¼ÑÐ½Ð¸ÑÐ¸? (Enter)" disabled={editLoading} className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy/40 disabled:opacity-50" />
                <button onClick={() => sendEdit(editInput)} disabled={editLoading || !editInput.trim()} className="bg-navy text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-40">â</button>
              </div>
            </div>
          )}

        {/* AI ÐÐ½ÑÐ¾Ð³ÑÐ°ÑÑÐºÐ° â Ð¿Ð¾ÑÐ¸Ð»Ð°Ð½Ð½Ñ Ð½Ð° ÐºÐ°ÑÑÐºÑ */}
        {cardId && (
          <div className="mt-4 bg-white/[0.04] border border-white/10 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-sm">ð AI ÐÐ½ÑÐ¾Ð³ÑÐ°ÑÑÐºÐ°</h3>
              <p className="text-white/35 text-xs mt-0.5">3 Ð²Ð°ÑÑÐ°Ð½ÑÐ¸ Â· DALL-E 3 Â· 1024Ã1024</p>
            </div>
            <a href={`/card/${cardId}`} className="bg-gold text-black font-bold px-4 py-2 rounded-xl text-sm hover:bg-gold/80 transition-colors">
              ÐÑÐ´ÐºÑÐ¸ÑÐ¸ ÐºÐ°ÑÑÐºÑ â
            </a>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
