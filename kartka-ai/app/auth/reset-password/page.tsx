'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/update-password`,
    });
    if (err) setError('Помилка. Перевір email та спробуй ще раз.');
    else setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-display font-black text-2xl text-gold">
            Картка<span className="text-white">АІ</span>
          </Link>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
          {sent ? (
            <div className="text-center">
              <div className="text-5xl mb-4">📧</div>
              <h2 className="font-display font-bold text-xl mb-2">Лист надіслано!</h2>
              <p className="text-white/50 text-sm">Перевір пошту та перейди за посиланням для скидання пароля.</p>
              <Link href="/auth" className="inline-block mt-6 text-gold text-sm hover:underline">← Назад до входу</Link>
            </div>
          ) : (
            <>
              <h1 className="font-display font-bold text-xl mb-1">Відновлення паролю</h1>
              <p className="text-white/40 text-sm mb-6">Вкажи email — надішлемо посилання для скидання</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Email</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-gold transition-colors" />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full bg-gold text-black py-3.5 rounded-xl font-bold hover:bg-gold-light transition-colors disabled:opacity-50">
                  {loading ? 'Надсилаю...' : 'Надіслати посилання'}
                </button>
                <Link href="/auth" className="block text-center text-white/40 text-sm hover:text-white transition-colors">
                  ← Назад
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
