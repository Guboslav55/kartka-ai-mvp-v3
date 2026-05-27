'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function VideoPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [token, setToken] = useState('')
  const [starsBalance, setStarsBalance] = useState(0)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState<'5s' | '10s'>('5s')
  const [loop, setLoop] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return }
      setToken(session.access_token)
      supabase.from('users').select('stars_balance').eq('id', session.user.id).single()
        .then(({ data }) => { if (data) setStarsBalance(data.stars_balance ?? 0) })
    })
    const h = (e: any) => setStarsBalance(e.detail.newBalance)
    window.addEventListener('stars-updated', h)
    return () => window.removeEventListener('stars-updated', h)
  }, [])

  const cost = duration === '10s' ? 32 : 16
  const canGenerate = (!!photo || !!photoUrl) && starsBalance >= cost && !loading

  async function generate() {
    if (!canGenerate) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: photo, imageUrl: photoUrl || undefined, description, duration, loop }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error)
        if (d.needStars) setStarsBalance(d.balance)
      } else {
        setResult(d.url)
        setStarsBalance(d.newBalance)
        window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: d.newBalance } }))
      }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black text-2xl">🎬 AI Відео</h1>
          <p className="text-white/40 text-sm mt-1">Перетвори фото товару у відео за секунди</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border ${starsBalance < cost ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/10 text-white border-white/15'}`}>
            ⭐ {starsBalance}
          </Link>
          <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        </div>
      </div>

      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 mb-6">
        <p className="text-white font-semibold text-sm">🎬 AI генерує відео з фото товару</p>
        <p className="text-white/50 text-xs mt-1">Плавна анімація, обертання, комерційний стиль. Потрібен REPLICATE_API_TOKEN.</p>
      </div>

      {/* Photo upload */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 mb-5">
        <label className="text-white/60 text-xs font-bold uppercase tracking-wider block mb-3">Фото товару</label>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (!f) return
            const r = new FileReader()
            r.onload = () => setPhoto(r.result as string)
            r.readAsDataURL(f)
          }} />
        {photo ? (
          <div className="flex items-center gap-4">
            <img src={photo} className="w-24 h-24 object-cover rounded-xl border border-white/15"/>
            <div>
              <p className="text-white text-sm font-semibold">Фото завантажено</p>
              <button onClick={() => { setPhoto(null); if(fileRef.current)fileRef.current.value='' }}
                className="text-white/30 text-xs hover:text-red-400 mt-1">Видалити ×</button>
            </div>
          </div>
        ) : (
          <div>
            <button onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-white/15 rounded-xl p-8 text-center hover:border-white/30 transition-colors cursor-pointer">
              <div className="text-3xl mb-2">📸</div>
              <p className="text-white/50 text-sm">Завантажити фото товару</p>
            </button>
            <div className="mt-3">
              <p className="text-white/40 text-xs mb-1">або вставити URL зображення:</p>
              <input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/25 focus:outline-none focus:border-indigo-500/50"/>
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 mb-5 space-y-4">
        <div>
          <label className="text-white/60 text-xs font-bold uppercase tracking-wider block mb-2">Опис відео (необов'язково)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            placeholder="напр: плавне обертання на 360°, динамічна зміна ракурсів, преміум стиль"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/25 focus:outline-none focus:border-indigo-500/50 resize-none"/>
        </div>
        <div>
          <label className="text-white/60 text-xs font-bold uppercase tracking-wider block mb-2">Тривалість</label>
          <div className="flex gap-3">
            {(['5s', '10s'] as const).map(d => (
              <button key={d} onClick={() => setDuration(d)}
                className={`flex-1 py-3 rounded-xl font-bold transition-all border ${duration===d ? 'bg-gold text-black border-gold' : 'bg-white/5 text-white/60 border-white/10 hover:border-white/25'}`}>
                {d} <span className="text-xs ml-1 opacity-60">({d === '5s' ? '16' : '32'} ⭐)</span>
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <button type="button" onClick={() => setLoop(v => !v)}
            className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${loop ? 'bg-gold' : 'bg-white/15'}`}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: loop ? '18px' : '2px' }}/>
          </button>
          <span className="text-white/60 text-sm">Циклічне відео</span>
        </label>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm mb-4 flex items-center justify-between gap-2">
          <span>{error}</span>
          {error.includes('зорь') && <Link href="/pricing" className="bg-gold text-black px-3 py-1 rounded-lg text-xs font-bold">Поповнити</Link>}
        </div>
      )}

      <button onClick={generate} disabled={!canGenerate}
        className={`w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-3 mb-8 ${canGenerate ? 'bg-gradient-to-r from-gold to-gold-light text-black hover:opacity-90' : 'bg-white/8 text-white/30 cursor-not-allowed'}`}>
        {loading
          ? <><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"/><span>Генерую відео (~60-90 сек)...</span></>
          : <><span>🎬 Згенерувати відео</span><span className="bg-black/20 px-2 py-1 rounded-lg text-sm">{cost} ⭐</span></>
        }
      </button>

      {result && (
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
            <span className="text-white font-bold">✅ Відео готове</span>
            <a href={result} download="product-video.mp4" target="_blank" rel="noreferrer"
              className="bg-white text-black px-4 py-1.5 rounded-xl text-sm font-bold">⬇ Завантажити MP4</a>
          </div>
          <div className="p-5">
            <video src={result} controls loop={loop} className="w-full rounded-xl max-h-96" />
          </div>
        </div>
      )}
    </div>
  )
}
