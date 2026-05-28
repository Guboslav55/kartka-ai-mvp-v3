'use client';
import Link from 'next/link';

const FEATURES = [
  { icon: '✏️', title: 'AI-генерація тексту', desc: 'Заголовок, опис, 5 переваг та ключові слова. GPT-4o аналізує фото і пише сам — без шаблонів.' },
  { icon: '📸', title: 'Обробка фото товару', desc: 'Завантаж фото — AI обріже, видалить фон і підготує до маркетплейсу автоматично.' },
  { icon: '🎯', title: 'Оптимізація під платформи', desc: 'Окремі алгоритми для Prom.ua, Rozetka і OLX — правильні довжини, SEO і формат.' },
  { icon: '📊', title: 'AI Інфографіка', desc: 'Три варіанти інфографіки з твоїм фото та текстом — готово до публікації.' },
];

const STEPS = [
  { num: '01', title: 'Завантаж фото товару', desc: 'AI розпізнає, обріже і видалить фон за 5 секунд' },
  { num: '02', title: 'AI пише картку', desc: 'Заголовок, опис, переваги, ключові слова — 10 сек' },
  { num: '03', title: 'Копіюй і публікуй', desc: 'Або скачай CSV для масового завантаження на маркетплейс' },
];

const PACKAGES = [
  { id: 'starter_100',     name: 'Старт',        stars: 100,  bonus: 0,    price: 99,   popular: false, per: '~0.99 ₴/⭐', examples: '25 карток' },
  { id: 'pro_500',         name: 'Про',          stars: 500,  bonus: 50,   price: 390,  popular: true,  per: '~0.71 ₴/⭐', examples: '137 карток' },
  { id: 'growth_1200',     name: 'Зростання',    stars: 1200, bonus: 200,  price: 790,  popular: false, per: '~0.57 ₴/⭐', examples: '350 карток' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-10 py-4 bg-black/80 backdrop-blur-xl border-b border-gold/10">
        <div className="font-display font-black text-xl text-gold tracking-tight">
          Картка<span className="text-white">АІ</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <a href="#features" className="hover:text-gold transition-colors">Можливості</a>
          <a href="#how" className="hover:text-gold transition-colors">Як працює</a>
          <a href="#pricing" className="hover:text-gold transition-colors">Ціни</a>
        </div>
        <Link href="/auth" className="bg-gold text-black px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-gold-light transition-colors">
          Спробувати →
        </Link>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0 hero-grid" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_900px_600px_at_50%_40%,rgba(36,86,164,0.18),transparent_70%)]" />
        <div className="relative z-10 animate-fade-down">
          <div className="inline-flex items-center gap-2 bg-gold/10 border border-gold/25 rounded-full px-4 py-1.5 text-gold-light text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
            Перший AI-сервіс карток товарів в Україні
          </div>
          <h1 className="font-display font-black text-4xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight mb-6">
            Картки товарів<br />
            для <span className="text-gold">Prom</span> та <span className="text-gold">Rozetka</span><br />
            за 10 секунд
          </h1>
          <p className="text-white/60 text-lg max-w-lg mx-auto mb-10">
            Завантаж фото — AI напише заголовок, опис, переваги та ключові слова. Видалить фон. Готово до публікації.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/auth" className="bg-gold text-black px-8 py-4 rounded-full font-bold text-base hover:bg-gold-light transition-all hover:-translate-y-0.5 shadow-[0_8px_32px_rgba(200,168,75,0.3)]">
              ✦ Спробувати безкоштовно
            </Link>
            <a href="#how" className="border border-white/20 text-white px-8 py-4 rounded-full font-semibold text-base hover:border-gold hover:text-gold transition-all">
              Як це працює →
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-12 mt-16">
            {[['10 сек', 'Час генерації'], ['4+', 'Платформи'], ['3', 'Мови']].map(([num, label]) => (
              <div key={label} className="text-center">
                <div className="font-display font-black text-3xl text-gold">{num}</div>
                <div className="text-xs text-white/40 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORMS */}
      <div className="border-y border-white/5 py-10 px-6">
        <p className="text-center text-white/30 text-xs uppercase tracking-widest mb-6">Оптимізовано під платформи</p>
        <div className="flex flex-wrap justify-center gap-10">
          {['Prom.ua', 'Rozetka', 'OLX', 'Hotline'].map(p => (
            <span key={p} className="font-display font-bold text-white/20 hover:text-white/40 transition-colors cursor-default">{p}</span>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-gold text-xs font-bold uppercase tracking-widest mb-3">▸ Можливості</p>
          <h2 className="font-display font-black text-3xl md:text-5xl tracking-tight">Що робить КарткаАІ</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white/[0.03] border border-white/8 rounded-2xl p-7 hover:border-gold/30 transition-all hover:-translate-y-1">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="font-display font-bold text-lg text-white mb-2">{f.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-24 px-6 bg-navy/5">
        <div className="max-w-4xl mx-auto text-center mb-14">
          <p className="text-gold text-xs font-bold uppercase tracking-widest mb-3">▸ Процес</p>
          <h2 className="font-display font-black text-3xl md:text-5xl tracking-tight">Три кроки до готової картки</h2>
        </div>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map(s => (
            <div key={s.num} className="bg-white/[0.03] border border-white/8 rounded-2xl p-8 text-center hover:border-gold/20 transition-all">
              <div className="font-display font-black text-5xl text-gold/15 mb-4">{s.num}</div>
              <h3 className="font-display font-bold text-base mb-2">{s.title}</h3>
              <p className="text-white/45 text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING — STARS */}
      <section id="pricing" className="py-24 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-gold text-xs font-bold uppercase tracking-widest mb-3">▸ Тарифи</p>
          <h2 className="font-display font-black text-3xl md:text-5xl tracking-tight">Платиш тільки за результат</h2>
          <p className="text-white/40 mt-3 max-w-md mx-auto">Система Зорь — купуй зорі і витрачай коли треба. Без підписки. Без обмежень по часу.</p>
        </div>

        {/* Star cost explanation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12 max-w-3xl mx-auto">
          {[
            { op: '✏️ Текст картки', cost: '2 ⭐' },
            { op: '📸 Обробка фото', cost: '4 ⭐' },
            { op: '📊 Інфографіка', cost: '4 ⭐' },
            { op: '🎨 3 інфографіки', cost: '10 ⭐' },
          ].map(item => (
            <div key={item.op} className="bg-white/[0.04] border border-white/8 rounded-xl p-4 text-center">
              <div className="text-xs text-white/40 mb-1">{item.op}</div>
              <div className="font-display font-bold text-lg text-gold">{item.cost}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {PACKAGES.map(pkg => (
            <div key={pkg.id} className={`relative rounded-2xl p-8 border transition-all hover:-translate-y-2 ${pkg.popular ? 'bg-gold/5 border-gold' : 'bg-white/[0.03] border-white/10'}`}>
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-black text-[10px] font-black px-4 py-1 rounded-full tracking-wider">НАЙПОПУЛЯРНІШИЙ</div>
              )}
              <div className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">{pkg.name}</div>
              <div className="font-display font-black text-4xl mb-1">
                {pkg.price}<span className="text-white/30 text-lg font-normal"> ₴</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gold font-bold">⭐ {pkg.stars.toLocaleString('uk-UA')}</span>
                {pkg.bonus > 0 && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-semibold">+{pkg.bonus} бонус</span>}
              </div>
              <div className="text-white/30 text-xs mb-6">{pkg.per} · ~{pkg.examples}</div>
              <div className="h-px bg-white/8 mb-6" />
              <ul className="space-y-2 mb-8 text-sm text-white/70">
                <li className="flex items-center gap-2"><span className="text-gold">✓</span> Текст картки — 2 ⭐</li>
                <li className="flex items-center gap-2"><span className="text-gold">✓</span> Обробка фото — 4 ⭐</li>
                <li className="flex items-center gap-2"><span className="text-gold">✓</span> Інфографіка — 4 ⭐</li>
                <li className="flex items-center gap-2"><span className="text-gold">✓</span> Зорі не згоряють</li>
              </ul>
              <Link href="/pricing" className={`block text-center py-3 rounded-xl font-bold text-sm transition-all ${pkg.popular ? 'bg-gold text-black hover:bg-gold-light' : 'border border-white/20 text-white hover:border-gold hover:text-gold'}`}>
                Придбати →
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-white/30 text-sm mt-8">
          🎁 При реєстрації — 5 зорь безкоштовно · Оплата в гривнях · LiqPay
        </p>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_600px_400px_at_50%_50%,rgba(36,86,164,0.2),transparent_70%)]" />
        <div className="relative z-10">
          <h2 className="font-display font-black text-3xl md:text-5xl tracking-tight mb-4">
            Почни продавати більше<br />вже сьогодні
          </h2>
          <p className="text-white/40 mb-10">Реєстрація за 30 секунд. 5 безкоштовних зорь одразу.</p>
          <Link href="/auth" className="inline-block bg-gold text-black px-10 py-4 rounded-full font-bold text-base hover:bg-gold-light transition-all shadow-[0_8px_32px_rgba(200,168,75,0.3)]">
            ✦ Спробувати зараз — безкоштовно
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/6 px-10 py-8 flex flex-wrap items-center justify-between gap-4">
        <div className="font-display font-black text-gold">Картка<span className="text-white">АІ</span></div>
        <p className="text-white/25 text-sm">© 2025 КарткаАІ. Зроблено в Україні 🇺🇦</p>
        <p className="text-white/20 text-xs">Політика конфіденційності · Умови використання</p>
      </footer>
    </div>
  );
}
