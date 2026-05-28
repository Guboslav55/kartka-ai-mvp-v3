import Link from 'next/link'

export const metadata = { title: 'Політика конфіденційності | КарткаАІ' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-4 sm:px-6 py-12 max-w-3xl mx-auto">
      <Link href="/" className="text-white/40 text-sm hover:text-white transition-colors mb-8 block">← На головну</Link>
      <h1 className="font-display font-black text-3xl text-white mb-2">Політика конфіденційності</h1>
      <p className="text-white/30 text-sm mb-8">Останнє оновлення: травень 2025</p>

      <div className="space-y-6 text-white/70 text-sm leading-relaxed">
        <section>
          <h2 className="text-white font-bold text-lg mb-3">1. Які дані ми збираємо</h2>
          <ul className="list-disc list-inside space-y-1 text-white/60">
            <li>Email адреса при реєстрації</li>
            <li>Фото товарів, що ви завантажуєте для обробки</li>
            <li>Згенерований контент (картки товарів)</li>
            <li>Дані про платежі (через LiqPay, без збереження карткових даних)</li>
            <li>Технічні дані: IP, браузер, дії в Сервісі</li>
          </ul>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">2. Як ми використовуємо дані</h2>
          <p>Дані використовуються виключно для надання послуг Сервісу: генерації контенту, обробки платежів, підтримки користувачів. Ми не продаємо ваші дані третім особам.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">3. AI обробка</h2>
          <p>Завантажені фото обробляються через API OpenAI (GPT-4o, DALL-E 3) та Remove.bg. Дані передаються цим сервісам відповідно до їх політик конфіденційності. Фото не використовуються для навчання моделей.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">4. Зберігання даних</h2>
          <p>Дані зберігаються в Supabase (EU регіон). Фото та зображення — у Supabase Storage. Ви можете запросити видалення своїх даних, написавши на support@kartka.ai.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">5. Cookies</h2>
          <p>Ми використовуємо лише технічно необхідні cookies для авторизації. Рекламних cookies немає.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">6. Ваші права</h2>
          <p>Ви маєте право на доступ, виправлення та видалення своїх даних. Запити надсилайте на <a href="mailto:support@kartka.ai" className="text-gold hover:underline">support@kartka.ai</a></p>
        </section>
      </div>
    </div>
  )
}
