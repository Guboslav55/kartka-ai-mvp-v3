// lib/stars.ts
// Тільки константи та чисті функції — безпечно імпортувати з client компонентів

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

export const STAR_PACKAGES = [
  { id: 'starter_100',     name: 'Старт',        stars: 100,  price_uah: 99,   bonus_stars: 0,    is_popular: false, description: 'Ідеально для старту',              examples: ['~25 фото товарів',    'або ×50 текстових карток'] },
  { id: 'pro_500',         name: 'Про',          stars: 500,  price_uah: 390,  bonus_stars: 50,   is_popular: true,  description: 'Кращий вибір',                     examples: ['~137 фото товарів',   'або 250 інфографік'] },
  { id: 'growth_1200',     name: 'Зростання',    stars: 1200, price_uah: 790,  bonus_stars: 200,  is_popular: false, description: 'Для активних продавців',            examples: ['~350 фото товарів',   'або 700 інфографік'] },
  { id: 'business_3000',   name: 'Бізнес',       stars: 3000, price_uah: 1490, bonus_stars: 500,  is_popular: false, description: 'Для магазину або команди',          examples: ['~875 фото товарів',   'або 1750 інфографік'] },
  { id: 'enterprise_5000', name: 'Підприємство', stars: 5000, price_uah: 1990, bonus_stars: 1000, is_popular: false, description: 'Максимальна вигода',                examples: ['~1500 фото товарів',  'або 3000 інфографік'] },
] as const

export type PackageId = (typeof STAR_PACKAGES)[number]['id']

export function getPackageById(id: string) {
  return STAR_PACKAGES.find(p => p.id === id) ?? null
}

export function formatStars(amount: number): string {
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k ⭐`
  return `${amount} ⭐`
}

export function pricePerStar(pkg: (typeof STAR_PACKAGES)[number]): string {
  const total = pkg.stars + pkg.bonus_stars
  return (pkg.price_uah / total).toFixed(2)
}
