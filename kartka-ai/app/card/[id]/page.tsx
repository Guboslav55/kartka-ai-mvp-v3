'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import type { SavedCard } from '@/types';

const PLATFORM_LABELS: Record<string, string> = {
  prom: 'Prom.ua', rozetka: 'Rozetka', olx: 'OLX', general: 'Загальний'
};

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${ok ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-700'}`}>
      {ok ? '✓ Скопійовано!' : label}
    </button>
  );
}

export default function CardPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const [card, setCard] = useState<SavedCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [allCopied, setAllCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }

      const { data } = await supabase
        .from('cards').select('*')
        .eq('id', params.id).eq('user_id', user.id)
        .single();

      if (!data) { router.push('/dashboard'); return; }
      setCard(data as SavedCard);
      setLoading(false);
    }
    load();
  }, [params.id]);

  function copyAll() {
    if (!card) return;
    const text = [
      card.title, '',
      card.description, '',
      'Переваги:',
      ...(card.bullets as string[]).map(b => '• ' + b), '',
      'Ключові слова: ' + (card.keywords as string[]).join(', '),
    ].join('\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  }

  function downloadCSV() {
    if (!card) return;
    const bullets = card.bullets as string[];
    const keywords = card.keywords as string[];
    const rows = [
      ['Назва', 'Опис', 'Переваги', 'Ключові слова', 'Платформа'],
      [card.title, card.description, bullets.join(' | '), keywords.join(', '), card.platform],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `kartka-${card.id.slice(0, 8)}.csv`,
    });
    a.click();
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!card) return null;

  const bullets = card.bullets as string[];
  const keywords = card.keywords as string[];
  const platform = PLATFORM_LABELS[card.platform] ?? card.platform;
  const date = new Date(card.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors">← Кабінет</Link>
        <div className="flex items-center gap-3">
          <span className="text-white/25 text-xs">{date}</span>
          <span className="text-xs bg-white/8 text-white/40 px-2.5 py-1 rounded-full">{platform}</span>
        </div>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
        {/* Card header */}
        <div className="bg-navy px-5 py-4 flex items-center justify-between gap-3">
          <span className="bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full">{platform}</span>
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-xs">{card.title.length}/80 симв.</span>
            <button onClick={copyAll}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${allCopied ? 'bg-green-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'}`}>
              {allCopied ? '✓ Скопійовано!' : '📋 Копіювати все'}
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-7 space-y-5">
          {/* Image */}
          {card.image_url && (
            <div className="relative group">
              <img src={card.image_url} alt={card.title} className="w-full h-48 sm:h-64 object-cover rounded-xl" />
              <a href={card.image_url} download target="_blank" rel="noreferrer"
                className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                ⬇ Завантажити
              </a>
            </div>
          )}

          {/* Title */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Заголовок</span>
              <CopyBtn text={card.title} label="Копіювати" />
            </div>
            <h2 className="font-display font-bold text-lg text-navy leading-tight">{card.title}</h2>
          </div>

          {/* Description */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Опис</span>
              <CopyBtn text={card.description} label="Копіювати" />
            </div>
            <p className="text-gray-700 text-sm leading-relaxed">{card.description}</p>
          </div>

          {/* Bullets */}
          {bullets.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Переваги</span>
                <CopyBtn text={bullets.map(b => '• ' + b).join('\n')} label="Копіювати" />
              </div>
              <ul className="space-y-2">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700 border-b border-gray-100 pb-2 last:border-0">
                    <span className="text-navy font-bold mt-0.5 shrink-0">✓</span>{b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Keywords */}
          {keywords.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ключові слова</span>
                <CopyBtn text={keywords.join(', ')} label="Копіювати" />
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.map(k => (
                  <button key={k} onClick={() => navigator.clipboard.writeText(k)}
                    className="bg-blue-50 text-navy text-xs font-medium px-3 py-1 rounded-full hover:bg-blue-100 transition-colors cursor-copy">
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 sm:px-7 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button onClick={copyAll}
            className={`px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${allCopied ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
            {allCopied ? '✓ Скопійовано!' : '📋 Копіювати все'}
          </button>
          <button onClick={downloadCSV}
            className="bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
            ⬇ Завантажити CSV
          </button>
          <Link href={`/generate`}
            className="border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2 text-center">
            ✦ Нова картка
          </Link>
        </div>
      </div>
    </div>
  );
}

