'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

type StudioResult = {
  id: string
  user_id: string
  product_name: string
  mode: string
  urls: string[]
  stars_spent: number
  created_at: string
}

export default function GalleryPage() {
  const router = useRouter()
  const supabase = createClient()
  const [items, setItems] = useState<StudioResult[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      const { data } = await supabase
        .from('studio_results')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      setItems(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const MODE_LABELS: Record<string, string> = { photo: '📸 Фото', card: '🃏 Карточка', video: '🎬 Відео' }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-black text-2xl">🖼 Галерея</h1>
          <p className="text-white/40 text-sm mt-1">Всі згенеровані зображення</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/studio" className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-indigo-500 transition-colors">+ Нова генерація</Link>
          <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">🎨</div>
          <p className="text-white/40 mb-5">Ще немає згенерованих зображень</p>
          <Link href="/studio" className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-500 transition-colors">Відкрити AI Студію →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.flatMap(item => item.urls.map((url, i) => ({ url, item, i }))).map(({ url, item, i }) => (
            <div key={`${item.id}-${i}`} className="group relative rounded-2xl overflow-hidden bg-white/5 border border-white/10 cursor-pointer"
              onClick={() => setSelected(url)}>
              <img src={url} alt={item.product_name} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"/>
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-3">
                <p className="text-white text-xs font-semibold text-center truncate w-full">{item.product_name}</p>
                <span className="text-white/60 text-xs">{MODE_LABELS[item.mode] || item.mode}</span>
                <a href={url} download onClick={e => e.stopPropagation()}
                  className="bg-white text-black px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-100">⬇ Скачати</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}>
          <img src={selected} alt="" className="max-w-2xl max-h-[90vh] object-contain rounded-2xl shadow-2xl"/>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white text-3xl">×</button>
          <a href={selected} download onClick={e => e.stopPropagation()}
            className="absolute bottom-6 bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-gray-100 transition-colors">⬇ Завантажити</a>
        </div>
      )}
    </div>
  )
}
