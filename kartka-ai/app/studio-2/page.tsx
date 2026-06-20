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
function PhotoUploader({ photos, onAdd, onRemove, onClear, irrelevant = [], notForModel = [], frontMode = false }: {
  photos: string[]; onAdd: (b64: string) => void; onRemove: (i: number) => void; onClear: () => void; irrelevant?: string[]; notForModel?: string[]; frontMode?: boolean
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
      {photos.length === 0 && (
        <button onClick={() => ref.current?.click()} className="w-full mb-3 rounded-2xl border-[1.5px] border-dashed border-white/15 bg-white/[0.03] py-5 px-4 text-center hover:border-gold/50 hover:bg-gold/5 transition-all group">
          <div className="text-white/40 group-hover:text-gold-light text-2xl mb-1">⬆</div>
          <div className="text-white text-[13px] font-semibold">Перетягніть або оберіть фото</div>
          <div className="text-white/30 text-[11px] mt-0.5">до 10 фото товару з різних сторін</div>
        </button>
      )}
      <div className="flex flex-wrap gap-2 mb-2">
        {photos.map((p, i) => {
          const bad = irrelevant.includes(p)
          const amber = !bad && frontMode && notForModel.includes(p)
          return (
          <div key={i} className="relative group">
            <img src={p} alt="" className={`w-16 h-16 object-cover rounded-xl border ${bad ? 'border-red-500' : amber ? 'border-amber-500' : 'border-white/15'}`} />
            {bad && (
              <div onClick={() => onRemove(i)} title="Не відноситься до товару — натисніть, щоб прибрати"
                className="absolute inset-0 rounded-xl bg-red-600/65 flex items-center justify-center cursor-pointer">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </div>
            )}
            {amber && (
              <div title="Потрібен вид анфас. У режимах «На моделі» та «Раскладка зверху» це фото пропускається (інші режими його використають)."
                className="absolute inset-0 rounded-xl bg-amber-500/45 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="9" /><line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
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
      {frontMode && notForModel.filter(p => !irrelevant.includes(p) && photos.includes(p)).length > 0 && (
        <p className="text-amber-400/90 text-xs mt-1">ℹ {notForModel.filter(p => !irrelevant.includes(p) && photos.includes(p)).length} фото не піде у цей режим (потрібен вид анфас) — у «На моделі» та «Раскладка зверху» пропускається</p>
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
    <div className="flex-1 flex items-center justify-center rounded-3xl border border-white/8" style={{background:'radial-gradient(120% 90% at 50% 0%, #15141d, #0a0a10)'}}>
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <div className="w-16 h-16 rounded-2xl grid place-items-center bg-white/5 border border-white/10 text-2xl">📸</div>
        <p className="text-white/40 text-sm">Тут з'явиться результат після генерації</p>
        <p className="text-white/20 text-xs">Завантажте фото та оберіть, як показати товар</p>
      </div>
    </div>
  )

  const current = results[active]

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Main image */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10" style={{maxHeight: "calc(100vh - 220px)", background:'radial-gradient(120% 90% at 50% 0%, #15141d, #0a0a10)'}}>
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


export default function StudioV2() {

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
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle | ''>('')
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
  const [notForModel, setNotForModel] = useState<string[]>([])
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

  const frontMode = displayStyle === 'model' || displayStyle === 'flatlay'
  const skippedCount = photos.filter(p => irrelevant.includes(p) || (frontMode && notForModel.includes(p))).length
  const usablePhotos = Math.max(1, photos.length - skippedCount)
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
    if (photos.length < 2 || !token) { setIrrelevant([]); setNotForModel([]); return }
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
    if (!Array.isArray(pics) || pics.length < 2 || !tok) { setIrrelevant([]); setNotForModel([]); return }
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
        const nfm: number[] = Array.isArray(d.notForModel) ? d.notForModel : []
        setIrrelevant(bad.map(i => pics[i]).filter(Boolean))
        setNotForModel(nfm.map(i => pics[i]).filter(Boolean))
      }
    } catch (e) { console.warn('checkPhotos error:', e) }
    setChecking(false)
  }

  const canGenerate = photos.length > 0 && productName.trim() && starsBalance >= totalCost && !loading && mode !== 'video' && (mode !== 'photo' || !!displayStyle)

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

  async function generate(append = false) {
    if (!canGenerate) return
    // Send only photos the user sees as valid: drop red-flagged (all modes) and amber (model mode)
    const usableList = photos.filter(p => !irrelevant.includes(p) && !(frontMode && notForModel.includes(p)))
    const sendPhotos = usableList.length ? usableList : photos
    setLoading(true); setError('')
    if (!append) setResults([])
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
          mode, productPhoto: sendPhotos[0], productPhotos: sendPhotos, productName, category, displayStyle, cardPreset, cardLayout, creativity,
          wishes, photoStyle, cardStyle, bullets: bullets.filter(Boolean),
          format, count,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Помилка')
        if (d.needStars) setStarsBalance(d.balance ?? 0)
      } else {
        setResults(prev => append ? [...prev, ...(d.results || [])] : (d.results || []))
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


  const [step, setStep] = useState(1)
  const step1ok = photos.length > 0 && productName.trim()
  function goStep(n: number) {
    if (n === 1) { setStep(1); return }
    if (n === 2 && step1ok) { setStep(2); return }
    if (n === 3 && (results.length > 0 || loading)) { setStep(3); return }
  }
  function runGenerate() {
    if (!canGenerate) return
    setStep(3)
    generate(false)
  }

  const vpRef = React.useRef<HTMLDivElement>(null)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const slide1Ref = React.useRef<HTMLElement>(null)
  const slide2Ref = React.useRef<HTMLElement>(null)
  const slide3Ref = React.useRef<HTMLElement>(null)
  const [tx, setTx] = React.useState(0)
  const [vh, setVh] = React.useState(0)
  const measure = React.useCallback(() => {
    const vp = vpRef.current
    const active = (step === 1 ? slide1Ref : step === 2 ? slide2Ref : slide3Ref).current
    if (!vp || !active) return
    setTx((vp.clientWidth - active.offsetWidth) / 2 - active.offsetLeft)
    setVh(active.offsetHeight)
  }, [step])
  React.useLayoutEffect(() => { measure() }, [measure, photos.length, results.length, displayStyle, wishes, error, loading, irrelevant, notForModel, productName, category, aiIdeaLoading])
  React.useEffect(() => {
    const ro = new ResizeObserver(() => measure())
    if (trackRef.current) ro.observe(trackRef.current)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [measure])

  if (!ready) return <div className="min-h-screen flex items-center justify-center bg-[#08080c]"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div id="s2" className="min-h-screen bg-[#08080c]">

      <style>{`
        #s2{--gold:#E8B24A;--gold2:#F4D27A;--violet:#8B7FE8;--cyan:#5BD6E8;--coral:#E87A6B;--mut:#9A98AD;--dim:#6A687E;--line:rgba(255,255,255,.09);--line2:rgba(255,255,255,.16);--glass:rgba(255,255,255,.04)}
        @keyframes s2drift{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,30px) scale(1.08)}66%{transform:translate(-30px,20px) scale(.95)}}
        @keyframes s2enter{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        #s2 .aurora{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
        #s2 .aurora span{position:absolute;border-radius:50%;filter:blur(100px);animation:s2drift 22s ease-in-out infinite}
        #s2 .aurora span:nth-child(1){width:620px;height:620px;background:var(--violet);top:-200px;left:-120px;opacity:.26}
        #s2 .aurora span:nth-child(2){width:520px;height:520px;background:var(--gold);bottom:-180px;right:4%;opacity:.18;animation-delay:-7s}
        #s2 .aurora span:nth-child(3){width:480px;height:480px;background:var(--cyan);top:34%;right:-160px;opacity:.13;animation-delay:-13s}
        #s2 .wrap{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column}
        #s2 .top{display:flex;align-items:center;justify-content:space-between;padding:16px 30px;border-bottom:1px solid var(--line);backdrop-filter:blur(10px)}
        #s2 .logo{font-weight:800;font-size:20px;letter-spacing:-.02em;background:linear-gradient(92deg,var(--gold),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent}
        #s2 .stars{display:flex;align-items:center;gap:6px;font-weight:600;font-size:14px;background:var(--glass);border:1px solid var(--line2);padding:7px 13px;border-radius:999px;color:#F4F3F8;text-decoration:none}
        #s2 .stars b{color:var(--gold2)}
        #s2 .ghost{color:var(--mut);font-size:13px;text-decoration:none;margin-left:14px}
        #s2 .steps{display:flex;align-items:center;justify-content:center;padding:26px 20px 6px}
        #s2 .stepbtn{display:flex;align-items:center;gap:11px;cursor:pointer;background:none;border:none;font-family:inherit;padding:6px 4px}
        #s2 .dot{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:14px;border:1.5px solid var(--line2);color:var(--mut);transition:.3s;background:var(--glass)}
        #s2 .stepbtn.done .dot{background:rgba(232,178,74,.16);border-color:rgba(232,178,74,.5);color:var(--gold2)}
        #s2 .stepbtn.active .dot{background:linear-gradient(135deg,var(--gold),var(--gold2));border-color:transparent;color:#1a1206;box-shadow:0 0 0 5px rgba(232,178,74,.16)}
        #s2 .stepbtn .lbl{font-size:13.5px;color:var(--mut);font-weight:600;transition:.3s}
        #s2 .stepbtn.active .lbl{color:#F4F3F8}
        #s2 .bar{width:80px;height:2px;background:var(--line2);margin:0 10px;border-radius:2px;overflow:hidden;position:relative}
        #s2 .bar i{position:absolute;inset:0;background:linear-gradient(90deg,var(--gold),var(--gold2));transform:scaleX(0);transform-origin:left;transition:.4s}
        #s2 .bar.fill i{transform:scaleX(1)}
        #s2 .stage{flex:1;display:flex;justify-content:center;padding:18px 20px 50px}
        #s2 .panel{width:100%;max-width:760px;animation:s2enter .45s cubic-bezier(.2,.7,.3,1)}
        #s2 .card{background:rgba(255,255,255,.025);border:1px solid var(--line);border-radius:24px;padding:26px;backdrop-filter:blur(8px)}
        #s2 .h{font-size:22px;font-weight:700;letter-spacing:-.02em;margin-bottom:4px;color:#F4F3F8}
        #s2 .sub{font-size:13.5px;color:var(--mut);margin-bottom:22px}
        #s2 .row2{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-top:20px}
        #s2 .inp{display:flex;align-items:center;gap:8px;background:var(--glass);border:1px solid var(--line);border-radius:13px;padding:0 6px 0 14px;height:48px}
        #s2 .inp input{flex:1;background:none;border:none;outline:none;color:#F4F3F8;font-size:15px;font-family:inherit}
        #s2 .icbtn{width:34px;height:34px;border-radius:9px;border:none;background:linear-gradient(135deg,var(--violet),var(--cyan));color:#fff;display:grid;place-items:center;cursor:pointer}
        #s2 .sel{height:48px;background:#14131c;border:1px solid var(--line);border-radius:13px;color:#F4F3F8;padding:0 14px;font-size:14px;font-family:inherit;cursor:pointer;width:100%}
        #s2 .modes{display:grid;grid-template-columns:1fr 1fr;gap:13px}
        #s2 .mode{position:relative;border:1px solid var(--line);border-radius:18px;padding:18px;cursor:pointer;background:var(--glass);transition:.22s cubic-bezier(.2,.7,.3,1);text-align:left}
        #s2 .mode:hover{transform:translateY(-3px);border-color:var(--line2)}
        #s2 .mode .ic{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:rgba(255,255,255,.06);margin-bottom:13px;font-size:20px;transition:.22s}
        #s2 .mode b{display:block;font-size:15px;margin-bottom:3px;color:#F4F3F8}
        #s2 .mode span{font-size:12px;color:var(--dim);line-height:1.4}
        #s2 .mode.on{border-color:rgba(232,178,74,.55);background:rgba(232,178,74,.07);box-shadow:0 10px 30px -14px rgba(232,178,74,.6)}
        #s2 .mode.on .ic{background:linear-gradient(135deg,var(--gold),var(--coral))}
        #s2 .mode .chk{position:absolute;top:14px;right:14px;width:22px;height:22px;border-radius:50%;background:var(--gold);color:#1a1206;display:grid;place-items:center;font-weight:800;font-size:12px}
        #s2 .lbl2{font-size:12px;color:var(--mut);margin:22px 0 9px}
        #s2 .chips{display:flex;gap:8px;flex-wrap:wrap}
        #s2 .chip{height:38px;padding:0 16px;border-radius:11px;border:1px solid var(--line);background:var(--glass);color:var(--mut);font-size:13px;font-weight:600;cursor:pointer;display:grid;place-items:center;transition:.2s;font-family:inherit}
        #s2 .chip:hover{border-color:var(--line2)}
        #s2 .chip.on{border-color:rgba(232,178,74,.5);background:rgba(232,178,74,.1);color:var(--gold2)}
        #s2 .whead{display:flex;align-items:center;justify-content:space-between;margin:22px 0 9px}
        #s2 .whead .lbl2{margin:0}
        #s2 .wb{display:flex;gap:8px}
        #s2 .pill{font-size:12px;border-radius:9px;padding:7px 11px;cursor:pointer;border:1px solid;background:none;font-family:inherit;font-weight:600;text-decoration:none}
        #s2 .pill.t{color:var(--gold2);border-color:rgba(232,178,74,.35)}
        #s2 .pill.i{color:var(--violet);border-color:rgba(139,127,232,.35)}
        #s2 .pill:disabled{opacity:.4;cursor:not-allowed}
        #s2 textarea{width:100%;min-height:88px;background:var(--glass);border:1px solid var(--line);border-radius:14px;padding:13px;color:#F4F3F8;font-size:13.5px;font-family:inherit;resize:none;line-height:1.55;outline:none}
        #s2 textarea:disabled{opacity:.5;cursor:not-allowed}
        #s2 .nav{display:flex;align-items:center;gap:12px;margin-top:24px}
        #s2 .back{height:50px;padding:0 22px;border-radius:14px;border:1px solid var(--line2);background:var(--glass);color:var(--mut);font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:8px;transition:.2s}
        #s2 .back:hover{color:#F4F3F8;border-color:#F4F3F8}
        #s2 .next{flex:1;height:50px;border:none;border-radius:14px;background:linear-gradient(95deg,var(--gold),var(--gold2));color:#1a1206;font-size:15px;font-weight:800;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;position:relative;overflow:hidden;transition:.2s}
        #s2 .next:hover{filter:brightness(1.06);transform:translateY(-1px)}
        #s2 .next:disabled{background:rgba(255,255,255,.08);color:rgba(255,255,255,.3);cursor:not-allowed}
        #s2 .next .c{background:rgba(26,18,6,.18);border-radius:8px;padding:3px 10px;font-size:13px}
        #s2 .hint{text-align:center;font-size:12px;color:var(--dim);margin-top:12px}
        #s2 .more{height:50px;padding:0 22px;border-radius:14px;border:1px solid rgba(232,178,74,.4);background:rgba(232,178,74,.06);color:var(--gold2);font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:9px;transition:.2s}
        #s2 .more:hover{background:rgba(232,178,74,.12)}
        #s2 .more:disabled{opacity:.4;cursor:not-allowed}
        #s2 .more .c{background:rgba(232,178,74,.16);border-radius:7px;padding:2px 8px;font-size:12px}
        #s2 .save{flex:1;height:50px;border:none;border-radius:14px;background:linear-gradient(95deg,var(--gold),var(--gold2));color:#1a1206;font-size:15px;font-weight:800;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:.2s}
        #s2 .save:hover{filter:brightness(1.06);transform:translateY(-1px)}
        #s2 .errbox{background:rgba(226,75,74,.12);border:1px solid rgba(226,75,74,.35);color:#f0938f;border-radius:12px;padding:12px 14px;font-size:13px;margin-bottom:16px}
        #s2 .vp{overflow:hidden;width:100%;transition:height .5s cubic-bezier(.22,.7,.25,1)}
        #s2 .track{position:relative;display:flex;gap:30px;align-items:flex-start;transition:transform .55s cubic-bezier(.22,.7,.25,1);will-change:transform}
        #s2 .slide{flex:0 0 760px;max-width:88vw;opacity:.3;transform:scale(.93);filter:blur(1px);transition:opacity .5s,transform .5s,filter .5s;cursor:pointer}
        #s2 .slide.active{opacity:1;transform:scale(1);filter:none;cursor:default}
        #s2 .slide .card{pointer-events:none}
        #s2 .slide.active .card{pointer-events:auto}
        #s2 .note{margin-bottom:18px;background:rgba(232,162,58,.12);border:1px solid rgba(232,162,58,.35);color:#E8A23A;border-radius:12px;padding:11px 14px;font-size:12.5px;cursor:pointer;transition:.2s}
        #s2 .note:hover{background:rgba(232,162,58,.18)}
      `}</style>

      <div className="aurora"><span></span><span></span><span></span></div>
      <div className="wrap">
        <div className="top">
          <Link href="/" className="logo">КарткаAI</Link>
          <div style={{display:'flex',alignItems:'center'}}>
            <Link href="/pricing" className="stars">★ <b>{starsBalance}</b></Link>
            <Link href="/dashboard" className="ghost">← Кабінет</Link>
          </div>
        </div>

        <div className="steps">
          <button className={`stepbtn ${step===1?'active':''} ${step>1?'done':''}`} onClick={() => goStep(1)}><span className="dot">1</span><span className="lbl">Фото</span></button>
          <div className={`bar ${step>1?'fill':''}`}><i></i></div>
          <button className={`stepbtn ${step===2?'active':''} ${step>2?'done':''}`} onClick={() => goStep(2)}><span className="dot">2</span><span className="lbl">Як показати</span></button>
          <div className={`bar ${step>2?'fill':''}`}><i></i></div>
          <button className={`stepbtn ${step===3?'active':''}`} onClick={() => goStep(3)}><span className="dot">3</span><span className="lbl">Результат</span></button>
        </div>

        <div className="stage">
          <div className="vp" ref={vpRef} style={{height: vh ? vh : undefined}}>
          <div className="track" ref={trackRef} style={{transform:`translateX(${tx}px)`}}>
            <section className={`slide ${step===1?'active':''}`} ref={slide1Ref} onClick={() => { if (step!==1) goStep(1) }}>
              <div className="card">
                <div className="h">Завантажте фото товару</div>
                <div className="sub">Чим більше ракурсів — тим краще результат. До {MAX_PHOTOS} фото.</div>
                <PhotoUploader
                  photos={photos}
                  irrelevant={irrelevant}
                  notForModel={notForModel}
                  frontMode={frontMode}
                  onAdd={b64 => {
                    setPhotos(p => {
                      const next = [...p, b64].slice(0, MAX_PHOTOS)
                      if (p.length === 0) {
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
                <div className="row2">
                  <div className="inp">
                    <input value={productName} onChange={e => setProductName(e.target.value)} placeholder={analyzing ? 'Аналізую фото…' : 'Назва товару'} />
                    {analyzing
                      ? <div className="w-5 h-5 mr-1 border-2 border-gold border-t-transparent rounded-full animate-spin"/>
                      : <button className="icbtn" title="AI аналіз фото" onClick={() => supabase.auth.getSession().then(({data:{session}}) => { if(session?.access_token && photos[0]) analyzePhoto(photos[0], session.access_token) })}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>
                        </button>}
                  </div>
                  <select className="sel" value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="">Категорія</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="nav">
                  <button className="next" disabled={!step1ok} onClick={() => goStep(2)}>
                    Далі: як показати
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </button>
                </div>
                {!step1ok && <div className="hint">{photos.length === 0 ? 'Додайте хоча б одне фото товару' : 'Введіть назву товару'}</div>}
              </div>
            </section>
            <section className={`slide ${step===2?'active':''}`} ref={slide2Ref} onClick={() => { if (step!==2) goStep(2) }}>
              <div className="card">
                <div className="h">Як показати товар</div>
                <div className="sub">Оберіть сцену — від цього залежить, як виглядатиме фото.</div>
                {frontMode && notForModel.filter(p => !irrelevant.includes(p) && photos.includes(p)).length > 0 && (
                  <div className="note" onClick={() => goStep(1)}>ℹ {notForModel.filter(p => !irrelevant.includes(p) && photos.includes(p)).length} фото не піде у цей режим (потрібен вид анфас) — натисніть, щоб переглянути на кроці «Фото»</div>
                )}
                <div className="modes">
                  {DISPLAY_STYLES.map(s => {
                    const on = displayStyle === s.value
                    return (
                      <button key={s.value} className={`mode ${on?'on':''}`} onClick={() => { if (s.value !== displayStyle) setWishes(''); setDisplayStyle(s.value) }}>
                        {on && <span className="chk">✓</span>}
                        <div className="ic">{s.emoji}</div>
                        <b>{s.label}</b><span>{s.desc}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="lbl2">Стиль фотографії</div>
                <div className="chips">
                  {(['commercial','home'] as const).map(s => (
                    <button key={s} className={`chip ${photoStyle===s?'on':''}`} onClick={() => setPhotoStyle(s)}>{s==='commercial'?'Комерційний':'Домашній'}</button>
                  ))}
                </div>

                <div className="lbl2">Формат</div>
                <div className="chips">
                  {FORMATS.map(f => <button key={f} className={`chip ${format===f?'on':''}`} onClick={() => setFormat(f)}>{f}</button>)}
                </div>

                <div className="whead">
                  <div className="lbl2">Побажання до сцени</div>
                  <div className="wb">
                    {displayStyle
                      ? <a href="/studio/style-test" className="pill t">🎯 Тест</a>
                      : <button className="pill t" disabled>🎯 Тест</button>}
                    <button className="pill i" disabled={aiIdeaLoading || !displayStyle} onClick={() => getAiIdea('random')}>{aiIdeaLoading ? '…' : '✦'} Ідея</button>
                  </div>
                </div>
                <textarea value={wishes} disabled={!displayStyle} maxLength={2000} onChange={e => setWishes(e.target.value)}
                  placeholder={displayStyle ? 'Опишіть фон, світло та атмосферу…' : 'Спочатку оберіть, як показати товар ↑'} />

                <div className="nav">
                  <button className="back" onClick={() => goStep(1)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg> Назад</button>
                  <button className="next" disabled={!canGenerate} onClick={runGenerate}>✦ Згенерувати <span className="c">⭐ {totalCost}</span></button>
                </div>
                <div className="hint">
                  {!displayStyle ? 'Оберіть, як показати товар' :
                   starsBalance < totalCost ? 'Недостатньо зорь — поповніть баланс' :
                   `${usablePhotos} фото → ${usablePhotos} результат(ів) · 4⭐ за кожне${skippedCount>0?` · ${skippedCount} пропущено`:''}`}
                </div>
              </div>
            </section>
            <section className={`slide ${step===3?'active':''}`} ref={slide3Ref} onClick={() => { if (step!==3) goStep(3) }}>
              <div className="card">
                <div className="h">{loading ? 'Генеруємо…' : 'Готово — ваші фото'}</div>
                <div className="sub">{loading ? (progressMsg || 'Зачекайте кілька секунд') : 'Гортайте варіанти, додайте ще або збережіть усі як товар.'}</div>
                {error && <div className="errbox">{error}</div>}
                <div style={{minHeight:380, display:'flex', flexDirection:'column'}}>
                  <ResultGrid results={results} loading={loading} loadingCount={usablePhotos} />
                </div>
                <div className="nav">
                  <button className="back" onClick={() => goStep(2)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M19 12H5M11 6l-6 6 6 6"/></svg> Змінити</button>
                  <button className="more" disabled={!canGenerate} onClick={() => generate(true)}>✦ Ще варіант <span className="c">⭐ {totalCost}</span></button>
                  {results.length > 0 && (
                    <button className="save" onClick={() => { try { localStorage.setItem('studio_batch', JSON.stringify(results)) } catch {} ; window.location.href = '/products/create' }}>Зберегти все як товар →</button>
                  )}
                </div>
              </div>
            </section>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
