'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────
type Mode = 'photo' | 'card' | 'video'
type DisplayStyle = 'model' | 'store' | 'flatlay' | 'catalog'
type PhotoStyle = 'commercial' | 'home'
type CardStyle = 'classic' | 'premium'
type Format = '9:16' | '3:4' | '1:1' | '4:3' | '16:9'

const DISPLAY_STYLES: { value: DisplayStyle; label: string; desc: string; emoji: string }[] = [
  { value: 'model',   label: 'На моделі',          desc: 'носимий контекст, акцент на посадці',    emoji: '🧍' },
  { value: 'store',   label: 'Як у магазині',       desc: 'на вішаку або підставці',                emoji: '🏪' },
  { value: 'flatlay', label: 'Раскладка зверху',    desc: 'вид строго зверху',                     emoji: '📐' },
  { value: 'catalog', label: 'Каталог (студійно)',  desc: 'чистий об\'єкт на нейтральному фоні',   emoji: '📸' },
]

const FORMATS: Format[] = ['9:16', '3:4', '1:1', '4:3', '16:9']
const MAX_PHOTOS = 4
const COST_MAP: Record<Mode, number> = { photo: 4, card: 4, video: 16 }
const CATEGORIES = ['Одяг та взуття', 'Тактичне спорядження', 'Електроніка', 'Дім та сад', "Краса та здоров'я", 'Спорт', 'Авто та мото', 'Іграшки', 'Їжа та напої', 'Інше']

