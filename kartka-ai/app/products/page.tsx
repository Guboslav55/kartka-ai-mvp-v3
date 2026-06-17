'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

type Product = {
  id?: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  category: string;
  available: boolean;
  sku: string;
  image_urls: string[];
};

const EMPTY: Product = {
  name: '', description: '', price: '', currency: 'UAH',
  category: '', available: true, sku: '', image_urls: [],
};

export default function ProductsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [uid, setUid] = useState<string | null>(null);
  const [token, setToken] = useState<string>('');
  const [products, setProducts] = useState<any[]>([]);
  const [gallery, setGallery] = useState<{ url: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { router.push('/auth'); return; }
      setUid(user.id);
      setToken(session?.access_token || '');
      await reload(user.id);
      // gallery = real Studio generations (studio_results.urls), newest first
      const { data: sr } = await supabase
        .from('studio_results').select('product_name,urls,created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(40);
      const flat: { url: string; name: string }[] = [];
      for (const r of sr || []) for (const u of (r.urls || [])) flat.push({ url: u, name: r.product_name || '' });
      setGallery(flat);
      setLoading(false);
    })();
  }, []);

  async function reload(userId: string) {
    const { data } = await supabase
      .from('products').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (data) setProducts(data);
  }

  function startNew() { setError(''); setForm({ ...EMPTY }); }
  function startFromImage(img: { url: string; name: string }) {
    setError('');
    setForm({ ...EMPTY, name: img.name || '', image_urls: [img.url] });
  }
  function startEdit(p: any) {
    setError('');
    setForm({
      id: p.id, name: p.name || '', description: p.description || '',
      price: p.price != null ? String(p.price) : '', currency: p.currency || 'UAH',
      category: p.category || '', available: p.available ?? true, sku: p.sku || '',
      image_urls: Array.isArray(p.image_urls) ? p.image_urls : [],
    });
  }

  function toggleImage(url: string) {
    if (!form) return;
    const has = form.image_urls.includes(url);
    setForm({ ...form, image_urls: has ? form.image_urls.filter(u => u !== url) : [...form.image_urls, url] });
  }

  async function generateText() {
    if (!form || !form.image_urls.length) { setError('Спершу обери фото товару'); return; }
    setGenerating(true); setError('');
    try {
      const res = await fetch('/api/product-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageUrl: form.image_urls[0] }),
      });
      const d = await res.json();
      if (d.error) { setError('Не вдалося згенерувати: ' + d.error); }
      else setForm(f => f ? {
        ...f,
        name: d.name || f.name,
        description: d.description || f.description,
        category: d.category || f.category,
        sku: f.sku || ('KAI-' + Date.now().toString(36).slice(-5).toUpperCase()),
      } : f);
    } catch {
      setError('Помилка генерації');
    }
    setGenerating(false);
  }

  async function save() {
    if (!form || !uid) return;
    if (!form.name.trim()) { setError('Вкажи назву товару'); return; }
    if (!form.price || isNaN(parseFloat(form.price))) { setError('Вкажи коректну ціну'); return; }
    setSaving(true); setError('');
    const payload = {
      user_id: uid,
      name: form.name.trim(),
      description: form.description.trim(),
      price: parseFloat(form.price),
      currency: form.currency,
      category: form.category.trim(),
      available: form.available,
      sku: form.sku.trim(),
      image_urls: form.image_urls,
    };
    const res = form.id
      ? await supabase.from('products').update(payload).eq('id', form.id)
      : await supabase.from('products').insert(payload);
    setSaving(false);
    if (res.error) { setError('Помилка збереження: ' + res.error.message); return; }
    setForm(null);
    await reload(uid);
  }

  async function del(id: string) {
    if (!uid) return;
    setDeletingId(id);
    await supabase.from('products').delete().eq('id', id);
    setDeletingId(null);
    await reload(uid);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-white/40">Завантаження…</div>;

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/dashboard" className="text-white/40 text-sm hover:text-white/70">← Кабінет</Link>
            <h1 className="font-display text-2xl font-black mt-1">Мої <span className="text-gradient">товари</span></h1>
            <p className="text-white/40 text-sm">Фото зі студії + назва, опис і ціна — в одному місці. Далі — експорт на маркетплейс.</p>
          </div>
          {!form && (
            <Link href="/products/create" className="bg-gold text-black font-bold px-4 py-2 rounded-xl hover:brightness-110 shrink-0">
              + Створити
            </Link>
          )}
        </div>

        {form && (
          <div className="glass border border-gold/30 rounded-2xl p-5 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{form.id ? 'Редагувати товар' : 'Новий товар'}</h2>
              <button onClick={() => setForm(null)} className="text-white/40 hover:text-white/80 text-xl">×</button>
            </div>

            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-2 block">Фото зі студії (обери одне або кілька)</label>
              {gallery.length === 0 ? (
                <div className="text-white/30 text-sm glass rounded-xl px-3 py-4">
                  Поки немає згенерованих карток. <Link href="/studio" className="text-gold/80 hover:text-gold">Згенерувати у Студії →</Link>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {gallery.map((g, i) => (
                      <button key={i} onClick={() => toggleImage(g.url)}
                        className={`shrink-0 rounded-lg overflow-hidden border-2 transition-all ${form.image_urls.includes(g.url) ? 'border-gold' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                        <img src={g.url} alt="" className="w-16 h-16 object-cover" />
                      </button>
                    ))}
                  </div>
                  <p className="text-white/30 text-[11px] mt-1">Обрано: {form.image_urls.length}</p>
                </>
              )}
            </div>

            <button onClick={generateText} disabled={generating || !form.image_urls.length}
              className={`w-full rounded-xl py-3 text-sm font-bold border transition-all ${form.image_urls.length && !generating ? 'border-gold/50 text-gold hover:bg-gold/10' : 'border-white/10 text-white/30'}`}>
              {generating ? '✨ Генерую назву та опис…' : '✨ Згенерувати назву і опис за фото'}
            </button>

            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-1.5 block">Назва товару *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-gold/50 outline-none"
                placeholder="Кросівки ON Cloud" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/60 text-xs font-bold uppercase mb-1.5 block">Ціна (грн) *</label>
                <input value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} inputMode="decimal"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-gold/50 outline-none"
                  placeholder="1499" />
              </div>
              <div>
                <label className="text-white/60 text-xs font-bold uppercase mb-1.5 block">Артикул / SKU</label>
                <input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-gold/50 outline-none"
                  placeholder="ON-CLD-42" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/60 text-xs font-bold uppercase mb-1.5 block">Категорія</label>
                <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-gold/50 outline-none"
                  placeholder="Взуття > Кросівки" />
              </div>
              <div>
                <label className="text-white/60 text-xs font-bold uppercase mb-1.5 block">Наявність</label>
                <button onClick={() => setForm({ ...form, available: !form.available })}
                  className={`w-full rounded-xl px-3 py-2.5 text-sm font-semibold border transition-all ${form.available ? 'bg-green-600/20 border-green-600/40 text-green-400' : 'bg-white/5 border-white/10 text-white/40'}`}>
                  {form.available ? '✓ В наявності' : 'Немає в наявності'}
                </button>
              </div>
            </div>

            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-1.5 block">Опис товару</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-gold/50 outline-none resize-y"
                placeholder="Натисни «Згенерувати назву і опис за фото» або напиши свій…" />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="bg-gold text-black font-bold px-5 py-2.5 rounded-xl hover:brightness-110 disabled:opacity-50">
                {saving ? 'Зберігаю…' : (form.id ? 'Зберегти зміни' : 'Створити товар')}
              </button>
              <button onClick={() => setForm(null)} className="px-4 py-2.5 rounded-xl border border-white/15 text-white/60 hover:border-white/30">
                Скасувати
              </button>
            </div>
          </div>
        )}

        {products.length === 0 && !form ? (
          <div className="glass rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-white/50 mb-1">Поки немає товарів</p>
            <p className="text-white/30 text-sm mb-4">Створи перший товар — обери фото зі студії, згенеруй опис, постав ціну.</p>
            <Link href="/products/create" className="inline-block bg-gold text-black font-bold px-4 py-2 rounded-xl hover:brightness-110">+ Створити товар</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.id} className="glass lift rounded-xl px-4 py-3 flex items-center gap-3 hover:border-gold/30">
                {p.image_urls?.[0]
                  ? <img src={p.image_urls[0]} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  : <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-lg">📦</div>}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm truncate">{p.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-gold font-bold text-sm">{p.price != null ? `${p.price} грн` : '—'}</span>
                    {p.category && <span className="text-white/35 text-xs truncate">· {p.category}</span>}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${p.available ? 'bg-green-600/20 text-green-400' : 'bg-white/8 text-white/40'}`}>
                      {p.available ? 'В наявності' : 'Немає'}
                    </span>
                  </div>
                </div>
                <button onClick={() => startEdit(p)} className="text-white/40 hover:text-gold text-sm px-2 shrink-0">Редагувати</button>
                <button onClick={() => del(p.id)} disabled={deletingId === p.id}
                  className="text-white/15 hover:text-red-400 text-lg shrink-0 disabled:opacity-50">
                  {deletingId === p.id ? '…' : '×'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
