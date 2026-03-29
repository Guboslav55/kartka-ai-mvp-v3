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
  }, []);

  async function deleteCard(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation();
    setDeletingId(id);
    await supabase.from('cards').delete().eq('id', id);
    setCards(prev => prev.filter(c => c.id !== id));
    setDeletingId(null);
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
  const cardsLeft = user?.cards_left === 99999 ? '∞' : String(user?.cards_left ?? 0);

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="font-display font-black text-xl text-gold">
          Картка<span className="text-white">АІ</span>
        </Link>
        <button onClick={signOut} className="text-white/30 text-sm hover:text-white transition-colors">Вийти</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Тариф', value: PLAN_LABELS[plan], cls: PLAN_COLORS[plan] },
          { label: 'Залишок карточок', value: cardsLeft, cls: 'text-white' },
          { label: 'Всього створено', value: String(user?.cards_total ?? 0), cls: 'text-white' },
          { label: 'Збережено', value: String(cards.length), cls: 'text-white' },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.04] border border-white/8 rounded-2xl p-4 sm:p-5">
            <div className={`font-display font-black text-2xl mb-1 ${s.cls}`}>{s.value}</div>
            <div className="text-white/35 text-xs leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Upgrade banner */}
      {plan === 'free' && (user?.cards_left ?? 0) <= 2 && (
        <div className="bg-gold/8 border border-gold/25 rounded-2xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-gold font-semibold text-sm">Карточки майже закінчились!</p>
            <p className="text-white/45 text-xs mt-0.5">Про-тариф: 200 карточок за 499 ₴/міс</p>
          </div>
          <Link href="/pricing" className="bg-gold text-black px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors shrink-0">
            Підвищити тариф →
          </Link>
        </div>
      )}

      {/* Main actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link href="/generate"
          className="bg-gold/10 border border-gold/30 rounded-2xl p-6 hover:bg-gold/15 transition-all hover:-translate-y-1 group">
          <div className="text-3xl mb-3">✏️</div>
          <div className="font-display font-bold text-lg mb-1">Генератор тексту</div>
          <div className="text-white/40 text-sm">Заголовок, опис, переваги та ключові слова</div>
          <div className="text-gold text-sm mt-3 font-semibold group-hover:translate-x-1 transition-transform">Створити картку →</div>
        </Link>
        <Link href="/banner"
          className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all hover:-translate-y-1 group">
          <div className="text-3xl mb-3">🖼️</div>
          <div className="font-display font-bold text-lg mb-1">Банер товару</div>
          <div className="text-white/40 text-sm">Завантаж фото → AI генерує 2 банери</div>
          <div className="text-white/40 text-sm mt-3 font-semibold group-hover:text-white/60 group-hover:translate-x-1 transition-all">Створити банер →</div>
        </Link>
      </div>

      {/* Extra actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        {plan !== 'business' && (
          <Link href="/pricing" className="border border-white/15 text-white/60 px-5 py-2.5 rounded-xl font-semibold text-sm hover:border-gold hover:text-gold transition-colors">
            ↑ Підвищити тариф
          </Link>
        )}
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
              {/* Thumbnail */}
              {card.image_url
                ? <img src={card.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                : <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-lg">📦</div>
              }
              {/* Text */}
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
              {/* Actions */}
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
