'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import type { CardResult, Platform, Tone, Lang } from '@/types';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'prom', label: 'Prom.ua' },
  { value: 'rozetka', label: 'Rozetka' },
  { value: 'olx', label: 'OLX' },
  { value: 'general', label: 'Загальний' },
];

export default function GeneratePage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [cardsLeft, setCardsLeft] = useState(0);
  const [accessToken, setAccessToken] = useState('');

  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [features, setFeatures] = useState('');
  const [platform, setPlatform] = useState<Platform>('prom');
  const [tone, setTone] = useState<Tone>('professional');
  const [lang, setLang] = useState<Lang>('uk');
  const [genImage, setGenImage] = useState(true);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CardResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
      supabase.from('users').select('cards_left').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (data) setCardsLeft(data.cards_left);
          setReady(true);
        });
    });
  }, []);

  const generate = useCallback(async () => {
    if (!productName.trim() || loading) return;
    if (cardsLeft <= 0) { setError('Ліміт вичерпано. Підвищ тариф.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ productName, category, features, platform, tone, lang, generateImage: genImage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка генерації');
      setResult(data);
      setCardsLeft(c => Math.max(0, c - 1));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка сервера. Спробуй ще раз.');
    }
    setLoading(false);
  }, [productName, category, features, platform, tone, lang, genImage, cardsLeft, loading, accessToken]);

  function copyAll() {
    if (!result) return;
    const text = [result.title, '', result.description, '', 'Переваги:', ...result.bullets.map(b => '• ' + b), '', 'Ключові слова: ' + result.keywords.join(', ')].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadCSV() {
    if (!result) return;
    const rows = [
      ['Назва', 'Опис', 'Переваги', 'Ключові слова', 'Платформа', 'Зображення'],
      [result.title, result.description, result.bullets.join(' | '), result.keywords.join(', '), platform, result.imageUrl || ''],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `kartka-${Date.now()}.csv`,
    });
    a.click();
  }

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const noCards = cardsLeft <= 0;
  const platformLabel = PLATFORMS.find(p => p.value === platform)?.label ?? platform;

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8 gap-3">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors shrink-0">← Кабінет</Link>
        <div className="text-right">
          <span className="text-xs text-white/30">Залишок: </span>
          <span className={`text-sm font-bold ${noCards ? 'text-red-400' : 'text-gold'}`}>
            {cardsLeft === 99999 ? '∞' : cardsLeft} карточок
          </span>
        </div>
      </div>

      <h1 className="font-display font-black text-2xl sm:text-3xl mb-6 tracking-tight">✦ Генератор картки</h1>

      {noCards && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-red-300 text-sm">Ліміт карточок вичерпано на цей місяць.</p>
          <Link href="/pricing" className="bg-gold text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-gold-light transition-colors shrink-0">Підвищити тариф →</Link>
        </div>
      )}

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 sm:p-7 mb-5">
        <div className="space-y-5">
          <div>
            <label className="block text-gold text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-2">Назва товару *</label>
            <input value={productName} onChange={e => setProductName(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="наприклад: Навушники Sony WH-1000XM5" disabled={noCards}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors disabled:opacity-40" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gold text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-2">Категорія</label>
              <select value={category} onChange={e => setCategory(e.target.value)} disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40">
                <option value="">— вибери —</option>
                {['Електроніка','Одяг та взуття','Дім та сад',"Краса та здоров'я",'Спорт та хобі','Авто та мото','Іграшки','Інше'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gold text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-2">Мова</label>
              <select value={lang} onChange={e => setLang(e.target.value as Lang)} disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40">
                <option value="uk">Українська</option>
                <option value="ru">Російська</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-gold text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-2">Особливості (необов'язково)</label>
            <textarea value={features} onChange={e => setFeatures(e.target.value)} rows={3} disabled={noCards}
              placeholder="наприклад: шумозаглушення 30 дБ, 30 год заряду, Bluetooth 5.2"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors resize-none disabled:opacity-40" />
          </div>

          <div>
            <label className="block text-gold text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-2">Платформа</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PLATFORMS.map(p => (
                <button key={p.value} onClick={() => setPlatform(p.value)} disabled={noCards}
                  className={`shrink-0 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${platform === p.value ? 'bg-gold/15 border-gold text-gold' : 'border-white/10 text-white/50 hover:border-white/25'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gold text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-2">Тон</label>
            <div className="flex flex-wrap gap-2">
              {[['professional','Професійний'],['friendly','Дружній'],['premium','Преміум'],['simple','Простий']].map(([v, l]) => (
                <button key={v} onClick={() => setTone(v as Tone)} disabled={noCards}
                  className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-all ${tone === v ? 'bg-gold/15 border-gold text-gold' : 'border-white/10 text-white/50 hover:border-white/25'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button type="button" onClick={() => setGenImage(v => !v)} disabled={noCards}
              className={`w-10 h-6 rounded-full transition-colors shrink-0 relative ${genImage ? 'bg-gold' : 'bg-white/15'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all`} style={{ left: genImage ? '18px' : '2px' }} />
            </button>
            <span className="text-white/60 text-sm">Генерувати зображення картки (DALL-E 3)</span>
          </label>
        </div>

        <button onClick={generate} disabled={loading || noCards || !productName.trim()}
          className="mt-6 w-full sm:w-auto bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 px-8 rounded-xl text-base hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {loading ? <><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Генерую...</> : '✦ Згенерувати картку'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-300 text-sm mb-5 flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          {error.includes('тариф') && <Link href="/pricing" className="text-gold underline text-sm">Підвищити →</Link>}
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-2xl p-6 sm:p-8">
          <div className="skeleton h-5 w-2/3 mb-6 rounded" />
          <div className="skeleton h-3 w-full mb-2 rounded" />
          <div className="skeleton h-3 w-11/12 mb-2 rounded" />
          <div className="skeleton h-3 w-4/5 mb-6 rounded" />
          <div className="skeleton h-3 w-1/2 mb-2 rounded" />
          <div className="skeleton h-3 w-2/5 rounded" />
        </div>
      )}

      {result && !loading && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-navy px-5 py-3.5 flex items-center justify-between gap-2">
            <span className="bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full">{platformLabel}</span>
            <span className="text-white/40 text-xs">{result.title.length}/80 симв.</span>
          </div>
          <div className="p-5 sm:p-7">
            {result.imageUrl && <img src={result.imageUrl} alt={result.title} className="w-full h-40 sm:h-52 object-cover rounded-xl mb-6" />}
            <h2 className="font-display font-bold text-lg sm:text-xl text-navy leading-tight mb-3">{result.title}</h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-5">{result.description}</p>
            <ul className="space-y-2 mb-5">
              {result.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 border-b border-gray-100 pb-2 last:border-0">
                  <span className="text-navy font-bold mt-0.5 shrink-0">✓</span>{b}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {result.keywords.map(k => <span key={k} className="bg-blue-50 text-navy text-xs font-medium px-3 py-1 rounded-full">{k}</span>)}
            </div>
          </div>
          <div className="px-5 sm:px-7 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={copyAll} className="bg-gray-900 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2">
              {copied ? '✓ Скопійовано!' : '📋 Копіювати'}
            </button>
            <button onClick={downloadCSV} className="bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
              ⬇ Завантажити CSV
            </button>
            <button onClick={generate} className="border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2">
              ↺ Інший варіант
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
