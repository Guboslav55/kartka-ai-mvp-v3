'use client';
import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
 
function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);
  const supabase = createClient();
 
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'register') {
        const { error: err } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` }
        });
        if (err) throw err;
        setDone(true);
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('Invalid login credentials')) setError('Невірний email або пароль');
      else if (raw.includes('Email not confirmed')) setError('Підтверди email — перевір пошту');
      else if (raw.includes('already registered')) setError('Цей email вже зареєстровано. Увійди.');
      else setError(raw || 'Помилка. Спробуй ще раз.');
    }
    setLoading(false);
  }
 
  async function resendEmail() {
    setResending(true); setResent(false);
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` }
    });
    if (!err) setResent(true);
    setResending(false);
  }
 
  if (done) return (
    <div className="text-center">
      <div className="text-5xl mb-4">📧</div>
      <h2 className="font-display font-bold text-xl mb-2">Перевір пошту!</h2>
      <p className="text-white/50 text-sm mb-1">
        Лист з підтвердженням надіслано на
      </p>
      <p className="text-white font-semibold text-sm mb-6">{email}</p>
      <p className="text-white/30 text-xs mb-8">
        Не прийшов лист? Перевір папку "Спам". Листи інколи затримуються до 2 хвилин.
      </p>
 
      {resent && (
        <p className="text-green-400 text-sm mb-4 bg-green-400/10 rounded-lg px-4 py-2">
          ✓ Лист надіслано повторно!
        </p>
      )}
 
      <button
        onClick={resendEmail}
        disabled={resending}
        className="w-full border border-white/15 text-white/60 py-3 rounded-xl text-sm font-semibold hover:border-gold hover:text-gold transition-colors disabled:opacity-40 mb-3"
      >
        {resending ? 'Надсилаю...' : '↺ Надіслати лист ще раз'}
      </button>
 
      <button
        onClick={() => { setDone(false); setMode('login'); setResent(false); }}
        className="w-full text-white/30 text-sm hover:text-white transition-colors py-2"
      >
        Вже підтвердив → Увійти
      </button>
    </div>
  );
 
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Email</label>
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-gold transition-colors"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-gold text-xs font-bold uppercase tracking-widest">Пароль</label>
          {mode === 'login' && (
            <Link href="/auth/reset-password" className="text-white/30 text-xs hover:text-gold transition-colors">
              Забув пароль?
            </Link>
          )}
        </div>
        <input
          type="password" required value={password} onChange={e => setPassword(e.target.value)}
          placeholder="мінімум 6 символів"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-gold transition-colors"
        />
      </div>
      {error && (
        <div className="text-red-400 text-sm bg-red-400/10 rounded-lg px-4 py-2 flex items-start gap-2">
          <span>⚠️</span><span>{error}</span>
        </div>
      )}
      <button
        type="submit" disabled={loading}
        className="w-full bg-gold text-black py-3.5 rounded-xl font-bold hover:bg-gold-light transition-colors disabled:opacity-50"
      >
        {loading ? 'Завантаження...' : mode === 'register' ? 'Створити акаунт' : 'Увійти'}
      </button>
      <p className="text-center text-white/40 text-sm">
        {mode === 'register' ? 'Вже є акаунт? ' : 'Немає акаунту? '}
        <button
          type="button"
          onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}
          className="text-gold hover:underline"
        >
          {mode === 'register' ? 'Увійти' : 'Зареєструватися'}
        </button>
      </p>
    </form>
  );
}
 
export default function AuthPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-display font-black text-2xl text-gold">
            Картка<span className="text-white">АІ</span>
          </Link>
          <h1 className="font-display font-bold text-2xl mt-5 mb-1">Вхід до КарткаАІ</h1>
          <p className="text-white/40 text-sm">Перші 5 карточок — безкоштовно</p>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
          <Suspense fallback={<div className="text-white/40 text-center py-4">Завантаження...</div>}>
            <AuthForm />
          </Suspense>
        </div>
        <p className="text-center text-white/20 text-xs mt-6">
          Реєструючись, ти погоджуєшся з{' '}
          <Link href="/legal" className="hover:text-gold transition-colors">умовами використання</Link>
        </p>
      </div>
    </div>
  );
}
