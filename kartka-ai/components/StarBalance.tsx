'use client'
// components/StarBalance.tsx
// Компонент балансу зорь для хедера

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface StarBalanceProps {
  initialBalance?: number
  className?: string
}

export default function StarBalance({ initialBalance = 0, className = '' }: StarBalanceProps) {
  const [balance, setBalance] = useState(initialBalance)
  const [loading, setLoading] = useState(initialBalance === 0)
  const [pulse, setPulse] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchBalance()
    // Оновлюємо баланс кожні 30 секунд
    const interval = setInterval(fetchBalance, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Слухаємо кастомну подію для оновлення балансу після генерації
  useEffect(() => {
    const handler = (e: CustomEvent<{ newBalance: number }>) => {
      setBalance(e.detail.newBalance)
      triggerPulse()
    }
    window.addEventListener('stars-updated', handler as EventListener)
    return () => window.removeEventListener('stars-updated', handler as EventListener)
  }, [])

  async function fetchBalance() {
    try {
      const res = await fetch('/api/stars/balance')
      if (res.ok) {
        const { balance } = await res.json()
        setBalance(balance)
      }
    } catch {
      // тихо ігноруємо
    } finally {
      setLoading(false)
    }
  }

  function triggerPulse() {
    setPulse(true)
    setTimeout(() => setPulse(false), 600)
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-8 w-24 animate-pulse rounded-full bg-white/10" />
      </div>
    )
  }

  const isLow = balance < 10

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Баланс */}
      <Link
        href="/pricing"
        className={`
          flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium
          transition-all duration-200 hover:scale-105
          ${isLow
            ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30'
            : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
          }
          ${pulse ? 'scale-110' : ''}
        `}
        title="Поповнити зорі"
      >
        <span className={`text-base ${pulse ? 'animate-bounce' : ''}`}>⭐</span>
        <span className={isLow ? 'text-red-300' : 'text-white'}>
          {balance.toLocaleString('uk-UA')}
        </span>
      </Link>

      {/* Кнопка поповнення */}
      <Link
        href="/pricing"
        className="
          flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-sm font-medium
          text-white transition-all duration-200 hover:bg-indigo-500 hover:scale-105
          border border-indigo-500
        "
      >
        <span className="text-xs">+</span>
        <span>Поповнити</span>
      </Link>
    </div>
  )
}

// ──────────────────────────────────────────────
// Хук для клієнтського читання балансу
// ──────────────────────────────────────────────
export function useStarsBalance() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/stars/balance')
      .then(r => r.json())
      .then(d => setBalance(d.balance))
      .catch(() => setBalance(0))
  }, [])

  function refetch() {
    fetch('/api/stars/balance')
      .then(r => r.json())
      .then(d => {
        setBalance(d.balance)
        window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: d.balance } }))
      })
      .catch(() => {})
  }

  return { balance, refetch }
}

// ──────────────────────────────────────────────
// Мінімальна версія (тільки число)
// ──────────────────────────────────────────────
export function StarBadge({ balance, className = '' }: { balance: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${className}`}>
      <span>⭐</span>
      <span>{balance}</span>
    </span>
  )
}
