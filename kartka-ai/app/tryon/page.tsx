'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

const SCENES = [
  { id: 'studio_white', label: 'Студія (біла)', emoji: '🤍', desc: 'Білий фон, студійне освітлення' },
  { id: 'studio_gray', label: 'Студія (сіра)', emoji: '🩶', desc: 'Нейтральний сірий фон' },
  { id: 'loft', label: 'Лофт', emoji: '🏭', desc: 'Цегляні стіни, індустріальний стиль' },
  { id: 'street', label: 'Вулиця', emoji: '🌆', desc: 'Міська вулиця, денне світло' },
  { id: 'nature', label: 'Природа', emoji: '🌿', desc: 'Парк або ліс, сонячне світло' },
  { id: 'cafe', label: 'Кафе', emoji: '☕', desc: 'Затишна атмосфера кафе' },
];

const MODELS = [
  { id: 'woman_young', label: 'Жінка 20-30', emoji: '👩' },
  { id: 'man_young', label: 'Чоловік 20-30', emoji: '👨' },
  { id: 'woman_mid', label: 'Жінка 30-45', emoji: '👩‍💼' },
  { id: 'man_mid', label: 'Чоловік 30-45', emoji: '👨‍💼' },
  { id: 'no_model', label: 'Без моделі', emoji: '👗' },
];

function getSupabaseToken(): string {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.includes('supabase') && key.includes('auth')) {
        const val = JSON.parse(localStorage.getItem(key) || '{}');
        if (val?.access_token) return val.access_token;
        if (val?.session?.access_token) return val.session.access_token;
      }
    }
  } catch {}
  return '';
}

export default function TryOnPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [image, setImage] = useState<string | null>(null);
  const [scene, setScene] = useState('studio_white');
  const [model, setModel] = useState('woman_young');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => { setImage(e.target?.result as string); setStep(2); };
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (!image) return;
    setLoading(true);
    setError('');
    setResults([]);
    setStep(3);
    try {
      const authToken = getSupabaseToken();
      const res = await fetch('/api/tryon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ imageBase64: image, scene, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка генерації');
      setResults(data.urls || [data.url].filter(Boolean));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Невідома помилка';
      setError(msg);
      setStep(2);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f2eb]">
      <div className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-white/50 hover:text-white text-sm transition-colors">
            ← Кабінет
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xl">👗</span>
            <span className="font-bold text-gold">AI Try-on</span>
            <span className="text-white/30 text-xs">Beta</span>
          </div>
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-center gap-4 mb-10">
          {[{ n: 1, label: 'Фото' }, { n: 2, label: 'Сцена' }, { n: 3, label: 'Результат' }].map((s, i) => (
            <div key={s.n} className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step >= s.n ? 'bg-gold text-black' : 'bg-white/10 text-white/40'}`}>{s.n}</div>
                <span className={`text-sm hidden sm:block ${step >= s.n ? 'text-white/70' : 'text-white/30'}`}>{s.label}</span>
              </div>
              {i < 2 && <div className={`w-8 h-px ${step > s.n ? 'bg-gold' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2">Завантажте фото товару</h1>
            <p className="text-white/50 mb-8">Одяг, взуття або аксесуар — підійде будь-яке фото</p>
            <div
              className="border-2 border-dashed border-white/20 rounded-2xl p-16 cursor-pointer hover:border-gold/50 transition-colors group"
              onClick={() => fileRef.current?.click()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFile(f); }}
              onDragOver={e => e.preventDefault()}
            >
              <div className="text-6xl mb-4">📸</div>
              <p className="text-white/60 group-hover:text-white/80 transition-colors">Натисни або перетягни фото сюди</p>
              <p className="text-white/30 text-sm mt-2">JPG, PNG, WEBP · до 10MB</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        )}

        {step === 2 && image && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="text-white/50 text-sm mb-3">Ваше фото</p>
              <div className="relative rounded-2xl overflow-hidden aspect-square">
                <img src={image} alt="upload" className="w-full h-full object-contain bg-white/5" />
                <button
                  onClick={() => { setImage(null); setStep(1); }}
                  className="absolute top-3 right-3 bg-black/60 text-white/60 hover:text-white w-8 h-8 rounded-full flex items-center justify-center text-sm"
                >✕</button>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <p className="text-white/50 text-sm mb-3 uppercase tracking-wider">Сцена</p>
                <div className="grid grid-cols-2 gap-2">
                  {SCENES.map(s => (
                    <button key={s.id} onClick={() => setScene(s.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${scene === s.id ? 'border-gold bg-gold/10 text-white' : 'border-white/10 text-white/50 hover:border-white/20'}`}>
                      <div className="text-lg mb-1">{s.emoji}</div>
                      <div className="text-xs font-medium">{s.label}</div>
                      <div className="text-xs text-white/30 mt-0.5">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-white/50 text-sm mb-3 uppercase tracking-wider">Модель</p>
                <div className="grid grid-cols-3 gap-2">
                  {MODELS.map(m => (
                    <button key={m.id} onClick={() => setModel(m.id)}
                      className={`p-2 rounded-xl border text-center transition-all ${model === m.id ? 'border-gold bg-gold/10 text-white' : 'border-white/10 text-white/50 hover:border-white/20'}`}>
                      <div className="text-xl mb-1">{m.emoji}</div>
                      <div className="text-xs">{m.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={generate}
                className="w-full py-4 rounded-2xl bg-gold text-black font-bold text-lg hover:bg-amber-400 transition-colors">
                ✨ Згенерувати
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold text-center mb-8">
              {loading ? 'Генеруємо...' : error ? 'Помилка' : 'Готово!'}
            </h2>
            {loading && (
              <div className="text-center py-16">
                <div className="text-6xl mb-6 animate-pulse">✨</div>
                <p className="text-white/60 mb-2">AI підбирає модель і сцену</p>
                <p className="text-white/30 text-sm">Зазвичай 30-60 секунд</p>
                <div className="mt-6 w-48 mx-auto h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gold rounded-full animate-pulse w-3/5" />
                </div>
              </div>
            )}
            {error && !loading && (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">❌</div>
                <p className="text-red-400 mb-2">{error}</p>
                <button onClick={() => { setError(''); setStep(2); }}
                  className="mt-4 px-6 py-2 rounded-xl border border-white/20 text-white/60 hover:text-white transition-colors">
                  ← Спробувати знову
                </button>
              </div>
            )}
            {results.length > 0 && !loading && (
              <>
                <div className="max-w-sm mx-auto space-y-4">
                  {results.map((url, i) => (
                    <div key={i} className="rounded-2xl overflow-hidden border border-white/10 group relative">
                      <img src={url} alt={`result ${i + 1}`} className="w-full aspect-square object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <a href={url} download={`tryon-${i + 1}.jpg`} target="_blank" rel="noreferrer"
                          className="px-4 py-2 rounded-xl bg-gold text-black font-bold text-sm hover:bg-amber-400">
                          ↓ Завантажити
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-center mt-8 flex gap-4 justify-center">
                  <button onClick={() => { setStep(2); setResults([]); }}
                    className="px-6 py-2 rounded-xl border border-white/20 text-white/60 hover:text-white transition-colors text-sm">
                    ↩ Змінити
                  </button>
                  <button onClick={generate}
                    className="px-6 py-2 rounded-xl bg-gold/20 text-gold border border-gold/30 hover:bg-gold/30 transition-colors text-sm font-medium">
                    🔄 Ще раз
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}