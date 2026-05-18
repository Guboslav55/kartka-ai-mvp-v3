// lib/stars.ts
// Утиліти для роботи з системою Зорь ⭐

import { createClient } from '@/lib/supabase/server'

// ──────────────────────────────────────────────
// Вартість операцій (в зорях)
// ──────────────────────────────────────────────
export const STARS_COST = {
  photo:                4,
  infographic_single:   4,
  infographic_triple:   10,
  tryon:                6,
  video_5s:             16,
  video_10s:            32,
  edit:                 2,
  text:                 2,
} as const

export type OperationType = keyof typeof STARS_COST

// ──────────────────────────────────────────────
// Пакети для покупки
// ──────────────────────────────────────────────
export const STAR_PACKAGES = [
  {
    id: 'starter_100',
    name: 'Старт',
    stars: 100,
    price_uah: 99,
    bonus_stars: 0,
    is_popular: false,
    description: 'Ідеально для старту',
    examples: ['~25 фото товарів', 'або ~50 текстових карток'],
  },
  {
    id: 'pro_500',
    name: 'Про',
    stars: 500,
    bonus_stars: 50,
    price_uah: 390,
    is_popular: true,
    description: 'Найкращий вибір',
    examples: ['~137 фото товарів', 'або 250 інфографік'],
  },
  {
    id: 'growth_1200',
    name: 'Зростання',
    stars: 1200,
    bonus_stars: 200,
    price_uah: 790,
    is_popular: false,
    description: 'Для активних продавців',
    examples: ['~350 фото товарів', 'або 700 інфографік'],
  },
  {
    id: 'business_3000',
    name: 'Бізнес',
    stars: 3000,
    bonus_stars: 500,
    price_uah: 1490,
    is_popular: false,
    description: 'Для магазину або команди',
    examples: ['~875 фото товарів', 'або 1750 інфографік'],
  },
  {
    id: 'enterprise_5000',
    name: 'Підприємство',
    stars: 5000,
    bonus_stars: 1000,
    price_uah: 1990,
    is_popular: false,
    description: 'Максимальна вигода',
    examples: ['~1500 фото товарів', 'або 3000 інфографік'],
  },
] as const

export type PackageId = (typeof STAR_PACKAGES)[number]['id']

export function getPackageById(id: string) {
  return STAR_PACKAGES.find(p => p.id === id) ?? null
}

// ──────────────────────────────────────────────
// Серверні функції
// ──────────────────────────────────────────────

/** Отримати поточний баланс зорь */
export async function getBalance(userId: string): Promise<number> {
  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('stars_balance')
    .eq('id', userId)
    .single()
  return data?.stars_balance ?? 0
}

/** Списати зорі (повертає false якщо недостатньо) */
export async function deductStars(
  userId: string,
  amount: number,
  description: string,
  generationId?: string,
): Promise<boolean> {
  const supabase = createClient()

  const { data: success, error } = await supabase.rpc('deduct_stars', {
    p_user_id: userId,
    p_amount: amount,
  })

  if (error || !success) return false

  await supabase.from('star_transactions').insert({
    user_id: userId,
    type: 'spend',
    amount: -amount,
    description,
    generation_id: generationId ?? null,
  })

  return true
}

/** Нарахувати зорі */
export async function addStars(
  userId: string,
  amount: number,
  type: 'purchase' | 'refund' | 'promo' | 'free_gift' | 'regeneration',
  description: string,
  paymentId?: string,
): Promise<void> {
  const supabase = createClient()

  await supabase.rpc('add_stars', {
    p_user_id: userId,
    p_amount: amount,
  })

  await supabase.from('star_transactions').insert({
    user_id: userId,
    type,
    amount,
    description,
    payment_id: paymentId ?? null,
  })
}

/** Отримати останні транзакції */
export async function getTransactions(userId: string, limit = 20) {
  const supabase = createClient()
  const { data } = await supabase
    .from('star_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

/** Кількість безкоштовних регенерацій, що залишились */
export async function getFreeRegenerations(userId: string): Promise<number> {
  const supabase = createClient()
  const { data } = await supabase
    .from('profiles')
    .select('free_regenerations')
    .eq('id', userId)
    .single()
  return data?.free_regenerations ?? 0
}

/** Використати безкоштовну регенерацію */
export async function useFreeRegeneration(userId: string): Promise<boolean> {
  const supabase = createClient()
  const free = await getFreeRegenerations(userId)
  if (free <= 0) return false

  await supabase
    .from('profiles')
    .update({ free_regenerations: free - 1 })
    .eq('id', userId)

  await supabase.from('star_transactions').insert({
    user_id: userId,
    type: 'regeneration',
    amount: 0,
    description: `Безкоштовна регенерація (лишилось ${free - 1})`,
  })

  return true
}

// ──────────────────────────────────────────────
// Хелпери
// ──────────────────────────────────────────────

/** Форматувати зорі для відображення */
export function formatStars(amount: number): string {
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k ⭐`
  return `${amount} ⭐`
}

/** Розрахувати ціну за зорю для пакету */
export function pricePerStar(pkg: (typeof STAR_PACKAGES)[number]): string {
  const total = pkg.stars + pkg.bonus_stars
  return (pkg.price_uah / total).toFixed(2)
}
