'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Card = { id: string; title: string; description: string; image_url: string | null; platform: string; created_at: string; product_name: string }
type Project = { id: string; name: string; description: string; platform: string }

const P_LABELS: Record<string,string> = { general:'Загальний', prom:'Prom.ua', rozetka:'Rozetka', olx:'OLX' }

export default function ProjectDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  const [project, setProject] = useState<Project | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [allCards, setAllCards] = useState<Card[]>([]) // unassigned
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [addingCard, setAddingCard] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setToken(session.access_token)

      const [{ data: proj }, { data: projCards }, { data: unassigned }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).eq('user_id', session.user.id).single(),
        supabase.from('cards').select('*').eq('project_id', id).eq('user_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('cards').select('id,title,product_name,platform,created_at').eq('user_id', session.user.id).is('project_id', null).order('created_at', { ascending: false }).limit(50),
      ])
      if (!proj) { router.push('/projects'); return }
      setProject(proj)
      setCards(projCards || [])
      setAllCards(unassigned || [])
      setLoading(false)
    }
    load()
  }, [id])

  async function addCardToProject(cardId: string) {
    await supabase.from('cards').update({ project_id: id }).eq('id', cardId)
    const card = allCards.find(c => c.id === cardId)
    if (card) {
      setCards(prev => [card as any, ...prev])
      setAllCards(prev => prev.filter(c => c.id !== cardId))
    }
  }

  async function removeFromProject(cardId: string) {
    await supabase.from('cards').update({ project_id: null }).eq('id', cardId)
    setAllCards(prev => {
      const card = cards.find(c => c.id === cardId)
      return card ? [card, ...prev] : prev
    })
    setCards(prev => prev.filter(c => c.id !== cardId))
  }

  async function downloadAllCSV() {
    if (!token) return
    const ids = cards.map(c => c.id).join(',')
    const res = await fetch(`/api/export?format=prom&ids=${ids}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const blob = await res.blob()
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `project-${project?.name}-prom.csv` })
    a.click()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>
  if (!project) return null

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <Link href="/projects" className="text-white/40 text-sm hover:text-white">← Проекти</Link>
        <div className="flex gap-2">
          <button onClick={downloadAllCSV} disabled={cards.length === 0} className="border border-white/15 text-white/50 px-4 py-2 rounded-xl text-sm hover:border-green-500/50 hover:text-green-400 disabled:opacity-30 transition-colors">⬇ CSV всіх карток</button>
          <Link href={`/generate?project=${id}`} className="bg-gold text-black px-4 py-2 rounded-xl font-bold text-sm hover:bg-gold-light">+ Додати картку</Link>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display font-black text-2xl">{project.name}</h1>
          <span className="text-xs bg-white/8 text-white/40 px-2.5 py-1 rounded-full">{P_LABELS[project.platform]}</span>
        </div>
        {project.description && <p className="text-white/40 text-sm">{project.description}</p>}
        <p className="text-white/25 text-xs mt-1">{cards.length} карток у проекті</p>
      </div>

      {/* Cards in project */}
      <div className="mb-8">
        {cards.length === 0 ? (
          <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-10 text-center">
            <p className="text-white/40 mb-4">Проект порожній</p>
            <button onClick={() => setAddingCard(true)} className="bg-white/10 text-white px-5 py-2 rounded-xl text-sm hover:bg-white/20">Додати існуючі картки</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cards.map(card => (
              <Link key={card.id} href={`/card/${card.id}`}
                className="bg-white/[0.04] border border-white/10 rounded-xl p-4 hover:border-gold/30 transition-all group flex items-start gap-3">
                {card.image_url ? <img src={card.image_url} className="w-12 h-12 rounded-lg object-cover shrink-0" /> : <div className="w-12 h-12 bg-white/5 rounded-lg flex items-center justify-center text-xl shrink-0">📦</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate group-hover:text-gold transition-colors">{card.title}</p>
                  <p className="text-white/35 text-xs mt-0.5 truncate">{card.product_name}</p>
                </div>
                <button onClick={e => { e.preventDefault(); removeFromProject(card.id) }}
                  className="text-white/15 hover:text-red-400 text-sm opacity-0 group-hover:opacity-100 transition-all">×</button>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Add existing cards */}
      <div>
        <button onClick={() => setAddingCard(v => !v)}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-4">
          <span className={`transition-transform ${addingCard ? 'rotate-180' : ''}`}>▼</span>
          Додати існуючі картки ({allCards.length})
        </button>
        {addingCard && allCards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allCards.map(card => (
              <button key={card.id} onClick={() => addCardToProject(card.id)}
                className="bg-white/[0.03] border border-white/8 rounded-xl p-3 text-left hover:border-gold/30 hover:bg-white/[0.06] transition-all flex items-center gap-3">
                <span className="text-lg">📦</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-semibold truncate">{card.title || card.product_name}</p>
                </div>
                <span className="text-gold text-sm">+</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