// ─── Sub-components ──────────────────────────────────────────────────────────
function PhotoUploader({ photos, onAdd, onRemove, onClear }: {
  photos: string[]; onAdd: (b64: string) => void; onRemove: (i: number) => void; onClear: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    files.slice(0, MAX_PHOTOS - photos.length).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => onAdd(reader.result as string)
      reader.readAsDataURL(file)
    })
    if (ref.current) ref.current.value = ''
  }
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={handleFile} />
      <div className="flex flex-wrap gap-2 mb-2">
        {photos.map((p, i) => (
          <div key={i} className="relative group">
            <img src={p} alt="" className="w-16 h-16 object-cover rounded-xl border border-white/15" />
            <button onClick={() => onRemove(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button onClick={() => ref.current?.click()} className="w-16 h-16 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center text-white/40 hover:border-gold/50 hover:text-gold transition-all gap-1">
            <span className="text-xl leading-none">+</span>
            <span className="text-[10px]">Ще</span>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-white/30">
        <span>До {MAX_PHOTOS} фото товару з різних сторін</span>
        {photos.length > 0 && <button onClick={onClear} className="hover:text-red-400 transition-colors">{photos.length} з {MAX_PHOTOS} · очистити</button>}
      </div>
    </div>
  )
}

function ModeTab({ mode, active, onClick, locked }: { mode: Mode; active: boolean; onClick: () => void; locked?: boolean }) {
  const icons: Record<Mode, string> = { photo: '📸', card: '🃏', video: '🎬' }
  const labels: Record<Mode, string> = { photo: 'Фото', card: 'Карточка', video: 'Відео' }
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-white text-black' : 'text-white/50 hover:text-white/80'} ${locked ? 'opacity-50' : ''}`}>
      <span>{icons[mode]}</span>
      <span>{labels[mode]}</span>
      {locked && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">скоро</span>}
    </button>
  )
}

function ResultGrid({ results, loading, loadingCount }: { results: string[]; loading: boolean; loadingCount: number }) {
  if (!loading && results.length === 0) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-white/20 text-sm">Тут з'являться результати після генерації</p>
    </div>
  )
  return (
    <div className={`grid gap-3 md:gap-4 ${results.length + (loading ? loadingCount : 0) > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {results.map((url, i) => (
        <div key={i} className="relative group rounded-2xl overflow-hidden bg-white/5 border border-white/10">
          <img src={url} alt="" className="w-full aspect-square object-cover" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <a href={url} download={`studio-${i+1}.jpg`} target="_blank" rel="noreferrer"
              className="bg-white text-black px-4 py-2 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors">⬇ Скачати</a>
          </div>
        </div>
      ))}
      {loading && Array.from({ length: loadingCount }).map((_, i) => (
        <div key={`loading-${i}`} className="rounded-2xl bg-white/5 border border-white/10 aspect-square flex items-center justify-center">
          <div className="text-center"><div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin mx-auto mb-2"/><p className="text-white/40 text-xs">Генерую...</p></div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StudioPage() {
  const router = useRouter()
  const supabase = createClient()

  const [token, setToken] = useState('')
  const [starsBalance, setStarsBalance] = useState(0)
  const [ready, setReady] = useState(false)

  // Step 1 — Product
  const [photos, setPhotos] = useState<string[]>([])
  const [productName, setProductName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')

  // Step 2 — Generation settings
  const [mode, setMode] = useState<Mode>('photo')
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('catalog')
  const [wishes, setWishes] = useState('')
  const [photoStyle, setPhotoStyle] = useState<PhotoStyle>('commercial')
  const [cardStyle, setCardStyle] = useState<CardStyle>('classic')
  const [format, setFormat] = useState<Format>('1:1')
  const [count, setCount] = useState(1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [bullets, setBullets] = useState(['', '', '', '', ''])

  // AI Idea
  const [aiIdeaLoading, setAiIdeaLoading] = useState(false)
  const [showAiMenu, setShowAiMenu] = useState(false)

  // Results
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return }
      setToken(session.access_token)
      supabase.from('users').select('stars_balance').eq('id', session.user.id).single()
        .then(({ data }) => { if (data) setStarsBalance(data.stars_balance ?? 0) })
      setReady(true)
    })
    const h = (e: any) => setStarsBalance(e.detail.newBalance)
    window.addEventListener('stars-updated', h)

    // Pick up wish from style-test quiz
    const savedWish = localStorage.getItem('studio_wish')
    if (savedWish) { setWishes(savedWish); localStorage.removeItem('studio_wish') }

    return () => window.removeEventListener('stars-updated', h)
  }, [])

  const totalCost = COST_MAP[mode] * count
  const canGenerate = photos.length > 0 && productName.trim() && starsBalance >= totalCost && !loading && mode !== 'video'

  async function getAiIdea(type: 'random' | 'detailed') {
    setAiIdeaLoading(true); setShowAiMenu(false)
    try {
      const res = await fetch('/api/studio/ai-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productName, category, displayStyle, mode: type }),
      })
      const d = await res.json()
      if (d.idea) setWishes(d.idea)
    } catch {}
    setAiIdeaLoading(false)
  }

  async function generate() {
    if (!canGenerate) return
    setLoading(true); setError(''); setResults([])
    setProgress(0); setProgressMsg('Аналізую фото товару...')

    // Simulate progress stages
    const stages = [
      [15, 'Будую промпт...'],
      [35, 'Відправляю запит до AI...'],
      [55, 'Генерую зображення...'],
      [75, 'Накладаю товар на сцену...'],
      [90, 'Зберігаю результат...'],
    ]
    let stageIdx = 0
    const progressInterval = setInterval(() => {
      if (stageIdx < stages.length) {
        setProgress(stages[stageIdx][0] as number)
        setProgressMsg(stages[stageIdx][1] as string)
        stageIdx++
      }
    }, 2500)
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode, productPhoto: photos[0], productName, category, displayStyle,
          wishes, photoStyle, cardStyle, bullets: bullets.filter(Boolean),
          format, count,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Помилка')
        if (d.needStars) setStarsBalance(d.balance ?? 0)
      } else {
        setResults(d.results || [])
        if (typeof d.newBalance === 'number') {
          setStarsBalance(d.newBalance)
          window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: d.newBalance } }))
        }
      }
    } catch (e: any) { setError(e.message) }
    clearInterval(progressInterval)
    setProgress(100)
    setProgressMsg('Готово!')
    setTimeout(() => { setProgress(0); setProgressMsg('') }, 1000)
    setLoading(false)
  }

  if (!ready) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="min-h-screen flex flex-col bg-[#0F0F1A]">
      {/* Header */}
      <header className="border-b border-white/8 px-6 py-3 flex items-center justify-between shrink-0">
        <Link href="/" className="font-display font-black text-lg text-gold">Картка<span className="text-white">АІ</span></Link>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-all ${starsBalance < 10 ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/10 text-white border-white/15 hover:border-gold/40'}`}>
            ⭐ {starsBalance}
          </Link>
          <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* ── Left Panel ── */}
        <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-white/8 overflow-y-auto p-4 md:p-5 space-y-5 md:space-y-6 md:shrink-0 max-h-[55vh] md:max-h-none">

          {/* Step 01 — Product */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold text-sm">Ваш товар</span>
              <span className="text-white/25 text-xs font-mono">01</span>
            </div>
            <PhotoUploader
              photos={photos}
              onAdd={b64 => setPhotos(p => [...p, b64].slice(0, MAX_PHOTOS))}
              onRemove={i => setPhotos(p => p.filter((_, j) => j !== i))}
              onClear={() => setPhotos([])}
            />
            <div className="mt-3 space-y-2">
              <input value={productName} onChange={e => setProductName(e.target.value)}
                placeholder="Назва товару"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-gold/50" />
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-[#1a1a2e] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/70 focus:outline-none focus:border-gold/50">
                <option value="">Це — (категорія)</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="h-px bg-white/8"/>

          {/* Step 02 — Settings */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold text-sm">Налаштуйте генерацію</span>
              <span className="text-white/25 text-xs font-mono">02</span>
            </div>

            {/* Mode tabs */}
            <div className="bg-white/5 rounded-xl p-1 flex gap-1 mb-4">
              <ModeTab mode="photo" active={mode==='photo'} onClick={() => setMode('photo')} />
              <ModeTab mode="card" active={mode==='card'} onClick={() => setMode('card')} />
              <ModeTab mode="video" active={mode==='video'} onClick={() => setMode('video')} locked />
            </div>

            {mode === 'photo' && (
              <>
                <p className="text-white/40 text-xs mb-3">Як показати товар?</p>
                <div className="space-y-2 mb-4">
                  {DISPLAY_STYLES.map(s => (
                    <button key={s.value} onClick={() => setDisplayStyle(s.value)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${displayStyle===s.value ? 'border-gold/50 bg-gold/8' : 'border-white/8 hover:border-white/20'}`}>
                      <span className="text-2xl">{s.emoji}</span>
                      <div>
                        <div className="text-white text-sm font-medium">{s.label}</div>
                        <div className="text-white/40 text-xs">{s.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Wishes */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-white/60 text-xs">Побажання</label>
                    <div className="relative">
                      <div className="flex items-center gap-1.5">
                        <a href="/studio/style-test" className="text-xs text-gold hover:text-gold-light transition-colors border border-gold/30 px-2 py-1 rounded-lg">
                          🎯 Пройти тест
                        </a>
                        <button onClick={() => getAiIdea('random')} disabled={aiIdeaLoading}
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                          {aiIdeaLoading ? <span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin"/> : '✨'} Ідея
                        </button>
                      </div>
                    </div>
                  </div>
                  <textarea value={wishes} onChange={e => setWishes(e.target.value)} rows={3}
                    placeholder="Наприклад: м'який світло, мінімалізм, нейтральний фон."
                    maxLength={2000}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder-white/20 focus:outline-none focus:border-indigo-500/50 resize-none"/>
                  <div className="text-right text-white/25 text-xs">{wishes.length}/2000</div>
                </div>

                {/* Advanced settings */}
                <button onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-3">
                  <span className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
                  Розширені налаштування
                </button>
                {showAdvanced && (
                  <div className="space-y-4 mb-4 bg-white/3 rounded-xl p-3">
                    <div>
                      <p className="text-white/50 text-xs mb-2">Стиль фотографії</p>
                      <div className="flex gap-2">
                        {(['commercial', 'home'] as const).map(s => (
                          <button key={s} onClick={() => setPhotoStyle(s)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${photoStyle===s ? 'bg-white text-black' : 'bg-white/8 text-white/60 hover:bg-white/15'}`}>
                            {s === 'commercial' ? 'Комерційний' : 'Домашній'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs mb-2">Формат</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {FORMATS.map(f => (
                          <button key={f} onClick={() => setFormat(f)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${format===f ? 'bg-white text-black font-bold' : 'bg-white/8 text-white/50 hover:bg-white/15'}`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {mode === 'card' && (
              <>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-white/60 text-xs">Про що розповісти</label>
                    <span className="text-white/25 text-xs">переваги товару</span>
                  </div>
                  <div className="space-y-1.5">
                    {bullets.slice(0,5).map((b, i) => (
                      <input key={i} value={b} onChange={e => setBullets(prev => prev.map((v, j) => j===i ? e.target.value : v))}
                        placeholder={`Перевага ${i+1}`}
                        className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-white text-xs placeholder-white/20 focus:outline-none focus:border-indigo-500/50"/>
                    ))}
                  </div>
                </div>

                <button onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-3">
                  <span className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
                  Розширені налаштування
                </button>
                {showAdvanced && (
                  <div className="space-y-4 bg-white/3 rounded-xl p-3 mb-4">
                    <div>
                      <p className="text-white/50 text-xs mb-2">Стиль карточки</p>
                      <div className="flex gap-2">
                        {(['classic', 'premium'] as const).map(s => (
                          <button key={s} onClick={() => setCardStyle(s)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${cardStyle===s ? 'bg-white text-black' : 'bg-white/8 text-white/60 hover:bg-white/15'}`}>
                            {s === 'classic' ? 'Класичний' : 'Преміум'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs mb-2">Формат</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {FORMATS.map(f => (
                          <button key={f} onClick={() => setFormat(f)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all ${format===f ? 'bg-white text-black font-bold' : 'bg-white/8 text-white/50 hover:bg-white/15'}`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {mode === 'video' && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <div className="text-3xl mb-2">🎬</div>
                <p className="text-white font-semibold text-sm mb-1">Відео-генерація</p>
                <p className="text-white/40 text-xs">Буде доступна найближчим часом. Слідкуйте за оновленнями!</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Results Panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-8 py-4 border-b border-white/8 shrink-0">
            <span className="text-white/40 text-sm">Результати</span>
            {loading && progress > 0 && (
              <div className="flex-1 mx-4">
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-gold to-gold-light rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}/>
                </div>
                <p className="text-white/40 text-xs mt-1 text-center">{progressMsg}</p>
              </div>
            )}
            {results.length > 0 && (
              <button onClick={() => setResults([])} className="text-white/30 text-xs hover:text-white/60 transition-colors">Очистити ×</button>
            )}
            <span className="text-white/25 text-xs font-mono ml-auto">03</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            {error && (
              <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm flex flex-wrap items-center justify-between gap-2">
                <span>{error}</span>
                {error.includes('зорь') && <Link href="/pricing" className="bg-gold text-black px-4 py-1.5 rounded-lg font-bold text-sm">Поповнити ⭐</Link>}
              </div>
            )}
            <ResultGrid results={results} loading={loading} loadingCount={count} />
          </div>

          {/* Generate button */}
          <div className="border-t border-white/8 px-4 md:px-8 py-3 md:py-4 flex flex-wrap items-center gap-3 shrink-0">
            <button onClick={generate} disabled={!canGenerate}
              className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold text-base transition-all ${canGenerate ? 'bg-gradient-to-r from-gold to-gold-light text-black hover:opacity-90 shadow-[0_4px_20px_rgba(200,168,75,0.3)]' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>
              {loading ? <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"/> : '✦'}
              Згенерувати
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm ${canGenerate ? 'bg-black/20' : 'bg-white/5'}`}>
                ⭐ {totalCost}
              </span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-xs">Кількість:</span>
              {[1,2,3,4].map(n => (
                <button key={n} onClick={() => setCount(n)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${count===n ? 'bg-white text-black' : 'bg-white/8 text-white/50 hover:bg-white/15'}`}>
                  {n}
                </button>
              ))}
            </div>
            {!canGenerate && photos.length === 0 && <span className="text-white/30 text-xs">↑ Завантажте фото товару</span>}
            {!canGenerate && photos.length > 0 && !productName && <span className="text-white/30 text-xs">↑ Введіть назву товару</span>}
            {!canGenerate && photos.length > 0 && productName && starsBalance < totalCost && (
              <span className="text-red-400/70 text-xs">Недостатньо зорь (<Link href="/pricing" className="underline text-gold">поповнити</Link>)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
