'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const STEPS = [
  { icon: '📸', title: 'Завантаж фото товару', desc: 'AI автоматично розпізнає товар, обріже зайве і видалить фон. JPG, PNG до 10 МБ.', demo: 'Тактична футболка → AI видаляє фон → чисте фото', cost: null },
  { icon: '✏️', title: 'AI пише картку за 10 сек', desc: 'GPT-4o створює SEO-заголовок, опис, 5 переваг та ключові слова під Prom.ua, Rozetka або OLX.', demo: 'Різні формати і довжини для кожної платформи', cost: '2 ⭐' },
  { icon: '📊', title: 'Генеруй інфографіку', desc: '3 варіанти: Lifestyle, Переваги, Студійне фото. DALL-E 3 + автоматичне накладення тексту.', demo: 'DALL-E фон → фото товару → текст → готова інфографіка', cost: '4 ⭐' },
  { icon: '⬇️', title: 'Копіюй і публікуй', desc: 'Одна кнопка — скопіювати все. Або CSV для масового імпорту 100+ карток на маркетплейс.', demo: 'CSV → Prom.ua → 100 карток за 1 хвилину', cost: null },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const current = STEPS[step]

  return (
    <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="font-display font-black text-2xl text-gold mb-1">Картка<span className="text-white">АІ</span></div>
          <p className="text-white/40 text-sm">Вітаємо! Ось як це працює 🎉</p>
        </div>
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => setStep(i)}
              className={`transition-all rounded-full ${i===step ? 'w-8 h-2 bg-gold' : i<step ? 'w-2 h-2 bg-gold/40' : 'w-2 h-2 bg-white/15'}`} />
          ))}
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-8 mb-6">
          <div className="text-6xl mb-4 text-center">{current.icon}</div>
          <h2 className="text-white font-display font-bold text-2xl text-center mb-3">{current.title}</h2>
          <p className="text-white/60 text-center leading-relaxed mb-4">{current.desc}</p>
          <div className="bg-white/[0.06] rounded-xl p-4 text-sm text-white/40 text-center">
            <span className="text-gold/70">Приклад: </span>{current.demo}
          </div>
          {current.cost && (
            <div className="flex justify-center mt-4">
              <span className="bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-bold px-4 py-1.5 rounded-full">⭐ Вартість: {current.cost}</span>
            </div>
          )}
        </div>
        {step === 0 && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl px-5 py-3 mb-4 text-center">
            <p className="text-green-400 font-semibold text-sm">🎁 На твій рахунок нараховано 5 безкоштовних зорь!</p>
            <p className="text-white/40 text-xs mt-1">Достатньо для 2 текстових карток або 1 інфографіки</p>
          </div>
        )}
        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep(s => s-1)}
              className="flex-1 border border-white/15 text-white/50 py-3 rounded-xl font-semibold hover:border-white/30 transition-colors">← Назад</button>
          )}
          <button onClick={() => step < STEPS.length-1 ? setStep(s=>s+1) : router.push('/generate')}
            className="flex-1 bg-gradient-to-r from-gold to-gold-light text-black font-bold py-3 rounded-xl hover:opacity-90 transition-all">
            {step < STEPS.length-1 ? 'Далі →' : '✦ Почати генерувати!'}
          </button>
        </div>
        <div className="text-center mt-4">
          <Link href="/generate" className="text-white/25 text-sm hover:text-white/50 transition-colors">Пропустити →</Link>
        </div>
      </div>
    </div>
  )
}
