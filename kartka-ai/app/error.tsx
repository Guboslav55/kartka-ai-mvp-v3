'use client';
import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error('App error:', error); }, [error]);
  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div>
        <div className="text-6xl mb-6">⚠️</div>
        <h1 className="font-display font-black text-2xl mb-3">Щось пішло не так</h1>
        <p className="text-white/40 text-sm mb-8 max-w-sm mx-auto">
          Виникла непередбачена помилка. Спробуй оновити сторінку або поверніться на головну.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button onClick={reset}
            className="bg-gold text-black px-6 py-3 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors">
            Спробувати ще раз
          </button>
          <Link href="/"
            className="border border-white/20 text-white px-6 py-3 rounded-xl text-sm hover:border-white/40 transition-colors">
            На головну
          </Link>
        </div>
      </div>
    </div>
  );
}
