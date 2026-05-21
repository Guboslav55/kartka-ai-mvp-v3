'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function ReferralPage() {
  const router = useRouter()
  const supabase = createClient()
  const [code, setCode] = useState('')
  const [referrals, setReferrals] = useState(0)
  const [referrerBonus, setReferrerBonus] = useState(20)
  const [invitedBonus, setInvitedBonus] = useState(10)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [inputCode, setInputCode] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ok: boolean, msg: string} | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setToken(session.access_token)

      const res = await fetch('/api/referral', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const d = await res.json()
      if (d.code) setCode(d.code)
      setReferrals(d.referrals || 0)
      setReferrerBonus(d.referrerBonus || 20)
      setInvitedBonus(d.invitedBonus || 10)
      setLoading(false)
    }
    load()
  }, [])

  const link = typeof window !== 'undefined' && code
    ? `${window.location.origin}/auth?ref=${code}`
    : ''

  function copyLink() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function applyCode() {
    if (!inputCode.trim()) return
    setApplying(true)
    setApplyResult(null)
    const res = await fetch('/api/referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ referralCode: inputCode }),
    })
    const d = await res.json()
    setApplyResult({ ok: res.ok, msg: d.message || d.error })
    setApplying(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
      </div>

      <h1 className="font-display font-black text-2xl mb-2">🤝 Запроси друга</h1>
      <p className="text-white/40 text-sm mb-8">Запроси друга — отримаєш <span className="text-gold font-bold">{referrerBonus} ⭐</span>, він отримає <span className="text-indigo-300 font-bold">{invitedBonus} ⭐</span></p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-gold/10 border border-gold/25 rounded-2xl p-5 text-center">
          <div className="font-display font-black text-3xl text-gold">{referrals}</div>
          <div className="text-white/40 text-xs mt-1">Запрошено друзів</div>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 text-center">
          <div className="font-display font-black text-3xl text-white">{referrals * referrerBonus} ⭐</div>
          <div className="text-white/40 text-xs mt-1">Зароблено на рефералах</div>
        </div>
      </div>

      {/* My referral link */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-white mb-1">Твоє реферальне посилання</h2>
        <p className="text-white/40 text-xs mb-4">Поділись з друзями — продавцями на Prom.ua, Rozetka, OLX</p>
        <div className="bg-black/30 rounded-xl px-4 py-3 text-sm text-white/60 font-mono break-all mb-3">
          {link || 'Завантаження...'}
        </div>
        <div className="flex gap-2">
          <button onClick={copyLink} className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${copied ? 'bg-green-600 text-white' : 'bg-gold text-black hover:bg-gold-light'}`}>
            {copied ? '✓ Скопійовано!' : '📋 Копіювати посилання'}
          </button>
          {code && (
            <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),2000); }}
              className="bg-white/10 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-white/15 transition-colors">
              Код: {code}
            </button>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-white mb-4">Як це працює</h2>
        <div className="space-y-3">
          {[
            { icon: '🔗', text: `Поділись посиланням з другом-продавцем` },
            { icon: '📝', text: `Друг реєструється за твоїм посиланням` },
            { icon: '⭐', text: `Ти отримуєш ${referrerBonus} зорь, він — ${invitedBonus} зорь` },
            { icon: '♾️', text: `Без обмежень — запрошуй скільки завгодно!` },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-white/60">
              <span className="text-xl w-8 text-center">{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Apply someone's code */}
      <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6">
        <h2 className="font-bold text-white mb-1">Є реферальний код?</h2>
        <p className="text-white/40 text-xs mb-4">Введи код друга і отримай {invitedBonus} ⭐ бонус</p>
        {applyResult ? (
          <div className={`rounded-xl p-3 text-sm text-center ${applyResult.ok ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
            {applyResult.msg}
          </div>
        ) : (
          <div className="flex gap-2">
            <input value={inputCode} onChange={e => setInputCode(e.target.value.toUpperCase())}
              placeholder="UA-12345" maxLength={8}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm placeholder-white/25 focus:outline-none focus:border-indigo-500"
              onKeyDown={e => e.key==='Enter' && applyCode()} />
            <button onClick={applyCode} disabled={applying || !inputCode.trim()}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors">
              {applying ? '...' : 'Застосувати'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
