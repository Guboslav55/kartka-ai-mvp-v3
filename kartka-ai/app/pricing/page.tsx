'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { STAR_PACKAGES, STARS_COST, pricePerStar } from '@/lib/stars'

function LiqPayForm({ data, signature }: { data: string; signature: string }) {
  return (
    <form method="POST" action="https://www.liqpay.ua/api/3/checkout" acceptCharset="utf-8">
      <input type="hidden" name="data" value={data} />
      <input type="hidden" name="signature" value={signature} />
      <button type="submit" className="w-full rounded-xl bg-indigo-600 py-3 text-white font-semibold hover:bg-indigo-500 transition-colors text-lg">
        Перейти до оплати →
      </button>
    </form>
  )
}

function PurchaseModal({ pkg, token, onClose }: { pkg: (typeof STAR_PACKAGES)[number]; token: string; onClose: () => void }) {
  const [promoCode, setPromoCode] = useState('')
  const [promoApplied, setPromoApplied] = useState<{ type: 'discount' | 'stars'; discount_percent?: number; free_stars?: number; message: string } | null>(null)
  const [promoError, setPromoError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [paymentData, setPaymentData] = useState<{ data: string; signature: string; finalPrice: number; totalStars: number; discountPercent: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const total = pkg.stars + pkg.bonus_stars

  async function applyPromo() {
    if (!promoCode.trim()) return
    setPromoLoading(true); setPromoError('')
    try {
      const res = await fetch('/api/promo/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: promoCode }),
      })
      const d = await res.json()
      if (!res.ok) { setPromoError(d.error) }
      else {
        setPromoApplied(d)
        if (d.type === 'stars') window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: 0 } }))
      }
    } catch { setPromoError('Помилка перевірки промокоду') }
    finally { setPromoLoading(false) }
  }

  async function initPayment() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packageId: pkg.id, promoCode: promoApplied?.type === 'discount' ? promoCode : undefined }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Помилка ініціації платежу'); return }
      setPaymentData(d)
    } catch { setError('Помилка підключення. Спробуйте ще раз.') }
    finally { setLoading(false) }
  }

  const discountPct = promoApplied?.type === 'discount' ? promoApplied.discount_percent ?? 0 : 0
  const finalPrice = Math.round(pkg.price_uah * (1 - discountPct / 100))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[#1A1A2E] border border-white/10 p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Пакет «{pkg.name}»</h2>
            <p className="text-gray-400 text-sm">⭐ {total.toLocaleString('uk-UA')} зорь</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="mb-5 rounded-xl bg-white/5 p-4">
          <div className="flex justify-between text-sm mb-2"><span className="text-gray-400">Зорі</span><span className="text-white font-medium">⭐ {pkg.stars.toLocaleString('uk-UA')}</span></div>
          {pkg.bonus_stars > 0 && <div className="flex justify-between text-sm mb-2"><span className="text-gray-400">Бонус</span><span className="text-green-400 font-medium">+ ⭐ {pkg.bonus_stars.toLocaleString('uk-UA')}</span></div>}
          <div className="border-t border-white/10 pt-2 mt-2 flex justify-between"><span className="text-gray-300 font-medium">Разом</span><span className="text-white font-bold">⭐ {total.toLocaleString('uk-UA')}</span></div>
        </div>

        {!paymentData && (
          <div className="mb-5">
            <label className="text-sm text-gray-400 mb-2 block">Промокод (необов'язково)</label>
            {promoApplied ? (
              <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-sm text-green-400">{promoApplied.message}</div>
            ) : (
              <div className="flex gap-2">
                <input type="text" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="KARTKA20"
                  className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
                  onKeyDown={e => e.key === 'Enter' && applyPromo()} />
                <button onClick={applyPromo} disabled={promoLoading || !promoCode.trim()}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-50 transition-colors">
                  {promoLoading ? '...' : 'Застосувати'}
                </button>
              </div>
            )}
            {promoError && <p className="mt-2 text-sm text-red-400">{promoError}</p>}
          </div>
        )}

        {!paymentData && (
          <div className="mb-5 flex items-center justify-between">
            <span className="text-gray-300">До сплати</span>
            <div className="text-right">
              {discountPct > 0 && <div className="text-sm text-gray-500 line-through">{pkg.price_uah} грн</div>}
              <div className="text-2xl font-bold text-white">{finalPrice} грн</div>
              {discountPct > 0 && <div className="text-sm text-green-400">-{discountPct}%</div>}
            </div>
          </div>
        )}

        {error && <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">{error}</div>}

        {paymentData ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-sm text-green-400 text-center">
              ✅ Готово! До сплати: {paymentData.finalPrice} грн за {paymentData.totalStars} ⭐
            </div>
            <LiqPayForm data={paymentData.data} signature={paymentData.signature} />
          </div>
        ) : (
          <button onClick={initPayment} disabled={loading}
            className="w-full rounded-xl bg-indigo-600 py-3 text-white font-semibold hover:bg-indigo-500 disabled:opacity-70 transition-colors text-lg">
            {loading ? <span className="flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Підготовка...</span> : `Оплатити ${finalPrice} грн →`}
          </button>
        )}

        <p className="mt-4 text-center text-xs text-gray-500">Оплата через LiqPay · Visa/Mastercard UAH · Зорі надходять миттєво</p>
      </div>
    </div>
  )
}

function PackageCard({ pkg, onSelect }: { pkg: (typeof STAR_PACKAGES)[number]; onSelect: () => void }) {
  const total = pkg.stars + pkg.bonus_stars
  const perStar = pricePerStar(pkg)
  return (
    <div onClick={onSelect}
      className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-200 hover:scale-[1.02] cursor-pointer ${pkg.is_popular ? 'bg-indigo-600/20 border-indigo-500 shadow-indigo-500/20 shadow-lg' : 'bg-[#1A1A2E] border-white/10 hover:border-white/20'}`}>
      {pkg.is_popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 px-4 py-1 text-xs font-bold text-white">⭐ Найпопулярніший</div>}
      <h3 className="text-lg font-bold text-white mb-1">{pkg.name}</h3>
      <p className="text-sm text-gray-400 mb-4">{pkg.description}</p>
      <div className="mb-4">
        <div className="text-3xl font-bold text-white">⭐ {pkg.stars.toLocaleString('uk-UA')}</div>
        {pkg.bonus_stars > 0 && <div className="text-sm text-green-400 font-medium mt-1">+ {pkg.bonus_stars.toLocaleString('uk-UA')} бонусних зорь</div>}
        {pkg.bonus_stars > 0 && <div className="text-xs text-gray-400 mt-0.5">Всього: {total.toLocaleString('uk-UA')} зорь</div>}
      </div>
      <ul className="mb-5 space-y-1">
        {pkg.examples.map((ex, i) => <li key={i} className="flex items-center gap-2 text-sm text-gray-400"><span className="text-indigo-400">✓</span>{ex}</li>)}
      </ul>
      <div className="mt-auto">
        <div className="flex items-end justify-between mb-3">
          <div className="text-2xl font-bold text-white">{pkg.price_uah} грн</div>
          <div className="text-sm text-gray-400">{perStar} грн/⭐</div>
        </div>
        <button className={`w-full rounded-xl py-2.5 font-semibold transition-colors ${pkg.is_popular ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-white/10 text-white hover:bg-white/20'}`}>Обрати →</button>
      </div>
    </div>
  )
}

function CostTable() {
  const items = [
    { icon: '📝', name: 'Текстова картка товару', cost: STARS_COST.text },
    { icon: '📸', name: 'AI Фото-студія (1 фото)', cost: STARS_COST.photo },
    { icon: '🎨', name: 'Інфографіка (1 варіант)', cost: STARS_COST.infographic_single },
    { icon: '🎨', name: 'Інфографіка (3 варіанти)', cost: STARS_COST.infographic_triple },
    { icon: '👗', name: 'AI Приміряння', cost: STARS_COST.tryon },
    { icon: '🎬', name: 'AI Відео (5 сек)', cost: STARS_COST.video_5s },
    { icon: '🎬', name: 'AI Відео (10 сек)', cost: STARS_COST.video_10s },
    { icon: '✏️', name: 'Редагування зображення', cost: STARS_COST.edit },
    { icon: '🔍', name: 'Аналіз товару з фото', cost: 0 },
    { icon: '🗑️', name: 'Видалення фону', cost: 0 },
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <table className="w-full">
        <thead><tr className="bg-white/5"><th className="px-4 py-3 text-left text-sm text-gray-400 font-medium">Операція</th><th className="px-4 py-3 text-right text-sm text-gray-400 font-medium">Вартість</th></tr></thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
              <td className="px-4 py-3 text-sm text-gray-300"><span className="mr-2">{item.icon}</span>{item.name}</td>
              <td className="px-4 py-3 text-right">
                {item.cost === 0 ? <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">Безкоштовно</span> : <span className="font-semibold text-white">⭐ {item.cost}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PricingPage() {
  const router = useRouter()
  const [selectedPkg, setSelectedPkg] = useState<(typeof STAR_PACKAGES)[number] | null>(null)
  const [token, setToken] = useState('')
  const [starsBalance, setStarsBalance] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setToken(session.access_token)
        supabase.from('users').select('stars_balance').eq('id', session.user.id).single()
          .then(({ data }) => { if (data) setStarsBalance(data.stars_balance ?? 0) })
      }
    })
    const handler = (e: any) => { if (typeof e.detail?.newBalance === 'number') setStarsBalance(e.detail.newBalance) }
    window.addEventListener('stars-updated', handler)
    return () => window.removeEventListener('stars-updated', handler)
  }, [])

  function handleSelect(pkg: (typeof STAR_PACKAGES)[number]) {
    if (!token) { router.push('/auth?redirect=/pricing'); return }
    setSelectedPkg(pkg)
  }

  return (
    <div className="min-h-screen bg-[#0F0F1A] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0F0F1A]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-xl font-bold text-white">КарткаАІ</Link>
          <div className="flex items-center gap-3">
            {starsBalance !== null && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white border border-white/15">
                ⭐ {starsBalance.toLocaleString('uk-UA')}
              </span>
            )}
            <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">← Кабінет</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold">Оберіть пакет <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Зорь ⭐</span></h1>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">Зорі — внутрішня валюта КарткаАІ. Не згорають, без обмежень терміну.</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/30 px-4 py-2 text-sm text-green-400">
            🎁 5 безкоштовних зорь при реєстрації · Карта не потрібна
          </div>
        </div>

        <div className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {STAR_PACKAGES.map(pkg => <PackageCard key={pkg.id} pkg={pkg} onSelect={() => handleSelect(pkg)} />)}
        </div>

        <div className="mb-16">
          <h2 className="mb-6 text-2xl font-bold text-center">Скільки коштує кожна дія?</h2>
          <div className="max-w-xl mx-auto"><CostTable /></div>
        </div>

        <div className="mb-16 max-w-2xl mx-auto">
          <h2 className="mb-6 text-2xl font-bold text-center">Часті питання</h2>
          <div className="space-y-4">
            {[
              { q: 'Що таке Зорі?', a: 'Зорі — внутрішня валюта КарткаАІ. Кожна операція витрачає певну кількість зорь.' },
              { q: 'Чи згорають Зорі?', a: 'Ні. Зорі діють безстроково — використовуйте коли зручно.' },
              { q: 'Коли зарахуються зорі після оплати?', a: 'Миттєво після підтвердження платежу LiqPay. Зазвичай до 1 хвилини.' },
              { q: 'Що якщо генерація не вдалась?', a: 'Зорі повертаються автоматично. Якщо ні — напишіть у Telegram-підтримку.' },
              { q: 'Чи є безкоштовний план?', a: 'Так! При реєстрації ви отримуєте 5 безкоштовних зорь.' },
              { q: 'Можна отримати повернення коштів?', a: 'Так, протягом 7 днів без питань. Напишіть у Telegram-підтримку.' },
            ].map((item, i) => (
              <details key={i} className="group rounded-xl bg-[#1A1A2E] border border-white/10 p-4">
                <summary className="cursor-pointer text-white font-medium flex justify-between items-center">{item.q}<span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span></summary>
                <p className="mt-3 text-gray-400 text-sm">{item.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="text-center rounded-2xl bg-indigo-600/20 border border-indigo-500/30 p-8">
          <p className="text-xl font-semibold text-white mb-2">Ще не пробували КарткаАІ?</p>
          <p className="text-gray-400 mb-5">5 безкоштовних зорь при реєстрації. Карта не потрібна.</p>
          <Link href="/auth" className="inline-block rounded-xl bg-indigo-600 px-8 py-3 text-white font-semibold hover:bg-indigo-500 transition-colors">Спробувати безкоштовно →</Link>
        </div>
      </main>

      {selectedPkg && token && <PurchaseModal pkg={selectedPkg} token={token} onClose={() => setSelectedPkg(null)} />}
    </div>
  )
}
