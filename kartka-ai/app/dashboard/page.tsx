'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const PLAN_LABELS: Record<string, string> = { free: 'Стартер', pro: 'Про', business: 'Бізнес' };
const PLAN_COLORS: Record<string, string> = { free: 'text-white/50', pro: 'text-gold', business: 'text-blue-400' };
const PLATFORM_LABELS: Record<string, string> = { prom: 'Prom.ua', rozetka: 'Rozetka', olx: 'OLX', general: 'Загальний' };

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user: auth } } = await supabase.auth.getUser();
      if (!auth) { router.push('/auth'); return; }
      const [{ data: profile }, { data: saved }] = await Promise.all([
        supabase.from('users').select('*').eq('id', auth.id).single(),
        supabase.from('cards').select('*').eq('user_id', auth.id).order('created_at', { ascending: false }).limit(50),
      ]);
      if (profile) setUser(profile);
      if (saved) setCards(saved);
      setLoading(false);
    }
    load();

    // Оновлення балансу після поповнення
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
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="font-display font-black text-xl text-gold">
          Картка<span className="text-white">АІ</span>
        </Link>
        <div className="flex items-center gap-3">
          {/* Зорі в хедері */}
          <Link href="/pricing"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-all ${
              isLowStars
                ? 'bg-red-500/20 text-red-300 border-red-500/30'
                : 'bg-white/10 text-white border-white/15 hover:border-gold/40 hover:text-gold'
            }`}>
            <span>⭐</span>
            <span>{starsBalance.toLocaleString('uk-UA')}</span>
          </Link>
          <Link href="/pricing"
            className="flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white border border-indigo-500 hover:bg-indigo-500 transition-colors">
            <span className="text-xs">+</span>
            <span>Поповнити</span>
          </Link>
          <button onClick={signOut} className="text-white/30 text-sm hover:text-white transition-colors">Вийти</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Зорі ⭐ →', value: starsBalance.toLocaleString('uk-UA'), cls: isLowStars ? 'text-red-400' : 'text-gold', href: '/stars' },
          { label: 'Тариф', value: PLAN_LABELS[plan], cls: PLAN_COLORS[plan] },
          { label: 'Всього створено', value: String(user?.cards_total ?? 0), cls: 'text-white' },
          { label: 'Збережено', value: String(cards.length), cls: 'text-white' },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.04] border border-white/8 rounded-2xl p-4 sm:p-5">
            <div className={`font-display font-black text-2xl mb-1 ${s.cls}`}>{s.value}</div>
            <div className="text-white/35 text-xs leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Low stars banner */}
      {isLowStars && (
        <div className="bg-gold/8 border border-gold/25 rounded-2xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-gold font-semibold text-sm">⭐ Зорі майже закінчились!</p>
            <p className="text-white/45 text-xs mt-0.5">Поповни баланс — генерація тексту коштує лише 2 зорі</p>
          </div>
          <Link href="/pricing" className="bg-gold text-black px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors shrink-0">
            Поповнити ⭐ →
          </Link>
        </div>
      )}

      {/* Main actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link href="/generate"
          className="bg-gold/10 border border-gold/30 rounded-2xl p-6 hover:bg-gold/15 transition-all hover:-translate-y-1 group">
          <div className="text-3xl mb-3">✏️</div>
          <div className="font-display font-bold text-lg mb-1">Генератор тексту</div>
          <div className="text-white/40 text-sm">Заголовок, опис, переваги та ключові слова</div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-gold text-sm font-semibold group-hover:translate-x-1 transition-transform">Створити картку →</span>
            <span className="text-white/30 text-xs bg-white/5 px-2 py-1 rounded-full">2 ⭐</span>
          </div>
        </Link>
        <Link href="/studio"
          className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-6 hover:bg-indigo-500/15 transition-all hover:-translate-y-1 group">
          <div className="text-3xl mb-3">📸</div>
          <div className="font-display font-bold text-lg mb-1">AI Фото-студія</div>
          <div className="text-white/40 text-sm">На моделі, у магазині, раскладка, студійно</div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-indigo-300 text-sm font-semibold group-hover:translate-x-1 transition-transform">Відкрити студію →</span>
            <span className="text-white/30 text-xs bg-white/5 px-2 py-1 rounded-full">4 ⭐</span>
          </div>
        </Link>
        <Link href="/projects"
          className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all hover:-translate-y-1 group">
          <div className="text-3xl mb-3">📁</div>
          <div className="font-display font-bold text-lg mb-1">Проекти</div>
          <div className="text-white/40 text-sm">Організуй картки по групах і платформах</div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-white/40 text-sm font-semibold group-hover:text-white/70 group-hover:translate-x-1 transition-all">Мої проекти →</span>
          </div>
        </Link>
        <Link href="/gallery"
          className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all hover:-translate-y-1 group">
          <div className="text-3xl mb-3">🖼️</div>
          <div className="font-display font-bold text-lg mb-1">Галерея</div>
          <div className="text-white/40 text-sm">Всі згенеровані зображення зі студії</div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-white/40 text-sm font-semibold group-hover:text-white/70 group-hover:translate-x-1 transition-all">Переглянути →</span>
          </div>
        </Link>
        <Link href="/tryon"
          className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-6 hover:bg-purple-500/15 transition-all hover:-translate-y-1 group">
          <div className="text-3xl mb-3">👗</div>
          <div className="font-display font-bold text-lg mb-1">AI Приміряння</div>
          <div className="text-white/40 text-sm">Примір одяг на модель без фотосесії</div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-purple-300 text-sm font-semibold group-hover:translate-x-1 transition-transform">Спробувати →</span>
            <span className="text-white/30 text-xs bg-white/5 px-2 py-1 rounded-full">6 ⭐</span>
          </div>
        </Link>
        <Link href="/video"
          className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 hover:bg-rose-500/15 transition-all hover:-translate-y-1 group">
          <div className="text-3xl mb-3">🎬</div>
          <div className="font-display font-bold text-lg mb-1">AI Відео</div>
          <div className="text-white/40 text-sm">Перетвори фото товару у відеоролик</div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-rose-300 text-sm font-semibold group-hover:translate-x-1 transition-transform">Створити відео →</span>
            <span className="text-white/30 text-xs bg-white/5 px-2 py-1 rounded-full">16 ⭐</span>
          </div>
        </Link>
        <Link href="/generate-model"
          className="bg-pink-500/10 border border-pink-500/20 rounded-2xl p-6 hover:bg-pink-500/15 transition-all hover:-translate-y-1 group">
          <div className="text-3xl mb-3">🧍</div>
          <div className="font-display font-bold text-lg mb-1">AI Моделі</div>
          <div className="text-white/40 text-sm">Генерація моделей з вибором статі, віку, пози</div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-pink-300 text-sm font-semibold group-hover:translate-x-1 transition-transform">Генерувати →</span>
            <span className="text-white/30 text-xs bg-white/5 px-2 py-1 rounded-full">8 ⭐</span>
          </div>
        </Link>
      </div>

      {/* Extra actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <Link href="/pricing" className="border border-white/15 text-white/60 px-5 py-2.5 rounded-xl font-semibold text-sm hover:border-gold hover:text-gold transition-colors">
          ⭐ Поповнити зорі
        </Link>
        <Link href="/referral" className="border border-white/15 text-white/60 px-5 py-2.5 rounded-xl font-semibold text-sm hover:border-indigo-400 hover:text-indigo-400 transition-colors">
          🤝 Запросити друга
        </Link>
        <Link href="/stars" className="border border-white/10 text-white/40 px-5 py-2.5 rounded-xl text-sm hover:border-white/25 hover:text-white/60 transition-colors">
          📊 Історія зорь
        </Link>
        <button onClick={() => downloadCSV('prom')} className="border border-white/10 text-white/35 px-5 py-2.5 rounded-xl text-sm hover:border-green-500/50 hover:text-green-400 transition-colors">
          ⬇ CSV Prom.ua
        </button>
        <button onClick={() => downloadCSV('rozetka')} className="border border-white/10 text-white/35 px-5 py-2.5 rounded-xl text-sm hover:border-green-500/50 hover:text-green-400 transition-colors">
          ⬇ CSV Rozetka
        </button>
        <Link href="/profile" className="border border-white/10 text-white/35 px-5 py-2.5 rounded-xl text-sm hover:border-white/25 hover:text-white/50 transition-colors">
          👤 Профіль
        </Link>
        <Link href="/auth/reset-password" className="border border-white/10 text-white/35 px-5 py-2.5 rounded-xl text-sm hover:border-white/25 hover:text-white/50 transition-colors">
          🔑 Змінити пароль
        </Link>
      </div>

      {/* Cards history */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-lg">Збережені картки</h2>
        {cards.length > 0 && <span className="text-white/30 text-xs">{cards.length} шт. · натисни щоб відкрити</span>}
      </div>

      {cards.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-white/40 mb-5 text-sm">Ще немає жодної картки</p>
          <Link href="/generate" className="inline-block bg-gold text-black px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors">
            Згенерувати першу →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map(card => (
            <Link key={card.id} href={`/card/${card.id}`}
              className="bg-white/[0.03] border border-white/8 rounded-xl px-4 py-4 flex items-start gap-3 hover:border-gold/30 hover:bg-white/[0.05] transition-all group block">
              {card.image_url
                ? <img src={card.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                : <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-lg">📦</div>
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] bg-white/8 text-white/40 px-2 py-0.5 rounded-full">
                    {PLATFORM_LABELS[card.platform] ?? card.platform}
                  </span>
                  <span className="text-white/20 text-[10px]">
                    {new Date(card.created_at).toLocaleDateString('uk-UA')}
                  </span>
                </div>
                <div className="font-semibold text-white text-sm truncate group-hover:text-gold transition-colors">{card.title}</div>
                <div className="text-white/35 text-xs mt-0.5 line-clamp-1">{card.description}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-white/20 text-xs opacity-0 group-hover:opacity-100 transition-opacity">відкрити →</span>
                <button
                  onClick={e => deleteCard(e, card.id)}
                  disabled={deletingId === card.id}
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
