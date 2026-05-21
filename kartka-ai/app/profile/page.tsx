'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ok: boolean, text: string} | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user: auth } } = await supabase.auth.getUser()
      if (!auth) { router.push('/auth'); return }
      setUser(auth)
      const { data } = await supabase.from('users').select('*').eq('id', auth.id).single()
      setProfile(data)
      setLoading(false)
    }
    load()
  }, [])

  async function changePassword() {
    if (!newPassword || newPassword !== confirmPassword) {
      setMsg({ ok: false, text: 'Паролі не збігаються' }); return
    }
    if (newPassword.length < 6) {
      setMsg({ ok: false, text: 'Пароль мінімум 6 символів' }); return
    }
    setChangingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setMsg({ ok: false, text: error.message })
    else { setMsg({ ok: true, text: 'Пароль змінено ✅' }); setNewPassword(''); setConfirmPassword('') }
    setChangingPw(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        <button onClick={signOut} className="text-white/30 text-xs hover:text-red-400 transition-colors">Вийти</button>
      </div>

      <h1 className="font-display font-black text-2xl mb-6">👤 Профіль</h1>

      {/* Account info */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 mb-5">
        <h2 className="font-bold text-white mb-4 text-sm uppercase tracking-wider text-white/40">Акаунт</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-sm">Email</span>
            <span className="text-white text-sm font-mono">{user?.email}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-sm">Код акаунту</span>
            <span className="text-gold font-mono text-sm">{profile?.account_code || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-sm">Тариф</span>
            <span className="text-white text-sm capitalize">{profile?.plan || 'free'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-sm">Баланс зорь</span>
            <span className="text-gold font-bold">⭐ {(profile?.stars_balance ?? 0).toLocaleString('uk-UA')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-sm">Карток створено</span>
            <span className="text-white text-sm">{profile?.cards_total ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 mb-5">
        <h2 className="font-bold text-white mb-4 text-sm uppercase tracking-wider text-white/40">Змінити пароль</h2>
        <div className="space-y-3">
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            placeholder="Новий пароль (мін. 6 символів)"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-indigo-500" />
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Повторити пароль"
            onKeyDown={e => e.key === 'Enter' && changePassword()}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-indigo-500" />
          {msg && <div className={`rounded-xl p-3 text-sm ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{msg.text}</div>}
          <button onClick={changePassword} disabled={changingPw || !newPassword}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {changingPw ? 'Зберігаю...' : 'Змінити пароль'}
          </button>
        </div>
      </div>

      {/* Quick links */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
        <h2 className="font-bold text-white mb-4 text-sm uppercase tracking-wider text-white/40">Швидкі посилання</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/stars" className="bg-white/5 border border-white/10 rounded-xl p-3 text-center text-sm text-white/60 hover:border-gold/30 hover:text-gold transition-colors">
            📊 Зорі та транзакції
          </Link>
          <Link href="/referral" className="bg-white/5 border border-white/10 rounded-xl p-3 text-center text-sm text-white/60 hover:border-indigo-400/30 hover:text-indigo-400 transition-colors">
            🤝 Реферальна програма
          </Link>
          <Link href="/pricing" className="bg-white/5 border border-white/10 rounded-xl p-3 text-center text-sm text-white/60 hover:border-green-400/30 hover:text-green-400 transition-colors">
            ⭐ Поповнити зорі
          </Link>
          <Link href="/dashboard" className="bg-white/5 border border-white/10 rounded-xl p-3 text-center text-sm text-white/60 hover:border-white/30 hover:text-white transition-colors">
            🏠 Кабінет
          </Link>
        </div>
      </div>

      {/* Danger zone */}
      <div className="mt-6 border border-red-500/15 rounded-2xl p-5">
        <h2 className="text-red-400/70 text-xs font-bold uppercase tracking-wider mb-3">Небезпечна зона</h2>
        <button onClick={signOut} className="w-full border border-red-500/20 text-red-400/60 py-2.5 rounded-xl text-sm hover:border-red-500/40 hover:text-red-400 transition-colors">
          Вийти з акаунту
        </button>
      </div>
    </div>
  )
}
