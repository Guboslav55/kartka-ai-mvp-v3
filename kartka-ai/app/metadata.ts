import type { Metadata } from 'next'

export const siteMetadata: Metadata = {
  metadataBase: new URL('https://kartka-ai-mvp-v3.vercel.app'),
  title: {
    default: 'КарткаАІ — AI-генератор карток товарів для Prom.ua та Rozetka',
    template: '%s | КарткаАІ',
  },
  description: 'Завантаж фото — AI напише заголовок, опис, переваги та ключові слова для Prom.ua, Rozetka та OLX за 10 секунд. AI Фото-студія, інфографіка, CSV-імпорт.',
  keywords: ['картка товару', 'AI генератор', 'Prom.ua', 'Rozetka', 'OLX', 'SEO опис товару', 'AI фото товару', 'маркетплейс Україна'],
  authors: [{ name: 'КарткаАІ' }],
  creator: 'КарткаАІ',
  openGraph: {
    type: 'website',
    locale: 'uk_UA',
    url: 'https://kartka-ai-mvp-v3.vercel.app',
    siteName: 'КарткаАІ',
    title: 'КарткаАІ — AI-картки товарів за 10 секунд',
    description: 'Перший AI-сервіс для карток товарів в Україні. Prom.ua, Rozetka, OLX. Від 99 грн.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'КарткаАІ' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'КарткаАІ — AI-картки товарів',
    description: 'AI пише картку товару за 10 секунд. Від 99 грн.',
  },
  robots: { index: true, follow: true },
}
