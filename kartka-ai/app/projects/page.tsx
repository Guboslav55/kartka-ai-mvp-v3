'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type Project = { id: string; name: string; description: string; platform: string; created_at: string; cards: { count: number }[] }
const PLATFORMS = ['general','prom','rozetka','olx']
const P_LABELS: Record<string,string> = { general:'Загальний', prom:'Prom.ua', rozetka:'Rozetka', olx:'OLX' }

export default function ProjectsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPlat, setNewPlat] = useState('general')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setToken(session.access_token)
      const res = await fetch('/api/projects', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const d = await res.json()
      setProjects(d.projects || [])
      setLoading(false)
    }
    load()
  }, [])

  async function createProject() {
    if (!newName.trim()) return
    setSaving(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName, description: newDesc, platform: newPlat }),
    })
    const d = await res.json()
    if (d.project) {
      setProjects(prev => [d.project, ...prev])
      setCreating(false); setNewName(''); setNewDesc('')
    }
    setSaving(false)
  }

  async function deleteProject(id: string) {
    if (!confirm('Видалити проект? Картки залишаться.')) return
    await fetch('/api/projects', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id }) })
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black text-2xl">📁 Проекти</h1>
          <p className="text-white/40 text-sm mt-1">Організуй картки по проектах</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setCreating(true)} className="bg-gold text-black px-4 py-2 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors">+ Новий проект</button>
          <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        </div>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-white/[0.04] border border-gold/30 rounded-2xl p-6 mb-6">
          <h3 className="font-bold text-white mb-4">Новий проект</h3>
          <div className="space-y-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Назва проекту *"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-gold/50" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Опис (необов'язково)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none" />
            <div className="flex gap-2">
              {PLATFORMS.map(p => (
                <button key={p} onClick={() => setNewPlat(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${newPlat===p ? 'bg-gold text-black' : 'bg-white/8 text-white/60 hover:bg-white/15'}`}>
                  {P_LABELS[p]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={createProject} disabled={saving || !newName.trim()}
                className="flex-1 bg-gold text-black py-2.5 rounded-xl font-bold text-sm disabled:opacity-50">
                {saving ? 'Створюю...' : 'Створити'}
              </button>
              <button onClick={() => setCreating(false)} className="px-4 border border-white/15 text-white/50 rounded-xl text-sm">Скасувати</button>
            </div>
          </div>
        </div>
      )}

      {/* Projects list */}
      {projects.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">📁</div>
          <p className="text-white/40 mb-5">Проектів поки немає</p>
          <button onClick={() => setCreating(true)} className="bg-gold text-black px-6 py-3 rounded-xl font-bold text-sm">Створити перший</button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => {
            const count = p.cards?.[0]?.count ?? 0
            return (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="block bg-white/[0.04] border border-white/10 rounded-2xl p-5 hover:border-gold/30 transition-all group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-white group-hover:text-gold transition-colors">{p.name}</h3>
                      <span className="text-xs bg-white/8 text-white/40 px-2 py-0.5 rounded-full">{P_LABELS[p.platform]}</span>
                    </div>
                    {p.description && <p className="text-white/40 text-sm truncate">{p.description}</p>}
                    <p className="text-white/25 text-xs mt-2">{count} {count === 1 ? 'картка' : count < 5 ? 'картки' : 'карток'} · {new Date(p.created_at).toLocaleDateString('uk-UA')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-white/20 text-sm opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                    <button onClick={e => { e.preventDefault(); deleteProject(p.id) }}
                      className="text-white/15 hover:text-red-400 text-lg transition-colors opacity-0 group-hover:opacity-100">×</button>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
