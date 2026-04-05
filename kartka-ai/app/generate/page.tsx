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
 
function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setOk(true);
    setTimeout(() => setOk(false), 2000);
  }
  return (
    <button onClick={copy}
      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all border ${ok ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'}`}>
      {ok ? '✓' : label}
    </button>
  );
}
 
export default function GeneratePage() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
 
  const [ready, setReady] = useState(false);
  const [cardsLeft, setCardsLeft] = useState(0);
  const [accessToken, setAccessToken] = useState('');
 
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [features, setFeatures] = useState('');
  const [platform, setPlatform] = useState<Platform>('prom');
  const [tone, setTone] = useState<Tone>('professional');
  const [lang, setLang] = useState<Lang>('uk');
  const [genImage, setGenImage] = useState(true);
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [uploadedPhotoName, setUploadedPhotoName] = useState('');
 
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CardResult | null>(null);
  const [error, setError] = useState('');
  const [allCopied, setAllCopied] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);

  // AI Edit state
  const [editOpen,    setEditOpen]    = useState(false);
  const [editMsgs,    setEditMsgs]    = useState<{role:'user'|'assistant';content:string;changedFields?:string[]}[]>([]);
  const [editInput,   setEditInput]   = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [lastChanged, setLastChanged] = useState<string[]>([]);
  const editEndRef = useRef<HTMLDivElement>(null);

  // Infographic state
  const [infOpen,     setInfOpen]     = useState(false);
  const [infVariants, setInfVariants] = useState<{url:string;label:string;prompt:string}[]>([]);
  const [infSelected, setInfSelected] = useState<number|null>(null);
  const [infLoading,  setInfLoading]  = useState(false);
  const [infStep,     setInfStep]     = useState('');
  const [infError,    setInfError]    = useState('');
  const [infEditOpen, setInfEditOpen] = useState(false);
  const [infEditMsgs, setInfEditMsgs] = useState<{role:'user'|'assistant';content:string}[]>([]);
  const [infEditInput,setInfEditInput]= useState('');
  const [infEditing,  setInfEditing]  = useState(false);
  const infEndRef = useRef<HTMLDivElement>(null);
 
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
      supabase.from('users').select('cards_left').eq('id', session.user.id).single()
        .then(({ data }) => { if (data) setCardsLeft(data.cards_left); setReady(true); });
    });
  }, []);
 
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = () => setUploadedPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }
 
  const generate = useCallback(async () => {
    if (!productName.trim() || loading) return;
    if (cardsLeft <= 0) { setError('Ліміт вичерпано. Підвищ тариф.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          productName, category, features, platform, tone, lang,
          generateImage: genImage,
          uploadedPhoto: uploadedPhoto,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка генерації');
      setResult(data);
      setCardId(data.cardId ?? null);
      setEditMsgs([]);
      setInfVariants([]);
      setInfSelected(null);
      setEditOpen(false);
      setInfOpen(false);
      setCardsLeft(c => Math.max(0, c - 1));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка сервера. Спробуй ще раз.');
    }
    setLoading(false);
  }, [productName, category, features, platform, tone, lang, genImage, uploadedPhoto, cardsLeft, loading, accessToken]);
 
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
      [result.title, result.description, result.bullets.join(' | '), result.keywords.join(', '), platform, result.imageUrl || ''],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `kartka-${Date.now()}.csv`,
    });
    a.click();
  }
 
  useEffect(() => { editEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [editMsgs, editLoading]);
  useEffect(() => { infEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [infEditMsgs, infEditing]);

  // AI text edit
  async function sendEdit(text: string) {
    if (!text.trim() || !result || editLoading) return;
    setEditMsgs(prev => [...prev, { role:'user', content: text }]);
    setEditInput('');
    setEditLoading(true);
    setLastChanged([]);
    try {
      const res = await fetch('/api/edit-card', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${accessToken}` },
        body: JSON.stringify({
          cardId,
          userMessage: text,
          card: { product_name: productName, platform, title: result.title, description: result.description, bullets: result.bullets, keywords: result.keywords },
          history: editMsgs.slice(-6),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка AI');
      if (data.diff && Object.keys(data.diff).length > 0) {
        setResult(prev => prev ? { ...prev, ...data.diff } : prev);
        setLastChanged(data.changedFields ?? []);
      }
      setEditMsgs(prev => [...prev, { role:'assistant', content: data.explanation ?? 'Готово', changedFields: data.changedFields }]);
    } catch (err: unknown) {
      setEditMsgs(prev => [...prev, { role:'assistant', content:'⚠️ ' + (err instanceof Error ? err.message : 'Помилка') }]);
    }
    setEditLoading(false);
  }

  // Generate infographic
  async function generateInfographic() {
    if (!result) return;
    setInfLoading(true);
    setInfError('');
    setInfVariants([]);
    setInfSelected(null);
    setInfEditOpen(false);
    setInfEditMsgs([]);
    try {
      setInfStep('🔍 GPT-4o аналізує товар...');
      await new Promise(r => setTimeout(r, 400));
      setInfStep('🎨 DALL-E 3 генерує 3 варіанти паралельно...');
      const res = await fetch('/api/generate-infographic', {
        method:'POST',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${accessToken}`},
        body: JSON.stringify({
          imageUrl: result.imageUrl || null,
          imageBase64: !result.imageUrl ? uploadedPhoto : null,
          productName: productName || result.title,
          description: result.description,
          bullets: result.bullets,
          platform,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка генерації');
      setInfVariants(data.variants ?? []);
      if (data.variants?.length > 0) setInfSelected(0);
      setInfStep('');
    } catch (err: unknown) {
      setInfError(err instanceof Error ? err.message : 'Помилка');
      setInfStep('');
    }
    setInfLoading(false);
  }

  // Edit infographic
  async function sendInfEdit(text: string) {
    if (!text.trim() || infSelected === null || infEditing) return;
    const current = infVariants[infSelected];
    if (!current) return;
    setInfEditMsgs(prev => [...prev, { role:'user', content: text }]);
    setInfEditInput('');
    setInfEditing(true);
    try {
      const res = await fetch('/api/edit-infographic', {
        method:'POST',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${accessToken}`},
        body: JSON.stringify({
          userMessage: text,
          currentImageUrl: current.url,
          originalPrompt: current.prompt,
          productName: productName || result?.title || '',
          bullets: result?.bullets || [],
          history: infEditMsgs.slice(-4),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка');
      setInfVariants(prev => prev.map((v,i) => i === infSelected ? {...v, url: data.imageUrl, prompt: data.newPrompt} : v));
      setInfEditMsgs(prev => [...prev, { role:'assistant', content: data.explanation }]);
    } catch (err: unknown) {
      setInfEditMsgs(prev => [...prev, { role:'assistant', content:'⚠️ ' + (err instanceof Error ? err.message : 'Помилка') }]);
    }
    setInfEditing(false);
  }

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );
 
  const noCards = cardsLeft <= 0;
  const platformLabel = PLATFORMS.find(p => p.value === platform)?.label ?? platform;
 
  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8 gap-3">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors shrink-0">← Кабінет</Link>
        <span className={`text-sm font-bold ${noCards ? 'text-red-400' : 'text-gold'}`}>
          Залишок: {cardsLeft === 99999 ? '∞' : cardsLeft} карточок
        </span>
      </div>
 
      <h1 className="font-display font-black text-2xl sm:text-3xl mb-6 tracking-tight">✦ Генератор картки</h1>
 
      {noCards && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-red-300 text-sm">Ліміт карточок вичерпано.</p>
          <Link href="/pricing" className="bg-gold text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-gold-light transition-colors shrink-0">Підвищити →</Link>
        </div>
      )}
 
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 sm:p-7 mb-5">
        <div className="space-y-5">
 
          {/* Product name */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Назва товару *</label>
            <input value={productName} onChange={e => setProductName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="наприклад: Тактична футболка selion veteran чорна" disabled={noCards}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors disabled:opacity-40" />
          </div>
 
          {/* Category + Lang */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Категорія</label>
              <select value={category} onChange={e => setCategory(e.target.value)} disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40">
                <option value="">— вибери —</option>
                {['Електроніка','Одяг та взуття','Дім та сад',"Краса та здоров'я",'Спорт та хобі','Авто та мото','Іграшки','Інше'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Мова</label>
              <select value={lang} onChange={e => setLang(e.target.value as Lang)} disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40">
                <option value="uk">Українська</option>
                <option value="ru">Російська</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
 
          {/* Features */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Особливості (необов'язково)</label>
            <textarea value={features} onChange={e => setFeatures(e.target.value)} rows={2} disabled={noCards}
              placeholder="наприклад: швидке висихання, якісний принт TDF, підходить для служби"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors resize-none disabled:opacity-40" />
          </div>
 
          {/* Photo upload */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              Фото товару <span className="text-white/30 font-normal normal-case tracking-normal">— AI створить унікальний банер з вашого фото</span>
            </label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${uploadedPhoto ? 'border-gold/50 bg-gold/5' : 'border-white/10 hover:border-white/25'}`}>
              {uploadedPhoto ? (
                <div className="flex items-center gap-3">
                  <img src={uploadedPhoto} alt="preview" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold truncate">{uploadedPhotoName}</p>
                    <p className="text-gold text-xs mt-0.5">AI проаналізує фото та створить банер ✓</p>
                    <button onClick={e => { e.stopPropagation(); setUploadedPhoto(null); setUploadedPhotoName(''); }}
                      className="text-white/30 text-xs hover:text-red-400 mt-1 transition-colors">
                      Видалити фото ×
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-3xl mb-2">📸</div>
                  <p className="text-white/50 text-sm">Натисни щоб завантажити фото товару</p>
                  <p className="text-white/25 text-xs mt-1">JPG, PNG до 10 МБ</p>
                </div>
              )}
            </div>
          </div>
 
          {/* Platform */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Платформа</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PLATFORMS.map(p => (
                <button key={p.value} onClick={() => setPlatform(p.value)} disabled={noCards}
                  className={`shrink-0 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${platform === p.value ? 'bg-gold/15 border-gold text-gold' : 'border-white/10 text-white/50 hover:border-white/25'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
 
          {/* Tone */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Тон</label>
            <div className="flex flex-wrap gap-2">
              {[['professional','Професійний'],['friendly','Дружній'],['premium','Преміум'],['simple','Простий']].map(([v, l]) => (
                <button key={v} onClick={() => setTone(v as Tone)} disabled={noCards}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${tone === v ? 'bg-gold/15 border-gold text-gold' : 'border-white/10 text-white/50 hover:border-white/25'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
 
          {/* Image toggle — show only if no photo uploaded */}
          {!uploadedPhoto && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button type="button" onClick={() => setGenImage(v => !v)} disabled={noCards}
                className={`w-10 h-6 rounded-full transition-colors shrink-0 relative ${genImage ? 'bg-gold' : 'bg-white/15'}`}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: genImage ? '18px' : '2px' }} />
              </button>
              <span className="text-white/60 text-sm">Генерувати зображення (DALL-E 3)</span>
            </label>
          )}
        </div>
 
        <button onClick={generate} disabled={loading || noCards || !productName.trim()}
          className="mt-6 w-full sm:w-auto bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 px-8 rounded-xl text-base hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {loading
            ? <><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Генерую...</>
            : '✦ Згенерувати картку'}
        </button>
      </div>
 
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-300 text-sm mb-5 flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          {error.includes('тариф') && <Link href="/pricing" className="text-gold underline">Підвищити →</Link>}
        </div>
      )}
 
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
 
      {result && !loading && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="bg-navy px-5 py-3.5 flex items-center justify-between gap-2">
            <span className="bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full">{platformLabel}</span>
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-xs">{result.title.length}/80 симв.</span>
              <button
                onClick={() => { setEditOpen(v => !v); }}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${editOpen ? 'bg-gold text-black' : 'bg-white/15 text-white hover:bg-white/25'}`}>
                {editOpen ? '✕ Закрити' : '✦ AI редагування'}
              </button>
              <button onClick={copyAll}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${allCopied ? 'bg-green-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'}`}>
                {allCopied ? '✓ Скопійовано!' : '📋 Все'}
              </button>
            </div>
          </div>
 
          <div className="p-5 sm:p-7 space-y-5">
            {/* Image */}
            {result.imageUrl && (
              <div className="relative group">
                <img src={result.imageUrl} alt={result.title} className="w-full h-48 sm:h-64 object-cover rounded-xl" />
                <a href={result.imageUrl} download={`banner-${Date.now()}.jpg`} target="_blank" rel="noreferrer"
                  className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                  ⬇ Завантажити фото
                </a>
              </div>
            )}
 
            {/* Title */}
            <div className={`rounded-xl p-4 transition-colors duration-500 ${lastChanged.includes('title') ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Заголовок</span>
                <CopyBtn text={result.title} label="Копіювати" />
              </div>
              <h2 className="font-display font-bold text-lg text-navy leading-tight">{result.title}</h2>
            </div>
 
            {/* Description */}
            <div className={`rounded-xl p-4 transition-colors duration-500 ${lastChanged.includes('description') ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-gray-50'}`}>
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
                  <button key={k} onClick={() => navigator.clipboard.writeText(k)}
                    className="bg-blue-50 text-navy text-xs font-medium px-3 py-1 rounded-full hover:bg-blue-100 transition-colors cursor-copy">
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>
 
          {/* Actions */}
          <div className="px-5 sm:px-7 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={copyAll}
              className={`px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${allCopied ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
              {allCopied ? '✓ Все скопійовано!' : '📋 Копіювати все'}
            </button>
            <button onClick={downloadCSV}
              className="bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
              ⬇ Завантажити CSV
            </button>
            <button onClick={generate}
              className="border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2">
              ↺ Інший варіант
            </button>
          </div>

          {/* ── AI EDIT CHAT ─────────────────────────────────────── */}
          {editOpen && (
            <div className="mx-5 sm:mx-7 mb-5 bg-black/5 rounded-2xl overflow-hidden border border-gray-100">
              <div className="px-4 py-3 bg-navy/5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-navy font-bold text-sm">✦ AI редагування тексту</span>
                  <p className="text-gray-400 text-xs mt-0.5">Скажи що змінити — AI оновить картку</p>
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                {editMsgs.length === 0 && (
                  <div className="text-center py-3">
                    <p className="text-gray-400 text-xs mb-2">Швидкі запити:</p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {['Зроби заголовок коротшим','Перепиши опис продаючим','Додай цифри в переваги','Зроби більш емоційним'].map(s => (
                        <button key={s} onClick={() => sendEdit(s)}
                          className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-navy/40 hover:text-navy transition-all">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {editMsgs.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-navy text-white rounded-br-sm' : 'bg-white text-gray-700 rounded-bl-sm border border-gray-100'}`}>
                      {msg.content}
                      {msg.changedFields && msg.changedFields.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {msg.changedFields.map(f => (
                            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/20 text-navy/70">
                              {f === 'title' ? 'заголовок' : f === 'description' ? 'опис' : f === 'bullets' ? 'переваги' : f === 'keywords' ? 'ключ.слова' : f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {editLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white rounded-xl rounded-bl-sm px-3 py-2 border border-gray-100">
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
                <input
                  type="text"
                  value={editInput}
                  onChange={e => setEditInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendEdit(editInput); }}
                  placeholder="Що змінити? (Enter)"
                  disabled={editLoading}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-navy/40 disabled:opacity-50"
                />
                <button onClick={() => sendEdit(editInput)} disabled={editLoading || !editInput.trim()}
                  className="bg-navy text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-40">↑</button>
              </div>
            </div>
          )}
        </div>

        {/* ── INFOGRAPHIC ──────────────────────────────────────────── */}
        <div className="mt-4 bg-white/[0.04] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white font-bold text-sm">📊 AI Інфографіка</h3>
              <p className="text-white/35 text-xs mt-0.5">3 унікальних варіанти · DALL-E 3 · 1024×1024</p>
            </div>
            <button onClick={generateInfographic} disabled={infLoading}
              className="bg-gold text-black font-bold px-4 py-2 rounded-xl text-sm hover:bg-gold/80 transition-colors disabled:opacity-50 flex items-center gap-2">
              {infLoading
                ? <><span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin"/>Генерую...</>
                : infVariants.length > 0 ? '↺ Перегенерувати' : '✦ Згенерувати 3 варіанти'}
            </button>
          </div>

          {infLoading && infStep && (
            <div className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 mb-3 text-sm text-white/60">
              {infStep}
            </div>
          )}

          {infError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 mb-3 text-red-400 text-sm">
              ⚠️ {infError}
            </div>
          )}

          {infVariants.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {infVariants.map((v, i) => (
                  <div key={i} onClick={() => { setInfSelected(i); setInfEditOpen(false); setInfEditMsgs([]); }}
                    className={`cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${infSelected === i ? 'border-gold' : 'border-white/10 hover:border-white/30'}`}>
                    <img src={v.url} alt={v.label} className="w-full aspect-square object-cover" />
                    <div className={`px-2 py-1.5 text-xs font-bold text-center ${infSelected === i ? 'bg-gold text-black' : 'bg-white/[0.06] text-white/50'}`}>
                      {infSelected === i ? '✓ ' : ''}{v.label}
                    </div>
                  </div>
                ))}
              </div>

              {infSelected !== null && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (infSelected !== null) { const url = infVariants[infSelected]?.url; if(url) Object.assign(document.createElement('a'),{href:url,download:`infographic-${Date.now()}.jpg`}).click(); } }}
                    className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
                    ⬇ Завантажити
                  </button>
                  <button onClick={() => { setInfEditOpen(v => !v); }}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${infEditOpen ? 'bg-gold text-black' : 'border border-white/20 text-white/60 hover:border-gold/50 hover:text-gold'}`}>
                    ✦ AI редагування
                  </button>
                </div>
              )}

              {infEditOpen && infSelected !== null && (
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
                    <span className="text-white font-bold text-sm">✦ Редагування: {infVariants[infSelected]?.label}</span>
                    <button onClick={() => setInfEditOpen(false)} className="text-white/30 hover:text-white/70 text-lg">×</button>
                  </div>
                  <div className="p-3 space-y-2 max-h-52 overflow-y-auto">
                    {infEditMsgs.length === 0 && (
                      <div className="text-center py-3">
                        <p className="text-white/40 text-xs mb-2">Що змінити?</p>
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {['Зроби текст крупнішим','Додай більше деталей','Зміни стиль на мінімалістичний','Зроби фон темнішим'].map(s => (
                            <button key={s} onClick={() => sendInfEdit(s)}
                              className="text-xs px-2.5 py-1 rounded-full border border-white/15 text-white/50 hover:border-gold/50 hover:text-gold transition-all">
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {infEditMsgs.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-gold text-black rounded-br-sm' : 'bg-white/[0.08] text-white/80 rounded-bl-sm'}`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {infEditing && (
                      <div className="flex justify-start">
                        <div className="bg-white/[0.08] rounded-xl rounded-bl-sm px-3 py-2">
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-gold/60 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                            <span className="w-1.5 h-1.5 bg-gold/60 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                            <span className="w-1.5 h-1.5 bg-gold/60 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={infEndRef} />
                  </div>
                  <div className="p-3 border-t border-white/[0.08] flex gap-2">
                    <input type="text" value={infEditInput} onChange={e => setInfEditInput(e.target.value)}
                      onKeyDown={e => { if(e.key==='Enter') sendInfEdit(infEditInput); }}
                      placeholder="Що змінити? (Enter)" disabled={infEditing}
                      className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold/40 disabled:opacity-50" />
                    <button onClick={() => sendInfEdit(infEditInput)} disabled={infEditing || !infEditInput.trim()}
                      className="bg-gold text-black font-bold px-3 py-2 rounded-xl text-sm disabled:opacity-40">↑</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

