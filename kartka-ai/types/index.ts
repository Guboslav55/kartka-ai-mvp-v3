export type Platform = 'prom' | 'rozetka' | 'olx' | 'general'
export type Tone = 'professional' | 'friendly' | 'premium' | 'simple'
export type Lang = 'uk' | 'ru' | 'en'

export type CardResult = {
  title: string
  description: string
  bullets: string[]
  keywords: string[]
  imageUrl?: string | null
  cardId?: string | null
  starsSpent?: number
  newBalance?: number
}

export type Card = {
  id: string
  user_id: string
  product_name: string
  platform: Platform
  title: string
  description: string
  bullets: string[]
  keywords: string[]
  image_url: string | null
  processed_image_url: string | null
  infographic_urls: string[] | null
  project_id: string | null
  created_at: string
}

export type StarTransaction = {
  id: string
  user_id: string
  type: 'purchase' | 'spend' | 'promo' | 'free_gift' | 'refund' | 'regeneration'
  amount: number
  description: string
  created_at: string
}
