'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
import type { CardResult, Platform, Tone, Lang } from '@/types';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'prom',    label: 'Prom.ua'   },
  { value: 'rozetka', label: 'Rozetka'   },
  { value: 'olx',     label: 'OLX'       },
  { value: 'general', label: 'ÃÂÃÂ°ÃÂ³ÃÂ°ÃÂ»ÃÂÃÂ½ÃÂ¸ÃÂ¹' },
];

// Ã¢ÂÂÃ¢ÂÂ Photo pipeline steps Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
type PhotoStep =
  | 'idle'
  | 'analyzing'   // GPT-4o analyze-product
  | 'cropping'    // sharp crop via crop-product
  | 'removing_bg' // remove.bg
  | 'done'
  | 'error';

const STEP_LABELS: Record<PhotoStep, string> = {
  idle:        '',
  analyzing:   'AI ÃÂ°ÃÂ½ÃÂ°ÃÂ»ÃÂÃÂ·ÃÂÃÂ ÃÂÃÂ¾ÃÂ²ÃÂ°ÃÂ...',
  cropping:    'ÃÂÃÂ±ÃÂÃÂÃÂ·ÃÂ°ÃÂ ÃÂ·ÃÂ¾ÃÂ±ÃÂÃÂ°ÃÂ¶ÃÂµÃÂ½ÃÂ½ÃÂ...',
  removing_bg: 'ÃÂÃÂ¸ÃÂ´ÃÂ°ÃÂ»ÃÂÃÂ ÃÂÃÂ¾ÃÂ½...',
  done:        'ÃÂ¤ÃÂ¾ÃÂÃÂ¾ ÃÂ³ÃÂ¾ÃÂÃÂ¾ÃÂ²ÃÂµ Ã¢ÂÂ',
  error:       'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° ÃÂ¾ÃÂ±ÃÂÃÂ¾ÃÂ±ÃÂºÃÂ¸',
};

// Ã¢ÂÂÃ¢ÂÂ Helpers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setOk(true);
    setTimeout(() => setOk(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all border ${
        ok
          ? 'bg-green-600 text-white border-green-600'
          : 'border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600'
      }`}
    >
      {ok ? 'Ã¢ÂÂ' : label}
    </button>
  );
}

function PhotoStepBadge({ step }: { step: PhotoStep }) {
  if (step === 'idle' || step === 'done') return null;
  const isError = step === 'error';
  return (
    <div
      className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full mt-2 ${
        isError
          ? 'bg-red-500/15 text-red-400'
          : 'bg-gold/10 text-gold'
      }`}
    >
      {!isError && (
        <span className="w-3 h-3 border border-gold border-t-transparent rounded-full animate-spin shrink-0" />
      )}
      {STEP_LABELS[step]}
    </div>
  );
}

