import Link from 'next/link';

export default function LegalPage() {
  return (
    <div className="min-h-screen px-6 py-12 max-w-3xl mx-auto">
      <Link href="/" className="font-display font-black text-xl text-gold block mb-12">
        Картка<span className="text-white">АІ</span>
      </Link>

      <h1 className="font-display font-black text-3xl mb-2">Правові документи</h1>
      <p className="text-white/40 text-sm mb-12">Останнє оновлення: грудень 2024</p>

      {/* Privacy */}
      <section className="mb-12">
        <h2 className="font-display font-bold text-xl text-gold mb-5">Політика конфіденційності</h2>

        <div className="space-y-6 text-white/65 text-sm leading-relaxed">
          <div>
            <h3 className="text-white font-semibold mb-2">Які дані ми збираємо</h3>
            <p>Ми збираємо email-адресу при реєстрації та текст запитів, які ти вводиш для генерації карточок. Ці дані необхідні для надання сервісу.</p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Як ми використовуємо дані</h3>
            <p>Email використовується для авторизації та відправки повідомлень про оплату. Запити на генерацію передаються в Anthropic Claude API та OpenAI API для створення контенту.</p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Зберігання даних</h3>
            <p>Дані зберігаються в захищеній базі даних Supabase (EU-регіон). Ми не продаємо та не передаємо твої дані третім особам, крім зазначених API-провайдерів.</p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Cookies</h3>
            <p>Ми використовуємо тільки технічні cookies для підтримки сесії авторизації. Рекламних cookies немає.</p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Видалення даних</h3>
            <p>Ти можеш запросити видалення свого акаунту та всіх пов'язаних даних, надіславши запит на наш email.</p>
          </div>
        </div>
      </section>

      {/* Terms */}
      <section className="mb-12">
        <h2 className="font-display font-bold text-xl text-gold mb-5">Умови використання</h2>

        <div className="space-y-6 text-white/65 text-sm leading-relaxed">
          <div>
            <h3 className="text-white font-semibold mb-2">Сервіс</h3>
            <p>КарткаАІ надає інструмент для генерації текстового контенту та зображень для карточок товарів. Результати генерації є рекомендаційними — редагуй їх за потреби.</p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Оплата та повернення</h3>
            <p>Оплата здійснюється через Wayforpay в гривнях. Підписка активується одразу після успішної оплати. Повернення коштів можливе протягом 3 днів, якщо ти не використав більше 10 карточок у рамках тарифу.</p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Ліміти карточок</h3>
            <p>Ліміт карточок оновлюється щомісяця на дату оплати. Невикористані карточки не переносяться на наступний місяць.</p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Заборонений контент</h3>
            <p>Забороняється використовувати сервіс для генерації контенту, що порушує законодавство України, права третіх осіб або правила маркетплейсів.</p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-2">Відповідальність</h3>
            <p>Сервіс надається "як є". Ми не гарантуємо збільшення продажів або відповідність згенерованого контенту вимогам конкретних платформ. Фінальна відповідальність за контент — на користувачі.</p>
          </div>
        </div>
      </section>

      <div className="border-t border-white/8 pt-8 text-white/25 text-xs">
        <p>КарткаАІ · Україна · Зв'язок: support@kartkaai.com.ua</p>
      </div>
    </div>
  );
}
