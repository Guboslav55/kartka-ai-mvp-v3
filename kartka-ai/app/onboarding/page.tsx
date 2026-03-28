'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const STEPS = [
  { icon: '✏️', title: 'Введи назву товару', desc: 'Наприклад: "Навушники Sony WH-1000XM5" або "Сукня жіноча літня"' },
  { icon: '🤖', title: 'AI генерує картку', desc: 'Заголовок, опис, переваги та ключові слова за 10–15 секунд' },
  { icon: '📋', title: 'Копіюй або завантажуй', desc: 'Готовий текст скопіюй вручну або скачай CSV для імпорту на Prom' },
];

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <Link href="/" className="font-display font-black text-2xl text-gold">
            Картка<span className="text-white">АІ</span>
          </Link>
          <div className="mt-6 inline-flex items-center gap-2 bg-green-500/10 border border-green-500/25 rounded-full px-4 py-1.5 text-green-400 text-xs font-medium">
            ✓ Акаунт створено
          </div>
          <h1 className="font-display font-black text-3xl mt-4 mb-2 tracking-tight">Ласкаво просимо!</h1>
          <p className="text-white/40 text-sm">У тебе є <span className="text-gold font-bold">5 безкоштовних карточок</span>. Ось як це працює:</p>
        </div>

        <div className="space-y-4 mb-10">
          {STEPS.map((s, i) => (
            <div key={i} className="flex gap-4 bg-white/[0.03] border border-white/8 rounded-xl p-5">
              <div className="text-2xl flex-shrink-0">{s.icon}</div>
              <div>
                <div className="font-semibold text-white mb-0.5">{s.title}</div>
                <div className="text-white/40 text-sm">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => router.push('/generate')}
          className="w-full bg-gold text-black py-4 rounded-xl font-bold text-base hover:bg-gold-light transition-colors">
          ✦ Згенерувати першу картку →
        </button>
        <Link href="/dashboard" className="block text-center text-white/30 text-sm mt-4 hover:text-white transition-colors">
          Пропустити, перейти до кабінету
        </Link>
      </div>
    </div>
  );
}
