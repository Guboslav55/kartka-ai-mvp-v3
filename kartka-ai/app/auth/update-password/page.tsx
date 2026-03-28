'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError('Мінімум 6 символів'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) setError('Помилка. Спробуй ще раз.');
    else router.push('/dashboard');
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="font-display font-black text-2xl text-gold">Картка<span className="text-white">АІ</span></Link>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
          <h1 className="font-display font-bold text-xl mb-6">Новий пароль</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">Новий пароль</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="мінімум 6 символів"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-gold transition-colors" />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-gold text-black py-3.5 rounded-xl font-bold hover:bg-gold-light transition-colors disabled:opacity-50">
              {loading ? 'Зберігаю...' : 'Зберегти пароль'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
