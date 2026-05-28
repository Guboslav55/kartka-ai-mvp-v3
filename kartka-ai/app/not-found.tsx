import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div>
        <div className="text-8xl font-display font-black text-gold/20 mb-4">404</div>
        <h2 className="text-white font-display font-bold text-2xl mb-3">Сторінку не знайдено</h2>
        <p className="text-white/40 mb-8">Можливо посилання застаріле або сторінку було видалено</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/" className="bg-gold text-black px-6 py-3 rounded-xl font-bold hover:bg-gold-light transition-colors">← На головну</Link>
          <Link href="/dashboard" className="border border-white/15 text-white/60 px-6 py-3 rounded-xl font-semibold hover:border-white/30 transition-colors">Кабінет</Link>
        </div>
      </div>
    </div>
  )
}
