'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

type Answer = { value: string; label: string; desc?: string; emoji: string }
type Question = { id: string; text: string; answers: Answer[] }

const QUESTIONS: Question[] = [
  {
    id: 'platform',
    text: 'Де ви продаєте товари?',
    answers: [
      { value: 'prom',     label: 'Prom.ua',    desc: 'Великий каталог B2B/B2C', emoji: '🛒' },
      { value: 'rozetka',  label: 'Rozetka',    desc: 'Найбільший рітейл',       emoji: '🌹' },
      { value: 'olx',      label: 'OLX',        desc: 'Оголошення та секонд',    emoji: '📋' },
      { value: 'instagram',label: 'Instagram',  desc: 'Соціальна мережа',        emoji: '📸' },
    ]
  },
  {
    id: 'audience',
    text: 'Хто ваша головна аудиторія?',
    answers: [
      { value: 'young',    label: 'Молодь 18-30',   desc: 'Трендові, активні',    emoji: '🧑' },
      { value: 'middle',   label: 'Дорослі 30-50',  desc: 'Практичні, цінують якість', emoji: '👔' },
      { value: 'business', label: 'Бізнес',         desc: 'B2B покупці',          emoji: '💼' },
      { value: 'all',      label: 'Всі вікові',     desc: 'Широка аудиторія',     emoji: '👥' },
    ]
  },
  {
    id: 'mood',
    text: 'Який настрій вашого бренду?',
    answers: [
      { value: 'premium',  label: 'Преміум',    desc: 'Luxury, вишуканість',      emoji: '✨' },
      { value: 'trust',    label: 'Довіра',     desc: 'Надійний, перевірений',    emoji: '🛡️' },
      { value: 'energy',   label: 'Енергія',    desc: 'Динамічний, активний',     emoji: '⚡' },
      { value: 'cozy',     label: 'Затишок',    desc: 'Домашній, теплий',         emoji: '🏡' },
    ]
  },
  {
    id: 'background',
    text: 'Який фон вам більше подобається?',
    answers: [
      { value: 'white',    label: 'Білий/нейтральний', desc: 'Чисто, мінімалістично', emoji: '⬜' },
      { value: 'lifestyle',label: 'Lifestyle сцени',   desc: 'З контекстом та атмосферою', emoji: '🌆' },
      { value: 'gradient', label: 'Градієнти',         desc: 'Сучасно, барвисто',    emoji: '🌈' },
      { value: 'dark',     label: 'Темний/преміум',    desc: 'Розкіш, ексклюзив',   emoji: '🌑' },
    ]
  },
  {
    id: 'detail',
    text: 'Що важливіше показати у фото?',
    answers: [
      { value: 'texture',  label: 'Текстуру та матеріал', emoji: '🪵' },
      { value: 'use',      label: 'Як використовується',  emoji: '🤲' },
      { value: 'style',    label: 'Стиль та образ',       emoji: '💫' },
      { value: 'size',     label: 'Розмір та пропорції',  emoji: '📏' },
    ]
  },
]

const WISH_TEMPLATES: Record<string, string[]> = {
  'prom+middle+trust+white+texture':    ['Чіткий студійний знімок на білому фоні. Детальна текстура матеріалу добре видна. М\'яке рівномірне освітлення без тіней. Акцент на якості та надійності товару.'],
  'instagram+young+energy+lifestyle+style': ['Яскрава lifestyle фотографія в міському середовищі. Динамічне освітлення, модний образ. Насичені кольори, трендова атмосфера. Товар органічно вписується у сцену.'],
  'rozetka+all+trust+white+use':        ['Демонстрація використання товару. Чисте зображення на нейтральному фоні. Показати функціональність та зручність. Природне освітлення, реалістичні кольори.'],
  'default': ['Професійна комерційна фотографія на нейтральному фоні. М\'яке студійне освітлення підкреслює деталі товару. Кольори точні та природні. Виглядає надійно та якісно.'],
}

