'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
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
const MAX_PHOTOS = 10
const COST_MAP: Record<Mode, number> = { photo: 4, card: 4, video: 16 }
const CATEGORIES = ['Одяг та взуття', 'Тактичне спорядження', 'Електроніка', 'Дім та сад', "Краса та здоров'я", 'Спорт', 'Авто та мото', 'Іграшки', 'Їжа та напої', 'Інше']

// ─── Sub-components ──────────────────────────────────────────────────────────
function PhotoUploader({ photos, onAdd, onRemove, onClear, irrelevant = [] }: {
  photos: string[]; onAdd: (b64: string) => void; onRemove: (i: number) => void; onClear: () => void; irrelevant?: string[]
}) {
  const ref = useRef<HTMLInputElement>(null)
  async function compress(file: File): Promise<string> {
    return new Promise(resolve => {
      const img = new Image(), url = URL.createObjectURL(file)
      img.onload = () => {
        const MAX = 1024
        let [w, h] = [img.width, img.height]
        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h*MAX/w); w = MAX } else { w = Math.round(w*MAX/h); h = MAX } }
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d')!.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(c.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = () => { URL.revokeObjectURL(url); const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file) }
      img.src = url
    })
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    files.slice(0, MAX_PHOTOS - photos.length).forEach(async file => {
      try { onAdd(await compress(file)) }
      catch { const r = new FileReader(); r.onload = () => onAdd(r.result as string); r.readAsDataURL(file) }
    })
    if (ref.current) ref.current.value = ''
  }
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={handleFile} />
      <div className="flex flex-wrap gap-2 mb-2">
        {photos.map((p, i) => {
          const bad = irrelevant.includes(p)
          return (
          <div key={i} className="relative group">
            <img src={p} alt="" className={`w-16 h-16 object-cover rounded-xl border ${bad ? 'border-red-500' : 'border-white/15'}`} />
            {bad && (
              <div onClick={() => onRemove(i)} title="Не відноситься до товару — натисніть, щоб прибрати"
                className="absolute inset-0 rounded-xl bg-red-600/65 flex items-center justify-center cursor-pointer">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </div>
            )}
            <button onClick={() => onRemove(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">×</button>
          </div>
          )
        })}
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
      {irrelevant.length > 0 && (
        <p className="text-red-400/90 text-xs mt-1.5">⚠ {irrelevant.length} фото не відноситься до товару — приберіть зайве</p>
      )}
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
  const [active, setActive] = React.useState(0)
  const total = results.length + (loading ? loadingCount : 0)

  React.useEffect(() => { if (results.length > 0) setActive(results.length - 1) }, [results.length])

  if (!loading && results.length === 0) return (
    <div className="flex-1 flex items-center justify-center flex-col gap-3">
      <div className="text-4xl opacity-20">📸</div>
      <p className="text-white/20 text-sm">Тут з'являться результати після генерації</p>
    </div>
  )

  const current = results[active]

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Main image */}
      <div className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/10" style={{maxHeight: "calc(100vh - 220px)"}}>
        {current ? (
          <>
            <img src={current} alt="" className="w-full object-contain" style={{maxHeight: "calc(100vh - 240px)"}} />
            {/* Download button */}
            <div className="absolute top-3 right-3 flex gap-2">
              <a href={current} download={`studio-${active+1}.jpg`} target="_blank" rel="noreferrer"
                className="bg-black/60 backdrop-blur text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-black/80 border border-white/20">
                ⬇ Завантажити
              </a>
            </div>
            {/* Counter */}
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur text-white text-xs px-2.5 py-1 rounded-full">
              {active + 1} / {results.length}
            </div>
            {/* Prev/Next arrows */}
            {results.length > 1 && (
              <>
                <button onClick={() => setActive(a => Math.max(0, a - 1))} disabled={active === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur text-white font-bold hover:bg-black/80 disabled:opacity-30 transition-all text-lg flex items-center justify-center">
                  ‹
                </button>
                <button onClick={() => setActive(a => Math.min(results.length - 1, a + 1))} disabled={active === results.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur text-white font-bold hover:bg-black/80 disabled:opacity-30 transition-all text-lg flex items-center justify-center">
                  ›
                </button>
              </>
            )}
          </>
        ) : loading ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-2 border-gold border-t-transparent rounded-full animate-spin"/>
            <p className="text-white/40 text-sm">Генерую...</p>
          </div>
        ) : null}
      </div>

      {/* Thumbnails strip */}
      {(results.length > 1 || loading) && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {results.map((url, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${active === i ? 'border-gold scale-105' : 'border-white/15 hover:border-white/40'}`}>
              <img src={url} alt="" className="w-full h-full object-cover"/>
            </button>
          ))}
          {loading && Array.from({ length: loadingCount }).map((_, i) => (
            <div key={`l${i}`} className="shrink-0 w-16 h-16 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-gold/50 border-t-transparent rounded-full animate-spin"/>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


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
  const [cardPreset, setCardPreset] = useState('urban')
  const [cardLayout, setCardLayout] = useState<'split'|'diagonal'|'radial'|'bold'|'poster'|'magazine'|'sidebar'>('split')
  const [creativity, setCreativity] = useState(0.5)
  const [format, setFormat] = useState<Format>('1:1')
  const [count, setCount] = useState(4)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [bullets, setBullets] = useState(['', '', '', '', ''])

  // AI Idea
  const [aiIdeaLoading, setAiIdeaLoading] = useState(false)
  const [showAiMenu, setShowAiMenu] = useState(false)

  // Results
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [irrelevant, setIrrelevant] = useState<string[]>([])
  const [checking, setChecking] = useState(false)
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

  const usablePhotos = Math.max(1, photos.length - irrelevant.length)
  const totalCost = mode === 'photo' ? COST_MAP[mode] * usablePhotos : COST_MAP[mode] * count
  // Auto-analyze: fires when first photo added, or when switching to card mode
  React.useEffect(() => {
    if (photos.length === 1 && token && !analyzing) {
      // First photo was just added - analyze it
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) analyzePhoto(photos[0], session.access_token)
      })
    }
  }, [photos.length])

  React.useEffect(() => {
    if (mode === 'card' && photos.length > 0 && token && !analyzing) {
      const hasAnyBullet = bullets.some(b => b.trim())
      if (!hasAnyBullet) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.access_token) analyzePhoto(photos[0], session.access_token)
        })
      }
    }
  }, [mode])

  // Коли є 2+ фото — перевіряємо, чи всі вони про той самий товар (з debounce)
  React.useEffect(() => {
    if (photos.length < 2 || !token) { setIrrelevant([]); return }
    const t = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) checkPhotos(photos, session.access_token, productName)
      })
    }, 1000)
    return () => clearTimeout(t)
  }, [photos, token])

  async function analyzePhoto(photo: string, tok: string) {
    if (!photo || !tok || analyzing) return
    setAnalyzing(true)
    try {
      const res = await fetch('/api/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ imageBase64: photo, lang: 'uk' }),
      })
      if (!res.ok) return
      const d = await res.json()
      if (d.productName) setProductName(prev => prev.trim() ? prev : d.productName)
      if (d.category) setCategory(prev => prev ? prev : d.category)
      if (d.bullets?.length) {
        setBullets(prev => {
          const hasAny = prev.some(b => b.trim())
          if (hasAny) return prev
          return [...d.bullets.slice(0, 5), '', '', '', '', ''].slice(0, 5)
        })
      }
    } catch (e) { console.warn('analyze error:', e) }
    setAnalyzing(false)
  }

  // Перевіряє всі фото і помічає ті, що не відносяться до товару
  async function checkPhotos(pics: string[], tok: string, name: string) {
    if (!Array.isArray(pics) || pics.length < 2 || !tok) { setIrrelevant([]); return }
    setChecking(true)
    try {
      const res = await fetch('/api/check-product-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ photos: pics, productName: name }),
      })
      if (res.ok) {
        const d = await res.json()
        const bad: number[] = Array.isArray(d.irrelevant) ? d.irrelevant : []
        setIrrelevant(bad.map(i => pics[i]).filter(Boolean))
      }
    } catch (e) { console.warn('checkPhotos error:', e) }
    setChecking(false)
  }

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
          mode, productPhoto: photos[0], productPhotos: photos, productName, category, displayStyle, cardPreset, cardLayout, creativity,
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
    <div className="min-h-screen flex flex-col bg-[#08080b]">
      {/* Header */}
      <header className="border-b border-white/8 px-6 py-3 flex items-center justify-between shrink-0">
        <Link href="/" className="font-display font-black text-lg"><span className="text-gradient">Картка</span><span className="text-white">АІ</span></Link>
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
              irrelevant={irrelevant}
              onAdd={b64 => {
              setPhotos(p => {
                const next = [...p, b64].slice(0, MAX_PHOTOS)
                if (p.length === 0) {
                  // Get fresh token from session to avoid race condition
                  supabase.auth.getSession().then(({ data: { session } }) => {
                    if (session?.access_token) analyzePhoto(b64, session.access_token)
                  })
                }
                return next
              })
            }}
              onRemove={i => setPhotos(p => p.filter((_, j) => j !== i))}
              onClear={() => setPhotos([])}
            />
            <div className="mt-3 space-y-2">
              <div className="relative">
                <input value={productName} onChange={e => setProductName(e.target.value)}
                  placeholder={analyzing ? "🔍 Аналізую фото..." : "Назва товару"}
                  className={`w-full bg-white/5 border rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none transition-all ${analyzing ? 'border-gold/40 placeholder-gold/50' : 'border-white/10 focus:border-gold/50'}`} />
                {analyzing
                  ? <div className="absolute right-3 top-3 w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin"/>
                  : photos.length > 0 && (
                    <button onClick={() => supabase.auth.getSession().then(({data:{session}}) => { if(session?.access_token) analyzePhoto(photos[0], session.access_token) })}
                      className="absolute right-2 top-1.5 text-xs bg-gold/15 text-gold px-2 py-1 rounded-lg hover:bg-gold/25 transition-colors"
                      title="AI аналіз фото">🔍</button>
                  )
                }
              </div>
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
                      <p className="text-white/30 text-[10px] mt-1.5">Для товару найкраще 1:1 або 3:4 / 9:16. 16:9 робить товар дрібним — лого гірше читається.</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {mode === 'card' && (
              <>
                <div className="mb-4">
                  {/* Card Preset Selector */}
                  <div className="mb-3">
                    <span className="text-white/50 text-xs font-bold uppercase block mb-2">Стиль карточки</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([['military','🎖️ Мілітарі'],['urban','⚡ Урбан'],['premium','💎 Преміум'],['rozetka','🟠 Rozetka'],['prom','🔵 Prom'],['minimal','◻️ Мінімал'],['social','💖 Соціальний'],['noir','🌑 Нуар'],['emerald','💚 Смарагд'],['crimson','❤️ Багряний'],['ocean','🌊 Океан'],['sunset','🌅 Захід'],['royal','👑 Роял'],['goldlux','🏆 Лакшері'],['mint','🌿 Мʼята'],['coral','🪸 Корал'],['steel','⚙️ Сталь'],['forest','🌲 Ліс']] as [string,string][]).map(([v,l]) => (
                        <button key={v} onClick={() => setCardPreset(v)}
                          className={['py-1.5 px-1 rounded-lg text-xs font-semibold transition-all', cardPreset===v ? 'bg-gold text-black' : 'bg-white/8 text-white/60 hover:bg-white/15'].join(' ')}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Creativity Slider */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-white/50 text-xs font-bold uppercase">Креативність AI</span>
                      <span className="text-gold text-xs font-bold">{creativity < 0.35 ? '🎯 Класичний' : creativity < 0.7 ? '⚡ Змішаний' : '🎨 Авторський'}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.1" value={creativity}
                      onChange={e => setCreativity(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-gold"
                      style={{background: `linear-gradient(to right, #FFD700 ${creativity*100}%, rgba(255,255,255,0.1) ${creativity*100}%)`}}
                    />
                    <div className="flex justify-between text-white/20 text-[10px] mt-0.5">
                      <span>Низька</span><span>Середня</span><span>Висока</span>
                    </div>
                  </div>

                  {/* Layout */}
                  <div className="mb-3">
                    <span className="text-white/50 text-xs font-bold uppercase block mb-2">Розміщення</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([['split','◧ Split','Текст+Товар'],['diagonal','◢ Diagonal','Діагональ'],['radial','◎ Radial','Навколо'],['bold','⬛ Bold','Великий'],['poster','🖼 Poster','Постер'],['magazine','📰 Magazine','Журнал'],['sidebar','◨ Бічна','Панель справа']] as [string,string,string][]).map(([v,l,d])=>(
                        <button key={v} onClick={()=>setCardLayout(v as any)} className={['py-1.5 px-2 rounded-lg text-xs transition-all',cardLayout===v?'bg-gold text-black font-bold':'bg-white/8 text-white/60 hover:bg-white/15'].join(' ')}>
                          <span className="block font-bold">{l}</span><span className="text-[10px] opacity-60">{d}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Text Preview */}
                  {productName.trim() && bullets.some(b=>b.trim()) && (
                    <div className="glass rounded-xl p-3 mb-3">
                      <span className="text-white/30 text-xs uppercase font-bold block mb-2">Превью тексту</span>
                      <p className="text-white/80 text-xs font-bold mb-1.5 truncate">{productName.toUpperCase()}</p>
                      {bullets.filter(Boolean).slice(0,5).map((b,i) => (
                        <p key={i} className="text-white/50 text-xs mb-0.5 truncate">✓ {b.slice(0,36)}</p>
                      ))}
                      <p className="text-white/25 text-xs mt-1.5">XS · S · M · L · XL · 2XL</p>
                    </div>
                  )}

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
                      <p className="text-white/30 text-[10px] mt-1.5">Для товару найкраще 1:1 або 3:4 / 9:16. 16:9 робить товар дрібним — лого гірше читається.</p>
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

          <div className="flex-1 overflow-hidden p-3 md:p-5 flex flex-col">
            {error && (
              <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm flex flex-wrap items-center justify-between gap-2">
                <span>{error}</span>
                {error.includes('зорь') && <Link href="/pricing" className="bg-gold text-black px-4 py-1.5 rounded-lg font-bold text-sm">Поповнити ⭐</Link>}
              </div>
            )}
            <ResultGrid results={results} loading={loading} loadingCount={mode === 'photo' ? Math.max(1, photos.length) : count} />
            {results.length > 0 && (
              <button onClick={() => { try { localStorage.setItem('studio_batch', JSON.stringify(results)) } catch {} ; window.location.href = '/products/create' }}
                className="btn-shine mt-4 self-start bg-gradient-to-r from-gold to-gold-light text-black font-bold px-5 py-2.5 rounded-xl hover:brightness-110">
                ✨ Зберегти все як товар →
              </button>
            )}
          </div>

          {/* Generate button */}
          <div className="border-t border-white/8 px-4 md:px-8 py-3 md:py-4 flex flex-wrap items-center gap-3 shrink-0">
            <button onClick={generate} disabled={!canGenerate}
              className={`btn-shine flex items-center gap-3 px-6 py-3 rounded-xl font-bold text-base transition-all ${canGenerate ? 'bg-gradient-to-r from-gold to-gold-light text-black hover:opacity-90 shadow-[0_6px_24px_rgba(255,210,63,0.4)]' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>
              {loading ? <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"/> : '✦'}
              Згенерувати
              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm ${canGenerate ? 'bg-black/20' : 'bg-white/5'}`}>
                ⭐ {totalCost}
              </span>
            </button>
            {mode !== 'photo' && (
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-xs">Кількість:</span>
                {[1,2,3,4].map(n => (
                  <button key={n} onClick={() => setCount(n)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${count===n ? 'bg-white text-black' : 'bg-white/8 text-white/50 hover:bg-white/15'}`}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {mode === 'photo' && photos.length > 0 && (
              <span className="text-white/40 text-xs">{usablePhotos} фото → {usablePhotos} результат(ів) • 4⭐ за кожне{irrelevant.length > 0 ? ` · ${irrelevant.length} пропущено (бирки/упаковка/інше)` : ''}</span>
            )}
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
