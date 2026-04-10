'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import type { SavedCard } from '@/types';

const PLATFORM_LABELS: Record<string, string> = {
  prom: 'Prom.ua', rozetka: 'Rozetka', olx: 'OLX', general: 'ÃÂÃÂ°ÃÂ³ÃÂ°ÃÂ»ÃÂÃÂ½ÃÂ¸ÃÂ¹',
};

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  changed?: string[];
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${
        ok ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-700'
      }`}
    >
      {ok ? 'Ã¢ÂÂ ÃÂ¡ÃÂºÃÂ¾ÃÂ¿ÃÂÃÂ¹ÃÂ¾ÃÂ²ÃÂ°ÃÂ½ÃÂ¾!' : label}
    </button>
  );
}

function AIBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: 'rgba(200,168,75,0.15)', color: '#c8a84b' }}>
      AI ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ÃÂ²
    </span>
  );
}

const SUGGESTIONS = [
  'ÃÂÃÂÃÂ¾ÃÂ±ÃÂ¸ ÃÂ·ÃÂ°ÃÂ³ÃÂ¾ÃÂ»ÃÂ¾ÃÂ²ÃÂ¾ÃÂº ÃÂºÃÂ¾ÃÂÃÂ¾ÃÂÃÂÃÂ¸ÃÂ¼',
  'ÃÂÃÂµÃÂÃÂµÃÂ¿ÃÂ¸ÃÂÃÂ¸ ÃÂ¾ÃÂ¿ÃÂ¸ÃÂ ÃÂ±ÃÂÃÂ»ÃÂÃÂ ÃÂ¿ÃÂÃÂ¾ÃÂ´ÃÂ°ÃÂÃÂÃÂ¸ÃÂ¼',
  'ÃÂÃÂ¾ÃÂ´ÃÂ°ÃÂ¹ ÃÂÃÂ¸ÃÂÃÂÃÂ¸ ÃÂ ÃÂ¿ÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸',
  'ÃÂÃÂ¾ÃÂ´ÃÂ°ÃÂ¹ ÃÂ·ÃÂ°ÃÂºÃÂ»ÃÂ¸ÃÂº ÃÂ´ÃÂ¾ ÃÂ´ÃÂÃÂ',
  'ÃÂÃÂÃÂ»ÃÂÃÂÃÂµ SEO ÃÂºÃÂ»ÃÂÃÂÃÂ¾ÃÂ²ÃÂ¸ÃÂ ÃÂÃÂ»ÃÂÃÂ²',
];

// Ã¢ÂÂÃ¢ÂÂ Infographic Section Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
interface InfographicVariant {
  url:    string;
  label:  string;
  prompt: string;
}

interface ChatMsg {
  role:    'user' | 'assistant';
  content: string;
}

const EDIT_SUGGESTIONS = [
  'ÃÂÃÂ¾ÃÂ´ÃÂ°ÃÂ¹ ÃÂ±ÃÂÃÂ»ÃÂÃÂÃÂµ ÃÂ´ÃÂµÃÂÃÂ°ÃÂ»ÃÂµÃÂ¹ ÃÂÃÂ¾ÃÂ²ÃÂ°ÃÂÃÂ',
  'ÃÂÃÂÃÂ¾ÃÂ±ÃÂ¸ ÃÂÃÂµÃÂºÃÂÃÂ ÃÂºÃÂÃÂÃÂ¿ÃÂ½ÃÂÃÂÃÂ¸ÃÂ¼',
  'ÃÂÃÂ¼ÃÂÃÂ½ ÃÂÃÂÃÂ¸ÃÂ»ÃÂ ÃÂ½ÃÂ° ÃÂ±ÃÂÃÂ»ÃÂÃÂ ÃÂ¼ÃÂÃÂ½ÃÂÃÂ¼ÃÂ°ÃÂ»ÃÂÃÂÃÂÃÂ¸ÃÂÃÂ½ÃÂ¸ÃÂ¹',
  'ÃÂÃÂ¾ÃÂ´ÃÂ°ÃÂ¹ ÃÂÃÂÃÂ½ÃÂ ÃÂ½ÃÂ° ÃÂÃÂ½ÃÂÃÂ¾ÃÂ³ÃÂÃÂ°ÃÂÃÂÃÂºÃÂ',
  'ÃÂÃÂÃÂ¾ÃÂ±ÃÂ¸ ÃÂÃÂ¾ÃÂ½ ÃÂÃÂ²ÃÂÃÂÃÂ»ÃÂÃÂÃÂ¸ÃÂ¼',
];

function InfographicSection({ card, accessToken }: { card: SavedCard; accessToken: string }) {
  const [generating,  setGenerating]  = useState(false);
  const [variants,    setVariants]    = useState<InfographicVariant[]>([]);
  const [selected,    setSelected]    = useState<number | null>(null);
  const [error,       setError]       = useState('');
  const [step,        setStep]        = useState('');

  const [chatOpen,    setChatOpen]    = useState(false);
  const [messages,    setMessages]    = useState<ChatMsg[]>([]);
  const [input,       setInput]       = useState('');
  const [editing,     setEditing]     = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load saved infographics on card open
  useEffect(() => {
    const saved = (card as any).infographic_urls;
    if (Array.isArray(saved) && saved.length > 0) {
      setVariants(saved.map((v: { url: string; label: string }) => ({
        url: v.url, label: v.label, prompt: '',
      })));
      setSelected(0);
    }
  }, [card.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, editing]);

  async function generateVariant(variant: 'lifestyle' | 'benefits'): Promise<{ url: string; label: string } | null> {
    const res = await fetch('/api/generate-infographic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        imageUrl:    (card as any).processed_image_url || card.image_url,
        productName: card.product_name || card.title,
        bullets:     card.bullets,
        category:    'general',
        variant,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) return null;
    return { url: data.url, label: data.label };
  }

  async function generate() {
    setGenerating(true);
    setError('');
    setVariants([]);
    setSelected(null);
    setChatOpen(false);
    setMessages([]);

    const results: { url: string; label: string; prompt: string }[] = [];

    try {
      setStep('variant1');
      const v1 = await generateVariant('lifestyle');
      if (v1) {
        results.push({ ...v1, prompt: '' });
        setVariants([...results]);
        setSelected(0);
      }

      setStep('variant2');
      const v2 = await generateVariant('benefits');
      if (v2) {
        results.push({ ...v2, prompt: '' });
        setVariants([...results]);
      }

      if (results.length === 0) throw new Error('ÃÂÃÂµ ÃÂ²ÃÂ´ÃÂ°ÃÂ»ÃÂ¾ÃÂÃÂ ÃÂ·ÃÂ³ÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸ ÃÂ¶ÃÂ¾ÃÂ´ÃÂµÃÂ½ ÃÂ²ÃÂ°ÃÂÃÂÃÂ°ÃÂ½ÃÂ');

      // Save to DB Ã¢ÂÂ ÃÂ¾ÃÂºÃÂÃÂµÃÂ¼ÃÂ¸ÃÂ¹ ÃÂ·ÃÂ°ÃÂ¿ÃÂ¸ÃÂ ÃÂÃÂÃÂ»ÃÂÃÂºÃÂ¸ ÃÂ´ÃÂ»ÃÂ ÃÂ·ÃÂ±ÃÂµÃÂÃÂµÃÂ¶ÃÂµÃÂ½ÃÂ½ÃÂ
      if (card.id) {
        fetch('/api/save-infographics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            cardId: card.id,
            variants: results.map(r => ({ url: r.url, label: r.label })),
          }),
        }).catch(e => console.error('Save failed:', e));
      }

      setStep('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° ÃÂÃÂµÃÂÃÂ²ÃÂµÃÂÃÂ°');
      setStep('');
    }

    setGenerating(false);
  }

  async function sendEdit(text: string) {
    if (!text.trim() || selected === null || editing) return;
    const current = variants[selected];
    if (!current) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setEditing(true);
    try {
      const res = await fetch('/api/edit-infographic', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({
          userMessage:     text,
          currentImageUrl: current.url,
          originalPrompt:  current.prompt,
          productName:     card.product_name || card.title,
          bullets:         card.bullets,
          history:         messages.slice(-4),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° ÃÂÃÂµÃÂ´ÃÂ°ÃÂ³ÃÂÃÂ²ÃÂ°ÃÂ½ÃÂ½ÃÂ');
      setVariants(prev => prev.map((v, i) =>
        i === selected ? { ...v, url: data.imageUrl, prompt: data.newPrompt } : v
      ));
      setMessages(prev => [...prev, { role: 'assistant', content: data.explanation }]);
    } catch (err: unknown) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Ã¢ÂÂ Ã¯Â¸Â ' + (err instanceof Error ? err.message : 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ°'),
      }]);
    }
    setEditing(false);
  }

  async function download(idx?: number) {
    const i = idx !== undefined ? idx : (selected ?? 0);
    const url = variants[i]?.url;
    if (!url) return;
    const name = (card.product_name || card.title).replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name + '.jpg';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
    } catch {
      window.open(url, '_blank');
    }
  }

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-bold text-lg">Ã°ÂÂÂ AI ÃÂÃÂ½ÃÂÃÂ¾ÃÂ³ÃÂÃÂ°ÃÂÃÂÃÂºÃÂ°</h2>
          <p className="text-white/40 text-xs mt-0.5">2 ÃÂÃÂ½ÃÂÃÂºÃÂ°ÃÂ»ÃÂÃÂ½ÃÂ¸ÃÂ ÃÂ²ÃÂ°ÃÂÃÂÃÂ°ÃÂ½ÃÂÃÂ¸ ÃÂ· Flux AI ÃÂ· 1024ÃÂ1024</p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="bg-gold text-black font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-gold/80 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {generating ? (
            <>
              <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ÃÂÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ...
            </>
          ) : variants.length > 0 ? 'Ã¢ÂÂº ÃÂÃÂµÃÂÃÂµÃÂ³ÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸' : 'Ã¢ÂÂ¦ ÃÂÃÂ³ÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸ ÃÂ²ÃÂ°ÃÂÃÂÃÂ°ÃÂ½ÃÂÃÂ¸'}
        </button>
      </div>

      {/* Step indicator */}
      {generating && (
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-4">
          <div className="flex flex-col gap-3 mb-3">
            {[
              { key: 'variant1', label: 'Ã°ÂÂÂ¨ Flux AI ÃÂ³ÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ Lifestyle ÃÂ²ÃÂ°ÃÂÃÂÃÂ°ÃÂ½ÃÂ...' },
              { key: 'variant2', label: 'Ã°ÂÂÂ¨ Flux AI ÃÂ³ÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ ÃÂÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸ ÃÂ²ÃÂ°ÃÂÃÂÃÂ°ÃÂ½ÃÂ...' },
            ].map((s, i) => {
              const isActive = step === s.key;
              const isDone = step === 'variant2' && i === 0;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    isDone ? 'bg-green-500' : isActive ? 'bg-gold/20 border border-gold' : 'bg-white/10'
                  }`}>
                    {isDone
                      ? <span className="text-white text-xs font-bold">Ã¢ÂÂ</span>
                      : isActive
                        ? <span className="w-3 h-3 border-2 border-gold border-t-transparent rounded-full animate-spin block" />
                        : <span className="w-2 h-2 bg-white/20 rounded-full block" />
                    }
                  </div>
                  <span className={`text-sm transition-colors ${
                    isDone ? 'text-green-400' : isActive ? 'text-gold' : 'text-white/30'
                  }`}>{s.label}</span>
                </div>
              );
            })}
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full bg-gold rounded-full transition-all duration-1000 ${
              step === 'variant1' ? 'w-1/2' : step === 'variant2' ? 'w-full' : 'w-0'
            }`} />
          </div>
          <p className="text-white/25 text-xs text-center mt-2">~1 ÃÂÃÂ²ÃÂ¸ÃÂ»ÃÂ¸ÃÂ½ÃÂ° ÃÂ½ÃÂ° ÃÂ²ÃÂ°ÃÂÃÂÃÂ°ÃÂ½ÃÂ</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">
          Ã¢ÂÂ Ã¯Â¸Â {error}
        </div>
      )}

      {/* Variants grid */}
      {variants.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {variants.map((v, i) => (
              <div
                key={i}
                onClick={() => { setSelected(i); setChatOpen(false); setMessages([]); }}
                className={`cursor-pointer rounded-2xl overflow-hidden border-2 transition-all ${
                  selected === i
                    ? 'border-gold shadow-lg shadow-gold/20'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <img src={v.url} alt={v.label} className="w-full aspect-square object-cover" />
                <div className={`px-3 py-2 text-xs font-bold text-center transition-colors ${
                  selected === i ? 'bg-gold text-black' : 'bg-white/[0.06] text-white/60'
                }`}>
                  {selected === i ? 'Ã¢ÂÂ ' : ''}{v.label}
                </div>
              </div>
            ))}
          </div>

          {/* Actions for selected */}
          {selected !== null && (
            <div className="flex gap-3">
              <button
                onClick={download}
                className="bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                Ã¢Â¬Â ÃÂÃÂ°ÃÂ²ÃÂ°ÃÂ½ÃÂÃÂ°ÃÂ¶ÃÂ¸ÃÂÃÂ¸
              </button>
              <button
                onClick={() => { setChatOpen(v => !v); if (!chatOpen) setMessages([]); }}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${
                  chatOpen
                    ? 'bg-gold text-black'
                    : 'border border-white/20 text-white/70 hover:border-gold/50 hover:text-gold'
                }`}
              >
                Ã¢ÂÂ¦ AI ÃÂÃÂµÃÂ´ÃÂ°ÃÂ³ÃÂÃÂ²ÃÂ°ÃÂ½ÃÂ½ÃÂ
              </button>
            </div>
          )}

          {/* AI Edit Chat */}
          {chatOpen && selected !== null && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.08] flex items-center justify-between">
                <div>
                  <span className="text-white font-bold text-sm">Ã¢ÂÂ¦ ÃÂ ÃÂµÃÂ´ÃÂ°ÃÂ³ÃÂÃÂ²ÃÂ°ÃÂ½ÃÂ½ÃÂ: {variants[selected]?.label}</span>
                  <p className="text-white/35 text-xs mt-0.5">ÃÂÃÂ¿ÃÂ¸ÃÂÃÂ¸ ÃÂÃÂ¾ ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ÃÂÃÂ¸ Ã¢ÂÂ AI ÃÂ¿ÃÂµÃÂÃÂµÃÂ³ÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ</p>
                </div>
                <button onClick={() => setChatOpen(false)} className="text-white/30 hover:text-white/70 text-lg">ÃÂ</button>
              </div>

              {/* Messages */}
              <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
                {messages.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-white/40 text-sm mb-3">ÃÂ©ÃÂ¾ ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ÃÂÃÂ¸ ÃÂ² ÃÂÃÂÃÂ¾ÃÂ¼ÃÂ ÃÂ²ÃÂ°ÃÂÃÂÃÂ°ÃÂ½ÃÂÃÂ?</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {EDIT_SUGGESTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => sendEdit(s)}
                          className="text-xs px-3 py-1.5 rounded-full border border-white/15 text-white/50 hover:border-gold/50 hover:text-gold transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-gold text-black font-medium rounded-br-sm'
                        : 'bg-white/[0.08] text-white/80 rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {editing && (
                  <div className="flex justify-start">
                    <div className="bg-white/[0.08] rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-gold/60 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                        <span className="w-1.5 h-1.5 bg-gold/60 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                        <span className="w-1.5 h-1.5 bg-gold/60 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-white/[0.08] flex gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendEdit(input); } }}
                  placeholder="ÃÂ©ÃÂ¾ ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ÃÂÃÂ¸? (Enter Ã¢ÂÂ ÃÂ½ÃÂ°ÃÂ´ÃÂÃÂÃÂ»ÃÂ°ÃÂÃÂ¸)"
                  disabled={editing}
                  rows={2}
                  className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 resize-none focus:outline-none focus:border-gold/40 disabled:opacity-50"
                />
                <button
                  onClick={() => sendEdit(input)}
                  disabled={editing || !input.trim()}
                  className="bg-gold text-black font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-40 flex-shrink-0"
                >
                  Ã¢ÂÂ
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CardPage() {
  const router   = useRouter();
  const params   = useParams();
  const supabase = createClient();

  const [card,        setCard]        = useState<SavedCard | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [allCopied,   setAllCopied]   = useState(false);
  const [accessToken, setAccessToken] = useState('');

  const [chatOpen,    setChatOpen]    = useState(false);
  const [messages,    setMessages]    = useState<ChatMsg[]>([]);
  const [input,       setInput]       = useState('');
  const [aiLoading,   setAiLoading]   = useState(false);
  const [lastChanged, setLastChanged] = useState<string[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
    });
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      const { data } = await supabase
        .from('cards').select('*')
        .eq('id', params.id).eq('user_id', user.id)
        .single();
      if (!data) { router.push('/dashboard'); return; }
      setCard(data as SavedCard);
      setLoading(false);
    })();
  }, [params.id]); // eslint-disable-line

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiLoading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !card || aiLoading) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setAiLoading(true);
    setLastChanged([]);
    try {
      const res = await fetch('/api/edit-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          cardId: card.id,
          userMessage: text,
          card: {
            product_name: card.product_name,
            platform: card.platform,
            title: card.title,
            description: card.description,
            bullets: card.bullets,
            keywords: card.keywords,
          },
          history: messages.slice(-6),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° AI');
      if (data.diff && Object.keys(data.diff).length > 0) {
        setCard(prev => prev ? { ...prev, ...data.diff } : prev);
        setLastChanged(data.changedFields ?? []);
      }
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.explanation ?? 'ÃÂÃÂ¾ÃÂÃÂ¾ÃÂ²ÃÂ¾', changed: data.changedFields },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° ÃÂÃÂµÃÂÃÂ²ÃÂµÃÂÃÂ°';
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ã¢ÂÂ Ã¯Â¸Â ' + msg }]);
    }
    setAiLoading(false);
  }, [card, messages, accessToken, aiLoading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  function copyAll() {
    if (!card) return;
    const text = [
      card.title, '',
      card.description, '',
      'ÃÂÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸:',
      ...(card.bullets as string[]).map(b => 'Ã¢ÂÂ¢ ' + b), '',
      'ÃÂÃÂ»ÃÂÃÂÃÂ¾ÃÂ²ÃÂ ÃÂÃÂ»ÃÂ¾ÃÂ²ÃÂ°: ' + (card.keywords as string[]).join(', '),
    ].join('\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  }

  function downloadCSV() {
    if (!card) return;
    const rows = [
      ['ÃÂÃÂ°ÃÂ·ÃÂ²ÃÂ°', 'ÃÂÃÂ¿ÃÂ¸ÃÂ', 'ÃÂÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸', 'ÃÂÃÂ»ÃÂÃÂÃÂ¾ÃÂ²ÃÂ ÃÂÃÂ»ÃÂ¾ÃÂ²ÃÂ°', 'ÃÂÃÂ»ÃÂ°ÃÂÃÂÃÂ¾ÃÂÃÂ¼ÃÂ°'],
      [card.title, card.description, (card.bullets as string[]).join(' | '), (card.keywords as string[]).join(', '), card.platform],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `kartka-${card.id.slice(0, 8)}.csv`,
    }).click();
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!card) return null;

  const bullets  = card.bullets  as string[];
  const keywords = card.keywords as string[];
  const platform = PLATFORM_LABELS[card.platform] ?? card.platform;
  const date     = new Date(card.created_at).toLocaleDateString('uk-UA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">

      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors">Ã¢ÂÂ ÃÂÃÂ°ÃÂ±ÃÂÃÂ½ÃÂµÃÂ</Link>
        <div className="flex items-center gap-3">
          <span className="text-white/25 text-xs">{date}</span>
          <span className="text-xs bg-white/[0.08] text-white/40 px-2.5 py-1 rounded-full">{platform}</span>
        </div>
      </div>

      <div className={`grid gap-6 ${chatOpen ? 'lg:grid-cols-2' : 'max-w-3xl mx-auto'}`}>

        {/* Ã¢ÂÂÃ¢ÂÂ Card Ã¢ÂÂÃ¢ÂÂ */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">

          <div className="bg-navy px-5 py-4 flex items-center justify-between gap-3">
            <span className="bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full">{platform}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setChatOpen(v => !v); setTimeout(() => inputRef.current?.focus(), 150); }}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                  chatOpen ? 'bg-gold text-black' : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                Ã¢ÂÂ¦ AI ÃÂÃÂµÃÂ´ÃÂ°ÃÂ³ÃÂÃÂ²ÃÂ°ÃÂ½ÃÂ½ÃÂ
              </button>
              <span className="text-white/40 text-xs">{card.title.length}/80</span>
              <button
                onClick={copyAll}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                  allCopied ? 'bg-green-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {allCopied ? 'Ã¢ÂÂ ÃÂÃÂÃÂµ ÃÂÃÂºÃÂ¾ÃÂ¿ÃÂÃÂ¹ÃÂ¾ÃÂ²ÃÂ°ÃÂ½ÃÂ¾!' : 'Ã°ÂÂÂ ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸ ÃÂ²ÃÂÃÂµ'}
              </button>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-4">

            {card.image_url && (
              <div className="relative group">
                <img src={card.image_url} alt={card.title}
                  className="w-full h-44 sm:h-52 object-contain bg-gray-50 rounded-xl" />
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(card.image_url!);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      Object.assign(document.createElement('a'), {
                        href: url,
                        download: `product-${card.id.slice(0,8)}.jpg`,
                      }).click();
                      URL.revokeObjectURL(url);
                    } catch { window.open(card.image_url, '_blank'); }
                  }}
                  className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity font-semibold"
                >
                  Ã¢Â¬Â ÃÂÃÂ°ÃÂ²ÃÂ°ÃÂ½ÃÂÃÂ°ÃÂ¶ÃÂ¸ÃÂÃÂ¸
                </button>
              </div>
            )}

            {/* Title */}
            <div className={`rounded-xl p-4 transition-colors ${lastChanged.includes('title') ? 'bg-yellow-50 ring-1 ring-yellow-200' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÃÂÃÂ°ÃÂ³ÃÂ¾ÃÂ»ÃÂ¾ÃÂ²ÃÂ¾ÃÂº</span>
                  <AIBadge show={lastChanged.includes('title')} />
                </div>
                <CopyBtn text={card.title} label="ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸" />
              </div>
              <h2 className="font-bold text-lg text-navy leading-tight">{card.title}</h2>
            </div>

            {/* Description */}
            <div className={`rounded-xl p-4 transition-colors ${lastChanged.includes('description') ? 'bg-yellow-50 ring-1 ring-yellow-200' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÃÂÃÂ¿ÃÂ¸ÃÂ</span>
                  <AIBadge show={lastChanged.includes('description')} />
                </div>
                <CopyBtn text={card.description} label="ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸" />
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">{card.description}</p>
            </div>

            {/* Bullets */}
            {bullets.length > 0 && (
              <div className={`rounded-xl p-4 transition-colors ${lastChanged.includes('bullets') ? 'bg-yellow-50 ring-1 ring-yellow-200' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÃÂÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸</span>
                    <AIBadge show={lastChanged.includes('bullets')} />
                  </div>
                  <CopyBtn text={bullets.map(b => 'Ã¢ÂÂ¢ ' + b).join('\n')} label="ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸" />
                </div>
                <ul className="space-y-2">
                  {bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 border-b border-gray-100 pb-2 last:border-0">
                      <span className="text-navy font-bold mt-0.5 shrink-0">Ã¢ÂÂ</span>{b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Keywords */}
            {keywords.length > 0 && (
              <div className={`rounded-xl p-4 transition-colors ${lastChanged.includes('keywords') ? 'bg-yellow-50 ring-1 ring-yellow-200' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÃÂÃÂ»ÃÂÃÂÃÂ¾ÃÂ²ÃÂ ÃÂÃÂ»ÃÂ¾ÃÂ²ÃÂ°</span>
                    <AIBadge show={lastChanged.includes('keywords')} />
                  </div>
                  <CopyBtn text={keywords.join(', ')} label="ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸" />
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

          <div className="px-5 sm:px-6 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={copyAll}
              className={`px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                allCopied ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'
              }`}>
              {allCopied ? 'Ã¢ÂÂ ÃÂ¡ÃÂºÃÂ¾ÃÂ¿ÃÂÃÂ¹ÃÂ¾ÃÂ²ÃÂ°ÃÂ½ÃÂ¾!' : 'Ã°ÂÂÂ ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸ ÃÂ²ÃÂÃÂµ'}
            </button>
            <button onClick={downloadCSV}
              className="bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
              Ã¢Â¬Â ÃÂÃÂ°ÃÂ²ÃÂ°ÃÂ½ÃÂÃÂ°ÃÂ¶ÃÂ¸ÃÂÃÂ¸ CSV
            </button>
            <Link href="/generate"
              className="border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2 text-center">
              Ã¢ÂÂ¦ ÃÂÃÂ¾ÃÂ²ÃÂ° ÃÂºÃÂ°ÃÂÃÂÃÂºÃÂ°
            </Link>
          </div>
        </div>

        {/* Ã¢ÂÂÃ¢ÂÂ Chat panel Ã¢ÂÂÃ¢ÂÂ */}
        {chatOpen && (
          <div className="flex flex-col bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden"
            style={{ height: '640px' }}>

            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
              <div>
                <p className="text-white text-sm font-bold">Ã¢ÂÂ¦ AI ÃÂÃÂµÃÂ´ÃÂ°ÃÂ³ÃÂÃÂ²ÃÂ°ÃÂ½ÃÂ½ÃÂ</p>
                <p className="text-white/30 text-xs">ÃÂ¡ÃÂºÃÂ°ÃÂ¶ÃÂ¸ ÃÂÃÂ¾ ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ÃÂÃÂ¸ Ã¢ÂÂ AI ÃÂ¾ÃÂ½ÃÂ¾ÃÂ²ÃÂ¸ÃÂÃÂ ÃÂºÃÂ°ÃÂÃÂÃÂºÃÂ</p>
              </div>
              <button onClick={() => setChatOpen(false)}
                className="text-white/30 hover:text-white text-xl leading-none transition-colors">Ã¢ÂÂ</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

              {messages.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">Ã¢ÂÂ¦</p>
                  <p className="text-white/50 text-sm mb-5">
                    ÃÂ¯ ÃÂ¼ÃÂ¾ÃÂ¶ÃÂ ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ÃÂÃÂ¸ ÃÂ±ÃÂÃÂ´ÃÂ-ÃÂÃÂºÃÂ ÃÂÃÂ°ÃÂÃÂÃÂ¸ÃÂ½ÃÂ ÃÂºÃÂ°ÃÂÃÂÃÂºÃÂ¸.<br />
                    ÃÂ¡ÃÂ¿ÃÂÃÂ¾ÃÂ±ÃÂÃÂ¹ ÃÂ¾ÃÂ´ÃÂ½ÃÂ ÃÂ· ÃÂ¿ÃÂÃÂ´ÃÂºÃÂ°ÃÂ·ÃÂ¾ÃÂº:
                  </p>
                  <div className="flex flex-col gap-2">
                    {SUGGESTIONS.map(s => (
                      <button key={s} onClick={() => sendMessage(s)}
                        className="text-xs px-4 py-2 rounded-xl border border-white/15 text-white/50 hover:border-gold/50 hover:text-gold transition-all text-left">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === 'user'
                      ? 'bg-gold text-black rounded-br-sm'
                      : 'bg-white/[0.08] text-white/90 rounded-bl-sm'
                  }`}>
                    <p className="leading-relaxed">{m.content}</p>
                    {m.role === 'assistant' && m.changed && m.changed.length > 0 && (
                      <p className="text-white/35 text-[10px] mt-1">
                        ÃÂÃÂ¼ÃÂÃÂ½ÃÂµÃÂ½ÃÂ¾: {m.changed.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.08] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                        style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Quick pills after first message */}
            {messages.length > 0 && !aiLoading && (
              <div className="px-4 py-2 flex gap-2 overflow-x-auto shrink-0 border-t border-white/[0.06]">
                {SUGGESTIONS.slice(0, 3).map(s => (
                  <button key={s} onClick={() => sendMessage(s)}
                    className="text-[11px] whitespace-nowrap px-3 py-1 rounded-full border border-white/15 text-white/40 hover:border-gold/40 hover:text-gold transition-all shrink-0">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-4 pb-4 pt-2 shrink-0">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="ÃÂ©ÃÂ¾ ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ÃÂÃÂ¸? (Enter Ã¢ÂÂ ÃÂ²ÃÂÃÂ´ÃÂ¿ÃÂÃÂ°ÃÂ²ÃÂ¸ÃÂÃÂ¸)"
                  rows={2}
                  disabled={aiLoading}
                  className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-gold/40 resize-none disabled:opacity-50 transition-colors"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || aiLoading}
                  className="bg-gold text-black px-4 py-3 rounded-xl font-bold text-sm hover:bg-gold/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  Ã¢ÂÂ
                </button>
              </div>
              <p className="text-white/20 text-[10px] mt-1.5 text-center">
                Shift+Enter Ã¢ÂÂ ÃÂ½ÃÂ¾ÃÂ²ÃÂ¸ÃÂ¹ ÃÂÃÂÃÂ´ÃÂ¾ÃÂº ÃÂ· ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ ÃÂ·ÃÂ±ÃÂµÃÂÃÂÃÂ³ÃÂ°ÃÂÃÂÃÂÃÂÃÂ ÃÂ°ÃÂ²ÃÂÃÂ¾ÃÂ¼ÃÂ°ÃÂÃÂ¸ÃÂÃÂ½ÃÂ¾
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Ã¢ÂÂÃ¢ÂÂ INFOGRAPHIC SECTION Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <InfographicSection
        card={card}
        accessToken={accessToken}
      />

    </div>
  );
}
