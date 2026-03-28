import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div>
        <div className="font-display font-black text-8xl text-gold/20 mb-4">404</div>
        <h1 className="font-display font-black text-2xl mb-3">Сторінку не знайдено</h1>
        <p className="text-white/40 text-sm mb-8">Можливо, посилання застаріле або сторінка була переміщена.</p>
        <Link href="/" className="bg-gold text-black px-6 py-3 rounded-xl font-bold text-sm hover:bg-gold-light transition-colors">
          На головну →
        </Link>
      </div>
    </div>
  );
}
