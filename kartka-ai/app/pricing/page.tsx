'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const PLANS = [
  {
    id: 'free',
    name: 'Стартер',
    price: 0,
    period: 'назавжди',
    cards: 5,
    popular: false,
    features: [
      { text: '5 карточок / місяць', ok: true },
      { text: 'Українська мова', ok: true },
      { text: 'Prom.ua та Rozetka', ok: true },
      { text: 'Генерація зображень', ok: false },
      { text: 'Експорт CSV', ok: false },
    ],
    cta: 'Поточний план',
  },
  {
    id: 'pro',
    name: 'Про',
    price: 499,
    period: '/ місяць',
    cards: 200,
    popular: true,
    features: [
      { text: '200 карточок / місяць', ok: true },
      { text: 'UA + RU + EN', ok: true },
      { text: 'Усі 4 платформи', ok: true },
      { text: 'Генерація зображень', ok: true },
      { text: 'Експорт CSV / Excel', ok: true },
    ],
    cta: 'Оплатити 499 ₴',
  },
  {
    id: 'business',
    name: 'Бізнес',
    price: 1490,
    period: '/ місяць',
    cards: 99999,
    popular: false,
    features: [
      { text: 'Безліміт карточок', ok: true },
      { text: 'UA + RU + EN', ok: true },
      { text: 'Усі 4 платформи', ok: true },
      { text: 'Генерація зображень', ok: true },
      { text: 'API-доступ', ok: true },
    ],
    cta: 'Оплатити 1490 ₴',
  },
];

declare global {
  interface Window {
    Wayforpay?: {
      run: (params: Record<string, string>) => void;
    };
  }
}

export default function PricingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState('');
  const [currentPlan, setCurrentPlan] = useState('free');
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/auth'); return; }
      setUserEmail(user.email || '');
      supabase.from('users').select('plan').eq('id', user.id).single()
        .then(({ data }) => { if (data) setCurrentPlan(data.plan); });
    });

    // Load Wayforpay script
    const script = document.createElement('script');
    script.src = 'https://secure.wayforpay.com/server/pay-widget.js';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  async function handlePay(planId: string) {
    if (planId === 'free') return;
    setPaying(planId);

    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, email: userEmail }),
      });
      const params = await res.json();

      if (window.Wayforpay) {
        window.Wayforpay.run(params);
      } else {
        // Fallback: build a form
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://secure.wayforpay.com/pay';
        Object.entries(params).forEach(([k, v]) => {
          const input = document.createElement('input');
          input.type = 'hidden'; input.name = k; input.value = String(v);
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
      }
    } catch {
      alert('Помилка оплати. Спробуй ще раз.');
    }
    setPaying(null);
  }

  return (
    <div className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors">← Кабінет</Link>
      </div>

      <div className="text-center mb-14">
        <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight mb-3">Оберіть тариф</h1>
        <p className="text-white/40">Оплата в гривнях. Скасування в будь-який момент.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div key={plan.id} className={`relative rounded-2xl p-8 border transition-all ${plan.popular ? 'bg-gold/5 border-gold' : 'bg-white/[0.03] border-white/10'}`}>
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
              <div className="h-px bg-white/8 mb-6" />
              <ul className="space-y-3 mb-8">
                {plan.features.map(f => (
                  <li key={f.text} className={`text-sm flex items-center gap-2 ${f.ok ? 'text-white/75' : 'text-white/25'}`}>
                    <span className={f.ok ? 'text-gold' : ''}>{f.ok ? '✓' : '—'}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handlePay(plan.id)}
                disabled={isCurrent || plan.id === 'free' || paying === plan.id}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 ${plan.popular ? 'bg-gold text-black hover:bg-gold-light' : 'border border-white/20 text-white hover:border-gold hover:text-gold'} ${isCurrent ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isCurrent ? '✓ Поточний план' : paying === plan.id ? 'Завантаження...' : plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-white/20 text-xs mt-10">
        Оплата захищена Wayforpay · Visa, Mastercard, Google Pay, Apple Pay
      </p>
    </div>
  );
}
