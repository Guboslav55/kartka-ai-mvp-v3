'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function UpscalePage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [token, setToken] = useState('')
  const [starsBalance, setStarsBalance] = useState(0)
  const [photo, setPhoto] = useState<string|null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [scale, setScale] = useState(2)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string|null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return }
      setToken(session.access_token)
      supabase.from('users').select('stars_balance').eq('id', session.user.id).single()
        .then(({ data }) => { if (data) setStarsBalance(data.stars_balance ?? 0) })
    })
  }, [])

  async function upscale() {
    if ((!photo && !imageUrl) || loading) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: photo, imageUrl: imageUrl || undefined, scale }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error)
        if (d.needStars) setStarsBalance(d.balance)
      } else {
        setResult(d.url)
        setStarsBalance(d.newBalance ?? starsBalance)
      }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black text-2xl">🔍 Покращення якості</h1>
          <p className="text-white/40 text-sm mt-1">RealESRGAN — збільш роздільну здатність до 4×</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-white/10 text-white border border-white/15 rounded-full px-3 py-1.5 text-sm">⭐ {starsBalance}</span>
          <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
          <label className="text-white/60 text-xs font-bold uppercase mb-3 block">Завантажити фото</label>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              const r = new FileReader(); r.onload = () => setPhoto(r.result as string); r.readAsDataURL(f)
            }} />
          {photo ? (
            <div className="relative group rounded-xl overflow-hidden border border-white/15">
              <img src={photo} alt="" className="w-full max-h-48 object-contain bg-white/5 p-2"/>
              <button onClick={() => setPhoto(null)} className="absolute top-2 right-2 bg-red-500/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Видалити</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-white/15 rounded-xl p-8 text-center hover:border-white/30 transition-colors">
              <p className="text-white/50 text-sm">PNG, JPG, WEBP</p>
              <p className="text-white/25 text-xs mt-1">Клікни або перетягни</p>
            </button>
          )}
          <div className="mt-3">
            <p className="text-white/40 text-xs mb-1">або URL зображення:</p>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/25 focus:outline-none"/>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="text-white/60 text-xs font-bold uppercase mb-3 block">Масштаб збільшення</label>
            <div className="flex gap-3">
              {[2, 4].map(s => (
                <button key={s} onClick={() => setScale(s)}
                  className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all border ${scale === s ? 'bg-gold text-black border-gold' : 'bg-white/5 text-white border-white/10 hover:border-white/25'}`}>
                  ×{s}
                  <span className="block text-xs opacity-60 font-normal">{scale === s ? `${2 * s} ⭐` : ''}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 text-xs text-white/30 space-y-1">
              <p>×2 — 2× більша роздільна здатність (2 ⭐)</p>
              <p>×4 — 4× більша роздільна здатність (2 ⭐)</p>
              <p>З Replicate: RealESRGAN AI upscaling</p>
              <p>Без Replicate: Sharp lanczos3 (безкоштовно)</p>
            </div>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>}

          <button onClick={upscale} disabled={(!photo && !imageUrl) || loading}
            className={`w-full py-4 rounded-2xl font-bold transition-all ${(!photo && !imageUrl) || loading ? 'bg-white/8 text-white/30 cursor-not-allowed' : 'bg-gradient-to-r from-gold to-gold-light text-black hover:opacity-90'}`}>
            {loading ? 'Обробляю...' : `🔍 Покращити ×${scale} • 2 ⭐`}
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
            <span className="text-white font-bold">✅ Результат</span>
            <a href={result} download="upscaled.png" target="_blank" rel="noreferrer" className="bg-gold text-black px-4 py-1.5 rounded-xl text-sm font-bold">⬇ Скачати</a>
          </div>
          <div className="p-5">
            <img src={result} alt="Upscaled" className="w-full rounded-xl object-contain max-h-96"/>
          </div>
        </div>
      )}
    </div>
  )
}
