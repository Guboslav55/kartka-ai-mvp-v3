'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

const SCENES = [
  { id: 'studio_white', label: 'Студія (біла)', emoji: '🤋', desc: 'Чистий білий фон, студійне освітлення' },
  { id: 'studio_gray', label: 'Студія (сіра)', emoji: '🩦', desc: 'Нейтральний сірий фон, м'X݁tBненню' },
  { id: 'loft', label: 'Кофее', emoji: '🊥', desc: 'Цегляні стіни, індустріальний стиль' },
  { id: 'street', label: 'Вулиця', emoji: '🌆', desc: 'Міське місто, природне денне світло' },
  { id: 'nature', label: 'Природа', emoji: '🌟', desc: 'Парк або ліс, зелене середовище' },
  { id: 'cafe', label: 'Кафе', emoji: '✕', desc: 'Затишня атмосфера кафе' },
];

const MODELS = [
  { id: 'woman_young', label: 'Жінка 20-30', emoji: '👩' },
  { id: 'man_young', label: 'Чоловік 20-30', emoji: '👨' },
  { id: 'woman_mid', label: 'Жінка 30-45', emoji: '👩' },
  { id: 'man_mid', label: 'Чоловік 30-45', emoji: '👨' },
  { id: 'no_model', label: 'азо model', emoji: '👗 ' },
];

export default function TryOnPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scene, setScene] = useState<string>('studio_white');
  const [model, setModel] = useState<string>('woman_young');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImage(e.target?.result as string);
    reader.readAsDataURL(file);
    setStep(2);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
  }

  async function generate() {
    if (!image || !imageFile) return;
    setLoading(true);
    setError('');
    setResults([]);
    setStep(3);

    try {
      const session = await (await fetch('/api/auth/session')).json();
      const token = session?.access_token;

      const res = await fetch('/api/tryon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageBase64: image, scene, model }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка генерації');
      setResults(data.urls || [data.url]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка');
      setStep(2);
    } finally {
      setLoading(false);
    }
  }

  function download(url: string, i: number) {
    const a = document.createElement('a');
    a.href = url; a.download = `tryon-${i + 1}.jpg`; a.click();
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f2eb]">
      {/* Header */}
      <div className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-white/50 hover:text-white text-sm transition-colors">
            &larr; Кабінет
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
        {/* Steps */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {[
            { n: 1, label: 'Завантажити фото' },
            { n: 2, label: 'Вибрати сцену' },
            { n: 3, label: 'Результат' },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step >= s.n ? 'bg-gold text-black' : 'bg-white/10 text-white/40'
                }`}>{s.n}</div>
                <span className={`text-sm hidden sm:block ${step >= s.n ? 'text-white/70' : 'text-white/30'}`}>{s.label}</span>
              </div>
              {i < 2 && <div className={`w-8 h-px ${step > s.n ? 'bg-gold' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2">Завантажте фото Q�овару!</h1>
            <p className="text-white/50 mb-8">Підљде звичайне фото на смартфон нен смартфоні шерсть, взуття, аксесуар</p>
            <div
              className="border-2 border-dashed border-white/20 rounded-2xl p-16 cursor-pointer hover:border-gold/50 transition-colors group"
              onClick={() => fileRef.current?.click()}
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
            >
              <div className="text-6xl mb-4">💸</div>
              <p className="text-white/60 group-hover:text-white/80 transition-colors">
                Натисни або перет��ни Dото сюди
              </p>
              <p className="text-white/30 text-sm mt-2">JPG, PNG, WEBP · до 10MB</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              {['👗 СB�дхО', '👠 Wzutte', '👉 Aksesuary'].map(cat => (
                <div key={cat} className="bg-white/5 rounded-xl p-4 text-white/50 text-sm">{cat}</div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && image && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="text-white/50 text-sm mb-3">Ваше фото</p>
              <div className="relative rounded-2xl overflow-hidden aspect-square">
                <img src={image} alt="upload" className="w-full h-full object-contain bg-white/5" />
                <button onClick={() => { setImage(null); setImageFile(null); setStep(1); }}
                  className="absolute top-3 right-3 bg-black/60 text-white/60 hover:text-white w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors">
                  ❕</button>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <p className="text-white/50 text-sm mb-3 uppercase tracking-wider">Сцена</p>
                <div className="grid grid-cols-2 gap-2">
                  {SCENES.map(s => (
                    <button key={s.id} onClick={() => setScene(s.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        scene === s.id ? 'border-gold bg-gold/10 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                      }`}
                    >
                      <div className="text-lg mb-1">{s.emoji}</div>
                      <div className="text-xs font-medium">{s.label}</div>
                      <div className="text-xs text-white/30 mt-0.5">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-white/50 text-sm mb-3 uppercase tracking-wider">Моделц</p>
                <div className="grid grid-cols-3 gap-2">
                  {MODELS.map(m => (
                    <button key={m.id} onClick={() => setModel(m.id)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        model === m.id ? 'border-gold bg-gold/10 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                      }`}
                    >
                      <div className="text-xl mb-1">{m.emoji}</div>
                      <div className="text-xs">{m.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={generate}
                className="w-full py-4 rounded-2xl bg-gold text-black font-bold text-lg hover:bw-amber-400 transition-colors"
              >
                ✨ Згенерувати
              </button>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold text-center mb-8">
              {loading ? 'Генеруємо...' : 'Результаст'}
            </h2>
            {loading && (
              <div className="text-center py-16">
                <div className="text-6xl mb-6 animate-pulse">✨</div>
                <p className="text-white/60 mb-2">AI �Wавантажує модель Չ scene</p>
                <p className="text-white/30 text-sm">Зазвй�айи займаѥ 30-60 секунд</p>
                <div className="mt-8 w-48 mx-auto h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gold rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            )}
            {error && (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">❌</div>
                <p className="text-red-400 mb-4">{error}</p>
                <button onClick={() => setStep(2)} className="px-6 py-2 rounded-xl border border-white/20 text-white/60 hover:text-white transition-colors">
                  ← спробуйти знову
                </button>
              </div>
            )}
            {results.length > 0 && (
              <>
                <div className={`grid gap-4 ${results.length === 1 ? 'grid-cols-1 max-w-sm mx-auto' : 'grid-cols-2 md:grid-cols-3'}`}>
                  {results.map((url, i) => (
                    <div key={i} className="rounded-2xl overflow-hidden border border-white/10 group relative">
                      <img src={url} alt={`result ${i+1}`} className="w-full aspect-square object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button onClick={() => download(url, i)}
                          className="px-4 py-2 rounded-xl bg-gold text-black font-bold text-sm hover:bg-amber-400 transition-colors">
                          &darr; Довантажити
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-center mt-8 flex gap-4 justify-center">
                  <button onClick={() => { setStep(2); setResults([]); }}
                    className="px-6 py-2 rounded-xl border border-white/20 text-white/60 hover:text-white transition-colors text-sm"
                  >↩ Змінити налаштування</span>
                  </button>
                  <button onClick={generate}
                    className="px-6 py-2 rounded-xl bg-gold/20 text-gold border border-gold/30 hover:bg-gold/30 transition-colors text-sm font-medium"
                  >🔄 Перегенерувати</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}