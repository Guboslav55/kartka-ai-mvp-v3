export const STARS_COST = {
  text: 2,
  photo: 4,
  infographic_single: 4,
  infographic_triple: 10,
  tryon: 6,
  video_5s: 16,
  video_10s: 32,
  edit: 2,
  regeneration: 2,
} as const

export type StarsPackage = {
  id: string
  name: string
  description: string
  stars: number
  bonus_stars: number
  price_uah: number
  is_popular: boolean
  examples: string[]
}

export const STAR_PACKAGES: StarsPackage[] = [
  {
    id: 'starter_100',
    name: 'Старт',
    description: 'Ідеально для старту',
    stars: 100,
    bonus_stars: 0,
    price_uah: 99,
    is_popular: false,
    examples: ['~25 фото товарів', 'або ~50 текстових карток'],
  },
  {
    id: 'pro_500',
    name: 'Про',
    description: 'Кращий вибір',
    stars: 500,
    bonus_stars: 50,
    price_uah: 390,
    is_popular: true,
    examples: ['~137 фото товарів', 'або 250 інфографік'],
  },
  {
    id: 'growth_1200',
    name: 'Зростання',
    description: 'Для активних продавців',
    stars: 1200,
    bonus_stars: 200,
    price_uah: 790,
    is_popular: false,
    examples: ['~350 фото товарів', 'або 700 інфографік'],
  },
  {
    id: 'business_3000',
    name: 'Бізнес',
    description: 'Для магазину або команди',
    stars: 3000,
    bonus_stars: 500,
    price_uah: 1490,
    is_popular: false,
    examples: ['~875 фото товарів', 'або 1750 інфографік'],
  },
  {
    id: 'enterprise_5000',
    name: 'Підприємство',
    description: 'Максимальна вигода',
    stars: 5000,
    bonus_stars: 1000,
    price_uah: 1990,
    is_popular: false,
    examples: ['~1500 фото товарів', 'або 3000 інфографік'],
  },
]

export function getPackageById(id: string): StarsPackage | undefined {
  return STAR_PACKAGES.find(p => p.id === id)
}

export function pricePerStar(pkg: StarsPackage): string {
  const total = pkg.stars + pkg.bonus_stars
  return (pkg.price_uah / total).toFixed(2)
}
