'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const InfographicEditor = dynamic(() => import('@/app/components/InfographicEditor'), { ssr: false });
import type { SavedCard } from '@/types';

const PLATFORM_LABELS: Record<string, string> = {
  prom: 'Prom.ua', rozetka: 'Rozetka', olx: 'OLX', general: 'ÐÐ°Ð³Ð°Ð»ÑÐ½Ð¸Ð¹',
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
      {ok ? 'â Ð¡ÐºÐ¾Ð¿ÑÐ¹Ð¾Ð²Ð°Ð½Ð¾!' : label}
    </button>
  );
}

function AIBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: 'rgba(200,168,75,0.15)', color: '#c8a84b' }}>
      AI Ð·Ð¼ÑÐ½Ð¸Ð²
    </span>
  );
}

const SUGGESTIONS = [
  'ÐÑÐ¾Ð±Ð¸ Ð·Ð°Ð³Ð¾Ð»Ð¾Ð²Ð¾Ðº ÐºÐ¾ÑÐ¾ÑÑÐ¸Ð¼',
  'ÐÐµÑÐµÐ¿Ð¸ÑÐ¸ Ð¾Ð¿Ð¸Ñ Ð±ÑÐ»ÑÑ Ð¿ÑÐ¾Ð´Ð°ÑÑÐ¸Ð¼',
  'ÐÐ¾Ð´Ð°Ð¹ ÑÐ¸ÑÑÐ¸ Ñ Ð¿ÐµÑÐµÐ²Ð°Ð³Ð¸',
  'ÐÐ¾Ð´Ð°Ð¹ Ð·Ð°ÐºÐ»Ð¸Ðº Ð´Ð¾ Ð´ÑÑ',
  'ÐÑÐ»ÑÑÐµ SEO ÐºÐ»ÑÑÐ¾Ð²Ð¸Ñ ÑÐ»ÑÐ²',
];

