'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'register') {
        const { error: err } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
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

  if (done) return (
    <div className="text-center">
      <div className="text-5xl mb-4">📧</div>
      <h2 className="font-display font-bold text-xl mb-2">Перевір пошту!</h2>
      <p className="text-white/50 text-sm">Лист з підтвердженням надіслано на <strong className="text-white">{email}</strong></p>
      <p className="text-white/30 text-xs mt-2">Перейди за посиланням у листі щоб активувати акаунт.</p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-gold transition-colors" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-gold text-xs font-bold uppercase tracking-widest">Пароль</label>
          {mode === 'login' && <Link href="/auth/reset-password" className="text-white/30 text-xs hover:text-gold transition-colors">Забув пароль?</Link>}
        </div>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="мінімум 6 символів"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-gold transition-colors" />
      </div>
      {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-4 py-2">{error}</p>}
      <button type="submit" disabled={loading} className="w-full bg-gold text-black py-3.5 rounded-xl font-bold hover:bg-gold-light transition-colors disabled:opacity-50">
        {loading ? 'Завантаження...' : mode === 'register' ? 'Створити акаунт' : 'Увійти'}
      </button>
      <p className="text-center text-white/40 text-sm">
        {mode === 'register' ? 'Вже є акаунт? ' : 'Немає акаунту? '}
        <button type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }} className="text-gold hover:underline">
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
          <Link href="/" className="font-display font-black text-2xl text-gold">Картка<span className="text-white">АІ</span></Link>
          <h1 className="font-display font-bold text-2xl mt-5 mb-1">Вхід до КарткаАІ</h1>
          <p className="text-white/40 text-sm">Перші 5 карточок — безкоштовно</p>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
          <Suspense fallback={<div className="text-white/40 text-center py-4">Завантаження...</div>}>
            <AuthForm />
          </Suspense>
        </div>
        <p className="text-center text-white/20 text-xs mt-6">
          Реєструючись, ти погоджуєшся з <Link href="/legal" className="hover:text-gold transition-colors">умовами використання</Link>
        </p>
      </div>
    </div>
  );
}

