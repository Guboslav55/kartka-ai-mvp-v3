'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

export default function CreateProductPage() {
  const router = useRouter();
  const supabase = createClient();
  const [uid, setUid] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [gallery, setGallery] = useState<{ url: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [shortName, setShortName] = useState('');
  const [seoName, setSeoName] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [available, setAvailable] = useState(true);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { router.push('/auth'); return; }
      setUid(user.id); setToken(session?.access_token || '');
      const { data: sr } = await supabase
        .from('studio_results').select('product_name,urls,created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(40);
      const flat: { url: string; name: string }[] = [];
      for (const r of sr || []) for (const u of (r.urls || [])) flat.push({ url: u, name: r.product_name || '' });
      setGallery(flat);
      try {
        const batch = JSON.parse(localStorage.getItem('studio_batch') || '[]');
        if (Array.isArray(batch) && batch.length) { setImageUrls(batch); localStorage.removeItem('studio_batch'); }
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function generate() {
    if (!imageUrls.length) { setError('Спершу обери фото товару'); return; }
    setGenerating(true); setError(''); setDone(false);
    try {
      const res = await fetch('/api/product-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageUrls }),
      });
      const d = await res.json();
      if (d.error) { setError('Не вдалося згенерувати: ' + d.error); }
      else {
        setShortName(d.shortName || '');
        setSeoName(d.seoName || '');
        setCategory(d.category || '');
        setDescription(d.description || '');
        if (!sku) setSku('KAI-' + Date.now().toString(36).slice(-5).toUpperCase());
        setDone(true);
      }
    } catch { setError('Помилка генерації'); }
    setGenerating(false);
  }

  async function save() {
    if (!uid) return;
    if (!imageUrls.length) { setError('Обери фото'); return; }
    if (!shortName.trim()) { setError('Потрібна назва (натисни «Згенерувати товар»)'); return; }
    if (!price || isNaN(parseFloat(price))) { setError('Встав ціну'); return; }
    setSaving(true); setError('');
    const { error: e } = await supabase.from('products').insert({
      user_id: uid,
      name: shortName.trim(),
      seo_name: seoName.trim(),
      description: description.trim(),
      price: parseFloat(price),
      currency: 'UAH',
      category: category.trim(),
      available, sku: sku.trim(),
      image_urls: imageUrls,
    });
    setSaving(false);
    if (e) { setError('Помилка збереження: ' + e.message); return; }
    router.push('/products');
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-white/40">Завантаження…</div>;

  const num = (n: number) => <span className="w-6 h-6 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center shrink-0">{n}</span>;

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/products" className="text-white/40 text-sm hover:text-white/70">← Мої товари</Link>
        <h1 className="font-display text-2xl font-black mt-1 mb-1">Створити <span className="text-gradient">товар</span></h1>
        <p className="text-white/40 text-sm mb-6">Обери фото → одна кнопка зробить назву, опис, категорію. Ти ставиш ціну.</p>

        {/* STEP 1 */}
        <div className="flex items-center gap-2 mb-3">{num(1)}<span className="font-semibold text-sm">Фото товару</span></div>
        {gallery.length === 0 ? (
          <div className="text-white/40 text-sm glass rounded-xl px-4 py-5 mb-6">
            Поки немає згенерованих карток. <Link href="/studio" className="text-gold hover:underline">Зроби картку у Студії →</Link>
          </div>
        ) : (
          <div className="mb-6">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {gallery.map((g, i) => {
                const sel = imageUrls.indexOf(g.url);
                return (
                  <button key={i} onClick={() => { setImageUrls(prev => prev.includes(g.url) ? prev.filter(u => u !== g.url) : [...prev, g.url]); if (!shortName) setShortName(g.name); }}
                    className={`relative shrink-0 rounded-xl overflow-hidden border-2 transition-all ${sel >= 0 ? 'border-gold' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                    <img src={g.url} alt="" className="w-20 h-20 object-cover" />
                    {sel >= 0 && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-gold text-black text-[11px] font-bold flex items-center justify-center">{sel + 1}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-white/35 text-[11px] mt-1.5">Обрано: {imageUrls.length} — усі фото підуть в один товар</p>
          </div>
        )}

        {/* STEP 2 */}
        <div className="flex items-center gap-2 mb-3">{num(2)}<span className="font-semibold text-sm">Одна кнопка робить усе</span></div>
        <button onClick={generate} disabled={generating || !imageUrls.length}
          className={`w-full rounded-xl py-3.5 font-bold mb-6 transition-all ${imageUrls.length && !generating ? 'bg-gold text-black hover:brightness-110' : 'bg-white/5 text-white/30 border border-white/10'}`}>
          {generating ? '✨ Генерую назву, опис, категорію…' : '✨ Згенерувати товар'}
        </button>

        {/* STEP 3 */}
        <div className="flex items-center gap-2 mb-3">{num(3)}<span className="font-semibold text-sm">Перевір і постав ціну</span></div>
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="flex gap-4">
            <div className="shrink-0 relative">
              {imageUrls[0]
                ? <img src={imageUrls[0]} alt="" className="w-28 h-36 rounded-xl object-cover border border-white/10" />
                : <div className="w-28 h-36 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 text-3xl">📦</div>}
              {imageUrls.length > 1 && <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[11px] px-2 py-0.5 rounded-full">+{imageUrls.length - 1}</span>}
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <label className="text-white/55 text-[11px] font-bold uppercase mb-1 block">Коротка назва (для картки)</label>
                <input value={shortName} onChange={e => setShortName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-gold/50 outline-none"
                  placeholder="Куртка тактична олива" />
              </div>
              <div>
                <label className="text-white/55 text-[11px] font-bold uppercase mb-1 block">SEO-назва (для Prom/Rozetka)</label>
                <input value={seoName} onChange={e => setSeoName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-gold/50 outline-none"
                  placeholder="Куртка тактична чоловіча олива з капюшоном Soft Shell" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/55 text-[11px] font-bold uppercase mb-1 block">Категорія</label>
              <input value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-gold/50 outline-none"
                placeholder="Одяг та взуття > Куртки" />
            </div>
            <div>
              <label className="text-white/55 text-[11px] font-bold uppercase mb-1 block">Артикул</label>
              <input value={sku} onChange={e => setSku(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-gold/50 outline-none"
                placeholder="KAI-7F3Q2" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/55 text-[11px] font-bold uppercase mb-1 block">Ціна, грн *</label>
              <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal"
                className="w-full bg-white/5 border border-gold/30 rounded-lg px-3 py-2 text-sm focus:border-gold/60 outline-none"
                placeholder="2500" />
            </div>
            <div>
              <label className="text-white/55 text-[11px] font-bold uppercase mb-1 block">Наявність</label>
              <button onClick={() => setAvailable(!available)}
                className={`w-full rounded-lg px-3 py-2 text-sm font-semibold border transition-all ${available ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-white/40'}`}>
                {available ? '✓ В наявності' : 'Немає'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-white/55 text-[11px] font-bold uppercase mb-1 block">Опис</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-gold/50 outline-none resize-y"
              placeholder="З'явиться після «Згенерувати товар» — або напиши свій" />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="btn-shine flex-1 bg-gradient-to-r from-gold to-gold-light text-black font-bold py-3 rounded-xl hover:brightness-110 disabled:opacity-50">
              {saving ? 'Зберігаю…' : '✓ Зберегти товар'}
            </button>
            <Link href="/studio" className="px-4 py-3 rounded-xl border border-white/15 text-white/60 hover:border-white/30 text-sm flex items-center">
              Тонко налаштувати
            </Link>
          </div>
        </div>

        <p className="text-white/25 text-[11px] text-center mt-4">«Тонко налаштувати» відкриває Студію — лише коли треба змінити саму картку.</p>
      </div>
    </div>
  );
}