// ââ Infographic Section ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
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
  'ÐÐ¾Ð´Ð°Ð¹ Ð±ÑÐ»ÑÑÐµ Ð´ÐµÑÐ°Ð»ÐµÐ¹ ÑÐ¾Ð²Ð°ÑÑ',
  'ÐÑÐ¾Ð±Ð¸ ÑÐµÐºÑÑ ÐºÑÑÐ¿Ð½ÑÑÐ¸Ð¼',
  'ÐÐ¼ÑÐ½ ÑÑÐ¸Ð»Ñ Ð½Ð° Ð±ÑÐ»ÑÑ Ð¼ÑÐ½ÑÐ¼Ð°Ð»ÑÑÑÐ¸ÑÐ½Ð¸Ð¹',
  'ÐÐ¾Ð´Ð°Ð¹ ÑÑÐ½Ñ Ð½Ð° ÑÐ½ÑÐ¾Ð³ÑÐ°ÑÑÐºÑ',
  'ÐÑÐ¾Ð±Ð¸ ÑÐ¾Ð½ ÑÐ²ÑÑÐ»ÑÑÐ¸Ð¼',
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

      if (results.length === 0) throw new Error('ÐÐµ Ð²Ð´Ð°Ð»Ð¾ÑÑ Ð·Ð³ÐµÐ½ÐµÑÑÐ²Ð°ÑÐ¸ Ð¶Ð¾Ð´ÐµÐ½ Ð²Ð°ÑÑÐ°Ð½Ñ');

      // Save to DB â Ð¾ÐºÑÐµÐ¼Ð¸Ð¹ Ð·Ð°Ð¿Ð¸Ñ ÑÑÐ»ÑÐºÐ¸ Ð´Ð»Ñ Ð·Ð±ÐµÑÐµÐ¶ÐµÐ½Ð½Ñ
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
      setError(err instanceof Error ? err.message : 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° ÑÐµÑÐ²ÐµÑÐ°');
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
      if (!res.ok) throw new Error(data.error || 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° ÑÐµÐ´Ð°Ð³ÑÐ²Ð°Ð½Ð½Ñ');
      setVariants(prev => prev.map((v, i) =>
        i === selected ? { ...v, url: data.imageUrl, prompt: data.newPrompt } : v
      ));
      setMessages(prev => [...prev, { role: 'assistant', content: data.explanation }]);
    } catch (err: unknown) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'â ï¸ ' + (err instanceof Error ? err.message : 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ°'),
      }]);
    }
    setEditing(false);
  }

  async function download() {
    if (selected === null) return;
    const url = variants[selected]?.url;
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `infographic-${(card.product_name || card.title).replace(/\s+/g, '-').slice(0, 40)}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-bold text-lg">ð AI ÐÐ½ÑÐ¾Ð³ÑÐ°ÑÑÐºÐ°</h2>
          <p className="text-white/40 text-xs mt-0.5">2 ÑÐ½ÑÐºÐ°Ð»ÑÐ½Ð¸Ñ Ð²Ð°ÑÑÐ°Ð½ÑÐ¸ Â· Flux AI Â· 1024Ã1024</p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="bg-gold text-black font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-gold/80 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {generating ? (
            <>
              <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ÐÐµÐ½ÐµÑÑÑ...
            </>
          ) : variants.length > 0 ? 'âº ÐÐµÑÐµÐ³ÐµÐ½ÐµÑÑÐ²Ð°ÑÐ¸' : 'â¦ ÐÐ³ÐµÐ½ÐµÑÑÐ²Ð°ÑÐ¸ Ð²Ð°ÑÑÐ°Ð½ÑÐ¸'}
        </button>
      </div>

      {/* Step indicator */}
      {generating && (
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 mb-4">
          <div className="flex flex-col gap-3 mb-3">
            {[
              { key: 'variant1', label: 'ð¨ Flux AI Ð³ÐµÐ½ÐµÑÑÑ Lifestyle Ð²Ð°ÑÑÐ°Ð½Ñ...' },
              { key: 'variant2', label: 'ð¨ Flux AI Ð³ÐµÐ½ÐµÑÑÑ ÐÐµÑÐµÐ²Ð°Ð³Ð¸ Ð²Ð°ÑÑÐ°Ð½Ñ...' },
            ].map((s, i) => {
              const isActive = step === s.key;
              const isDone = step === 'variant2' && i === 0;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    isDone ? 'bg-green-500' : isActive ? 'bg-gold/20 border border-gold' : 'bg-white/10'
                  }`}>
                    {isDone
                      ? <span className="text-white text-xs font-bold">â</span>
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
          <p className="text-white/25 text-xs text-center mt-2">~1 ÑÐ²Ð¸Ð»Ð¸Ð½Ð° Ð½Ð° Ð²Ð°ÑÑÐ°Ð½Ñ</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">
          â ï¸ {error}
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
                  {selected === i ? 'â ' : ''}{v.label}
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
                â¬ ÐÐ°Ð²Ð°Ð½ÑÐ°Ð¶Ð¸ÑÐ¸
              </button>
              <button
                onClick={() => setEditorOpen(true)}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-500 transition-colors flex items-center gap-2"
              >
                ✏️ Редактор
              </button>
              <button
                onClick={() => { setChatOpen(v => !v); if (!chatOpen) setMessages([]); }}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${
                  chatOpen
                    ? 'bg-gold text-black'
                    : 'border border-white/20 text-white/70 hover:border-gold/50 hover:text-gold'
                }`}
              >
                â¦ AI ÑÐµÐ´Ð°Ð³ÑÐ²Ð°Ð½Ð½Ñ
              </button>
            </div>
          )}

          {/* AI Edit Chat */}
          {chatOpen && selected !== null && (
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.08] flex items-center justify-between">
                <div>
                  <span className="text-white font-bold text-sm">â¦ Ð ÐµÐ´Ð°Ð³ÑÐ²Ð°Ð½Ð½Ñ: {variants[selected]?.label}</span>
                  <p className="text-white/35 text-xs mt-0.5">ÐÐ¿Ð¸ÑÐ¸ ÑÐ¾ Ð·Ð¼ÑÐ½Ð¸ÑÐ¸ â AI Ð¿ÐµÑÐµÐ³ÐµÐ½ÐµÑÑÑ</p>
                </div>
                <button onClick={() => setChatOpen(false)} className="text-white/30 hover:text-white/70 text-lg">Ã</button>
              </div>

              {/* Messages */}
              <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
                {messages.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-white/40 text-sm mb-3">Ð©Ð¾ Ð·Ð¼ÑÐ½Ð¸ÑÐ¸ Ð² ÑÑÐ¾Ð¼Ñ Ð²Ð°ÑÑÐ°Ð½ÑÑ?</p>
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
                  placeholder="Ð©Ð¾ Ð·Ð¼ÑÐ½Ð¸ÑÐ¸? (Enter â Ð½Ð°Ð´ÑÑÐ»Ð°ÑÐ¸)"
                  disabled={editing}
                  rows={2}
                  className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 resize-none focus:outline-none focus:border-gold/40 disabled:opacity-50"
                />
                <button
                  onClick={() => sendEdit(input)}
                  disabled={editing || !input.trim()}
                  className="bg-gold text-black font-bold px-4 py-2.5 rounded-xl text-sm disabled:opacity-40 flex-shrink-0"
                >
                  â
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
      />
    )}
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
      if (!res.ok) throw new Error(data.error || 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° AI');
      if (data.diff && Object.keys(data.diff).length > 0) {
        setCard(prev => prev ? { ...prev, ...data.diff } : prev);
        setLastChanged(data.changedFields ?? []);
      }
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: data.explanation ?? 'ÐÐ¾ÑÐ¾Ð²Ð¾', changed: data.changedFields },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ÐÐ¾Ð¼Ð¸Ð»ÐºÐ° ÑÐµÑÐ²ÐµÑÐ°';
      setMessages(prev => [...prev, { role: 'assistant', content: 'â ï¸ ' + msg }]);
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
      'ÐÐµÑÐµÐ²Ð°Ð³Ð¸:',
      ...(card.bullets as string[]).map(b => 'â¢ ' + b), '',
      'ÐÐ»ÑÑÐ¾Ð²Ñ ÑÐ»Ð¾Ð²Ð°: ' + (card.keywords as string[]).join(', '),
    ].join('\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  }

  function downloadCSV() {
    if (!card) return;
    const rows = [
      ['ÐÐ°Ð·Ð²Ð°', 'ÐÐ¿Ð¸Ñ', 'ÐÐµÑÐµÐ²Ð°Ð³Ð¸', 'ÐÐ»ÑÑÐ¾Ð²Ñ ÑÐ»Ð¾Ð²Ð°', 'ÐÐ»Ð°ÑÑÐ¾ÑÐ¼Ð°'],
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
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors">â ÐÐ°Ð±ÑÐ½ÐµÑ</Link>
        <div className="flex items-center gap-3">
          <span className="text-white/25 text-xs">{date}</span>
          <span className="text-xs bg-white/[0.08] text-white/40 px-2.5 py-1 rounded-full">{platform}</span>
        </div>
      </div>

      <div className={`grid gap-6 ${chatOpen ? 'lg:grid-cols-2' : 'max-w-3xl mx-auto'}`}>

        {/* ââ Card ââ */}
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
                â¦ AI ÑÐµÐ´Ð°Ð³ÑÐ²Ð°Ð½Ð½Ñ
              </button>
              <span className="text-white/40 text-xs">{card.title.length}/80</span>
              <button
                onClick={copyAll}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                  allCopied ? 'bg-green-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {allCopied ? 'â ÐÑÐµ ÑÐºÐ¾Ð¿ÑÐ¹Ð¾Ð²Ð°Ð½Ð¾!' : 'ð ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸ Ð²ÑÐµ'}
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
                  â¬ ÐÐ°Ð²Ð°Ð½ÑÐ°Ð¶Ð¸ÑÐ¸
                </button>
              </div>
            )}

            {/* Title */}
            <div className={`rounded-xl p-4 transition-colors ${lastChanged.includes('title') ? 'bg-yellow-50 ring-1 ring-yellow-200' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÐÐ°Ð³Ð¾Ð»Ð¾Ð²Ð¾Ðº</span>
                  <AIBadge show={lastChanged.includes('title')} />
                </div>
                <CopyBtn text={card.title} label="ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸" />
              </div>
              <h2 className="font-bold text-lg text-navy leading-tight">{card.title}</h2>
            </div>

            {/* Description */}
            <div className={`rounded-xl p-4 transition-colors ${lastChanged.includes('description') ? 'bg-yellow-50 ring-1 ring-yellow-200' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÐÐ¿Ð¸Ñ</span>
                  <AIBadge show={lastChanged.includes('description')} />
                </div>
                <CopyBtn text={card.description} label="ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸" />
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">{card.description}</p>
            </div>

            {/* Bullets */}
            {bullets.length > 0 && (
              <div className={`rounded-xl p-4 transition-colors ${lastChanged.includes('bullets') ? 'bg-yellow-50 ring-1 ring-yellow-200' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÐÐµÑÐµÐ²Ð°Ð³Ð¸</span>
                    <AIBadge show={lastChanged.includes('bullets')} />
                  </div>
                  <CopyBtn text={bullets.map(b => 'â¢ ' + b).join('\n')} label="ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸" />
                </div>
                <ul className="space-y-2">
                  {bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 border-b border-gray-100 pb-2 last:border-0">
                      <span className="text-navy font-bold mt-0.5 shrink-0">â</span>{b}
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
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÐÐ»ÑÑÐ¾Ð²Ñ ÑÐ»Ð¾Ð²Ð°</span>
                    <AIBadge show={lastChanged.includes('keywords')} />
                  </div>
                  <CopyBtn text={keywords.join(', ')} label="ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸" />
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
              {allCopied ? 'â Ð¡ÐºÐ¾Ð¿ÑÐ¹Ð¾Ð²Ð°Ð½Ð¾!' : 'ð ÐÐ¾Ð¿ÑÑÐ²Ð°ÑÐ¸ Ð²ÑÐµ'}
            </button>
            <button onClick={downloadCSV}
              className="bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
              â¬ ÐÐ°Ð²Ð°Ð½ÑÐ°Ð¶Ð¸ÑÐ¸ CSV
            </button>
            <Link href="/generate"
              className="border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2 text-center">
              â¦ ÐÐ¾Ð²Ð° ÐºÐ°ÑÑÐºÐ°
            </Link>
          </div>
        </div>

        {/* ââ Chat panel ââ */}
        {chatOpen && (
          <div className="flex flex-col bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden"
            style={{ height: '640px' }}>

            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
              <div>
                <p className="text-white text-sm font-bold">â¦ AI ÑÐµÐ´Ð°Ð³ÑÐ²Ð°Ð½Ð½Ñ</p>
                <p className="text-white/30 text-xs">Ð¡ÐºÐ°Ð¶Ð¸ ÑÐ¾ Ð·Ð¼ÑÐ½Ð¸ÑÐ¸ â AI Ð¾Ð½Ð¾Ð²Ð¸ÑÑ ÐºÐ°ÑÑÐºÑ</p>
              </div>
              <button onClick={() => setChatOpen(false)}
                className="text-white/30 hover:text-white text-xl leading-none transition-colors">â</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

              {messages.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">â¦</p>
                  <p className="text-white/50 text-sm mb-5">
                    Ð¯ Ð¼Ð¾Ð¶Ñ Ð·Ð¼ÑÐ½Ð¸ÑÐ¸ Ð±ÑÐ´Ñ-ÑÐºÑ ÑÐ°ÑÑÐ¸Ð½Ñ ÐºÐ°ÑÑÐºÐ¸.<br />
                    Ð¡Ð¿ÑÐ¾Ð±ÑÐ¹ Ð¾Ð´Ð½Ñ Ð· Ð¿ÑÐ´ÐºÐ°Ð·Ð¾Ðº:
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
                        ÐÐ¼ÑÐ½ÐµÐ½Ð¾: {m.changed.join(', ')}
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
                  placeholder="Ð©Ð¾ Ð·Ð¼ÑÐ½Ð¸ÑÐ¸? (Enter â Ð²ÑÐ´Ð¿ÑÐ°Ð²Ð¸ÑÐ¸)"
                  rows={2}
                  disabled={aiLoading}
                  className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-gold/40 resize-none disabled:opacity-50 transition-colors"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || aiLoading}
                  className="bg-gold text-black px-4 py-3 rounded-xl font-bold text-sm hover:bg-gold/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  â
                </button>
              </div>
              <p className="text-white/20 text-[10px] mt-1.5 text-center">
                Shift+Enter â Ð½Ð¾Ð²Ð¸Ð¹ ÑÑÐ´Ð¾Ðº Â· Ð·Ð¼ÑÐ½Ð¸ Ð·Ð±ÐµÑÑÐ³Ð°ÑÑÑÑÑ Ð°Ð²ÑÐ¾Ð¼Ð°ÑÐ¸ÑÐ½Ð¾
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ââ INFOGRAPHIC SECTION ââââââââââââââââââââââââââââââââââââââââââââ */}
      <InfographicSection
        card={card}
        accessToken={accessToken}
      />

    </div>
  );
}
