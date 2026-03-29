'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const PLANS = [
  {
    id: 'free', name: 'Стартер', price: 0, period: 'назавжди',
    features: [
      { text: '5 карточок / місяць', ok: true },
      { text: 'Українська мова', ok: true },
      { text: 'Prom.ua та Rozetka', ok: true },
      { text: 'Завантаження фото товару', ok: false },
      { text: 'Генерація зображень', ok: false },
      { text: 'Експорт CSV', ok: false },
    ],
    popular: false, cta: 'Поточний план',
  },
  {
    id: 'pro', name: 'Про', price: 499, period: '/ місяць',
    features: [
      { text: '200 карточок / місяць', ok: true },
      { text: 'UA + RU + EN', ok: true },
      { text: 'Усі 4 платформи', ok: true },
      { text: 'Завантаження фото товару', ok: true },
      { text: 'Генерація зображень (DALL-E 3)', ok: true },
      { text: 'Експорт CSV / Excel', ok: true },
    ],
    popular: true, cta: 'Оплатити 499 ₴',
  },
  {
    id: 'business', name: 'Бізнес', price: 1490, period: '/ місяць',
    features: [
      { text: 'Безліміт карточок', ok: true },
      { text: 'UA + RU + EN', ok: true },
      { text: 'Усі 4 платформи', ok: true },
      { text: 'Завантаження фото товару', ok: true },
      { text: 'Генерація зображень (DALL-E 3)', ok: true },
      { text: 'API-доступ', ok: true },
    ],
    popular: false, cta: 'Оплатити 1490 ₴',
  },
];

export default function PricingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [currentPlan, setCurrentPlan] = useState('free');
  const [paying, setPaying] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
      supabase.from('users').select('plan').eq('id', session.user.id).single()
        .then(({ data }) => { if (data) setCurrentPlan(data.plan); });
    });
  }, []);

  async function handlePay(planId: string) {
    if (planId === 'free') return;
    setPaying(planId);
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ plan: planId }),
      });
      const { data, signature } = await res.json();

      // Build and submit LiqPay form
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://www.liqpay.ua/api/3/checkout';
      form.acceptCharset = 'utf-8';

      [['data', data], ['signature', signature]].forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = name; input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch {
      alert('Помилка оплати. Спробуй ще раз.');
      setPaying(null);
    }
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors">← Кабінет</Link>
      </div>

      <div className="text-center mb-12">
        <h1 className="font-display font-black text-3xl sm:text-5xl tracking-tight mb-3">Оберіть тариф</h1>
        <p className="text-white/40">Оплата в гривнях через LiqPay · Visa, Mastercard, Google Pay, Apple Pay</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
        {PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div key={plan.id} className={`relative rounded-2xl p-7 border transition-all hover:-translate-y-1 ${plan.popular ? 'bg-gold/5 border-gold' : 'bg-white/[0.03] border-white/10'}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-black text-[10px] font-black px-4 py-1 rounded-full tracking-wider whitespace-nowrap">
                  НАЙПОПУЛЯРНІШИЙ
                </div>
              )}
              <div className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">{plan.name}</div>
              <div className="font-display font-black text-4xl mb-1">
                {plan.price}<span className="text-white/30 text-lg font-normal"> ₴</span>
              </div>
              <div className="text-white/35 text-sm mb-6">{plan.period}</div>
              <div className="h-px bg-white/8 mb-5" />
              <ul className="space-y-3 mb-8">
                {plan.features.map(f => (
                  <li key={f.text} className={`text-sm flex items-start gap-2 ${f.ok ? 'text-white/75' : 'text-white/25'}`}>
                    <span className={`mt-0.5 shrink-0 ${f.ok ? 'text-gold' : ''}`}>{f.ok ? '✓' : '—'}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handlePay(plan.id)}
                disabled={isCurrent || plan.id === 'free' || paying === plan.id}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${plan.popular ? 'bg-gold text-black hover:bg-gold-light' : 'border border-white/20 text-white hover:border-gold hover:text-gold'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                {isCurrent ? '✓ Поточний план' : paying === plan.id ? 'Перенаправляю...' : plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-white/20 text-xs mt-10">
        Захищено LiqPay · SSL шифрування · Скасування в будь-який момент
      </p>
    </div>
  );
}