function generateWish(answers: Record<string, string>): string {
  const key = Object.values(answers).join('+')
  const templates = WISH_TEMPLATES[key] || WISH_TEMPLATES['default']
  
  // Build dynamic wish based on answers
  const parts: string[] = []
  
  if (answers.mood === 'premium' || answers.background === 'dark') {
    parts.push('Преміальна темна фотографія з золотими акцентами освітлення.')
  } else if (answers.background === 'white') {
    parts.push('Чистий студійний знімок на білому або світло-сірому фоні.')
  } else if (answers.background === 'lifestyle') {
    parts.push('Атмосферна lifestyle сцена з продуманим фоном та контекстом.')
  } else if (answers.background === 'gradient') {
    parts.push('Сучасне градієнтне тло що підкреслює колір товару.')
  }
  
  if (answers.mood === 'energy') {
    parts.push('Динамічний ракурс, насичені кольори, відчуття руху та енергії.')
  } else if (answers.mood === 'cozy') {
    parts.push('Тепле природне освітлення, затишна атмосфера домашнього комфорту.')
  } else if (answers.mood === 'trust') {
    parts.push('Рівномірне м\'яке освітлення, точна передача кольорів, акцент на якості.')
  }
  
  if (answers.detail === 'texture') {
    parts.push('Крупний план текстури матеріалу добре видно.')
  } else if (answers.detail === 'use') {
    parts.push('Показати товар в процесі використання, підкреслити функціональність.')
  } else if (answers.detail === 'style') {
    parts.push('Акцент на стилі та образі, товар доповнює загальну естетику.')
  }
  
  if (answers.audience === 'young') {
    parts.push('Трендова естетика, сучасний стиль що резонує з молодою аудиторією.')
  } else if (answers.audience === 'business') {
    parts.push('Діловий та представницький вигляд, підкреслює B2B цінність.')
  }
  
  return parts.length > 0 ? parts.join(' ') : templates[0]
}

function StyleTestContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('return') || '/studio'
  
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function answer(questionId: string, value: string) {
    const newAnswers = { ...answers, [questionId]: value }
    setAnswers(newAnswers)
    
    if (step < QUESTIONS.length - 1) {
      setTimeout(() => setStep(s => s + 1), 200)
    } else {
      setResult(generateWish(newAnswers))
    }
  }

  function copyAndReturn() {
    if (!result) return
    // Store in localStorage so studio page can pick it up
    localStorage.setItem('studio_wish', result)
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => router.back(), 1500)
  }

  const q = QUESTIONS[step]
  const progress = ((step) / QUESTIONS.length) * 100

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="font-display font-black text-xl text-gold mb-1">Картка<span className="text-white">АІ</span></div>
          <p className="text-white/40 text-sm">Тест стилю фотографії</p>
        </div>

        {!result ? (
          <>
            {/* Progress */}
            <div className="mb-6">
              <div className="flex justify-between text-xs text-white/30 mb-1.5">
                <span>Питання {step + 1} з {QUESTIONS.length}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full">
                <div className="h-1.5 bg-gradient-to-r from-gold to-gold-light rounded-full transition-all duration-500" style={{ width: `${progress}%` }}/>
              </div>
            </div>

            {/* Question */}
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 mb-4">
              <h2 className="font-display font-bold text-xl text-white text-center mb-6">{q.text}</h2>
              <div className="grid grid-cols-2 gap-3">
                {q.answers.map(a => (
                  <button key={a.value} onClick={() => answer(q.id, a.value)}
                    className={`p-4 rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:border-gold/40 ${answers[q.id] === a.value ? 'border-gold bg-gold/10' : 'border-white/10 bg-white/[0.03]'}`}>
                    <div className="text-2xl mb-2">{a.emoji}</div>
                    <div className="text-white font-semibold text-sm">{a.label}</div>
                    {a.desc && <div className="text-white/40 text-xs mt-0.5">{a.desc}</div>}
                  </button>
                ))}
              </div>
            </div>

            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="w-full text-white/30 text-sm hover:text-white/60 transition-colors py-2">← Назад</button>
            )}
          </>
        ) : (
          /* Result */
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">🎨</div>
              <h2 className="font-display font-bold text-xl text-white mb-2">Ваш стиль визначено!</h2>
              <p className="text-white/40 text-sm">Ось побажання для вашої фотографії</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
              <p className="text-white/80 text-sm leading-relaxed">{result}</p>
            </div>

            <div className="space-y-3">
              <button onClick={copyAndReturn}
                className={`w-full py-3 rounded-xl font-bold text-base transition-all ${copied ? 'bg-green-600 text-white' : 'bg-gold text-black hover:bg-gold-light'}`}>
                {copied ? '✓ Скопійовано! Повертаємось...' : '📋 Використати це побажання'}
              </button>
              <button onClick={() => { setStep(0); setAnswers({}); setResult(null) }}
                className="w-full py-2.5 rounded-xl border border-white/15 text-white/50 text-sm hover:border-white/30 transition-colors">
                ↺ Пройти ще раз
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function StyleTestPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>}>
      <StyleTestContent />
    </Suspense>
  )
}
