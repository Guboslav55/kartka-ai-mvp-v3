export interface CardResult {
  title: string;
  description: string;
  bullets: string[];
  keywords: string[];
  imageUrl?: string;
  cardId?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  plan: 'free' | 'pro' | 'business';
  cards_left: number;
  cards_total: number;
  created_at: string;
}

export interface SavedCard {
  id: string;
  user_id: string;
  product_name: string;
  platform: string;
  title: string;
  description: string;
  bullets: string[];
  keywords: string[];
  image_url?: string;
  created_at: string;
}

export type Platform = 'prom' | 'rozetka' | 'olx' | 'general';
export type Tone = 'professional' | 'friendly' | 'premium' | 'simple';
export type Lang = 'uk' | 'ru' | 'en';
