'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import type { UserProfile, SavedCard } from '@/types';

const PLAN_LABELS: Record<string, string> = { free: 'Стартер', pro: 'Про', business: 'Бізнес' };
const PLAN_COLORS: Record<string, string> = { free: 'text-white/50', pro: 'text-gold', business: 'text-blue-400' };
const PLATFORM_LABELS: Record<string, string> = { prom: 'Prom.ua', rozetka: 'Rozetka', olx: 'OLX', general: 'Загальний' };

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user: auth } } = await supabase.auth.getUser();
      if (!auth) { router.push('/auth'); return; }

      const [{ data: profile }, { data: saved }] = await Promise.all([
        supabase.from('users').select('*').eq('id', auth.id).single(),
        supabase.from('cards').select('*').eq('user_id', auth.id).order('created_at', { ascending: false }).limit(30),
      ]);
      if (profile) setUser(profile as UserProfile);
      if (saved) setCards(saved as SavedCard[]);
      setLoading(false);
    }
    load();
  }, []);

  async function deleteCard(id: string) {
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

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="font-display font-black text-xl text-gold">
          Картка<span className="text-white">АІ</span>
        </Link>
        <button onClick={signOut} className="text-white/30 text-sm hover:text-white transition-colors">Вийти</button>
      </div>

      {/* Stats grid */}
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

      {/* Upgrade banner for free users */}
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

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <Link href="/generate"
          className="bg-gold text-black px-6 py-3 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors flex items-center gap-2">
          ✦ Нова картка
        </Link>
        {plan !== 'business' && (
          <Link href="/pricing"
            className="border border-white/15 text-white/60 px-6 py-3 rounded-xl font-semibold text-sm hover:border-gold hover:text-gold transition-colors">
            ↑ Підвищити тариф
          </Link>
        )}
        <Link href="/auth/reset-password"
          className="border border-white/15 text-white/40 px-6 py-3 rounded-xl text-sm hover:border-white/30 hover:text-white/60 transition-colors">
          🔑 Змінити пароль
        </Link>
      </div>

      {/* Cards list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-lg">Останні картки</h2>
        {cards.length > 0 && <span className="text-white/30 text-xs">{cards.length} шт.</span>}
      </div>

      {cards.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-white/40 mb-5 text-sm">Ще немає жодної картки</p>
          <Link href="/generate"
            className="inline-block bg-gold text-black px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors">
            Згенерувати першу →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map(card => (
            <div key={card.id}
              className="bg-white/[0.03] border border-white/8 rounded-xl px-4 py-4 flex items-start gap-3 hover:border-white/15 transition-colors group">
              {/* Image */}
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
                <div className="font-semibold text-white text-sm truncate">{card.title}</div>
                <div className="text-white/35 text-xs mt-0.5 line-clamp-1">{card.description}</div>
              </div>
              {/* Delete */}
              <button
                onClick={() => deleteCard(card.id)}
                disabled={deletingId === card.id}
                className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all text-lg shrink-0 disabled:opacity-50">
                {deletingId === card.id ? '...' : '×'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const metadata = { title: 'Кабінет' };
