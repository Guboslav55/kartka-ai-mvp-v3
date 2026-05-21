'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Transaction = {
  id: string
  type: 'purchase' | 'spend' | 'promo' | 'free_gift' | 'refund' | 'regeneration'
  amount: number
  description: string
  created_at: string
  payment_id: string | null
}

const TYPE_CONFIG = {
  purchase:     { icon: '💳', label: 'Поповнення',   color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  spend:        { icon: '⚡', label: 'Витрачено',    color: 'text-white/60',   bg: 'bg-white/5 border-white/10' },
  promo:        { icon: '🎁', label: 'Промокод',     color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  free_gift:    { icon: '🎉', label: 'Подарунок',    color: 'text-gold',       bg: 'bg-gold/10 border-gold/20' },
  refund:       { icon: '↩️', label: 'Повернення',   color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  regeneration: { icon: '🔄', label: 'Регенерація',  color: 'text-white/60',   bg: 'bg-white/5 border-white/10' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function StarsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [balance, setBalance] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalEarned: 0, totalSpent: 0 })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const [{ data: profile }, { data: txs }] = await Promise.all([
        supabase.from('users').select('stars_balance').eq('id', user.id).single(),
        supabase.from('star_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
      ])

      if (profile) setBalance(profile.stars_balance ?? 0)
      if (txs) {
        setTransactions(txs)
        const earned = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
        const spent = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
        setStats({ totalEarned: earned, totalSpent: spent })
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors">← Кабінет</Link>
        <Link href="/pricing" className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-500 transition-colors">
          + Поповнити ⭐
        </Link>
      </div>

      <h1 className="font-display font-black text-2xl mb-6">⭐ Зорі</h1>

      {/* Balance + stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-gold/10 border border-gold/25 rounded-2xl p-5 col-span-1">
          <div className="text-white/40 text-xs mb-1">Баланс</div>
          <div className="font-display font-black text-3xl text-gold">{(balance ?? 0).toLocaleString('uk-UA')}</div>
          <div className="text-white/30 text-xs mt-1">⭐ зорь</div>
        </div>
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
          <div className="text-white/40 text-xs mb-1">Нараховано</div>
          <div className="font-display font-bold text-2xl text-green-400">+{stats.totalEarned.toLocaleString('uk-UA')}</div>
          <div className="text-white/30 text-xs mt-1">⭐ всього</div>
        </div>
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-5">
          <div className="text-white/40 text-xs mb-1">Витрачено</div>
          <div className="font-display font-bold text-2xl text-white/60">{stats.totalSpent.toLocaleString('uk-UA')}</div>
          <div className="text-white/30 text-xs mt-1">⭐ всього</div>
        </div>
      </div>

      {/* Transactions */}
      <h2 className="font-bold text-base text-white/60 mb-3 uppercase tracking-wider text-xs">Історія транзакцій</h2>

      {transactions.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-white/40 text-sm">Транзакцій поки немає</p>
          <Link href="/generate" className="inline-block mt-4 text-gold text-sm hover:underline">Згенерувати першу картку →</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map(tx => {
            const cfg = TYPE_CONFIG[tx.type] ?? TYPE_CONFIG.spend
            const isPositive = tx.amount > 0
            return (
              <div key={tx.id} className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${cfg.bg}`}>
                <span className="text-xl shrink-0">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{tx.description || cfg.label}</div>
                  <div className="text-white/30 text-xs mt-0.5">{formatDate(tx.created_at)}</div>
                </div>
                <div className={`font-display font-bold text-lg shrink-0 ${isPositive ? 'text-green-400' : cfg.color}`}>
                  {isPositive ? '+' : ''}{tx.amount} ⭐
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Low balance CTA */}
      {balance !== null && balance < 10 && (
        <div className="mt-8 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-5 text-center">
          <p className="text-white font-semibold mb-1">Зорі майже закінчились</p>
          <p className="text-white/40 text-sm mb-4">Поповни щоб продовжити генерацію</p>
          <Link href="/pricing" className="inline-block bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-500 transition-colors">
            Обрати пакет →
          </Link>
        </div>
      )}
    </div>
  )
}
