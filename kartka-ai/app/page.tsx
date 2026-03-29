'use client';
import Link from 'next/link';

const FEATURES = [
  { icon: '✏️', title: 'AI-генерація текстів', desc: 'Заголовок, опис, 5 переваг та ключові слова для будь-якого товару' },
  { icon: '🖼️', title: 'Генерація зображень', desc: 'DALL-E 3 створює банерну картку товару за описом' },
  { icon: '🎯', title: 'Оптимізація під платформи', desc: 'Адаптація під Prom.ua, Rozetka, OLX — правильні довжини та SEO' },
  { icon: '📥', title: 'Експорт CSV / Excel', desc: 'Завантажуй готові картки та імпортуй одразу на маркетплейс' },
];

const STEPS = [
  { num: '01', title: 'Введи назву товару', desc: 'Вкажи категорію та ключові особливості' },
  { num: '02', title: 'AI генерує контент', desc: 'Текст + зображення за 10–15 секунд' },
  { num: '03', title: 'Завантажуй та публікуй', desc: 'Копіюй або скачай CSV — готово до імпорту' },
];

const PLANS = [
  {
    name: 'Стартер', price: '0', period: 'назавжди', popular: false,
    features: ['5 карточок / місяць', 'Українська мова', 'Prom.ua та Rozetka', '—  Генерація зображень', '—  Експорт CSV'],
    cta: 'Спробувати', href: '/auth',
  },
  {
    name: 'Про', price: '499', period: '/ місяць', popular: true,
    features: ['200 карточок / місяць', 'UA + RU + EN', 'Усі 4 платформи', '✓  Генерація зображень', '✓  Експорт CSV'],
    cta: 'Обрати Про', href: '/auth?plan=pro',
  },
  {
    name: 'Бізнес', price: '1490', period: '/ місяць', popular: false,
    features: ['Безліміт карточок', 'UA + RU + EN', 'Усі 4 платформи', '✓  Генерація зображень', '✓  API-доступ'],
    cta: 'Зв\'язатися', href: '/auth?plan=business',
  },
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
            Введи назву товару — AI напише заголовок, опис, переваги та ключові слова. Готово до завантаження.
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

      {/* PRICING */}
      <section id="pricing" className="py-24 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-gold text-xs font-bold uppercase tracking-widest mb-3">▸ Тарифи</p>
          <h2 className="font-display font-black text-3xl md:text-5xl tracking-tight">Прозора ціна</h2>
          <p className="text-white/40 mt-3">Оплата в гривнях. Скасування в будь-який момент.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {PLANS.map(plan => (
            <div key={plan.name} className={`relative rounded-2xl p-8 border transition-all hover:-translate-y-2 ${plan.popular ? 'bg-gold/5 border-gold' : 'bg-white/[0.03] border-white/10'}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-black text-[10px] font-black px-4 py-1 rounded-full tracking-wider">
                  НАЙПОПУЛЯРНІШИЙ
                </div>
              )}
              <div className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">{plan.name}</div>
              <div className="font-display font-black text-4xl mb-1">
                {plan.price}<span className="text-white/30 text-lg font-normal"> ₴</span>
              </div>
              <div className="text-white/35 text-sm mb-6">{plan.period}</div>
              <div className="h-px bg-white/8 mb-6" />
              <ul className="space-y-3 mb-8">
                {plan.features.map(f => (
                  <li key={f} className={`text-sm flex items-start gap-2 ${f.startsWith('—') ? 'text-white/25' : 'text-white/75'}`}>
                    {f.startsWith('✓') ? <span className="text-gold mt-0.5">✓</span> : f.startsWith('—') ? <span className="mt-0.5">—</span> : <span className="text-gold mt-0.5">✓</span>}
                    {f.replace(/^[✓—]\s+/, '')}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-3 rounded-xl font-bold text-sm transition-all ${plan.popular ? 'bg-gold text-black hover:bg-gold-light' : 'border border-white/20 text-white hover:border-gold hover:text-gold'}`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_600px_400px_at_50%_50%,rgba(36,86,164,0.2),transparent_70%)]" />
        <div className="relative z-10">
          <h2 className="font-display font-black text-3xl md:text-5xl tracking-tight mb-4">
            Почни продавати більше<br />вже сьогодні
          </h2>
          <p className="text-white/40 mb-10">Перші 5 карточок — безкоштовно. Реєстрація за 30 секунд.</p>
          <Link href="/auth" className="inline-block bg-gold text-black px-10 py-4 rounded-full font-bold text-base hover:bg-gold-light transition-all shadow-[0_8px_32px_rgba(200,168,75,0.3)]">
            ✦ Спробувати зараз
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/6 px-10 py-8 flex flex-wrap items-center justify-between gap-4">
        <div className="font-display font-black text-gold">Картка<span className="text-white">АІ</span></div>
        <p className="text-white/25 text-sm">© 2024 КарткаАІ. Зроблено в Україні 🇺🇦</p>
        <p className="text-white/20 text-xs">Політика конфіденційності · Умови використання</p>
      </footer>
    </div>
  );
}

