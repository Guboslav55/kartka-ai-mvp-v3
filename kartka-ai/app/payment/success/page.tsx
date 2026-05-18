'use client'
import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderId = searchParams.get('order')
  const [stars, setStars] = useState<number | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(true)
    if (orderId) {
      const token = typeof window !== 'undefined'
        ? (window as any).supabase?.auth?.session?.()?.access_token
        : null
      fetch('/api/stars/balance', token ? { headers: { Authorization: `Bearer ${token}` } } : {})
        .then(r => r.json()).then(d => {
          setStars(d.balance)
          window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: d.balance } }))
        }).catch(() => {})
    }
    const t = setTimeout(() => router.push('/generate'), 5000)
    return () => clearTimeout(t)
  }, [orderId, router])

  return (
    <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className={`text-8xl mb-6 transition-all duration-700 ${show ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          🎉
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Зорі нараховано!</h1>
        {stars !== null && (
          <p className="text-xl text-indigo-300 mb-2">
            Баланс: <span className="font-bold text-white">⭐ {stars.toLocaleString('uk-UA')}</span>
          </p>
        )}
        <p className="text-gray-400 mb-8">Дякуємо за поповнення! Тепер можна створювати картки товарів.</p>
        <div className="flex flex-col gap-3">
          <Link href="/generate" className="w-full rounded-xl bg-indigo-600 py-3 text-white font-semibold hover:bg-indigo-500 transition-colors">
            ⚡ Створити картку товару
          </Link>
          <Link href="/pricing" className="w-full rounded-xl bg-white/10 py-3 text-white font-semibold hover:bg-white/20 transition-colors">
            Переглянути тарифи
          </Link>
        </div>
        <p className="mt-6 text-sm text-gray-500">Автоматичний перехід через 5 сек...</p>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center">
        <div className="text-white text-xl">Завантаження...</div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  )
}
