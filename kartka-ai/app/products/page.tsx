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
  const [products, setProducts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      setUid(user.id);
      await reload(user.id);
      const { data: savedCards } = await supabase
        .from('cards').select('id,image_url,title,description,created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
      if (savedCards) setCards(savedCards);
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
  function startFromCard(card: any) {
    setError('');
    setForm({
      ...EMPTY,
      name: card.title || '',
      description: card.description || '',
      image_urls: card.image_url ? [card.image_url] : [],
    });
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

  if (loading) return <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center text-white/40">Завантаження…</div>;

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/dashboard" className="text-white/40 text-sm hover:text-white/70">← Кабінет</Link>
            <h1 className="text-2xl font-black mt-1">Мої товари</h1>
            <p className="text-white/40 text-sm">Єдиний товар: фото + опис + ціна. Далі — експорт на маркетплейс.</p>
          </div>
          {!form && (
            <button onClick={startNew} className="bg-gold text-black font-bold px-4 py-2 rounded-xl hover:brightness-110 shrink-0">
              + Створити
            </button>
          )}
        </div>

        {form && (
          <div className="bg-white/[0.04] border border-gold/30 rounded-2xl p-5 mb-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">{form.id ? 'Редагувати товар' : 'Новий товар'}</h2>
              <button onClick={() => setForm(null)} className="text-white/40 hover:text-white/80 text-xl">×</button>
            </div>

            {cards.length > 0 && (
              <div>
                <label className="text-white/60 text-xs font-bold uppercase mb-2 block">Фото з твоїх карток (обери одне або кілька)</label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {cards.filter(c => c.image_url).map(c => (
                    <button key={c.id} onClick={() => toggleImage(c.image_url)}
                      className={`shrink-0 rounded-lg overflow-hidden border-2 transition-all ${form.image_urls.includes(c.image_url) ? 'border-gold' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                      <img src={c.image_url} alt="" className="w-16 h-16 object-cover" />
                    </button>
                  ))}
                </div>
                <p className="text-white/30 text-[11px] mt-1">Обрано: {form.image_urls.length}</p>
              </div>
            )}

            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-1.5 block">Назва товару *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-gold/50 outline-none"
                placeholder="Кросівки ON Cloud" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/60 text-xs font-bold uppercase mb-1.5 block">Ціна (грн) *</label>
                <input value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                  inputMode="decimal"
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
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-gold/50 outline-none resize-y"
                placeholder="Встав опис із SEO-генератора або напиши свій…" />
              <Link href="/seo" className="text-gold/70 text-[11px] hover:text-gold">→ Згенерувати опис у SEO-інструменті</Link>
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
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-white/50 mb-1">Поки немає товарів</p>
            <p className="text-white/30 text-sm mb-4">Створи перший товар — фото з картки, ціна та опис в одному місці.</p>
            <button onClick={startNew} className="bg-gold text-black font-bold px-4 py-2 rounded-xl hover:brightness-110">+ Створити товар</button>
            {cards.length > 0 && (
              <div className="mt-6 text-left">
                <p className="text-white/40 text-xs font-bold uppercase mb-2">…або почни з готової картки</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {cards.filter(c => c.image_url).slice(0, 10).map(c => (
                    <button key={c.id} onClick={() => startFromCard(c)}
                      className="shrink-0 rounded-lg overflow-hidden border border-white/10 hover:border-gold/50">
                      <img src={c.image_url} alt="" className="w-16 h-16 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.id} className="bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-gold/30 transition-all">
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
