'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function SeoPage() {
  const router = useRouter()
  const supabase = createClient()
  const [token, setToken] = useState('')
  const [starsBalance, setStarsBalance] = useState(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [bullets, setBullets] = useState('')
  const [keywords, setKeywords] = useState('')
  const [platform, setPlatform] = useState('prom')
  const [lang, setLang] = useState('uk')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string|null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return }
      setToken(session.access_token)
      supabase.from('users').select('stars_balance').eq('id', session.user.id).single()
        .then(({ data }) => { if (data) setStarsBalance(data.stars_balance ?? 0) })
    })
  }, [])

  async function generate() {
    if (!title.trim() || loading) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title, description, platform, lang,
          bullets: bullets.split('\n').filter(Boolean),
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error)
        if (d.needStars) setStarsBalance(d.balance)
      } else {
        setResult(d)
        setStarsBalance(d.newBalance ?? starsBalance)
      }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzing(true); setError('')
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = reject
        r.readAsDataURL(file)
      })
      const res = await fetch('/api/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: b64, lang }),
      })
      const d = await res.json()
      if (d.productName) setTitle(d.productName)
      if (Array.isArray(d.bullets) && d.bullets.length) {
        setBullets(d.bullets.join('\n'))
        if (!keywords.trim()) setKeywords([d.category, ...d.bullets].filter(Boolean).join(', '))
      }
      if (!d.productName && (!d.bullets || !d.bullets.length)) setError('Не вдалося розпізнати фото — спробуй інше')
    } catch (err: any) {
      setError('Не вдалося обробити фото')
    }
    setAnalyzing(false)
    e.target.value = ''
  }

  const PLATFORMS = [
    { value: 'prom', label: 'Prom.ua' },
    { value: 'rozetka', label: 'Rozetka' },
    { value: 'olx', label: 'OLX' },
    { value: 'google', label: 'Google Shopping' },
  ]

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black text-2xl">🔎 SEO Генерація</h1>
          <p className="text-white/40 text-sm mt-1">Оптимізовані заголовки та ключові слова для маркетплейсів</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border bg-white/10 text-white border-white/15">⭐ {starsBalance}</Link>
          <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-4">
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-4">
            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-2 block">Фото товару — AI заповнить поля</label>
              <label className={`flex items-center justify-center gap-2 w-full border border-dashed rounded-xl py-4 cursor-pointer text-sm transition-all ${analyzing ? 'border-gold/50 text-gold' : 'border-white/20 text-white/50 hover:border-gold/50 hover:text-white/70'}`}>
                <input type="file" accept="image/*" onChange={onPhoto} disabled={analyzing} className="hidden" />
                {analyzing ? '⏳ Аналізую фото…' : '📷 Завантажити фото товару'}
              </label>
              <p className="text-white/30 text-[11px] mt-1.5">AI заповнить назву, переваги та ключі. Безкоштовно — зорі лише за генерацію.</p>
            </div>
            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-2 block">Поточна назва товару *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Наприклад: Футболка POMSTA"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-gold/50"/>
            </div>
            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-2 block">Поточний опис</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Короткий опис товару..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/25 focus:outline-none resize-none"/>
            </div>
            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-2 block">Переваги (кожна з нового рядка)</label>
              <textarea value={bullets} onChange={e => setBullets(e.target.value)} rows={3} placeholder="Дихаючий матеріал&#10;Камуфляжний принт&#10;Для активного відпочинку"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/25 focus:outline-none resize-none"/>
            </div>
          </div>

          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-4">
            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-2 block">Платформа</label>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map(p => (
                  <button key={p.value} onClick={() => setPlatform(p.value)}
                    className={`py-2 rounded-xl text-sm font-semibold border transition-all ${platform === p.value ? 'bg-gold text-black border-gold' : 'bg-white/5 text-white/60 border-white/10'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-white/60 text-xs font-bold uppercase mb-2 block">Мова</label>
              <div className="flex gap-2">
                {[['uk','Українська'],['ru','Російська'],['en','English']].map(([v,l]) => (
                  <button key={v} onClick={() => setLang(v)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${lang === v ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 text-white/50 border-white/10'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>}

          <button onClick={generate} disabled={!title.trim() || loading || starsBalance < 2}
            className={`w-full py-4 rounded-2xl font-bold transition-all ${!title.trim() || loading ? 'bg-white/8 text-white/30 cursor-not-allowed' : 'bg-gradient-to-r from-gold to-gold-light text-black hover:opacity-90'}`}>
            {loading ? 'Генерую SEO...' : '🔎 Згенерувати SEO • 2 ⭐'}
          </button>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {result ? (
            <>
              {(result.categoryPath || result.priceSuggestion) && (
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 space-y-2">
                  {result.categoryPath && <div className="flex justify-between gap-3 text-sm"><span className="text-white/40 shrink-0">Категорія</span><span className="text-white/80 text-right">{result.categoryPath}</span></div>}
                  {result.priceSuggestion && <div className="flex justify-between gap-3 text-sm"><span className="text-white/40 shrink-0">Ціна</span><span className="text-white/70 text-right">{result.priceSuggestion}</span></div>}
                </div>
              )}

              {(Array.isArray(result.blocks) && result.blocks.length ? result.blocks : [result]).map((b: any, bi: number) => (
                <div key={bi} className="space-y-4">
                  {(Array.isArray(result.blocks) && result.blocks.length > 1) && (
                    <div className="flex items-center gap-2 pt-2">
                      <span className="bg-gold text-black text-xs font-black px-3 py-1 rounded-full">{({uk:'🇺🇦 Українською',ru:'🇷🇺 Російською',en:'🇬🇧 English'} as any)[b.lang] || b.lang}</span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>
                  )}

                  {[
                    { key: 'seoTitle', label: 'SEO Заголовок', value: b.seoTitle },
                    { key: 'metaDescription', label: 'Meta Description', value: b.metaDescription },
                    { key: 'h1', label: 'H1 Заголовок', value: b.h1 },
                  ].map(item => item.value ? (
                    <div key={item.key} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white/50 text-xs font-bold uppercase">{item.label}</span>
                        <button onClick={() => copy(item.value, bi+'-'+item.key)}
                          className={`text-xs px-2 py-1 rounded-lg border transition-all ${copied === bi+'-'+item.key ? 'bg-green-600 text-white border-green-600' : 'border-white/15 text-white/40 hover:border-white/30'}`}>
                          {copied === bi+'-'+item.key ? '✓' : '📋'}
                        </button>
                      </div>
                      <p className="text-white text-sm">{item.value}</p>
                    </div>
                  ) : null)}

                  {[
                    { key: 'premium', label: 'Опис — Преміум (стриманий)', value: b.descriptionPremium || b.fullDescription },
                    { key: 'active', label: 'Опис — Активний продаж', value: b.descriptionActive },
                  ].map(item => item.value ? (
                    <div key={item.key} className="bg-white/[0.04] border border-gold/30 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gold text-xs font-bold uppercase">{item.label}</span>
                        <button onClick={() => copy(item.value, bi+'-'+item.key)}
                          className={`text-xs px-2 py-1 rounded-lg border transition-all ${copied === bi+'-'+item.key ? 'bg-green-600 text-white border-green-600' : 'border-white/15 text-white/40 hover:border-white/30'}`}>
                          {copied === bi+'-'+item.key ? '✓ Скопійовано' : '📋 Копіювати'}
                        </button>
                      </div>
                      <p className="text-white/90 text-sm whitespace-pre-line leading-relaxed">{item.value}</p>
                    </div>
                  ) : null)}

                  {b.searchKeywords?.length > 0 && (
                    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white/50 text-xs font-bold uppercase">Ключові слова</span>
                        <button onClick={() => copy(b.searchKeywords.join(', '), bi+'-kw')}
                          className={`text-xs px-2 py-1 rounded-lg border transition-all ${copied === bi+'-kw' ? 'bg-green-600 text-white border-green-600' : 'border-white/15 text-white/40'}`}>
                          {copied === bi+'-kw' ? '✓' : '📋'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {b.searchKeywords.map((kw: string, i: number) => (
                          <button key={i} onClick={() => copy(kw, bi+'-kw'+i)}
                            className="bg-white/8 text-white/70 text-xs px-2.5 py-1 rounded-full hover:bg-white/15 cursor-copy">{kw}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.longTailKeywords?.length > 0 && (
                    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
                      <span className="text-white/50 text-xs font-bold uppercase block mb-2">Long-tail запити</span>
                      <ul className="space-y-1">
                        {b.longTailKeywords.map((kw: string, i: number) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="text-gold text-xs">→</span>
                            <span className="text-white/70 text-xs">{kw}</span>
                            <button onClick={() => copy(kw, bi+'-lt'+i)} className="ml-auto text-white/25 hover:text-white/60 text-xs">📋</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}

              {result.tags?.length > 0 && (
                <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
                  <span className="text-white/50 text-xs font-bold uppercase block mb-2">Теги</span>
                  <div className="flex flex-wrap gap-1.5">
                    {result.tags.map((t: string, i: number) => (
                      <span key={i} className="bg-white/8 text-white/60 text-xs px-2.5 py-1 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-16 text-center flex-1 min-h-64 flex flex-col items-center justify-center">
              <div className="text-4xl mb-3">🔎</div>
              <p className="text-white/40 text-sm">Введи назву товару і натисни "Згенерувати"</p>
              <p className="text-white/25 text-xs mt-2">Отримаєш SEO заголовок, meta, H1, ключові слова</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
