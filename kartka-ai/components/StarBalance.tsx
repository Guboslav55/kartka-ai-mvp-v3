'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface StarBalanceProps {
  initialBalance?: number
  className?: string
}

export default function StarBalance({ initialBalance = 0, className = '' }: StarBalanceProps) {
  const [balance, setBalance] = useState(initialBalance)
  const [loading, setLoading] = useState(initialBalance === 0)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    fetchBalance()
    const interval = setInterval(fetchBalance, 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ newBalance: number }>).detail
      setBalance(detail.newBalance)
      setPulse(true)
      setTimeout(() => setPulse(false), 600)
    }
    window.addEventListener('stars-updated', handler)
    return () => window.removeEventListener('stars-updated', handler)
  }, [])

  async function fetchBalance() {
    try {
      // Get token from Supabase session
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      const res = await fetch('/api/stars/balance', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      if (res.ok) {
        const { balance } = await res.json()
        setBalance(balance)
      }
    } catch {}
    finally { setLoading(false) }
  }

  const isLow = balance < 10

  if (loading) return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-8 w-24 animate-pulse rounded-full bg-white/10" />
    </div>
  )

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Link href="/pricing"
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 hover:scale-105 ${
          isLow
            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
            : 'bg-white/10 text-white border border-white/10'
        } ${pulse ? 'scale-110' : ''}`}
      >
        <span className={`text-base ${pulse ? 'animate-bounce' : ''}`}>⭐</span>
        <span>{balance.toLocaleString('uk-UA')}</span>
      </Link>
      <Link href="/pricing"
        className="flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white border border-indigo-500 hover:bg-indigo-500 transition-colors"
      >
        <span className="text-xs">+</span>
        <span>Поповнити</span>
      </Link>
    </div>
  )
}

export function useStarsBalance() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { createClient } = await import('@/lib/supabase')
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/stars/balance', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
        if (res.ok) { const { balance } = await res.json(); setBalance(balance) }
      } catch {}
    }
    load()
    const h = (e: Event) => setBalance((e as CustomEvent<{newBalance:number}>).detail.newBalance)
    window.addEventListener('stars-updated', h)
    return () => window.removeEventListener('stars-updated', h)
  }, [])

  async function refetch() {
    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/stars/balance', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) {
        const { balance } = await res.json()
        setBalance(balance)
        window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: balance } }))
      }
    } catch {}
  }

  return { balance, refetch }
}

export function StarBadge({ balance, className = '' }: { balance: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${className}`}>
      <span>⭐</span>
      <span>{balance}</span>
    </span>
  )
}