// Ã¢ÂÂÃ¢ÂÂ Main component Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
export default function GeneratePage() {
  const router    = useRouter();
  const supabase  = createClient();
  const fileRef   = useRef<HTMLInputElement>(null);

  const [ready,       setReady]       = useState(false);
  const [cardsLeft,   setCardsLeft]   = useState(0);
  const [accessToken, setAccessToken] = useState('');

  // Form fields
  const [productName, setProductName] = useState('');
  const [category,    setCategory]    = useState('');
  const [features,    setFeatures]    = useState('');
  const [platform,    setPlatform]    = useState<Platform>('prom');
  const [tone,        setTone]        = useState<Tone>('professional');
  const [lang,        setLang]        = useState<Lang>('uk');
  const [genImage,    setGenImage]    = useState(true);

  // Photo pipeline state
  const [photoStep,        setPhotoStep]        = useState<PhotoStep>('idle');
  const [photoError,       setPhotoError]       = useState('');
  const [originalPhoto,    setOriginalPhoto]    = useState<string | null>(null); // raw base64 from user
  const [processedPhoto,   setProcessedPhoto]   = useState<string | null>(null); // after crop + remove-bg
  const [uploadedPhotoName, setUploadedPhotoName] = useState('');
  const [analyzeData,      setAnalyzeData]      = useState<Record<string, unknown> | null>(null);

  // Generation state
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<CardResult | null>(null);
  const [error,      setError]      = useState('');
  const [allCopied,  setAllCopied]  = useState(false);
  const [cardId,     setCardId]     = useState<string|null>(null);
  const [editOpen,   setEditOpen]   = useState(false);
  const [editMsgs,   setEditMsgs]   = useState<{role:'user'|'assistant';content:string;changedFields?:string[]}[]>([]);
  const [editInput,  setEditInput]  = useState('');
  const [editLoading,setEditLoading]= useState(false);
  const editEndRef = useRef<HTMLDivElement>(null);
  const [lastChanged, setLastChanged] = useState<string[]>([]);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
      supabase
        .from('users')
        .select('cards_left')
        .eq('id', session.user.id)
        .single()
        .then(({ data }) => {
          if (data) setCardsLeft(data.cards_left);
          setReady(true);
        });
    });
  }, []);

  // Ã¢ÂÂÃ¢ÂÂ Photo pipeline Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  async function runPhotoPipeline(base64: string) {
    setPhotoError('');
    setProcessedPhoto(null);
    setAnalyzeData(null);

    try {
      // Step 1 Ã¢ÂÂ analyze: GPT-4o returns bbox + category + bullets
      setPhotoStep('analyzing');
      const analyzeRes = await fetch('/api/analyze-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: base64, lang }),
      });
      const analyzed = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzed.error || 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° ÃÂ°ÃÂ½ÃÂ°ÃÂ»ÃÂÃÂ·ÃÂ ÃÂÃÂ¾ÃÂÃÂ¾');

      // Auto-fill form fields from AI analysis
      if (analyzed.productName && !productName) setProductName(analyzed.productName);
      if (analyzed.category)                    setCategory(analyzed.category);
      if (analyzed.bullets?.length && !features)
        setFeatures(analyzed.bullets.slice(0, 3).join(', '));
      setAnalyzeData(analyzed);
        const shouldSkipProcessing = false; // Always remove bg




      if (shouldSkipProcessing) {
        // White/clean background Ã¢ÂÂ skip crop + remove-bg, use original
        setProcessedPhoto(base64);
        setPhotoStep('done');
        return;
      }

      // Step 2 Ã¢ÂÂ crop: sharp cuts out the product bbox
      setPhotoStep('cropping');
      const cropRes = await fetch('/api/crop-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: base64 }),
      });
      const cropData = await cropRes.json();
      if (!cropRes.ok) throw new Error(cropData.error || 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° ÃÂ¾ÃÂ±ÃÂÃÂÃÂ·ÃÂºÃÂ¸');
      const cropped = cropData.croppedBase64 as string;

      // Step 3 Ã¢ÂÂ remove background via Remove.bg
      setPhotoStep('removing_bg');
      const bgRes = await fetch('/api/remove-bg', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({ imageBase64: cropped }),
      });
      const bgData = await bgRes.json();

      if (!bgRes.ok) {
        // Remove.bg failed Ã¢ÂÂ fallback to cropped without bg removal, don't block user
        console.warn('Remove.bg failed, using cropped:', bgData.error);
        setProcessedPhoto(cropped);
      } else {
        setProcessedPhoto(bgData.imageBase64 as string);
      }

      setPhotoStep('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° ÃÂ¾ÃÂ±ÃÂÃÂ¾ÃÂ±ÃÂºÃÂ¸ ÃÂÃÂ¾ÃÂÃÂ¾';
      setPhotoError(msg);
      setPhotoStep('error');
      // Don't block Ã¢ÂÂ user can still generate with original photo
      setProcessedPhoto(base64);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setOriginalPhoto(b64);
      runPhotoPipeline(b64);
    };
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setOriginalPhoto(null);
    setProcessedPhoto(null);
    setAnalyzeData(null);
    setPhotoStep('idle');
    setPhotoError('');
    setUploadedPhotoName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  // Ã¢ÂÂÃ¢ÂÂ Compress image for API (max 1024px, JPEG 85%) to avoid 413 / timeout Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  function compressForApi(base64: string): Promise<string> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        // White background for PNG with transparency (remove-bg output)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(base64); // fallback: send as-is
      img.src = base64;
    });
  }

  // Ã¢ÂÂÃ¢ÂÂ Generate card Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  const generate = useCallback(async () => {
    if (!productName.trim() || loading) return;
    if (cardsLeft <= 0) { setError('ÃÂÃÂÃÂ¼ÃÂÃÂ ÃÂ²ÃÂ¸ÃÂÃÂµÃÂÃÂ¿ÃÂ°ÃÂ½ÃÂ¾. ÃÂÃÂÃÂ´ÃÂ²ÃÂ¸ÃÂ ÃÂÃÂ°ÃÂÃÂ¸ÃÂ.'); return; }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Use processed photo (cropped + no-bg), compress to avoid 413 on Vercel
      const rawPhoto = processedPhoto ?? originalPhoto ?? null;
      const photoToSend = rawPhoto ? await compressForApi(rawPhoto) : null;

      const res = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body:    JSON.stringify({
          productName,
          category,
          features,
          platform,
          tone,
          lang,
          generateImage: genImage && !photoToSend,
          uploadedPhoto: photoToSend,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° ÃÂ³ÃÂµÃÂ½ÃÂµÃÂÃÂ°ÃÂÃÂÃÂ');
      setResult(data);
      setCardId(data.cardId ?? null);
      setEditMsgs([]);
      setEditOpen(false);
      setCardsLeft(c => Math.max(0, c - 1));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° ÃÂÃÂµÃÂÃÂ²ÃÂµÃÂÃÂ°. ÃÂ¡ÃÂ¿ÃÂÃÂ¾ÃÂ±ÃÂÃÂ¹ ÃÂÃÂµ ÃÂÃÂ°ÃÂ·.');
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, category, features, platform, tone, lang,
    genImage, processedPhoto, originalPhoto, cardsLeft, loading, accessToken]);

  async function sendEdit(text: string) {
    if (!text.trim() || !result || editLoading) return;
    setEditMsgs(prev => [...prev, { role: 'user' as const, content: text }]);
    setEditInput('');
    setEditLoading(true);
    setLastChanged([]);
    try {
      const res = await fetch('/api/edit-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ cardId, userMessage: text, card: { product_name: productName, platform, title: result.title, description: result.description, bullets: result.bullets, keywords: result.keywords }, history: editMsgs.slice(-6) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ° AI');
      if (data.diff && Object.keys(data.diff).length > 0) { setResult(prev => prev ? { ...prev, ...data.diff } : prev); setLastChanged(data.changedFields ?? []); }
      setEditMsgs(prev => [...prev, { role: 'assistant' as const, content: data.explanation ?? 'ÃÂÃÂ¾ÃÂÃÂ¾ÃÂ²ÃÂ¾', changedFields: data.changedFields }]);
    } catch (err: unknown) {
      setEditMsgs(prev => [...prev, { role: 'assistant' as const, content: 'Ã¢ÂÂ Ã¯Â¸Â ' + (err instanceof Error ? err.message : 'ÃÂÃÂ¾ÃÂ¼ÃÂ¸ÃÂ»ÃÂºÃÂ°') }]);
    }
    setEditLoading(false);
  }

  function copyAll() {
    if (!result) return;
    const text = [
      result.title, '',
      result.description, '',
      'ÃÂÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸:',
      ...result.bullets.map(b => 'Ã¢ÂÂ¢ ' + b), '',
      'ÃÂÃÂ»ÃÂÃÂÃÂ¾ÃÂ²ÃÂ ÃÂÃÂ»ÃÂ¾ÃÂ²ÃÂ°: ' + result.keywords.join(', '),
    ].join('\n');
    navigator.clipboard.writeText(text);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  }

  function downloadCSV() {
    if (!result) return;
    const rows = [
      ['ÃÂÃÂ°ÃÂ·ÃÂ²ÃÂ°', 'ÃÂÃÂ¿ÃÂ¸ÃÂ', 'ÃÂÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸', 'ÃÂÃÂ»ÃÂÃÂÃÂ¾ÃÂ²ÃÂ ÃÂÃÂ»ÃÂ¾ÃÂ²ÃÂ°', 'ÃÂÃÂ»ÃÂ°ÃÂÃÂÃÂ¾ÃÂÃÂ¼ÃÂ°', 'ÃÂÃÂ¾ÃÂ±ÃÂÃÂ°ÃÂ¶ÃÂµÃÂ½ÃÂ½ÃÂ'],
      [
        result.title,
        result.description,
        result.bullets.join(' | '),
        result.keywords.join(', '),
        platform,
        result.imageUrl || '',
      ],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `kartka-${Date.now()}.csv`,
    });
    a.click();
  }

  // Ã¢ÂÂÃ¢ÂÂ Render Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const noCards      = cardsLeft <= 0;
  const platformLabel = PLATFORMS.find(p => p.value === platform)?.label ?? platform;
  const pipelineActive = photoStep !== 'idle' && photoStep !== 'done' && photoStep !== 'error';

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-3">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white transition-colors shrink-0">
          Ã¢ÂÂ ÃÂÃÂ°ÃÂ±ÃÂÃÂ½ÃÂµÃÂ
        </Link>
        <span className={`text-sm font-bold ${noCards ? 'text-red-400' : 'text-gold'}`}>
          ÃÂÃÂ°ÃÂ»ÃÂ¸ÃÂÃÂ¾ÃÂº: {cardsLeft === 99999 ? 'Ã¢ÂÂ' : cardsLeft} ÃÂºÃÂ°ÃÂÃÂÃÂ¾ÃÂÃÂ¾ÃÂº
        </span>
      </div>

      <h1 className="font-display font-black text-2xl sm:text-3xl mb-6 tracking-tight">Ã¢ÂÂ¦ ÃÂÃÂµÃÂ½ÃÂµÃÂÃÂ°ÃÂÃÂ¾ÃÂ ÃÂºÃÂ°ÃÂÃÂÃÂºÃÂ¸</h1>

      {noCards && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-red-300 text-sm">ÃÂÃÂÃÂ¼ÃÂÃÂ ÃÂºÃÂ°ÃÂÃÂÃÂ¾ÃÂÃÂ¾ÃÂº ÃÂ²ÃÂ¸ÃÂÃÂµÃÂÃÂ¿ÃÂ°ÃÂ½ÃÂ¾.</p>
          <Link href="/pricing" className="bg-gold text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-gold-light transition-colors shrink-0">
            ÃÂÃÂÃÂ´ÃÂ²ÃÂ¸ÃÂÃÂ¸ÃÂÃÂ¸ Ã¢ÂÂ
          </Link>
        </div>
      )}

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 sm:p-7 mb-5">
        <div className="space-y-5">

          {/* Ã¢ÂÂÃ¢ÂÂ Photo upload Ã¢ÂÂÃ¢ÂÂ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              ÃÂ¤ÃÂ¾ÃÂÃÂ¾ ÃÂÃÂ¾ÃÂ²ÃÂ°ÃÂÃÂ{' '}
              <span className="text-white/30 font-normal normal-case tracking-normal">
                Ã¢ÂÂ AI ÃÂÃÂ¾ÃÂ·ÃÂ¿ÃÂÃÂ·ÃÂ½ÃÂ°ÃÂ, ÃÂ¾ÃÂ±ÃÂÃÂÃÂ¶ÃÂµ ÃÂÃÂ° ÃÂ²ÃÂ¸ÃÂ´ÃÂ°ÃÂ»ÃÂ¸ÃÂÃÂ ÃÂÃÂ¾ÃÂ½ ÃÂ°ÃÂ²ÃÂÃÂ¾ÃÂ¼ÃÂ°ÃÂÃÂ¸ÃÂÃÂ½ÃÂ¾
              </span>
            </label>

            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

            <div
              onClick={() => !originalPhoto && fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 transition-all ${
                originalPhoto
                  ? 'border-gold/50 bg-gold/5 cursor-default'
                  : 'border-white/10 hover:border-white/25 cursor-pointer'
              }`}
            >
              {originalPhoto ? (
                <div className="flex items-start gap-4">

                  {/* Left: original Ã¢ÂÂ processed preview */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Original */}
                    <div className="relative">
                      <img
                        src={originalPhoto}
                        alt="original"
                        className="w-16 h-16 object-cover rounded-lg opacity-40"
                      />
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-white/40 whitespace-nowrap">
                        ÃÂ¾ÃÂÃÂ¸ÃÂ³ÃÂÃÂ½ÃÂ°ÃÂ»
                      </span>
                    </div>

                    <span className="text-white/20 text-lg">Ã¢ÂÂ</span>

                    {/* Processed */}
                    <div className="relative">
                      {processedPhoto ? (
                        <>
                          <img
                            src={processedPhoto}
                            alt="processed"
                            className="w-16 h-16 object-contain rounded-lg bg-white/5"
                          />
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-gold whitespace-nowrap">
                            ÃÂ³ÃÂ¾ÃÂÃÂ¾ÃÂ²ÃÂµ
                          </span>
                        </>
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-white/5 flex items-center justify-center">
                          <span className="w-5 h-5 border-2 border-gold/50 border-t-gold rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: info + pipeline status */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{uploadedPhotoName}</p>

                    {/* Pipeline steps progress */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {(['analyzing', 'cropping', 'removing_bg'] as PhotoStep[]).map((s, i) => {
                        const steps: PhotoStep[] = ['analyzing', 'cropping', 'removing_bg'];
                        const currentIdx = steps.indexOf(photoStep);
                        const isDone  = photoStep === 'done' || currentIdx > i;
                        const isActive = photoStep === s;
                        return (
                          <div key={s} className="flex items-center gap-1.5">
                            <div
                              className={`w-2 h-2 rounded-full transition-all ${
                                isDone   ? 'bg-gold' :
                                isActive ? 'bg-gold/60 animate-pulse' :
                                           'bg-white/15'
                              }`}
                            />
                            {i < 2 && <div className="w-4 h-px bg-white/10" />}
                          </div>
                        );
                      })}
                    </div>

                    <PhotoStepBadge step={photoStep} />

                    {photoStep === 'done' && (
                      <p className="text-gold text-xs mt-2 font-medium">
                        Ã¢ÂÂ ÃÂ¤ÃÂ¾ÃÂ½ ÃÂ²ÃÂ¸ÃÂ´ÃÂ°ÃÂ»ÃÂµÃÂ½ÃÂ¾, ÃÂÃÂ¾ÃÂ²ÃÂ°ÃÂ ÃÂ³ÃÂ¾ÃÂÃÂ¾ÃÂ²ÃÂ¸ÃÂ¹ ÃÂ´ÃÂ¾ ÃÂ±ÃÂ°ÃÂ½ÃÂµÃÂÃÂ
                      </p>
                    )}

                    {/* Analyzed data preview */}
                    {analyzeData && photoStep === 'done' && (
                      <p className="text-white/40 text-xs mt-1 truncate">
                        AI ÃÂ²ÃÂ¸ÃÂ·ÃÂ½ÃÂ°ÃÂÃÂ¸ÃÂ²: {analyzeData.category as string}
                      </p>
                    )}

                    {photoError && (
                      <p className="text-red-400 text-xs mt-1">{photoError} Ã¢ÂÂ ÃÂ²ÃÂ¸ÃÂºÃÂ¾ÃÂÃÂ¸ÃÂÃÂÃÂ°ÃÂ ÃÂ¾ÃÂÃÂ¸ÃÂ³ÃÂÃÂ½ÃÂ°ÃÂ»</p>
                    )}

                    <button
                      onClick={e => { e.stopPropagation(); clearPhoto(); }}
                      className="text-white/30 text-xs hover:text-red-400 mt-2 transition-colors"
                    >
                      ÃÂÃÂ¸ÃÂ´ÃÂ°ÃÂ»ÃÂ¸ÃÂÃÂ¸ ÃÂÃÂ¾ÃÂÃÂ¾ ÃÂ
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-3xl mb-2">Ã°ÂÂÂ¸</div>
                  <p className="text-white/50 text-sm">ÃÂÃÂ°ÃÂÃÂ¸ÃÂÃÂ½ÃÂ¸ ÃÂÃÂ¾ÃÂ± ÃÂ·ÃÂ°ÃÂ²ÃÂ°ÃÂ½ÃÂÃÂ°ÃÂ¶ÃÂ¸ÃÂÃÂ¸ ÃÂÃÂ¾ÃÂÃÂ¾ ÃÂÃÂ¾ÃÂ²ÃÂ°ÃÂÃÂ</p>
                  <p className="text-white/25 text-xs mt-1">JPG, PNG ÃÂ´ÃÂ¾ 10 ÃÂÃÂ ÃÂ· AI ÃÂ¾ÃÂ±ÃÂÃÂÃÂ¶ÃÂµ ÃÂÃÂ° ÃÂ²ÃÂ¸ÃÂ´ÃÂ°ÃÂ»ÃÂ¸ÃÂÃÂ ÃÂÃÂ¾ÃÂ½</p>
                </div>
              )}
            </div>
          </div>

          {/* Ã¢ÂÂÃ¢ÂÂ Product name Ã¢ÂÂÃ¢ÂÂ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              ÃÂÃÂ°ÃÂ·ÃÂ²ÃÂ° ÃÂÃÂ¾ÃÂ²ÃÂ°ÃÂÃÂ *{' '}
              {analyzeData && (
                <span className="text-white/30 font-normal normal-case tracking-normal">
                  Ã¢ÂÂ ÃÂ·ÃÂ°ÃÂ¿ÃÂ¾ÃÂ²ÃÂ½ÃÂµÃÂ½ÃÂ¾ AI ÃÂ· ÃÂÃÂ¾ÃÂÃÂ¾
                </span>
              )}
            </label>
            <input
              value={productName}
              onChange={e => setProductName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="ÃÂ½ÃÂ°ÃÂ¿ÃÂÃÂ¸ÃÂºÃÂ»ÃÂ°ÃÂ´: ÃÂ¢ÃÂ°ÃÂºÃÂÃÂ¸ÃÂÃÂ½ÃÂ° ÃÂÃÂÃÂÃÂ±ÃÂ¾ÃÂ»ÃÂºÃÂ° selion veteran ÃÂÃÂ¾ÃÂÃÂ½ÃÂ°"
              disabled={noCards}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors disabled:opacity-40"
            />
          </div>

          {/* Ã¢ÂÂÃ¢ÂÂ Category + Lang Ã¢ÂÂÃ¢ÂÂ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">ÃÂÃÂ°ÃÂÃÂµÃÂ³ÃÂ¾ÃÂÃÂÃÂ</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40"
              >
                <option value="">Ã¢ÂÂ ÃÂ²ÃÂ¸ÃÂ±ÃÂµÃÂÃÂ¸ Ã¢ÂÂ</option>
                {[
                  'ÃÂÃÂ»ÃÂµÃÂºÃÂÃÂÃÂ¾ÃÂ½ÃÂÃÂºÃÂ°', 'ÃÂÃÂ´ÃÂÃÂ³ ÃÂÃÂ° ÃÂ²ÃÂ·ÃÂÃÂÃÂÃÂ', 'ÃÂ¢ÃÂ°ÃÂºÃÂÃÂ¸ÃÂÃÂ½ÃÂµ ÃÂÃÂ¿ÃÂ¾ÃÂÃÂÃÂ´ÃÂ¶ÃÂµÃÂ½ÃÂ½ÃÂ',
                  'ÃÂÃÂÃÂ¼ ÃÂÃÂ° ÃÂÃÂ°ÃÂ´', "ÃÂÃÂÃÂ°ÃÂÃÂ° ÃÂÃÂ° ÃÂ·ÃÂ´ÃÂ¾ÃÂÃÂ¾ÃÂ²'ÃÂ", 'ÃÂ¡ÃÂ¿ÃÂ¾ÃÂÃÂ ÃÂÃÂ° ÃÂÃÂ¾ÃÂ±ÃÂ',
                  'ÃÂÃÂ²ÃÂÃÂ¾ ÃÂÃÂ° ÃÂ¼ÃÂ¾ÃÂÃÂ¾', 'ÃÂÃÂ³ÃÂÃÂ°ÃÂÃÂºÃÂ¸', 'ÃÂÃÂ½ÃÂÃÂµ',
                ].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">ÃÂÃÂ¾ÃÂ²ÃÂ°</label>
              <select
                value={lang}
                onChange={e => setLang(e.target.value as Lang)}
                disabled={noCards}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors disabled:opacity-40"
              >
                <option value="uk">ÃÂ£ÃÂºÃÂÃÂ°ÃÂÃÂ½ÃÂÃÂÃÂºÃÂ°</option>
                <option value="ru">ÃÂ ÃÂ¾ÃÂÃÂÃÂ¹ÃÂÃÂÃÂºÃÂ°</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* Ã¢ÂÂÃ¢ÂÂ Features Ã¢ÂÂÃ¢ÂÂ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">
              ÃÂÃÂÃÂ¾ÃÂ±ÃÂ»ÃÂ¸ÃÂ²ÃÂ¾ÃÂÃÂÃÂ{' '}
              <span className="text-white/30 font-normal normal-case tracking-normal">(ÃÂ½ÃÂµÃÂ¾ÃÂ±ÃÂ¾ÃÂ²&apos;ÃÂÃÂ·ÃÂºÃÂ¾ÃÂ²ÃÂ¾)</span>
            </label>
            <textarea
              value={features}
              onChange={e => setFeatures(e.target.value)}
              rows={2}
              disabled={noCards}
              placeholder="ÃÂ½ÃÂ°ÃÂ¿ÃÂÃÂ¸ÃÂºÃÂ»ÃÂ°ÃÂ´: ÃÂÃÂ²ÃÂ¸ÃÂ´ÃÂºÃÂµ ÃÂ²ÃÂ¸ÃÂÃÂ¸ÃÂÃÂ°ÃÂ½ÃÂ½ÃÂ, ÃÂÃÂºÃÂÃÂÃÂ½ÃÂ¸ÃÂ¹ ÃÂ¿ÃÂÃÂ¸ÃÂ½ÃÂ TDF, ÃÂ¿ÃÂÃÂ´ÃÂÃÂ¾ÃÂ´ÃÂ¸ÃÂÃÂ ÃÂ´ÃÂ»ÃÂ ÃÂÃÂ»ÃÂÃÂ¶ÃÂ±ÃÂ¸"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-gold transition-colors resize-none disabled:opacity-40"
            />
          </div>

          {/* Ã¢ÂÂÃ¢ÂÂ Platform Ã¢ÂÂÃ¢ÂÂ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">ÃÂÃÂ»ÃÂ°ÃÂÃÂÃÂ¾ÃÂÃÂ¼ÃÂ°</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PLATFORMS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPlatform(p.value)}
                  disabled={noCards}
                  className={`shrink-0 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    platform === p.value
                      ? 'bg-gold/15 border-gold text-gold'
                      : 'border-white/10 text-white/50 hover:border-white/25'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ã¢ÂÂÃ¢ÂÂ Tone Ã¢ÂÂÃ¢ÂÂ */}
          <div>
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-2">ÃÂ¢ÃÂ¾ÃÂ½</label>
            <div className="flex flex-wrap gap-2">
              {([['professional', 'ÃÂÃÂÃÂ¾ÃÂÃÂµÃÂÃÂÃÂ¹ÃÂ½ÃÂ¸ÃÂ¹'], ['friendly', 'ÃÂÃÂÃÂÃÂ¶ÃÂ½ÃÂÃÂ¹'], ['premium', 'ÃÂÃÂÃÂµÃÂ¼ÃÂÃÂÃÂ¼'], ['simple', 'ÃÂÃÂÃÂ¾ÃÂÃÂÃÂ¸ÃÂ¹']] as const).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setTone(v as Tone)}
                  disabled={noCards}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    tone === v
                      ? 'bg-gold/15 border-gold text-gold'
                      : 'border-white/10 text-white/50 hover:border-white/25'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Ã¢ÂÂÃ¢ÂÂ DALL-E toggle Ã¢ÂÂ hide if photo uploaded Ã¢ÂÂÃ¢ÂÂ */}
          {!originalPhoto && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setGenImage(v => !v)}
                disabled={noCards}
                className={`w-10 h-6 rounded-full transition-colors shrink-0 relative ${genImage ? 'bg-gold' : 'bg-white/15'}`}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                  style={{ left: genImage ? '18px' : '2px' }}
                />
              </button>
              <span className="text-white/60 text-sm">ÃÂÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸ ÃÂ·ÃÂ¾ÃÂ±ÃÂÃÂ°ÃÂ¶ÃÂµÃÂ½ÃÂ½ÃÂ (DALL-E 3)</span>
            </label>
          )}
        </div>

        {/* Ã¢ÂÂÃ¢ÂÂ Generate button Ã¢ÂÂÃ¢ÂÂ */}
        <button
          onClick={generate}
          disabled={loading || noCards || !productName.trim() || pipelineActive}
          className="mt-6 w-full sm:w-auto bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 px-8 rounded-xl text-base hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ÃÂÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ...
            </>
          ) : pipelineActive ? (
            <>
              <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ÃÂÃÂ±ÃÂÃÂ¾ÃÂ±ÃÂ»ÃÂÃÂ ÃÂÃÂ¾ÃÂÃÂ¾...
            </>
          ) : (
            'Ã¢ÂÂ¦ ÃÂÃÂ³ÃÂµÃÂ½ÃÂµÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸ ÃÂºÃÂ°ÃÂÃÂÃÂºÃÂ'
          )}
        </button>
      </div>

      {/* Ã¢ÂÂÃ¢ÂÂ Error Ã¢ÂÂÃ¢ÂÂ */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-300 text-sm mb-5 flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          {error.includes('ÃÂÃÂ°ÃÂÃÂ¸ÃÂ') && (
            <Link href="/pricing" className="text-gold underline">ÃÂÃÂÃÂ´ÃÂ²ÃÂ¸ÃÂÃÂ¸ÃÂÃÂ¸ Ã¢ÂÂ</Link>
          )}
        </div>
      )}

      {/* Ã¢ÂÂÃ¢ÂÂ Loading skeleton Ã¢ÂÂÃ¢ÂÂ */}
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

      {/* Ã¢ÂÂÃ¢ÂÂ Result card Ã¢ÂÂÃ¢ÂÂ */}
      {result && !loading && (
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">

          {/* Header bar */}
          <div className="bg-navy px-5 py-3.5 flex items-center justify-between gap-2">
            <span className="bg-white/15 text-white text-xs font-bold px-3 py-1 rounded-full">{platformLabel}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditOpen(v => !v)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${editOpen ? 'bg-gold text-black' : 'bg-white/15 text-white hover:bg-white/25'}`}>
                {editOpen ? 'Ã¢ÂÂ ÃÂÃÂ°ÃÂºÃÂÃÂ¸ÃÂÃÂ¸' : 'Ã¢ÂÂ¦ AI ÃÂÃÂµÃÂ´ÃÂ°ÃÂ³ÃÂÃÂ²ÃÂ°ÃÂ½ÃÂ½ÃÂ'}
              </button>
              <span className="text-white/40 text-xs">{result.title.length}/80 ÃÂÃÂ¸ÃÂ¼ÃÂ².</span>
              <button
                onClick={copyAll}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all ${
                  allCopied ? 'bg-green-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'
                }`}
              >
                {allCopied ? 'Ã¢ÂÂ ÃÂ¡ÃÂºÃÂ¾ÃÂ¿ÃÂÃÂ¹ÃÂ¾ÃÂ²ÃÂ°ÃÂ½ÃÂ¾!' : 'Ã°ÂÂÂ ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸ ÃÂ²ÃÂÃÂµ'}
              </button>
            </div>
          </div>

          <div className="p-5 sm:p-7 space-y-5">

            {/* Product image Ã¢ÂÂ processed or generated */}
            {(processedPhoto || result.imageUrl) && (
              <div className="relative group">
                <img
                  src={processedPhoto ?? result.imageUrl}
                  alt={result.title}
                  className={`w-full rounded-xl object-contain ${
                    processedPhoto ? 'h-56 bg-gray-50' : 'h-48 sm:h-64 object-cover'
                  }`}
                />
                <a
                  href={processedPhoto ?? result.imageUrl}
                  download={`product-${Date.now()}.${processedPhoto ? 'png' : 'jpg'}`}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity font-semibold"
                >
                  Ã¢Â¬Â ÃÂÃÂ°ÃÂ²ÃÂ°ÃÂ½ÃÂÃÂ°ÃÂ¶ÃÂ¸ÃÂÃÂ¸
                </a>
              </div>
            )}

            {/* Title */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÃÂÃÂ°ÃÂ³ÃÂ¾ÃÂ»ÃÂ¾ÃÂ²ÃÂ¾ÃÂº</span>
                <CopyBtn text={result.title} label="ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸" />
              </div>
              <h2 className="font-display font-bold text-lg text-navy leading-tight">{result.title}</h2>
            </div>

            {/* Description */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÃÂÃÂ¿ÃÂ¸ÃÂ</span>
                <CopyBtn text={result.description} label="ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸" />
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">{result.description}</p>
            </div>

            {/* Bullets */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÃÂÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸</span>
                <CopyBtn text={result.bullets.map(b => 'Ã¢ÂÂ¢ ' + b).join('\n')} label="ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸" />
              </div>
              <ul className="space-y-2">
                {result.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-navy font-bold mt-0.5 shrink-0">Ã¢ÂÂ</span>{b}
                  </li>
                ))}
              </ul>
            </div>

            {/* Keywords */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">ÃÂÃÂ»ÃÂÃÂÃÂ¾ÃÂ²ÃÂ ÃÂÃÂ»ÃÂ¾ÃÂ²ÃÂ°</span>
                <CopyBtn text={result.keywords.join(', ')} label="ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸" />
              </div>
              <div className="flex flex-wrap gap-2">
                {result.keywords.map(k => (
                  <button
                    key={k}
                    onClick={() => navigator.clipboard.writeText(k)}
                    className="bg-blue-50 text-navy text-xs font-medium px-3 py-1 rounded-full hover:bg-blue-100 transition-colors cursor-copy"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 sm:px-7 pb-6 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={copyAll}
              className={`px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                allCopied ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'
              }`}
            >
              {allCopied ? 'Ã¢ÂÂ ÃÂÃÂÃÂµ ÃÂÃÂºÃÂ¾ÃÂ¿ÃÂÃÂ¹ÃÂ¾ÃÂ²ÃÂ°ÃÂ½ÃÂ¾!' : 'Ã°ÂÂÂ ÃÂÃÂ¾ÃÂ¿ÃÂÃÂÃÂ²ÃÂ°ÃÂÃÂ¸ ÃÂ²ÃÂÃÂµ'}
            </button>
            <button
              onClick={downloadCSV}
              className="bg-green-700 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              Ã¢Â¬Â ÃÂÃÂ°ÃÂ²ÃÂ°ÃÂ½ÃÂÃÂ°ÃÂ¶ÃÂ¸ÃÂÃÂ¸ CSV
            </button>
            <button
              onClick={generate}
              className="border border-gray-200 text-gray-500 px-4 py-3 rounded-xl text-sm font-semibold hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              Ã¢ÂÂº ÃÂÃÂ½ÃÂÃÂ¸ÃÂ¹ ÃÂ²ÃÂ°ÃÂÃÂÃÂ°ÃÂ½ÃÂ
            </button>
          </div>

          {/* AI Edit Panel */}
          {editOpen && (
            <div className="mx-5 sm:mx-7 mb-4 border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-navy/5 border-b border-gray-100">
                <p className="text-navy font-bold text-sm">Ã¢ÂÂ¦ AI ÃÂÃÂµÃÂ´ÃÂ°ÃÂ³ÃÂÃÂ²ÃÂ°ÃÂ½ÃÂ½ÃÂ ÃÂÃÂµÃÂºÃÂÃÂÃÂ</p>
                <p className="text-gray-400 text-xs mt-0.5">ÃÂ¡ÃÂºÃÂ°ÃÂ¶ÃÂ¸ ÃÂÃÂ¾ ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ÃÂÃÂ¸ Ã¢ÂÂ AI ÃÂ¾ÃÂ½ÃÂ¾ÃÂ²ÃÂ¸ÃÂÃÂ ÃÂºÃÂ°ÃÂÃÂÃÂºÃÂ</p>
              </div>
              <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
                {editMsgs.length === 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center py-2">
                    {['ÃÂÃÂÃÂ¾ÃÂ±ÃÂ¸ ÃÂ·ÃÂ°ÃÂ³ÃÂ¾ÃÂ»ÃÂ¾ÃÂ²ÃÂ¾ÃÂº ÃÂºÃÂ¾ÃÂÃÂ¾ÃÂÃÂÃÂ¸ÃÂ¼','ÃÂÃÂµÃÂÃÂµÃÂ¿ÃÂ¸ÃÂÃÂ¸ ÃÂ¾ÃÂ¿ÃÂ¸ÃÂ ÃÂ¿ÃÂÃÂ¾ÃÂ´ÃÂ°ÃÂÃÂÃÂ¸ÃÂ¼','ÃÂÃÂ¾ÃÂ´ÃÂ°ÃÂ¹ ÃÂÃÂ¸ÃÂÃÂÃÂ¸ ÃÂ² ÃÂ¿ÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸','ÃÂÃÂÃÂ¾ÃÂ±ÃÂ¸ ÃÂ±ÃÂÃÂ»ÃÂÃÂ ÃÂµÃÂ¼ÃÂ¾ÃÂÃÂÃÂ¹ÃÂ½ÃÂ¸ÃÂ¼'].map(s => (
                      <button key={s} onClick={() => sendEdit(s)} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-navy/40 hover:text-navy">{s}</button>
                    ))}
                  </div>
                )}
                {editMsgs.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-navy text-white' : 'bg-gray-50 text-gray-700 border border-gray-100'}`}>
                      {msg.content}
                      {msg.changedFields && msg.changedFields.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {msg.changedFields.map((f: string) => (
                            <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/20 text-navy/70">
                              {f === 'title' ? 'ÃÂ·ÃÂ°ÃÂ³ÃÂ¾ÃÂ»ÃÂ¾ÃÂ²ÃÂ¾ÃÂº' : f === 'description' ? 'ÃÂ¾ÃÂ¿ÃÂ¸ÃÂ' : f === 'bullets' ? 'ÃÂ¿ÃÂµÃÂÃÂµÃÂ²ÃÂ°ÃÂ³ÃÂ¸' : 'ÃÂºÃÂ»ÃÂÃÂ.ÃÂÃÂ»ÃÂ¾ÃÂ²ÃÂ°'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {editLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-navy/40 rounded-full animate-bounce" style={{animationDelay:'0ms'}} />
                        <span className="w-1.5 h-1.5 bg-navy/40 rounded-full animate-bounce" style={{animationDelay:'150ms'}} />
                        <span className="w-1.5 h-1.5 bg-navy/40 rounded-full animate-bounce" style={{animationDelay:'300ms'}} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={editEndRef} />
              </div>
              <div className="p-3 border-t border-gray-100 flex gap-2">
                <input type="text" value={editInput} onChange={e => setEditInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendEdit(editInput); }} placeholder="ÃÂ©ÃÂ¾ ÃÂ·ÃÂ¼ÃÂÃÂ½ÃÂ¸ÃÂÃÂ¸? (Enter)" disabled={editLoading} className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy/40 disabled:opacity-50" />
                <button onClick={() => sendEdit(editInput)} disabled={editLoading || !editInput.trim()} className="bg-navy text-white font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-40">Ã¢ÂÂ</button>
              </div>
            </div>
          )}

        {/* AI ÃÂÃÂ½ÃÂÃÂ¾ÃÂ³ÃÂÃÂ°ÃÂÃÂÃÂºÃÂ° Ã¢ÂÂ ÃÂ¿ÃÂ¾ÃÂÃÂ¸ÃÂ»ÃÂ°ÃÂ½ÃÂ½ÃÂ ÃÂ½ÃÂ° ÃÂºÃÂ°ÃÂÃÂÃÂºÃÂ */}
        {cardId && (
          <div className="mt-4 bg-white/[0.04] border border-white/10 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-sm">Ã°ÂÂÂ AI ÃÂÃÂ½ÃÂÃÂ¾ÃÂ³ÃÂÃÂ°ÃÂÃÂÃÂºÃÂ°</h3>
              <p className="text-white/35 text-xs mt-0.5">3 ÃÂ²ÃÂ°ÃÂÃÂÃÂ°ÃÂ½ÃÂÃÂ¸ ÃÂ· DALL-E 3 ÃÂ· 1024ÃÂ1024</p>
            </div>
            <a href={`/card/${cardId}`} className="bg-gold text-black font-bold px-4 py-2 rounded-xl text-sm hover:bg-gold/80 transition-colors">
              ÃÂÃÂÃÂ´ÃÂºÃÂÃÂ¸ÃÂÃÂ¸ ÃÂºÃÂ°ÃÂÃÂÃÂºÃÂ Ã¢ÂÂ
            </a>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
