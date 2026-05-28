import Link from 'next/link'

export const metadata = { title: 'Умови використання | КарткаАІ' }

export default function TermsPage() {
  return (
    <div className="min-h-screen px-4 sm:px-6 py-12 max-w-3xl mx-auto">
      <Link href="/" className="text-white/40 text-sm hover:text-white transition-colors mb-8 block">← На головну</Link>
      <h1 className="font-display font-black text-3xl text-white mb-2">Умови використання</h1>
      <p className="text-white/30 text-sm mb-8">Останнє оновлення: травень 2025</p>

      <div className="prose prose-invert max-w-none space-y-6 text-white/70 text-sm leading-relaxed">
        <section>
          <h2 className="text-white font-bold text-lg mb-3">1. Загальні положення</h2>
          <p>Використовуючи сервіс КарткаАІ (далі — «Сервіс»), ви погоджуєтесь з цими Умовами. Сервіс надає інструменти для автоматичної генерації текстів карток товарів для маркетплейсів за допомогою штучного інтелекту.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">2. Реєстрація та акаунт</h2>
          <p>Для використання Сервісу необхідна реєстрація. Ви відповідаєте за конфіденційність свого паролю і всі дії, що відбуваються під вашим акаунтом. При реєстрації ви отримуєте 5 безкоштовних Зорь.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">3. Система Зорь</h2>
          <p>Зорі — внутрішня валюта Сервісу. Придбані Зорі не мають терміну дії і не можуть бути обміняні на грошові кошти. Вартість операцій: генерація тексту — 2⭐, AI фото — 4⭐, відео — 16⭐.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">4. Оплата і повернення</h2>
          <p>Оплата здійснюється через платіжну систему LiqPay. Повернення коштів можливе протягом 7 днів з моменту покупки, якщо Зорі не були використані. Для повернення зверніться до підтримки.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">5. Обмеження</h2>
          <p>Забороняється використовувати Сервіс для генерації контенту, що порушує авторські права, містить дезінформацію або суперечить законодавству України. Ми залишаємо право призупинити акаунт у разі порушень.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">6. Інтелектуальна власність</h2>
          <p>Контент, згенерований Сервісом, належить вам. Ми не претендуємо на права на створені тексти та зображення.</p>
        </section>
        <section>
          <h2 className="text-white font-bold text-lg mb-3">7. Контакти</h2>
          <p>З питань: <a href="mailto:support@kartka.ai" className="text-gold hover:underline">support@kartka.ai</a></p>
        </section>
      </div>
    </div>
  )
}
