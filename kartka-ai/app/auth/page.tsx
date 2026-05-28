'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [refCode, setRefCode] = useState('')

  useEffect(() => {
    // Save referral code from URL
    const ref = searchParams.get('ref')
    if (ref) {
      setRefCode(ref)
      localStorage.setItem('referral_code', ref.toUpperCase())
    }
    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/dashboard')
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) { setError('Введіть email та пароль'); return }
    if (password.length < 6) { setError('Пароль мінімум 6 символів'); return }
    setLoading(true); setError('')

    if (mode === 'register') {
      const { error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` }
      })
      if (signUpError) {
        setError(signUpError.message === 'User already registered' ? 'Цей email вже зареєстровано' : signUpError.message)
      } else {
        setSuccess('✅ Перевірте пошту та підтвердіть реєстрацію!')
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message.includes('Invalid') ? 'Невірний email або пароль' : signInError.message)
      } else {
        const redirect = searchParams.get('redirect') || '/dashboard'
        router.push(redirect)
      }
    }
    setLoading(false)
  }

  async function handleGoogle() {
    if (refCode) localStorage.setItem('referral_code', refCode)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="font-display font-black text-2xl text-gold">
            Картка<span className="text-white">АІ</span>
          </Link>
          <p className="text-white/40 text-sm mt-2">
            {mode === 'login' ? 'Увійдіть у свій акаунт' : 'Створіть акаунт безкоштовно'}
          </p>
          {refCode && (
            <div className="mt-3 inline-flex items-center gap-2 bg-green-500/15 border border-green-500/30 rounded-full px-4 py-1.5 text-green-400 text-xs font-semibold">
              🎁 Реферальний код активовано — +10 ⭐ при реєстрації!
            </div>
          )}
        </div>

        {/* Card */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
          {/* Tabs */}
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            <button onClick={() => { setMode('login'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'login' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>
              Увійти
            </button>
            <button onClick={() => { setMode('register'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'register' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}>
              Реєстрація
            </button>
          </div>

          {/* Free stars badge for registration */}
          {mode === 'register' && (
            <div className="bg-gold/10 border border-gold/25 rounded-xl px-4 py-3 mb-5 text-center">
              <p className="text-gold font-semibold text-sm">🎁 При реєстрації — 5 зорь безкоштовно!</p>
              <p className="text-white/40 text-xs mt-0.5">Карта не потрібна · Без підписки</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-white/60 text-xs font-semibold block mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" autoComplete="email"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-white/60 text-xs font-semibold block mb-1.5">Пароль</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Мінімум 6 символів' : '••••••••'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-2.5 text-red-400 text-sm">{error}</div>
            )}
            {success && (
              <div className="bg-green-500/10 border border-green-500/25 rounded-xl px-4 py-2.5 text-green-400 text-sm">{success}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-gold to-gold-light text-black font-bold py-3.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all text-base">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"/>
                  {mode === 'login' ? 'Входжу...' : 'Реєструю...'}
                </span>
              ) : mode === 'login' ? '✦ Увійти' : '✦ Зареєструватись'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/10"/>
            <span className="text-white/30 text-xs">або</span>
            <div className="flex-1 h-px bg-white/10"/>
          </div>

          {/* Google OAuth */}
          <button onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 rounded-xl py-3 text-white font-semibold text-sm hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Продовжити з Google
          </button>

          {/* Footer links */}
          <div className="mt-5 flex items-center justify-between text-xs text-white/30">
            {mode === 'login' ? (
              <button onClick={() => setMode('register')} className="hover:text-white transition-colors">Немає акаунту? Реєстрація</button>
            ) : (
              <button onClick={() => setMode('login')} className="hover:text-white transition-colors">Вже є акаунт? Увійти</button>
            )}
            <Link href="/" className="hover:text-white transition-colors">← На головну</Link>
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-6 text-white/20 text-xs">
          <span>🔒 Захищено SSL</span>
          <span>🇺🇦 Зроблено в Україні</span>
          <span>💳 Оплата через LiqPay</span>
        </div>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>}>
      <AuthContent />
    </Suspense>
  )
}
