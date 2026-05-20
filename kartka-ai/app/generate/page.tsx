'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import type { CardResult, Platform, Tone, Lang } from '@/types';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'prom', label: 'Prom.ua' },
  { value: 'rozetka', label: 'Rozetka' },
  { value: 'olx', label: 'OLX' },
  { value: 'general', label: 'Загальний' },
];

type PhotoStep = 'idle' | 'analyzing' | 'cropping' | 'removing_bg' | 'done' | 'error';
const STEP_LABELS: Record<PhotoStep, string> = {
  idle: '', analyzing: 'AI аналізує товар...', cropping: 'Обрізаю зображення...',
  removing_bg: 'Видаляю фон...', done: 'Фото готове ✓', error: 'Помилка обробки',
};

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  function copy() { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }
  return (
    <button onClick={copy} className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all border ${ok ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'}`}>
      {ok ? '✓' : label}
    </button>
  );
}

function PhotoStepBadge({ step }: { step: PhotoStep }) {
  if (step === 'idle' || step === 'done') return null;
  const isError = step === 'error';
  return (
    <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full mt-2 ${isError ? 'bg-red-500/15 text-red-400' : 'bg-gold/10 text-gold'}`}>
      {!isError && <span className="w-3 h-3 border border-gold border-t-transparent rounded-full animate-spin shrink-0" />}
      {STEP_LABELS[step]}
    </div>
  );
}

export default function GeneratePage() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(false);
  const [cardsLeft, setCardsLeft] = useState(0);
  const [starsBalance, setStarsBalance] = useState(0);
  const [accessToken, setAccessToken] = useState('');

  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [features, setFeatures] = useState('');
  const [platform, setPlatform] = useState<Platform>('prom');
  const [tone, setTone] = useState<Tone>('professional');
  const [lang, setLang] = useState<Lang>('uk');
  const [genImage, setGenImage] = useState(true);

  const [photoStep, setPhotoStep] = useState<PhotoStep>('idle');
  const [photoError, setPhotoError] = useState('');
  const [originalPhoto, setOriginalPhoto] = useState<string | null>(null);
  const [processedPhoto, setProcessedPhoto] = useState<string | null>(null);
  const [uploadedPhotoName, setUploadedPhotoName] = useState('');
  const [analyzeData, setAnalyzeData] = useState<Record<string, unknown> | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CardResult | null>(null);
  const [error, setError] = useState('');
  const [needStars, setNeedStars] = useState(false);
  const [allCopied, setAllCopied] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editMsgs, setEditMsgs] = useState<{ role: 'user' | 'assistant'; content: string; changedFields?: string[] }[]>([]);
  const [editInput, setEditInput] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const editEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
      supabase.from('users').select('cards_left, stars_balance').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (data) { setCardsLeft(data.cards_left ?? 0); setStarsBalance(data.stars_balance ?? 0); }
          setReady(true);
        });
    });

    // Слухаємо оновлення балансу зорь
    const handler = (e: any) => setStarsBalance(e.detail.newBalance);
    window.addEventListener('stars-updated', handler);
    return () => window.removeEventListener('stars-updated', handler);
  }, []);

  async function runPhotoPipeline(base64: string) {
    setPhotoError(''); setProcessedPhoto(null); setAnalyzeData(null);
    try {
      setPhotoStep('analyzing');
      const analyzeRes = await fetch('/api/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ imageBase64: base64, lang }),
      });
      const analyzed = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzed.error || 'Помилка аналізу фото');
      if (analyzed.productName && !productName) setProductName(analyzed.productName);
      if (analyzed.category) setCategory(analyzed.category);
      if (analyzed.bullets?.length && !features) setFeatures(analyzed.bullets.slice(0, 3).join(', '));
      setAnalyzeData(analyzed);
      const shouldSkipProcessing = analyzed.keepBackground || (analyzed.bbox?.w > 0.92 && analyzed.bbox?.h > 0.92);
      if (shouldSkipProcessing) { setProcessedPhoto(base64); setPhotoStep('done'); return; }

      setPhotoStep('cropping');
      const cropRes = await fetch('/api/crop-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const cropData = await cropRes.json();
      if (!cropRes.ok) throw new Error(cropData.error || 'Помилка обрізки');

      setPhotoStep('removing_bg');
      const bgRes = await fetch('/api/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ imageBase64: cropData.croppedBase64 }),
      });
      const bgData = await bgRes.json();
      setProcessedPhoto(bgRes.ok ? bgData.imageBase64 : cropData.croppedBase64);
      setPhotoStep('done');
    } catch (err: unknown) {
      setPhotoError(err instanceof Error ? err.message : 'Помилка обробки фото');
      setPhotoStep('error');
      setProcessedPhoto(base64);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = () => { const b64 = reader.result as string; setOriginalPhoto(b64); runPhotoPipeline(b64); };
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setOriginalPhoto(null); setProcessedPhoto(null); setAnalyzeData(null);
    setPhotoStep('idle'); setPhotoError(''); setUploadedPhotoName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function compressForApi(base64: string): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(base64);
      img.src = base64;
    });
  }

  const generate = useCallback(async () => {
    if (!productName.trim() || loading) return;
    const hasStars = starsBalance >= 2;
    const hasCards = cardsLeft > 0;
    if (!hasStars && !hasCards) { setNeedStars(true); setError('Недостатньо зорь ⭐. Поповни баланс щоб продовжити.'); return; }

    setLoading(true); setError(''); setResult(null); setNeedStars(false);
    try {
      const rawPhoto = processedPhoto ?? originalPhoto ?? null;
      const photoToSend = rawPhoto ? await compressForApi(rawPhoto) : null;
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ productName, category, features, platform, tone, lang, generateImage: genImage && !photoToSend, uploadedPhoto: photoToSend }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needStars) { setNeedStars(true); setStarsBalance(data.balance ?? 0); }
        throw new Error(data.error || 'Помилка генерації');
      }
      setResult(data);
      setCardId(data.cardId ?? null);
      setEditMsgs([]); setEditOpen(false);
      // Оновлюємо баланс
      if (typeof data.newBalance === 'number') {
        setStarsBalance(data.newBalance);
        window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: data.newBalance } }));
      } else {
        setCardsLeft(c => Math.max(0, c - 1));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка сервера. Спробуй ще раз.');
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, category, features, platform, tone, lang, genImage, processedPhoto, originalPhoto, starsBalance, cardsLeft, loading, accessToken]);

  async function sendEdit(text: string) {
    if (!text.trim() || !result || editLoading) return;
    setEditMsgs(prev => [...prev, { role: 'user' as const, content: text }]);
    setEditInput(''); setEditLoading(true);
    try {
      const res = await fetch('/api/edit-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ cardId, userMessage: text, card: { product_name: productName, platform, title: result.title, description: result.description, bullets: result.bullets, keywords: result.keywords }, history: editMsgs.slice(-6) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка AI');
      if (data.diff && Object.keys(data.diff).length > 0) setResult(prev => prev ? { ...prev, ...data.diff } : prev);
      setEditMsgs(prev => [...prev, { role: 'assistant' as const, content: data.explanation ?? 'Готово', changedFields: data.changedFields }]);
    } catch (err: unknown) {
      setEditMsgs(prev => [...prev, { role: 'assistant' as const, content: '⚠️ ' + (err instanceof Error ? err.message : 'Помилка') }]);
    }
    setEditLoading(false);
  }

  function copyAll() {
    if (!result) return;
    const text = [result.title, '', result.description, '', 'Переваги:', ...result.bullets.map(b => '• ' + b), '', 'Ключові слова: ' + result.keywords.join(', ')].join('\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true); setTimeout(() => setAllCopied(false), 2000);
  }

  function downloadCSV() {
    if (!result) return;
    const rows = [['Назва', 'Опис', 'Переваги', 'Ключові слова', 'Платформа', 'Зображення'], [result.title, result.description, result.bullets.join(' | '), result.keywords.join(', '), platform, result.imageUrl || '']];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })), download: `kartka-${Date.now()}.csv` });
    a.click();
  }

  if (!ready) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" /></div>;

  const isLowStars = starsBalance < 4;
  const canGenerate = starsBalance >= 2 || cardsLeft > 0;
  const platformLabel = PLATFORMS.find(p => p.value === platform)?.label ?? platform;
  const pipelineActive = photoStep !== 'idle' && photoStep !== 'done' && photoStep !== 'error';

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-3">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors shrink-0">← Кабінет</Link>
        <div className="flex items-center gap-2">
          {/* Stars balance */}
          <Link href="/pricing" className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-all ${isLowStars ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/10 text-white border-white/15 hover:border-gold/40 hover:text-gold'}`}>
            <span>⭐</span><span>{starsBalance}</span>
          </Link>
          <Link href="/pricing" className="flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white border border-indigo-500 hover:bg-indigo-500 transition-colors">
            <span className="text-xs">+</span><span>Поповнити</span>
          </Link>
        </div>
      </div>

      <h1 className="font-display font-black text-2xl sm:text-3xl mb-6 tracking-tight">✦ Генератор картки</h1>

      {/* Low stars / no stars banner */}
      {!canGenerate && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-red-300 font-semibold text-sm">⭐ Зорі закінчились</p>
            <p className="text-white/45 text-xs mt-0.5">Поповни баланс — генерація тексту коштує 2 ⭐</p>
          </div>
          <Link href="/pricing" className="bg-gold text-black px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors shrink-0">Поповнити ⭐ →</Link>
        </div>
      )}
      {canGenerate && isLowStars && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3">
          <p className="text-yellow-300 text-sm">⭐ Залишилось {starsBalance} зорь — вистачить ще на {Math.floor(starsBalance / 2)} генерацій</p>
          <Link href="/pricing" className="text-gold text-sm font-semibold hover:underline shrink-0">Поповнити →</Link>
        </div>
      )}

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 sm:p-7 mb-5">
        <div className="space-y-5">
          {/* Photo upload */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              Фото товару <span className="text-white/30 font-normal normal-case tracking-normal">— AI розпізнає, обріже та видалить фон автоматично</span>
            </label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <div onClick={() => !originalPhoto && fileRef.current?.click()} className={`border-2 border-dashed rounded-xl p-5 transition-all ${originalPhoto ? 'border-gold/50 bg-gold/5 cursor-default' : 'border-white/10 hover:border-white/25 cursor-pointer'}`}>
              {originalPhoto ? (
                <div className="flex items-start gap-4">
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative"><img src={originalPhoto} alt="original" className="w-16 h-16 object-cover rounded-lg opacity-40" /><span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/40 whitespace-nowrap">оригінал</span></div>
                    <span className="text-white/20 text-lg">→</span>
                    <div className="relative">
                      {processedPhoto ? (<><img src={processedPhoto} alt="processed" className="w-16 h-16 object-contain rounded-lg bg-white/5" /><span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-gold whitespace-nowrap">готове</span></>) : (<div className="w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center"><span className="w-5 h-5 border-2 border-gold/50 border-t-gold rounded-full animate-spin" /></div>)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{uploadedPhotoName}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {(['analyzing', 'cropping', 'removing_bg'] as PhotoStep[]).map((s, i) => {
                        const steps: PhotoStep[] = ['analyzing', 'cropping', 'removing_bg'];
                        const currentIdx = steps.indexOf(photoStep);
                        const isDone = photoStep === 'done' || currentIdx > i;
                        const isActive = photoStep === s;
                        return (<div key={s} className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full transition-all ${isDone ? 'bg-gold' : isActive ? 'bg-gold/60 animate-pulse' : 'bg-white/15'}`} />{i < 2 && <div className="w-4 h-px bg-white/10" />}</div>);
                      })}
                    </div>
                    <PhotoStepBadge step={photoStep} />
                    {photoStep === 'done' && <p className="text-gold text-xs mt-2 font-medium">✓ Фон видалено, товар готовий</p>}
                    {analyzeData && photoStep === 'done' && <p className="text-white/40 text-xs mt-1 truncate">AI визначив: {analyzeData.category as string}</p>}
                    {photoError && <p className="text-red-400 text-xs mt-1">{photoError} — використаю оригінал</p>}
                    <button onClick={e => { e.stopPropagation(); clearPhoto(); }} className="text-white/30 text-xs hover:text-red-400 mt-2 transition-colors">Видалити фото ×</button>
                  </div>
                </div>
              ) : (
                <div className="text-center"><div className="text-3xl mb-2">📸</div><p className="text-white/50 text-sm">Натисни щоб завантажити фото товару</p><p className="text-white/25 text-xs mt-1">JPG, PNG до 10 МБ · AI обріже та видалить фон</p></div>
              )}
            </div>
          </div>

          {/* Product name */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Назва товару * {analyzeData && <span className="text-white/30 font-normal normal-case tracking-normal">— заповнено AI з фото</span>}</label>
            <input value={productName} onChange={e => setProductName(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()} placeholder="наприклад: Тактична футболка selion veteran чорна" disabled={!canGenerate} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors disabled:opacity-40" />
          </div>

          {/* Category + Lang */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Категорія</label>
              <select value={category} onChange={e => setCategory(e.target.value)} disabled={!canGenerate} className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40">
                <option value="">— вибери —</option>
                {['Електроніка','Одяг та взуття','Тактичне спорядження','Дім та сад',"Краса та здоров'я",'Спорт та хобі','Авто та мото','Іграшки','Інше'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Мова</label>
              <select value={lang} onChange={e => setLang(e.target.value as Lang)} disabled={!canGenerate} className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40">
                <option value="uk">Українська</option>
                <option value="ru">Російська</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* Features */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Особливості <span className="text-white/30 font-normal normal-case tracking-normal">(необов&apos;язково)</span></label>
            <textarea value={features} onChange={e => setFeatures(e.target.value)} rows={2} disabled={!canGenerate} placeholder="наприклад: швидке висихання, якісний принт TDF, підходить для служби" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors resize-none disabled:opacity-40" />
          </div>

          {/* Platform */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Платформа</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PLATFORMS.map(p => (<button key={p.value} onClick={() => setPlatform(p.value)} disabled={!canGenerate} className={`shrink-0 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${platform === p.value ? 'bg-gold/15 border-gold text-gold' : 'border-white/10 text-white/50 hover:border-white/25'}`}>{p.label}</button>))}
            </div>
          </div>

          {/* Tone */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Тон</label>
            <div className="flex flex-wrap gap-2">
              {([['professional','Професійний'],['friendly','Дружній'],['premium','Преміум'],['simple','Простий']] as const).map(([v, l]) => (<button key={v} onClick={() => setTone(v as Tone)} disabled={!canGenerate} className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${tone === v ? 'bg-gold/15 border-gold text-gold' : 'border-white/10 text-white/50 hover:border-white/25'}`}>{l}</button>))}
            </div>
          </div>

          {/* DALL-E toggle */}
          {!originalPhoto && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button type="button" onClick={() => setGenImage(v => !v)} disabled={!canGenerate} className={`w-10 h-6 rounded-full transition-colors shrink-0 relative ${genImage ? 'bg-gold' : 'bg-white/15'}`}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: genImage ? '18px' : '2px' }} />
              </button>
              <span className="text-white/60 text-sm">Генерувати зображення (DALL-E 3)</span>
            </label>
          )}
        </div>

        {/* Generate button */}
        <button onClick={generate} disabled={loading || !canGenerate || !productName.trim() || pipelineActive}
          className="mt-6 w-full sm:w-auto bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 px-8 rounded-xl text-base hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {loading ? (<><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />Генерую...</>)
            : pipelineActive ? (<><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />Обробляю фото...</>)
            : (<>✦ Згенерувати картку <span className="text-black/50 text-sm ml-1">2 ⭐</span></>)}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-300 text-sm mb-5 flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          {needStars && <Link href="/pricing" className="bg-gold text-black px-4 py-1.5 rounded-lg font-bold text-sm">Поповнити ⭐</Link>}
        </div>
      )}

      {/* Loading skeleton */}
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

      {/* Result card */}
      {result && !loading && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-navy px-5 py-3.5 flex items-center justify-between gap-2">
            <span className="bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full">{platformLabel}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditOpen(v => !v)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${editOpen ? 'bg-gold text-black' : 'bg-white/15 text-white hover:bg-white/25'}`}>{editOpen ? '✕ Закрити' : '✦ AI редагування'}</button>
              <span className="text-white/40 text-xs">{result.title.length}/80 симв.</span>
              <button onClick={copyAll} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${allCopied ? 'bg-green-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'}`}>{allCopied ? '✓ Скопійовано!' : '📋 Копіювати все'}</button>
            </div>
          </div>
          <div className="p-5 sm:p-7 space-y-5">
            {(processedPhoto || result.imageUrl) && (
              <div className="relative group">
                <img src={processedPhoto ?? result.imageUrl} alt={result.title} className={`w-full rounded-xl object-contain ${processedPhoto ? 'h-56 bg-gray-50' : 'h-48 sm:h-64 object-cover'}`} />
                <a href={processedPhoto ?? result.imageUrl} download={`product-${Date.now()}.${processedPhoto ? 'png' : 'jpg'}`} target="_blank" rel="noreferrer" className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity font-semibold">⬇ Завантажити</a>
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-4"><div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Заголовок</span><CopyBtn text={result.title} label="Копіювати" /></div><h2 className="font-display font-bold text-lg text-navy leading-tight">{result.title}</h2></div>
            <div className="bg-gray-50 rounded-xl p-4"><div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Опис</span><CopyBtn text={result.description} label="Копіювати" /></div><p className="text-gray-700 text-sm leading-relaxed">{result.description}</p></div>
            <div className="bg-gray-50 rounded-xl p-4"><div className="flex items-center justify-between mb-3"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Переваги</span><CopyBtn text={result.bullets.map(b => '• ' + b).join('\n')} label="Копіювати" /></div><ul className="space-y-2">{result.bullets.map((b, i) => (<li key={i} className="flex items-start gap-2 text-sm text-gray-700"><span className="text-navy font-bold mt-0.5 shrink-0">✓</span>{b}</li>))}</ul></div>
            <div className="bg-gray-50 rounded-xl p-4"><div className="flex items-center justify-between mb-3"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ключові слова</span><CopyBtn text={result.keywords.join(', ')} label="Копіювати" /></div><div className="flex flex-wrap gap-2">{result.keywords.map(k => (<button key={k} onClick={() => navigator.clipboard.writeText(k)} className="bg-blue-50 text-navy text-xs font-medium px-3 py-1 rounded-full hover:bg-blue-100 transition-colors cursor-copy">{k}</button>))}</div></div>
          </div>
          <div className="px-5 sm:px-7 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={copyAll} className={`px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${allCopied ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>{allCopied ? '✓ Все скопійовано!' : '📋 Копіювати все'}</button>
            <button onClick={downloadCSV} className="bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2">⬇ Завантажити CSV</button>
            <button onClick={generate} className="border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2">↺ Інший варіант</button>
          </div>
          {editOpen && (
            <div className="mx-5 sm:mx-7 mb-4 border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-navy/5 border-b border-gray-100"><p className="text-navy font-bold text-sm">✦ AI редагування тексту</p><p className="text-gray-400 text-xs mt-0.5">Скажи що змінити — AI оновить картку</p></div>
              <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
                {editMsgs.length === 0 && (<div className="flex flex-wrap gap-1.5 justify-center py-2">{['Зроби заголовок коротшим','Перепиши опис продаючим','Додай цифри в переваги','Зроби більш емоційним'].map(s => (<button key={s} onClick={() => sendEdit(s)} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-navy/40 hover:text-navy">{s}</button>))}</div>)}
                {editMsgs.map((msg, i) => (<div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-navy text-white' : 'bg-gray-50 text-gray-700 border border-gray-100'}`}>{msg.content}{msg.changedFields && msg.changedFields.length > 0 && (<div className="flex flex-wrap gap-1 mt-1">{msg.changedFields.map((f: string) => (<span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/20 text-navy/70">{f === 'title' ? 'заголовок' : f === 'description' ? 'опис' : f === 'bullets' ? 'переваги' : 'ключ.слова'}</span>))}</div>)}</div></div>))}
                {editLoading && (<div className="flex justify-start"><div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100"><div className="flex gap-1"><span className="w-1.5 h-1.5 bg-navy/40 rounded-full animate-bounce" style={{animationDelay:'0ms'}} /><span className="w-1.5 h-1.5 bg-navy/40 rounded-full animate-bounce" style={{animationDelay:'150ms'}} /><span className="w-1.5 h-1.5 bg-navy/40 rounded-full animate-bounce" style={{animationDelay:'300ms'}} /></div></div></div>)}
                <div ref={editEndRef} />
              </div>
              <div className="p-3 border-t border-gray-100 flex gap-2">
                <input type="text" value={editInput} onChange={e => setEditInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendEdit(editInput); }} placeholder="Що змінити? (Enter)" disabled={editLoading} className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy/40 disabled:opacity-50" />
                <button onClick={() => sendEdit(editInput)} disabled={editLoading || !editInput.trim()} className="bg-navy text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-40">↑</button>
              </div>
            </div>
          )}
          {cardId && (
            <div className="mx-5 sm:mx-7 mb-6 bg-white/[0.04] border border-white/10 rounded-2xl p-5 flex items-center justify-between">
              <div><h3 className="text-white font-bold text-sm">📊 AI Інфографіка</h3><p className="text-white/35 text-xs mt-0.5">3 варіанти · DALL-E 3 · 1024×1024</p></div>
              <a href={`/card/${cardId}`} className="bg-gold text-black font-bold px-4 py-2 rounded-xl text-sm hover:bg-gold/80 transition-colors">Відкрити картку →</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
