import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'КарткаАІ — Генератор карток товарів', template: '%s | КарткаАІ' },
  description: 'AI-сервіс для автоматичної генерації карток товарів під Prom.ua, Rozetka, OLX. Заголовок, опис, переваги та зображення за 10 секунд.',
  keywords: ['генератор описів товарів', 'картка товару prom', 'rozetka опис', 'AI копірайтер україна', 'автоматичний опис товару'],
  openGraph: {
    title: 'КарткаАІ — Картки товарів за 10 секунд',
    description: 'Введи назву товару — AI напише заголовок, опис і ключові слова для Prom та Rozetka.',
    locale: 'uk_UA',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;700;900&family=Golos+Text:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[#0a0a0a] text-[#f5f2eb] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
