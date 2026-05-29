'use client'
import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div>
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="font-display font-bold text-xl text-white mb-3">Щось пішло не так</h2>
        <p className="text-white/40 text-sm mb-2">Виникла непередбачена помилка. Спробуй оновити сторінку або повернись на головну.</p>
        {process.env.NODE_ENV === 'development' && (
          <p className="text-red-400/60 text-xs mb-4 font-mono">{error.message}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button onClick={reset}
            className="bg-gold text-black px-6 py-3 rounded-xl font-bold hover:bg-gold-light transition-colors">
            Спробувати ще раз
          </button>
          <Link href="/"
            className="border border-white/15 text-white/60 px-6 py-3 rounded-xl font-semibold hover:border-white/30 transition-colors">
            На головну
          </Link>
        </div>
      </div>
    </div>
  )
}
