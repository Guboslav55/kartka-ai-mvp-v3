'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const PLAN_LABELS: Record<string, string> = { free: 'Стартер', pro: 'Про', business: 'Бізнес' };
const PLAN_COLORS: Record<string, string> = { free: 'text-white/50', pro: 'text-gold', business: 'text-blue-400' };
const PLATFORM_LABELS: Record<string, string> = { prom: 'Prom.ua', rozetka: 'Rozetka', olx: 'OLX', general: 'Загальний' };

const TOOLS = [
  { href: '/generate', icon: '✏️', name: 'Текст', cost: '2 ⭐' },
  { href: '/seo', icon: '🔎', name: 'SEO', cost: '' },
  { href: '/studio', icon: '🎨', name: 'Студія', cost: '4 ⭐' },
  { href: '/gallery', icon: '🖼️', name: 'Галерея', cost: '' },
  { href: '/tryon', icon: '👗', name: 'Приміряння', cost: '6 ⭐' },
  { href: '/video', icon: '🎬', name: 'Відео', cost: '16 ⭐' },
  { href: '/generate-model', icon: '🧍', name: 'Моделі', cost: '8 ⭐' },
  { href: '/upscale', icon: '🔍', name: 'Апскейл', cost: '2 ⭐' },
  { href: '/editor', icon: '🎛️', name: 'Редактор', cost: 'free' },
];

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user: auth } } = await supabase.auth.getUser();
      if (!auth) { router.push('/auth'); return; }
      const [{ data: profile }, { data: saved }, { data: prods }] = await Promise.all([
        supabase.from('users').select('*').eq('id', auth.id).single(),
        supabase.from('cards').select('*').eq('user_id', auth.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('products').select('id,name,price,image_urls,available').eq('user_id', auth.id).order('created_at', { ascending: false }).limit(6),
      ]);
      if (profile) setUser(profile);
      if (saved) setCards(saved);
      if (prods) setProducts(prods);
      setLoading(false);
    }
    load();
    const handler = (e: any) => {
      setUser((prev: any) => prev ? { ...prev, stars_balance: e.detail.newBalance } : prev);
    };
    window.addEventListener('stars-updated', handler);
    return () => window.removeEventListener('stars-updated', handler);
  }, []);

  async function deleteCard(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation();
    setDeletingId(id);
    await supabase.from('cards').delete().eq('id', id);
    setCards(prev => prev.filter(c => c.id !== id));
    setDeletingId(null);
  }

  async function downloadCSV(format: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/export?format=${format}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kartka-${format}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const plan = user?.plan ?? 'free';
  const starsBalance = user?.stars_balance ?? 0;
  const isLowStars = starsBalance < 10;

  return (
    <div className="min-h-screen px-4 sm:px-6 py-7 max-w-2xl mx-auto">
      {/* Top bar */}
      <nav className="flex items-center justify-between mb-2">
        <Link href="/" className="font-display font-black text-xl">
          <span className="text-gradient">Картка</span><span className="text-white">АІ</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/stars"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-all ${isLowStars ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'glass text-white hover:border-gold/40 hover:text-gold'}`}>
            ⭐ {starsBalance.toLocaleString('uk-UA')}
          </Link>
          <Link href="/pricing" className="rounded-full bg-gradient-to-r from-gold to-gold-light text-black px-3.5 py-1.5 text-sm font-bold hover:brightness-110 transition-all">+ Поповнити</Link>
          <Link href="/profile" className="w-9 h-9 rounded-full glass flex items-center justify-center text-sm hover:border-gold/40 transition-all">👤</Link>
          <button onClick={signOut} className="text-white/25 text-sm hover:text-white transition-colors ml-1">Вийти</button>
        </div>
      </nav>

      {/* Low stars banner */}
      {isLowStars && (
        <div className="bg-gold/8 border border-gold/25 rounded-2xl px-5 py-4 my-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-gold font-semibold text-sm">⭐ Зорі майже закінчились!</p>
            <p className="text-white/45 text-xs mt-0.5">Поповни баланс — генерація тексту коштує лише 2 зорі</p>
          </div>
          <Link href="/pricing" className="bg-gold text-black px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors shrink-0">Поповнити ⭐ →</Link>
        </div>
      )}

      {/* HERO — single primary action */}
      <div className="text-center pt-6 pb-7">
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tight mb-2">
          Що продаємо <span className="text-gradient">сьогодні?</span>
        </h1>
        <p className="text-white/50 text-sm mb-6">Завантаж фото товару — решту зробить ШІ</p>
        <Link href="/products/create" className="btn-shine lift block rounded-3xl p-8 border border-gold/30 bg-gradient-to-br from-gold/15 via-coral/8 to-violet/12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gold to-coral flex items-center justify-center text-3xl shadow-[0_10px_34px_rgba(255,107,91,0.4)]">✨</div>
            <div className="font-display font-black text-lg">Створити товар</div>
            <div className="text-white/50 text-sm">фото → картка, опис і ціна за крок</div>
          </div>
        </Link>
      </div>

      {/* Slim stats */}
      <div className="grid grid-cols-3 gap-2.5 mb-7">
        <Link href="/stars" className="glass lift rounded-2xl p-3.5 text-center hover:border-gold/30">
          <div className={`font-display font-black text-xl ${isLowStars ? 'text-red-400' : 'text-gold'}`}>{starsBalance.toLocaleString('uk-UA')}</div>
          <div className="text-white/35 text-[11px] mt-0.5">Зорі ⭐</div>
        </Link>
        <div className="glass rounded-2xl p-3.5 text-center">
          <div className="font-display font-black text-xl text-white">{user?.cards_total ?? 0}</div>
          <div className="text-white/35 text-[11px] mt-0.5">Створено</div>
        </div>
        <Link href="/products" className="glass lift rounded-2xl p-3.5 text-center hover:border-gold/30">
          <div className="font-display font-black text-xl text-white">{products.length}</div>
          <div className="text-white/35 text-[11px] mt-0.5">Товарів</div>
        </Link>
      </div>

      {/* Мої товари feed */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-base">Мої товари</h2>
        <Link href="/products" className="text-gold text-sm hover:underline">усі →</Link>
      </div>
      {products.length === 0 ? (
        <Link href="/products/create" className="glass lift block rounded-2xl p-6 text-center mb-8 hover:border-gold/30">
          <div className="text-3xl mb-2">📦</div>
          <p className="text-white/45 text-sm">Ще немає товарів — створи перший</p>
        </Link>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {products.map(p => (
            <Link key={p.id} href="/products" className="glass lift rounded-2xl overflow-hidden hover:border-gold/30 block">
              <div className="h-24 bg-gradient-to-br from-white/5 to-gold/10 flex items-center justify-center text-2xl">
                {p.image_urls?.[0] ? <img src={p.image_urls[0]} alt="" className="w-full h-full object-cover" /> : '📦'}
              </div>
              <div className="p-3">
                <div className="text-sm font-semibold truncate">{p.name}</div>
                <div className="text-gold text-sm font-bold mt-0.5">{p.price != null ? `${p.price} грн` : '—'}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Tools grid — big tiles */}
      <div className="text-white/35 text-[11px] font-bold uppercase tracking-widest mb-3">Інструменти</div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mb-7">
        {TOOLS.map(t => (
          <Link key={t.href} href={t.href} className="glass lift rounded-2xl p-4 flex flex-col items-center text-center gap-2 hover:border-gold/30">
            <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center text-xl">{t.icon}</div>
            <div className="text-[13px] font-semibold leading-tight">{t.name}</div>
            <div className="text-[11px] text-white/30 -mt-1 h-3">{t.cost}</div>
          </Link>
        ))}
      </div>

      {/* Service chips */}
      <div className="text-white/35 text-[11px] font-bold uppercase tracking-widest mb-3">Сервіс</div>
      <div className="flex flex-wrap gap-2 mb-9">
        <Link href="/projects" className="glass px-4 py-2 rounded-full text-sm text-white/60 hover:text-gold hover:border-gold/40 transition-all">📁 Проекти</Link>
        <Link href="/templates" className="glass px-4 py-2 rounded-full text-sm text-white/60 hover:text-gold hover:border-gold/40 transition-all">📋 Шаблони</Link>
        <Link href="/stars" className="glass px-4 py-2 rounded-full text-sm text-white/60 hover:text-gold hover:border-gold/40 transition-all">📊 Історія зорь</Link>
        <Link href="/referral" className="glass px-4 py-2 rounded-full text-sm text-white/60 hover:text-indigo-300 hover:border-indigo-400/40 transition-all">🤝 Запросити друга</Link>
        <button onClick={() => downloadCSV('prom')} className="glass px-4 py-2 rounded-full text-sm text-white/60 hover:text-green-400 hover:border-green-500/40 transition-all">⬇ CSV Prom</button>
        <button onClick={() => downloadCSV('rozetka')} className="glass px-4 py-2 rounded-full text-sm text-white/60 hover:text-green-400 hover:border-green-500/40 transition-all">⬇ CSV Rozetka</button>
        <Link href="/profile" className="glass px-4 py-2 rounded-full text-sm text-white/60 hover:text-white hover:border-white/30 transition-all">👤 Профіль</Link>
        <Link href="/auth/reset-password" className="glass px-4 py-2 rounded-full text-sm text-white/60 hover:text-white hover:border-white/30 transition-all">🔑 Пароль</Link>
      </div>

      {/* Saved cards history */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-base">Збережені картки</h2>
        {cards.length > 0 && <span className="text-white/30 text-xs">{cards.length} шт.</span>}
      </div>
      {cards.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-white/40 mb-5 text-sm">Ще немає жодної картки</p>
          <Link href="/generate" className="inline-block bg-gold text-black px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors">Згенерувати першу →</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map(card => (
            <Link key={card.id} href={`/card/${card.id}`}
              className="glass rounded-xl px-4 py-4 flex items-start gap-3 hover:border-gold/30 hover:bg-white/[0.05] transition-all group block">
              {card.image_url
                ? <img src={card.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                : <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-lg">📦</div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] bg-white/8 text-white/40 px-2 py-0.5 rounded-full">{PLATFORM_LABELS[card.platform] ?? card.platform}</span>
                  <span className="text-white/20 text-[10px]">{new Date(card.created_at).toLocaleDateString('uk-UA')}</span>
                </div>
                <div className="font-semibold text-white text-sm truncate group-hover:text-gold transition-colors">{card.title}</div>
                <div className="text-white/35 text-xs mt-0.5 line-clamp-1">{card.description}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-white/20 text-xs opacity-0 group-hover:opacity-100 transition-opacity">відкрити →</span>
                <button onClick={e => deleteCard(e, card.id)} disabled={deletingId === card.id}
                  className="text-white/15 hover:text-red-400 transition-all text-lg disabled:opacity-50 opacity-0 group-hover:opacity-100">
                  {deletingId === card.id ? '…' : '×'}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
