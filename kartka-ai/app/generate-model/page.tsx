'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const GENDERS = [{value:'female',label:'Жінка',emoji:'👩'},{value:'male',label:'Чоловік',emoji:'👨'},{value:'nonbinary',label:'Небінарна',emoji:'🧑'}]
const AGES = [{value:'young',label:'18-25',emoji:'🧑'},{value:'adult',label:'25-40',emoji:'👤'},{value:'middle',label:'40-55',emoji:'🧓'}]
const ETHNICITIES = [{value:'european',label:'Європейська',emoji:'🌍'},{value:'asian',label:'Азійська',emoji:'🌏'},{value:'african',label:'Африканська',emoji:'✊'},{value:'latin',label:'Латинська',emoji:'💃'},{value:'middle_eastern',label:'Близькосхідна',emoji:'🌙'}]
const POSES = [{value:'standing_front',label:'Стоїть прямо',emoji:'🧍'},{value:'standing_side',label:'3/4 ракурс',emoji:'↗'},{value:'walking',label:'Ходить',emoji:'🚶'},{value:'casual',label:'Розслаблена',emoji:'🙆'},{value:'arms_crossed',label:'Руки схрещені',emoji:'🤞'}]
const BACKGROUNDS = ['studio white','studio gradient','urban street','nature park','minimalist indoor']

export default function GenerateModelPage() {
  const router = useRouter()
  const supabase = createClient()
  const clothRef = useRef<HTMLInputElement>(null)
  const [token, setToken] = useState('')
  const [starsBalance, setStarsBalance] = useState(0)
  const [clothingPhoto, setClothingPhoto] = useState<string | null>(null)
  const [gender, setGender] = useState('female')
  const [age, setAge] = useState('adult')
  const [ethnicity, setEthnicity] = useState('european')
  const [pose, setPose] = useState('standing_front')
  const [background, setBackground] = useState('studio white')
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')
  const COST = 8

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

  async function generate() {
    if (!clothingPhoto || starsBalance < COST || loading) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/generate-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gender, age, ethnicity, pose, background, clothingPhoto, additionalDetails: details }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Помилка генерації')
        if (d.needStars) setStarsBalance(d.balance)
      } else {
        setResult(d.url)
        setStarsBalance(d.newBalance)
        window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: d.newBalance } }))
      }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const canGen = !!clothingPhoto && starsBalance >= COST && !loading

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black text-2xl">AI Генерація моделей</h1>
          <p className="text-white/40 text-sm mt-1">Примір одяг на згенеровану AI-модель</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border bg-white/10 text-white border-white/15">
            {starsBalance} Stars
          </Link>
          <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">Back</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="text-white/60 text-xs font-bold uppercase tracking-wider block mb-3">Фото одягу *</label>
            <input ref={clothRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>setClothingPhoto(r.result as string); r.readAsDataURL(f) }} />
            {clothingPhoto ? (
              <div className="flex items-center gap-3">
                <img src={clothingPhoto} className="w-20 h-20 object-contain rounded-xl border border-white/15 bg-white/5"/>
                <button onClick={() => setClothingPhoto(null)} className="text-white/30 text-xs hover:text-red-400">Видалити</button>
              </div>
            ) : (
              <button onClick={() => clothRef.current?.click()} className="w-full border-2 border-dashed border-white/15 rounded-xl p-6 text-center hover:border-white/30">
                <p className="text-white/50 text-sm">Завантажити фото одягу</p>
              </button>
            )}
          </div>

          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="text-white/60 text-xs font-bold uppercase mb-3 block">Стать</label>
            <div className="flex gap-2">{GENDERS.map(g=><button key={g.value} onClick={()=>setGender(g.value)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${gender===g.value?'bg-gold text-black border-gold':'bg-white/5 text-white/60 border-white/10'}`}>{g.emoji} {g.label}</button>)}</div>
          </div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="text-white/60 text-xs font-bold uppercase mb-3 block">Вік</label>
            <div className="flex gap-2">{AGES.map(a=><button key={a.value} onClick={()=>setAge(a.value)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${age===a.value?'bg-gold text-black border-gold':'bg-white/5 text-white/60 border-white/10'}`}>{a.emoji} {a.label}</button>)}</div>
          </div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="text-white/60 text-xs font-bold uppercase mb-3 block">Зовнішність</label>
            <div className="grid grid-cols-3 gap-2">{ETHNICITIES.map(e=><button key={e.value} onClick={()=>setEthnicity(e.value)} className={`py-2 rounded-xl text-xs font-semibold border transition-all ${ethnicity===e.value?'bg-indigo-600 text-white border-indigo-500':'bg-white/5 text-white/50 border-white/10'}`}>{e.emoji} {e.label}</button>)}</div>
          </div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="text-white/60 text-xs font-bold uppercase mb-3 block">Поза</label>
            <div className="grid grid-cols-2 gap-2">{POSES.map(p=><button key={p.value} onClick={()=>setPose(p.value)} className={`py-2 rounded-xl text-xs font-semibold border transition-all ${pose===p.value?'bg-purple-600 text-white border-purple-500':'bg-white/5 text-white/50 border-white/10'}`}>{p.emoji} {p.label}</button>)}</div>
          </div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="text-white/60 text-xs font-bold uppercase mb-2 block">Фон</label>
            <select value={background} onChange={e=>setBackground(e.target.value)} className="w-full bg-[#1a1a2e] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none">
              {BACKGROUNDS.map(b=><option key={b} value={b}>{b}</option>)}
            </select>
            <textarea value={details} onChange={e=>setDetails(e.target.value)} rows={2} placeholder="Додаткові деталі..." className="w-full mt-3 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder-white/25 focus:outline-none resize-none"/>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl flex-1 min-h-64 flex items-center justify-center p-6">
            {loading ? (
              <div className="text-center">
                <div className="w-10 h-10 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
                <p className="text-white">Генерую модель...</p>
                <p className="text-white/40 text-xs mt-1">До 90 сек</p>
              </div>
            ) : result ? (
              <div className="w-full">
                <img src={result} alt="Model" className="w-full rounded-xl object-contain max-h-96"/>
                <div className="flex gap-2 mt-4">
                  <a href={result} download="model.jpg" target="_blank" rel="noreferrer" className="flex-1 bg-gold text-black py-2.5 rounded-xl font-bold text-sm text-center">Download</a>
                  <button onClick={() => setResult(null)} className="px-4 border border-white/15 text-white/50 rounded-xl text-sm">Again</button>
                </div>
              </div>
            ) : (
              <div className="text-center text-white/40">
                <p className="text-4xl mb-2">Model result here</p>
              </div>
            )}
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>}
          <button onClick={generate} disabled={!canGen}
            className={`w-full py-4 rounded-2xl font-bold transition-all ${canGen?'bg-gradient-to-r from-gold to-gold-light text-black hover:opacity-90':'bg-white/8 text-white/30 cursor-not-allowed'}`}>
            {loading ? 'Генерую...' : `Згенерувати модель • ${COST} Stars`}
          </button>
        </div>
      </div>
    </div>
  )
}
