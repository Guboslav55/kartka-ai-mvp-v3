'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const ADMIN_EMAIL = 'guboslav55@gmail.com'

type Stats = {
  totalUsers: number
  newUsersToday: number
  totalCards: number
  cardsToday: number
  totalStarsSold: number
  totalRevenue: number
  paymentsToday: number
  activeUsers: number
}

type RecentPayment = {
  id: string
  user_email: string
  package_id: string
  stars_amount: number
  price_uah: number
  status: string
  created_at: string
}

type RecentUser = {
  id: string
  email: string
  stars_balance: number
  cards_total: number
  plan: string
  created_at: string
}


function GiveStarsForm({ token }: { token: string }) {
  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState('50')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ok: boolean, msg: string} | null>(null)

  async function submit() {
    if (!email || !amount) return
    setLoading(true); setResult(null)
    const res = await fetch('/api/admin/give-stars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetEmail: email, amount: parseInt(amount), reason }),
    })
    const d = await res.json()
    setResult({ ok: res.ok, msg: d.message || d.error })
    if (res.ok) { setEmail(''); setReason('') }
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email юзера"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-gold/50" />
      <div className="flex gap-2">
        {[10,25,50,100,500].map(n => (
          <button key={n} onClick={() => setAmount(String(n))}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${amount===String(n) ? 'bg-gold text-black' : 'bg-white/8 text-white/60 hover:bg-white/15'}`}>
            {n}⭐
          </button>
        ))}
        <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1"
          className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 text-white text-xs text-center focus:outline-none" />
      </div>
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Причина (необов'язково)"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none" />
      {result && <div className={`rounded-xl p-2.5 text-sm ${result.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{result.msg}</div>}
      <button onClick={submit} disabled={loading || !email}
        className="w-full bg-gold text-black py-2.5 rounded-xl font-bold text-sm hover:bg-gold-light disabled:opacity-50 transition-colors">
        {loading ? 'Нараховую...' : `⭐ Нарахувати ${amount} зорь`}
      </button>
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [payments, setPayments] = useState<RecentPayment[]>([])
  const [users, setUsers] = useState<RecentUser[]>([])
  const [tab, setTab] = useState<'overview' | 'users' | 'payments'>('overview')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.email !== ADMIN_EMAIL) { router.push('/dashboard'); return }

      const today = new Date(); today.setHours(0,0,0,0)
      const todayIso = today.toISOString()

      const [
        { count: totalUsers },
        { count: newUsersToday },
        { count: totalCards },
        { count: cardsToday },
        { data: paymentsData },
        { data: usersData },
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
        supabase.from('cards').select('*', { count: 'exact', head: true }),
        supabase.from('cards').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
        supabase.from('payments').select('*, users(email)').eq('status', 'success').order('created_at', { ascending: false }).limit(20),
        supabase.from('users').select('id, email, stars_balance, cards_total, plan, created_at').order('created_at', { ascending: false }).limit(20),
      ])

      const successPayments = paymentsData || []
      const totalRevenue = successPayments.reduce((s: number, p: any) => s + (p.price_uah || 0), 0)
      const totalStarsSold = successPayments.reduce((s: number, p: any) => s + (p.stars_amount || 0), 0)
      const paymentsToday = successPayments.filter((p: any) => p.created_at >= todayIso).length

      setStats({
        totalUsers: totalUsers || 0,
        newUsersToday: newUsersToday || 0,
        totalCards: totalCards || 0,
        cardsToday: cardsToday || 0,
        totalStarsSold,
        totalRevenue,
        paymentsToday,
        activeUsers: (usersData || []).filter((u: any) => (u.cards_total || 0) > 0).length,
      })

      setPayments(successPayments.map((p: any) => ({
        id: p.id, user_email: p.users?.email || '—',
        package_id: p.package_id, stars_amount: p.stars_amount,
        price_uah: p.price_uah, status: p.status, created_at: p.created_at,
      })))
      setUsers(usersData || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black text-2xl text-white">⚙️ Адмін-панель</h1>
          <p className="text-white/30 text-xs mt-1">КарткаАІ · тільки для адміна</p>
        </div>
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Юзерів всього', value: stats.totalUsers, sub: `+${stats.newUsersToday} сьогодні`, color: 'text-white' },
            { label: 'Карток всього', value: stats.totalCards, sub: `+${stats.cardsToday} сьогодні`, color: 'text-white' },
            { label: 'Виручка (грн)', value: stats.totalRevenue, sub: `${stats.paymentsToday} оплат сьогодні`, color: 'text-green-400' },
            { label: 'Зорь продано', value: stats.totalStarsSold.toLocaleString('uk-UA'), sub: `${stats.activeUsers} активних юзерів`, color: 'text-gold' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.04] border border-white/8 rounded-2xl p-4">
              <div className={`font-display font-black text-2xl ${s.color}`}>{s.value}</div>
              <div className="text-white/40 text-xs mt-1">{s.label}</div>
              <div className="text-white/20 text-xs mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['overview', 'users', 'payments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab===t ? 'bg-gold text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
            {t === 'overview' ? '📊 Огляд' : t === 'users' ? '👥 Юзери' : '💳 Платежі'}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-white/5 text-white/40 text-xs"><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-right">Зорі</th><th className="px-4 py-3 text-right">Картки</th><th className="px-4 py-3 text-right">Дата</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white truncate max-w-[200px]">{u.email}</td>
                  <td className="px-4 py-3 text-right text-gold font-bold">⭐ {u.stars_balance}</td>
                  <td className="px-4 py-3 text-right text-white/60">{u.cards_total || 0}</td>
                  <td className="px-4 py-3 text-right text-white/30 text-xs">{new Date(u.created_at).toLocaleDateString('uk-UA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments tab */}
      {tab === 'payments' && (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
          {payments.length === 0 ? (
            <div className="p-12 text-center text-white/40">Платежів поки немає</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="bg-white/5 text-white/40 text-xs"><th className="px-4 py-3 text-left">Email</th><th className="px-4 py-3 text-right">Пакет</th><th className="px-4 py-3 text-right">Зорі</th><th className="px-4 py-3 text-right">Сума</th><th className="px-4 py-3 text-right">Дата</th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 text-white truncate max-w-[200px]">{p.user_email}</td>
                    <td className="px-4 py-3 text-right text-white/60 text-xs">{p.package_id}</td>
                    <td className="px-4 py-3 text-right text-gold font-bold">⭐ {p.stars_amount}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-bold">{p.price_uah} ₴</td>
                    <td className="px-4 py-3 text-right text-white/30 text-xs">{new Date(p.created_at).toLocaleDateString('uk-UA')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Overview tab */}
      {tab === 'overview' && stats && (
        <div className="space-y-4">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6">
            <h3 className="font-bold text-white mb-4">Воронка</h3>
            <div className="space-y-3">
              {[
                { label: 'Всього юзерів', value: stats.totalUsers, pct: 100 },
                { label: 'Активних (є картки)', value: stats.activeUsers, pct: Math.round((stats.activeUsers/Math.max(stats.totalUsers,1))*100) },
                { label: 'Платили (є платежі)', value: payments.length > 0 ? new Set(payments.map(p=>p.user_email)).size : 0, pct: Math.round((new Set(payments.map(p=>p.user_email)).size/Math.max(stats.totalUsers,1))*100) },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white/60">{item.label}</span>
                    <span className="text-white font-bold">{item.value} ({item.pct}%)</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full"><div className="h-2 bg-gold rounded-full transition-all" style={{width: item.pct+'%'}}/></div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6">
            <h3 className="font-bold text-white mb-4">Видати зорі вручну</h3>
            <GiveStarsForm token={token} />
          </div>
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6">
            <h3 className="font-bold text-white mb-4">Швидкі посилання</h3>
            <div className="flex flex-wrap gap-3">
              <Link href="https://supabase.com/dashboard" target="_blank" className="bg-white/5 border border-white/10 text-white/60 px-4 py-2 rounded-xl text-sm hover:border-white/25 transition-colors">🗄️ Supabase</Link>
              <Link href="https://vercel.com" target="_blank" className="bg-white/5 border border-white/10 text-white/60 px-4 py-2 rounded-xl text-sm hover:border-white/25 transition-colors">▲ Vercel</Link>
              <Link href="https://platform.openai.com/usage" target="_blank" className="bg-white/5 border border-white/10 text-white/60 px-4 py-2 rounded-xl text-sm hover:border-white/25 transition-colors">🤖 OpenAI</Link>
              <Link href="https://www.liqpay.ua" target="_blank" className="bg-white/5 border border-white/10 text-white/60 px-4 py-2 rounded-xl text-sm hover:border-white/25 transition-colors">💳 LiqPay</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
