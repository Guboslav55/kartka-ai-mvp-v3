'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Template = {
  id: string; name: string; category: string; description: string
  style: string; lighting: string; cardStyle: string; accent: string; isPro: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Всі', studio: 'Студія', lifestyle: 'Lifestyle', outdoor: 'Природа',
  flatlay: 'Flatlay', premium: 'Преміум'
}

export default function TemplatesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [templates, setTemplates] = useState<Template[]>([])
  const [userTemplates, setUserTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')
  const [token, setToken] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setToken(session.access_token)
      const res = await fetch('/api/templates', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const d = await res.json()
      setTemplates(d.templates || [])
      setUserTemplates(d.userTemplates || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = category === 'all' ? templates : templates.filter(t => t.category === category)

  function useTemplate(t: Template) {
    // Navigate to studio with template settings pre-applied
    const params = new URLSearchParams({ style: t.style, lighting: t.lighting, cardStyle: t.cardStyle })
    router.push(`/studio?${params}`)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black text-2xl">📋 Шаблони</h1>
          <p className="text-white/40 text-sm mt-1">Готові стилі для AI Студії</p>
        </div>
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap mb-8">
        {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
          <button key={val} onClick={() => setCategory(val)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${category === val ? 'bg-gold text-black' : 'bg-white/8 text-white/60 hover:bg-white/15'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Built-in templates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {filtered.map(t => (
          <div key={t.id} className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all group">
            {/* Preview area with accent color */}
            <div className="h-36 relative flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${t.accent}20, ${t.accent}08)` }}>
              <div className="absolute inset-0 opacity-20"
                style={{ background: `radial-gradient(circle at 30% 40%, ${t.accent}, transparent 60%)` }}/>
              <div className="text-center relative z-10">
                <div className="w-16 h-16 rounded-2xl border-2 mx-auto mb-2 flex items-center justify-center text-2xl"
                  style={{ borderColor: t.accent + '60', background: t.accent + '15' }}>
                  {t.category === 'studio' ? '📸' : t.category === 'lifestyle' ? '🌆' :
                   t.category === 'outdoor' ? '🌿' : t.category === 'flatlay' ? '📐' : '✨'}
                </div>
                <div className="w-8 h-0.5 rounded mx-auto" style={{ background: t.accent }}/>
              </div>
              {t.isPro && (
                <div className="absolute top-2 right-2 bg-gold text-black text-xs font-bold px-2 py-0.5 rounded-full">PRO</div>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-bold text-white mb-1">{t.name}</h3>
              <p className="text-white/40 text-xs mb-3">{t.description}</p>
              <div className="flex items-center gap-2 mb-3 text-xs text-white/30">
                <span className="bg-white/8 px-2 py-0.5 rounded-full">{t.style}</span>
                <span className="bg-white/8 px-2 py-0.5 rounded-full">{t.lighting}</span>
              </div>
              <button onClick={() => useTemplate(t)}
                className="w-full py-2 rounded-xl text-sm font-semibold transition-all border border-white/10 text-white/60 hover:border-gold/40 hover:text-gold hover:bg-gold/5">
                Використати →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* User templates */}
      {userTemplates.length > 0 && (
        <div>
          <h2 className="font-bold text-white mb-4">Мої шаблони</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {userTemplates.map((t: any) => (
              <div key={t.id} className="bg-white/[0.04] border border-indigo-500/20 rounded-2xl p-4">
                <h3 className="font-bold text-white mb-1">{t.name}</h3>
                <p className="text-white/30 text-xs">{new Date(t.created_at).toLocaleDateString('uk-UA')}</p>
                <button onClick={() => router.push('/studio')} className="mt-3 w-full py-2 rounded-xl text-xs border border-white/10 text-white/50 hover:border-indigo-500/40">
                  Використати
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-white/40">Шаблонів в цій категорії немає</p>
        </div>
      )}
    </div>
  )
}
