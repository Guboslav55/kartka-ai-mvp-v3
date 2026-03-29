'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
 
const TEMPLATES = [
  { id: 'benefits', name: '✓ Переваги справа', desc: 'Фото + панель переваг' },
  { id: 'callout',  name: '◎ Callout стрілки', desc: 'Фото + підписи зі стрілками' },
  { id: 'cta',      name: '💰 Ціна + CTA',     desc: 'Фото + заклик купити' },
  { id: 'infographic', name: '📊 Інфографіка', desc: 'AI підбирає шаблон під товар' },
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
 
  const [photo, setPhoto] = useState<string|null>(null);
  const [noBgPhoto, setNoBgPhoto] = useState<string|null>(null);
  const [photoName, setPhotoName] = useState('');
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [bullets, setBullets] = useState(['','','']);
  const [bgStyle, setBgStyle] = useState('dark');
  const [template, setTemplate] = useState('benefits');
  const [keepBackground, setKeepBackground] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [finalUrl, setFinalUrl] = useState<string|null>(null);
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
      const b64 = reader.result as string;
      setPhoto(b64); setNoBgPhoto(null); setFinalUrl(null);
      if (bullets.every(b => !b.trim())) await analyzePhoto(b64);
    };
    reader.readAsDataURL(file);
  }
 
  async function analyzePhoto(base64?: string) {
    const src = base64 || photo; if (!src || !accessToken) return;
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
    if (!productName.trim() && !photo) return;
    setGenerating(true); setError(''); setFinalUrl(null);
    try {
      // Step 1: optionally remove bg
      let productSrc = photo;
      const isInfographic = template === 'infographic';
 
      if (photo && !keepBackground && !isInfographic) {
        setStep('🔮 Видаляю фон...');
        try {
          const res = await fetch('/api/remove-bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ imageBase64: photo }),
          });
          if (res.ok) { const d = await res.json(); if (d.imageBase64) { productSrc = d.imageBase64; setNoBgPhoto(d.imageBase64); } }
        } catch {}
      }
 
      // Step 2: render
      setStep(isInfographic ? '📊 AI аналізує товар і генерує інфографіку...' : '🎨 Рендерю банер...');
 
      const endpoint = isInfographic ? '/api/infographic' : '/api/og-banner';
      const body = isInfographic
        ? { productName, productB64: photo }
        : { productName, price, bullets, bgStyle, template, productB64: productSrc };
 
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
      const objectUrl = URL.createObjectURL(blob);
      setFinalUrl(objectUrl);
 
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
    a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(finalUrl); }, 1000);
  }
 
  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        <Link href="/generate" className="text-white/40 text-sm hover:text-white">Генератор тексту →</Link>
      </div>
      <h1 className="font-display font-black text-2xl sm:text-3xl mb-2 tracking-tight">🖼️ Банер товару</h1>
      <p className="text-white/40 text-sm mb-8">Оберіть шаблон — AI генерує банер з кириличними шрифтами</p>
 
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Upload */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Фото товару</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden"/>
            <div onClick={()=>fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${photo?'border-gold/40 bg-gold/5':'border-white/10 hover:border-white/25'}`}>
              {photo ? (
                <div className="flex items-center gap-3">
                  <img src={photo} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0"/>
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold truncate">{photoName}</p>
                    {analyzing
                      ? <p className="text-gold text-xs flex items-center gap-1 mt-0.5"><span className="w-3 h-3 border border-gold border-t-transparent rounded-full animate-spin"/>AI аналізує...</p>
                      : <p className="text-green-400 text-xs mt-0.5">✓ Готово</p>}
                    {noBgPhoto && <p className="text-blue-400 text-xs">✓ Фон видалено</p>}
                    <button onClick={e=>{e.stopPropagation();setPhoto(null);setNoBgPhoto(null);setPhotoName('');setFinalUrl(null);}}
                      className="text-white/25 text-xs hover:text-red-400 mt-1">видалити ×</button>
                  </div>
                </div>
              ) : (
                <div><div className="text-3xl mb-2">📸</div><p className="text-white/50 text-sm">Завантажити фото товару</p><p className="text-white/25 text-xs mt-1">AI визначить переваги автоматично</p></div>
              )}
            </div>
            {photo && template !== 'infographic' && (
              <label className="flex items-center gap-3 mt-3 cursor-pointer select-none">
                <button type="button" onClick={()=>setKeepBackground(v=>!v)}
                  className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${keepBackground?'bg-gold':'bg-white/15'}`}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{left:keepBackground?'17px':'2px'}}/>
                </button>
                <span className="text-white/50 text-xs">{keepBackground?'✓ Зберегти оригінальний фон':'Видалити фон (Remove.bg)'}</span>
              </label>
            )}
          </div>
 
          {/* Template — FIRST */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Тип банеру</label>
            <div className="space-y-2">
              {TEMPLATES.map(t=>(
                <button key={t.id} onClick={()=>setTemplate(t.id)}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${template===t.id?'border-gold bg-gold/10':'border-white/8 hover:border-white/20'}`}>
                  <span className="text-sm font-semibold text-white">{t.name}</span>
                  <span className="block text-xs text-white/35 mt-0.5">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
 
          {/* Data — hidden for infographic */}
          {template !== 'infographic' && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-gold text-xs font-bold uppercase tracking-widest">Дані товару</label>
                {photo && <button onClick={()=>analyzePhoto()} disabled={analyzing}
                  className="text-xs text-gold/60 hover:text-gold border border-gold/20 hover:border-gold/40 px-3 py-1 rounded-lg disabled:opacity-40 flex items-center gap-1">
                  {analyzing?<><span className="w-3 h-3 border border-gold/40 border-t-gold rounded-full animate-spin"/>Аналізую...</>:'🤖 Визначити з фото'}
                </button>}
              </div>
              <input value={productName} onChange={e=>setProductName(e.target.value)} placeholder="Назва товару *"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors"/>
              <input value={price} onChange={e=>setPrice(e.target.value)} placeholder="Ціна (наприклад: 2 499 ₴)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors"/>
              <p className="text-white/25 text-xs">Переваги (або залиш — AI визначить):</p>
              {bullets.map((b,i)=>(
                <div key={i} className="relative">
                  <input value={b} onChange={e=>{const nb=[...bullets];nb[i]=e.target.value;setBullets(nb);}} placeholder={`Перевага ${i+1}`}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors pr-8"/>
                  {b&&<button onClick={()=>{const nb=[...bullets];nb[i]='';setBullets(nb);}} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">×</button>}
                </div>
              ))}
            </div>
          )}
 
          {/* Infographic note */}
          {template === 'infographic' && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Назва товару</label>
              <input value={productName} onChange={e=>setProductName(e.target.value)} placeholder="Назва товару (необов'язково)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors mb-3"/>
              <div className="bg-gold/8 border border-gold/20 rounded-xl p-4">
                <p className="text-gold text-sm font-semibold mb-1">🤖 AI сам визначить:</p>
                <p className="text-white/50 text-xs">Категорію товару, потрібні характеристики, стиль інфографіки, кольори та іконки — все автоматично на основі фото</p>
              </div>
            </div>
          )}
 
          {/* Style — hidden for infographic */}
          {template !== 'infographic' && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Стиль фону</label>
              <div className="grid grid-cols-2 gap-2">
                {BG_STYLES.map(s=><button key={s.id} onClick={()=>setBgStyle(s.id)}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all ${bgStyle===s.id?'border-gold bg-gold/10 text-gold':'border-white/10 text-white/50 hover:border-white/25'}`}>{s.label}</button>)}
              </div>
            </div>
          )}
 
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">⚠️ {error}</div>}
 
          <button onClick={generate} disabled={generating||(!productName.trim()&&!photo)}
            className="w-full bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 text-base">
            {generating?<><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"/>{step||'Генерую...'}</>:
              template==='infographic'?'📊 Згенерувати інфографіку':'✦ Згенерувати банер'}
          </button>
          <p className="text-white/20 text-xs text-center">
            {template==='infographic'?'~10-15 сек · AI аналізує товар і підбирає шаблон':'~5-8 сек · Noto Sans · Кирилиця ✓'}
          </p>
        </div>
 
        {/* Result */}
        <div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden sticky top-6">
            <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
              <span className="text-gold text-xs font-bold uppercase tracking-wider">Результат</span>
              {finalUrl && <button onClick={download} className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600">⬇ Завантажити PNG</button>}
            </div>
            <div className="relative bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#141414_0%_50%)] bg-[length:24px_24px]" style={{minHeight:'360px'}}>
              {generating && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                <div className="w-12 h-12 border-[3px] border-gold/20 border-t-gold rounded-full animate-spin"/>
                <p className="text-white/60 text-sm text-center px-4">{step}</p>
              </div>}
              {!generating && !finalUrl && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/20">
                <span className="text-5xl">🖼️</span>
                <span className="text-sm">Тут з'явиться банер</span>
              </div>}
              {finalUrl && <img src={finalUrl} alt="Banner" className="w-full block"/>}
            </div>
            {finalUrl && <div className="px-5 py-4 border-t border-white/8 flex gap-3">
              <button onClick={download} className="flex-1 bg-green-700 text-white py-3 rounded-xl font-bold hover:bg-green-600 text-sm flex items-center justify-center gap-2">⬇ Завантажити PNG</button>
              <button onClick={generate} className="flex-1 border border-white/15 text-white/60 py-3 rounded-xl font-semibold hover:border-gold hover:text-gold text-sm">↺ Перегенерувати</button>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
