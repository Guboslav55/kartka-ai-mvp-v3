'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type Card = {
  id: string
  user_id: string
  product_name: string
  platform: string
  title: string
  description: string
  bullets: string[]
  keywords: string[]
  image_url: string | null
  processed_image_url: string | null
  infographic_urls: string[] | null
  created_at: string
}

type InfographicVariant = {
  url: string
  label: string
  variant: 'lifestyle' | 'benefits' | 'studio'
  generating: boolean
}

const PLATFORM_LABELS: Record<string, string> = {
  prom: 'Prom.ua', rozetka: 'Rozetka', olx: 'OLX', general: 'Загальний'
}

// ─── CopyBtn ─────────────────────────────────────────────────────────────────
function CopyBtn({ text, label = 'Копіювати' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setOk(true)
    setTimeout(() => setOk(false), 2000)
  }
  return (
    <button onClick={copy}
      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${
        ok ? 'bg-green-600 text-white border-green-600' : 'border-white/15 text-white/50 hover:border-white/35 hover:text-white'
      }`}>
      {ok ? '✓ Скопійовано' : label}
    </button>
  )
}

// ─── Infographic Section ──────────────────────────────────────────────────────
function InfographicSection({
  card, token, starsBalance, onStarsSpent
}: {
  card: Card
  token: string
  starsBalance: number
  onStarsSpent: (spent: number) => void
}) {
  const VARIANTS: { id: 'lifestyle' | 'benefits' | 'studio'; label: string; desc: string; emoji: string }[] = [
    { id: 'lifestyle', label: 'Lifestyle',     desc: 'Атмосферний фон',    emoji: '🌆' },
    { id: 'benefits',  label: 'Переваги',      desc: 'Динамічний дизайн',  emoji: '⚡' },
    { id: 'studio',    label: 'Студійне фото', desc: 'Мінімалістичний',    emoji: '📸' },
  ]

  const [variants, setVariants] = useState<InfographicVariant[]>(
    VARIANTS.map(v => ({
      url: (() => {
        try {
          const urls = card.infographic_urls
          if (!urls) return ''
          if (Array.isArray(urls)) return ''
          return (urls as Record<string,string>)[v.id] || ''
        } catch { return '' }
      })(),
      label: v.label,
      variant: v.id,
      generating: false,
    }))
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [regenField, setRegenField] = useState<string | null>(null)
  const [freeRegens, setFreeRegens] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)

  const hasPhoto = !!(card.processed_image_url || card.image_url)
  const generatedCount = variants.filter(v => v.url).length

  async function generate(variantId: 'lifestyle' | 'benefits' | 'studio') {
    if (starsBalance < 4) { setError('Недостатньо зорь (потрібно 4 ⭐)'); return }
    if (!hasPhoto) { setError('Для інфографіки потрібне фото товару'); return }
    setError('')
    setVariants(prev => prev.map(v => v.variant === variantId ? { ...v, generating: true } : v))
    try {
      const res = await fetch('/api/generate-infographic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          imageUrl: card.processed_image_url || card.image_url,
          productName: card.product_name,
          bullets: card.bullets,
          variant: variantId,
          cardId: card.id,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Помилка генерації')
      } else {
        setVariants(prev => prev.map(v => v.variant === variantId ? { ...v, url: d.url, generating: false } : v))
        onStarsSpent(d.starsSpent || 4)
        // Auto-save
        const updatedVariants = variants.map(v => v.variant === variantId ? {...v, url: d.url} : v)
        const allUrls = updatedVariants.reduce((acc, v) => {
          if (v.url) acc[v.variant] = v.url
          return acc
        }, {} as Record<string, string>)
        if (Object.keys(allUrls).length > 0) {
          await fetch('/api/generate-infographic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ allVariants: allUrls, cardId: card.id }),
          })
        }
      }
    } catch (e: any) { setError(e.message) }
    setVariants(prev => prev.map(v => v.variant === variantId ? { ...v, generating: false } : v))
  }

  async function generateAll() {
    for (const v of VARIANTS) {
      if (!variants.find(vv => vv.variant === v.id)?.url) {
        await generate(v.id)
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-display font-bold text-lg text-white">📊 AI Інфографіка</h3>
          <p className="text-white/40 text-xs mt-0.5">DALL-E 3 фон + фото товару + текст • 4 ⭐ за варіант</p>
        </div>
        {generatedCount < 3 && hasPhoto && starsBalance >= 4 * (3 - generatedCount) && (
          <button onClick={generateAll}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-500 transition-colors">
            ✦ Всі 3 варіанти ({4 * (3 - generatedCount)} ⭐)
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-300 text-sm flex items-center justify-between gap-2">
          <span>{error}</span>
          {error.includes('зорь') && <Link href="/pricing" className="bg-gold text-black px-3 py-1 rounded-lg text-xs font-bold">Поповнити</Link>}
        </div>
      )}

      {!hasPhoto && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-yellow-300 text-sm mb-4">
          ⚠️ Для генерації інфографіки потрібне фото товару. Перегенеруйте картку з фото.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {VARIANTS.map(v => {
          const state = variants.find(vv => vv.variant === v.id)!
          return (
            <div key={v.id} className="flex flex-col gap-2">
              <div className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 relative">
                {state.generating ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
                    <p className="text-white/40 text-xs">Генерую...</p>
                  </div>
                ) : state.url ? (
                  <div className="group relative w-full h-full">
                    <img src={state.url} alt={state.label} className="w-full h-full object-cover"/>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <a href={state.url} download={`infographic-${v.id}.jpg`} target="_blank" rel="noreferrer"
                        className="bg-white text-black px-3 py-1.5 rounded-lg text-xs font-bold">⬇ Скачати</a>
                      <button onClick={() => generate(v.id)}
                        className="bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs">↺ Ще раз</button>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <span className="text-3xl">{v.emoji}</span>
                    <p className="text-white/60 text-xs font-medium">{v.label}</p>
                    <p className="text-white/30 text-xs">{v.desc}</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => generate(v.id)}
                disabled={state.generating || !hasPhoto || starsBalance < 4}
                className={`w-full py-2 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  state.url
                    ? 'bg-white/8 text-white/60 hover:bg-white/15'
                    : 'bg-indigo-600/80 text-white hover:bg-indigo-600 disabled:opacity-40'
                }`}>
                {state.generating ? '...' : state.url ? '↺ Оновити' : `✦ Генерувати`}
                <span className="text-xs opacity-60">4⭐</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CardPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [card, setCard] = useState<Card | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [token, setToken] = useState('')
  const [starsBalance, setStarsBalance] = useState(0)
  const [allCopied, setAllCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloadModal, setDownloadModal] = useState<string | null>(null) // imageUrl
  const [dlFormat, setDlFormat] = useState('jpeg')
  const [dlSize, setDlSize] = useState('original')
  const [downloading, setDownloading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editBullets, setEditBullets] = useState<string[]>([])
  const [editKeywords, setEditKeywords] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setToken(session.access_token)

      // Load stars balance
      const { data: profile } = await supabase.from('users').select('stars_balance').eq('id', session.user.id).single()
      if (profile) setStarsBalance(profile.stars_balance ?? 0)

      // Load card
      const { data: cardData, error } = await supabase
        .from('cards').select('*').eq('id', id).eq('user_id', session.user.id).single()

      if (error || !cardData) { setNotFound(true); setLoading(false); return }
      setCard(cardData)
      setEditTitle(cardData.title)
      setEditDesc(cardData.description)
      setEditBullets(Array.isArray(cardData.bullets) ? cardData.bullets : [])
      setEditKeywords(Array.isArray(cardData.keywords) ? cardData.keywords.join(', ') : '')
      setLoading(false)
    }
    load()

    const h = (e: Event) => setStarsBalance((e as CustomEvent<{newBalance:number}>).detail.newBalance)
    window.addEventListener('stars-updated', h)
    return () => window.removeEventListener('stars-updated', h)
  }, [id])

  function copyAll() {
    if (!card) return
    const text = [
      card.title, '',
      card.description, '',
      'Переваги:',
      ...card.bullets.map(b => '• ' + b), '',
      'Ключові слова: ' + card.keywords.join(', ')
    ].join('\n')
    navigator.clipboard.writeText(text)
    setAllCopied(true)
    setTimeout(() => setAllCopied(false), 2000)
  }

  function downloadCSV() {
    if (!card) return
    const BOM = '\uFEFF'
    const rows = [
      ['Назва', 'Опис', 'Переваги', 'Ключові слова', 'Платформа', 'Зображення'],
      [card.title, card.description, card.bullets.join(' | '), card.keywords.join(', '), card.platform, card.image_url || '']
    ]
    const csv = BOM + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `kartka-${card.id.slice(0,8)}.csv`
    })
    a.click()
  }

  async function saveEdit() {
    if (!card) return
    setSaving(true)
    const kw = editKeywords.split(',').map(k => k.trim()).filter(Boolean)
    const { error } = await supabase.from('cards').update({
      title: editTitle,
      description: editDesc,
      bullets: editBullets,
      keywords: kw,
    }).eq('id', card.id)

    if (!error) {
      setCard(prev => prev ? { ...prev, title: editTitle, description: editDesc, bullets: editBullets, keywords: kw } : prev)
      setEditMode(false)
    }
    setSaving(false)
  }

  async function regenField_fn(field: string) {
    if (!card) return
    setRegenField(field)
    try {
      const res = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cardId: card.id, field, currentValue: Array.isArray((card as any)[field]) ? (card as any)[field].join(', ') : (card as any)[field], productName: card.product_name, platform: card.platform }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Помилка регенерації'); return }
      setCard(prev => prev ? { ...prev, [field]: d.newValue } : prev)
      if (field === 'title') setEditTitle(d.newValue)
      if (field === 'description') setEditDesc(d.newValue)
      if (field === 'bullets') setEditBullets(d.newValue)
      if (field === 'keywords') setEditKeywords(Array.isArray(d.newValue) ? d.newValue.join(', ') : d.newValue)
      setFreeRegens(d.freeLeft ?? null)
      if (typeof d.newBalance === 'number') {
        setStarsBalance(d.newBalance)
        window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: d.newBalance } }))
      }
    } catch (e: any) { alert(e.message) }
    setRegenField(null)
  }

  async function downloadImage(imageUrl: string) {
    setDownloading(true)
    const sizeMap: Record<string, {width?: number; height?: number}> = {
      original: {},
      large: { width: 1200 },
      medium: { width: 800 },
      small: { width: 400 },
      prom: { width: 1000, height: 1000 },
      rozetka: { width: 1200, height: 1200 },
    }
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageUrl, format: dlFormat, ...sizeMap[dlSize], quality: 90 }),
      })
      if (!res.ok) { alert('Помилка завантаження'); return }
      const blob = await res.blob()
      const ext = dlFormat === 'png' ? 'png' : dlFormat === 'webp' ? 'webp' : 'jpg'
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `${card?.product_name?.slice(0,30) || 'image'}-${dlSize}.${ext}`
      })
      a.click()
      setDownloadModal(null)
    } catch (e: any) { alert(e.message) }
    setDownloading(false)
  }

  async function deleteCard() {
    if (!card || !confirm('Видалити цю картку?')) return
    setDeleting(true)
    await supabase.from('cards').delete().eq('id', card.id)
    router.push('/dashboard')
  }

  function handleStarsSpent(spent: number) {
    setStarsBalance(prev => {
      const newBal = prev - spent
      window.dispatchEvent(new CustomEvent('stars-updated', { detail: { newBalance: newBal } }))
      return newBal
    })
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center text-center p-4">
      <div>
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-white font-bold text-xl mb-2">Картку не знайдено</h2>
        <p className="text-white/40 mb-6">Можливо вона була видалена або не належить вам</p>
        <Link href="/dashboard" className="bg-gold text-black px-6 py-3 rounded-xl font-bold">← До кабінету</Link>
      </div>
    </div>
  )

  if (!card) return null

  const platformLabel = PLATFORM_LABELS[card.platform] ?? card.platform
  const displayImage = card.processed_image_url || card.image_url

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors">← Кабінет</Link>
        <div className="flex items-center gap-2">
          <Link href="/pricing"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-all ${
              starsBalance < 10 ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/10 text-white border-white/15'
            }`}>
            ⭐ {starsBalance}
          </Link>
          <button onClick={copyAll}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${allCopied ? 'bg-green-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            {allCopied ? '✓ Скопійовано!' : '📋 Копіювати все'}
          </button>
          <button onClick={downloadCSV}
            className="px-4 py-1.5 rounded-xl text-sm font-semibold bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 transition-all">
            ⬇ CSV
          </button>
        </div>
      </div>

      {/* Regen balance */}
      {freeRegens !== null && (
        <div className="text-xs text-white/30 text-right -mt-4 mb-4">
          Безкоштовних регенерацій: <span className={freeRegens > 0 ? 'text-green-400' : 'text-white/30'}>{freeRegens}</span>/3
        </div>
      )}
      {/* Card header info */}
      <div className="flex items-center gap-3 mb-6">
        <span className="bg-white/8 text-white/50 text-xs font-semibold px-3 py-1.5 rounded-full">{platformLabel}</span>
        <span className="text-white/25 text-xs">{new Date(card.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <span className="text-white/25 text-xs ml-auto">{card.product_name}</span>
      </div>

      {/* Image */}
      {displayImage && (
        <div className="mb-6 rounded-2xl overflow-hidden bg-white/5 border border-white/10">
          <img src={displayImage} alt={card.title} className="w-full max-h-72 object-contain"/>
        </div>
      )}

      {/* Edit mode toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white/50 text-xs font-bold uppercase tracking-wider">Текст картки</h2>
        <button onClick={() => setEditMode(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${
            editMode ? 'bg-gold text-black border-gold' : 'border-white/15 text-white/50 hover:border-white/30'
          }`}>
          {editMode ? '✕ Скасувати' : '✏️ Редагувати'}
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4 mb-8">
        {/* Title */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Заголовок</span>
            <div className="flex items-center gap-2">
              <span className="text-white/25 text-xs">{card.title.length}/80 симв.</span>
              <CopyBtn text={editMode ? editTitle : card.title} />
                  <button onClick={() => regenField_fn('title')} disabled={regenField==='title'} className="text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/40 hover:border-indigo-500/50 hover:text-indigo-400 disabled:opacity-40 transition-all">{regenField==='title' ? '...'  : '↺'}</button>
            </div>
          </div>
          {editMode ? (
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={100}
              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-white font-bold text-base focus:outline-none focus:border-gold/50"/>
          ) : (
            <h1 className="text-white font-display font-bold text-lg leading-snug">{card.title}</h1>
          )}
        </div>

        {/* Description */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Опис</span>
            <CopyBtn text={editMode ? editDesc : card.description} />
                  <button onClick={() => regenField_fn('description')} disabled={regenField==='description'} className="text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/40 hover:border-indigo-500/50 hover:text-indigo-400 disabled:opacity-40 transition-all">{regenField==='description' ? '...' : '↺'}</button>
          </div>
          {editMode ? (
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={5}
              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-white text-sm leading-relaxed focus:outline-none focus:border-gold/50 resize-none"/>
          ) : (
            <p className="text-white/80 text-sm leading-relaxed">{card.description}</p>
          )}
        </div>

        {/* Bullets */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Переваги</span>
            <CopyBtn text={card.bullets.map(b => '• ' + b).join('\n')} />
          </div>
          {editMode ? (
            <div className="space-y-2">
              {editBullets.map((b, i) => (
                <input key={i} value={b} onChange={e => setEditBullets(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50"/>
              ))}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {card.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-gold font-bold mt-0.5 shrink-0">✓</span>
                  <span className="text-white/80 text-sm">{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Keywords */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Ключові слова</span>
            <CopyBtn text={card.keywords.join(', ')} />
          </div>
          {editMode ? (
            <input value={editKeywords} onChange={e => setEditKeywords(e.target.value)}
              placeholder="слово1, слово2, слово3..."
              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"/>
          ) : (
            <div className="flex flex-wrap gap-2">
              {card.keywords.map((kw, i) => (
                <button key={i} onClick={() => navigator.clipboard.writeText(kw)}
                  className="bg-white/8 text-white/70 text-xs px-3 py-1.5 rounded-full hover:bg-white/15 transition-colors cursor-copy border border-white/10">
                  {kw}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Save button when editing */}
        {editMode && (
          <button onClick={saveEdit} disabled={saving}
            className="w-full bg-gold text-black font-bold py-3 rounded-xl text-sm hover:bg-gold-light disabled:opacity-50 transition-all">
            {saving ? 'Зберігаю...' : '✅ Зберегти зміни'}
          </button>
        )}
      </div>

      {/* Infographic Section */}
      <div className="mb-8">
        <InfographicSection card={card} token={token} starsBalance={starsBalance} onStarsSpent={handleStarsSpent} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-6 border-t border-white/8">
        <button onClick={copyAll}
          className={`flex-1 min-w-0 py-3 rounded-xl font-semibold text-sm transition-all ${allCopied ? 'bg-green-600 text-white' : 'bg-white/8 text-white hover:bg-white/15'}`}>
          {allCopied ? '✓ Все скопійовано!' : '📋 Копіювати все'}
        </button>
        <button onClick={downloadCSV}
          className="flex-1 min-w-0 bg-green-700 text-white py-3 rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors">
          ⬇ CSV
        </button>
        {displayImage && (
          <button onClick={() => setDownloadModal(displayImage)}
            className="flex-1 min-w-0 bg-indigo-700 text-white py-3 rounded-xl font-semibold text-sm hover:bg-indigo-600 transition-colors">
            🖼 Фото PNG/JPG
          </button>
        )}
        <Link href="/generate"
          className="flex-1 min-w-0 border border-white/15 text-white/60 py-3 rounded-xl font-semibold text-sm hover:border-white/30 text-center transition-colors">
          ↺ Нова картка
        </Link>
        <button onClick={deleteCard} disabled={deleting}
          className="border border-red-500/20 text-red-400/50 py-3 px-4 rounded-xl text-sm hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 transition-colors">
          {deleting ? '...' : '🗑'}
        </button>
      </div>
      {/* Download Modal */}
      {downloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setDownloadModal(null)}>
          <div className="bg-[#1A1A2E] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-white text-lg mb-5">⬇ Завантажити зображення</h3>
            <div className="space-y-4">
              <div>
                <p className="text-white/50 text-xs mb-2">Формат</p>
                <div className="flex gap-2">
                  {[['jpeg','JPEG'],['png','PNG'],['webp','WebP']].map(([v,l]) => (
                    <button key={v} onClick={() => setDlFormat(v)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${dlFormat===v ? 'bg-gold text-black' : 'bg-white/8 text-white/60 hover:bg-white/15'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-white/50 text-xs mb-2">Розмір</p>
                <div className="grid grid-cols-3 gap-2">
                  {[['original','Оригінал'],['prom','Prom (1000×1000)'],['rozetka','Rozetka (1200×1200)'],['large','Велике (1200px)'],['medium','Середнє (800px)'],['small','Мале (400px)']].map(([v,l]) => (
                    <button key={v} onClick={() => setDlSize(v)}
                      className={`py-2 px-2 rounded-xl text-xs font-semibold text-center transition-all ${dlSize===v ? 'bg-indigo-600 text-white' : 'bg-white/8 text-white/50 hover:bg-white/15'}`}>{l}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => downloadImage(downloadModal)} disabled={downloading}
                className="w-full bg-gold text-black py-3 rounded-xl font-bold text-sm hover:bg-gold-light disabled:opacity-50 transition-all">
                {downloading ? 'Завантажую...' : `⬇ Завантажити ${dlFormat.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}