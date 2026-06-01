
'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const STEPS = [
  {
    id: 'welcome',
    emoji: '👋',
    title: 'Ласкаво просимо до КарткаАІ',
    subtitle: 'За 2 хвилини ти отримаєш готову карточку товару для маркетплейсу',
    points: [
      '📸 Завантаж фото товару',
      '🤖 AI проаналізує і заповнить всі поля',
      '✨ Отримай 4 унікальні карточки',
    ],
  },
  {
    id: 'photo',
    emoji: '📸',
    title: 'Завантаж фото твого товару',
    subtitle: 'AI автоматично розпізнає назву, категорію і переваги',
    points: null,
  },
  {
    id: 'generate',
    emoji: '⚡',
    title: 'Карточка готова!',
    subtitle: 'Тепер ти знаєш як це працює. Йди в Студію і генеруй скільки завгодно.',
    points: null,
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoName, setPhotoName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<{productName:string; category:string; bullets:string[]} | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const b64 = e.target?.result as string
      setPhoto(b64)
      setPhotoName(file.name)
      setStep(1)

      // Auto-analyze
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/analyze-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ imageBase64: b64, lang: 'uk' }),
        })
        if (res.ok) {
          const d = await res.json()
          setAnalysis(d)
        }
      } catch {}
    }
    reader.readAsDataURL(file)
  }

  async function handleGenerate() {
    if (!photo || !analysis) return
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          mode: 'card',
          productPhoto: photo,
          productName: analysis.productName,
          category: analysis.category,
          bullets: analysis.bullets.slice(0, 4),
          cardPreset: 'urban',
          cardLayout: 'split',
          creativity: 0.5,
          count: 1,
        }),
      })
      const d = await res.json()
      if (d.results?.[0]) {
        setResult(d.results[0])
        setStep(2)
      }
    } catch {}
    setLoading(false)
  }

  async function finish() {
    // Mark onboarding as done
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('users').update({ onboarding_done: true }).eq('id', user.id)
    }
    router.push('/studio')
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-white/30 text-xs mb-2">
            <span>Крок {step + 1} з {STEPS.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gold rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* STEP 0: Welcome */}
        {step === 0 && (
          <div className="text-center animate-fadeIn">
            <div className="text-6xl mb-6">✨</div>
            <h1 className="text-3xl font-bold text-white mb-3">Ласкаво просимо до <span className="text-gold">КарткаАІ</span></h1>
            <p className="text-white/50 mb-8 text-lg">За 2 хвилини ти побачиш як AI робить карточки для твого товару</p>
            <div className="space-y-3 mb-8 text-left">
              {['📸 Завантажуєш фото товару', '🤖 AI аналізує і заповнює поля', '⚡ Отримуєш 4 унікальні карточки'].map((p, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                  <span className="text-xl">{p.split(' ')[0]}</span>
                  <span className="text-white/70 text-sm">{p.split(' ').slice(1).join(' ')}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(1)}
              className="w-full bg-gold text-black font-bold py-4 rounded-2xl text-lg hover:bg-gold/90 transition-all">
              Почати →
            </button>
            <button onClick={finish} className="mt-3 w-full text-white/30 text-sm py-2 hover:text-white/50 transition-colors">
              Пропустити
            </button>
          </div>
        )}

        {/* STEP 1: Upload photo */}
        {step === 1 && (
          <div className="animate-fadeIn">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">📸</div>
              <h2 className="text-2xl font-bold text-white mb-2">Завантаж фото товару</h2>
              <p className="text-white/50">AI сам розпізнає що це за товар і заповнить всі поля</p>
            </div>

            {!photo ? (
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-white/20 rounded-2xl p-12 text-center cursor-pointer hover:border-gold/50 hover:bg-gold/5 transition-all"
              >
                <div className="text-4xl mb-3">+</div>
                <p className="text-white/50 text-sm">Натисни або перетягни фото</p>
                <p className="text-white/25 text-xs mt-1">JPG, PNG, WEBP</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Photo preview */}
                <div className="relative rounded-2xl overflow-hidden bg-white/5">
                  <img src={photo} alt="Product" className="w-full max-h-56 object-contain py-4" />
                </div>

                {/* Analysis result */}
                {analysis ? (
                  <div className="bg-white/5 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-green-400 text-sm font-bold mb-3">
                      <span>✓</span><span>AI проаналізував товар</span>
                    </div>
                    <div className="text-white font-bold">{analysis.productName}</div>
                    <div className="text-white/40 text-xs">{analysis.category}</div>
                    <div className="space-y-1 mt-2">
                      {analysis.bullets.slice(0,3).map((b,i) => (
                        <div key={i} className="text-white/60 text-xs flex gap-2">
                          <span className="text-gold">✓</span><span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/5 rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span className="text-white/50 text-sm">AI аналізує товар...</span>
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={!analysis || loading}
                  className="w-full bg-gold text-black font-bold py-4 rounded-2xl text-lg hover:bg-gold/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"/>
                      Генерую карточку...
                    </span>
                  ) : '⚡ Згенерувати карточку'}
                </button>

                <button onClick={() => { setPhoto(null); setAnalysis(null) }}
                  className="w-full text-white/30 text-sm py-2 hover:text-white/50 transition-colors">
                  Змінити фото
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Result */}
        {step === 2 && result && (
          <div className="animate-fadeIn text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">Ось твоя карточка!</h2>
            <p className="text-white/50 mb-6 text-sm">В Студії можна генерувати 4 варіанти одночасно з різними стилями</p>

            <div className="rounded-2xl overflow-hidden mb-6 shadow-2xl">
              <img src={result} alt="Generated card" className="w-full" />
            </div>

            <button onClick={finish}
              className="w-full bg-gold text-black font-bold py-4 rounded-2xl text-lg hover:bg-gold/90 transition-all mb-3">
              Перейти до Студії →
            </button>
            <p className="text-white/30 text-xs">У тебе є {10} зорь для генерацій</p>
          </div>
        )}

      </div>
    </div>
  )
}
