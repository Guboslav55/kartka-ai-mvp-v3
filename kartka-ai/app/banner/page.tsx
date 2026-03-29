'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';
 
const TEMPLATES = [
  { id: 'benefits', name: '✓ Переваги справа', desc: 'Товар зліва + панель переваг' },
  { id: 'callout',  name: '◎ Callout стрілки', desc: 'Підписи навколо товару' },
  { id: 'cta',      name: '💰 Ціна + CTA',     desc: 'Велика ціна + замовити' },
];
 
const BG_STYLES = [
  { id: 'dark',  label: '⚫ Темний',  bg1: '#0d0d0d', bg2: '#1a1a1a', accent: '#c8a84b', text: '#ffffff', sub: '#aaaaaa', panel: 'rgba(0,0,0,0.82)',          isDark: true  },
  { id: 'white', label: '⬜ Білий',   bg1: '#f5f5f5', bg2: '#ffffff', accent: '#1a3a5c', text: '#1a1a1a', sub: '#555555', panel: 'rgba(255,255,255,0.92)',     isDark: false },
  { id: 'navy',  label: '🌑 Синій',   bg1: '#060e1a', bg2: '#0d1b2a', accent: '#4a9eff', text: '#ffffff', sub: '#8899bb', panel: 'rgba(6,14,26,0.88)',         isDark: true  },
  { id: 'gold',  label: '✨ Золотий', bg1: '#0d0800', bg2: '#1a1000', accent: '#c8a84b', text: '#f5e6c8', sub: '#aa9966', panel: 'rgba(13,8,0,0.88)',          isDark: true  },
];
type BgStyle = typeof BG_STYLES[0];
 
export default function BannerPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
 
  const [photo, setPhoto] = useState<string|null>(null);
  const [noBgPhoto, setNoBgPhoto] = useState<string|null>(null);
  const [photoName, setPhotoName] = useState('');
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [bullets, setBullets] = useState(['','','']);
  const [bgStyle, setBgStyle] = useState('dark');
  const [template, setTemplate] = useState('benefits');
  const [keepBackground, setKeepBackground] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [finalUrl, setFinalUrl] = useState<string|null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState('');
  const [fontsReady, setFontsReady] = useState(false);
 
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/auth'); return; }
      setAccessToken(session.access_token);
    });
    loadFonts();
  }, []);
 
  async function loadFonts() {
    try {
      const [f1, f2] = await Promise.all([
        new FontFace('BannerFont', 'url(https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNjXhFVZNyBx2pqPIif.woff2)', { weight: '700' }).load(),
        new FontFace('BannerFont', 'url(https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNjXhFVZNyBx2pqPIif.woff2)', { weight: '900' }).load(),
      ]);
      (document.fonts as any).add(f1);
      (document.fonts as any).add(f2);
    } catch {}
    setFontsReady(true);
  }
 
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result as string;
      setPhoto(b64); setNoBgPhoto(null); setFinalUrl(null);
      if (bullets.every(b => !b.trim())) await analyzePhoto(b64);
    };
    reader.readAsDataURL(file);
  }
 
  async function analyzePhoto(base64?: string) {
    const src = base64 || photo; if (!src || !accessToken) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ imageBase64: src, productName, lang: 'uk' }),
      });
      const d = await res.json();
      if (d.bullets?.length) setBullets([d.bullets[0]||'', d.bullets[1]||'', d.bullets[2]||'']);
      if (!productName && d.productName) setProductName(d.productName);
    } catch {}
    setAnalyzing(false);
  }
 
  // ─── Canvas helpers ────────────────────────────────────────────────────────
 
  function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }
 
  function measureLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const t = line + w + ' ';
      if (ctx.measureText(t).width > maxW && line) { lines.push(line.trim()); line = w+' '; }
      else line = t;
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  }
 
  function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineH: number, maxLines = 3): number {
    lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
    return y + Math.min(lines.length, maxLines) * lineH;
  }
 
  function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, C: BgStyle) {
    const grad = ctx.createLinearGradient(0,0,W,H);
    grad.addColorStop(0, C.bg2); grad.addColorStop(1, C.bg1);
    ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);
    const glow = ctx.createRadialGradient(W*0.35, H*0.4, 0, W*0.35, H*0.4, W*0.55);
    glow.addColorStop(0, 'rgba(200,168,75,0.07)'); glow.addColorStop(1,'transparent');
    ctx.fillStyle = glow; ctx.fillRect(0,0,W,H);
  }
 
  function loadImg(src: string, x: number, y: number, size: number, C: BgStyle, ctx: CanvasRenderingContext2D): Promise<void> {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        ctx.save();
        ctx.shadowColor = C.isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 64; ctx.shadowOffsetY = 28;
        ctx.drawImage(img, x-size/2, y-size/2, size, size);
        ctx.restore(); res();
      };
      img.onerror = () => res();
      img.src = src;
    });
  }
 
  // ─── TEMPLATE: Benefits ────────────────────────────────────────────────────
  async function renderBenefits(ctx: CanvasRenderingContext2D, W: number, H: number, C: BgStyle, src: string|null) {
    drawBg(ctx,W,H,C);
    if (src) await loadImg(src, W*0.30, H*0.50, H*0.68, C, ctx);
 
    const px=516, py=44, pw=484, ph=936;
    ctx.fillStyle = C.panel; rr(ctx,px,py,pw,ph,20); ctx.fill();
    ctx.fillStyle = C.accent; rr(ctx,px,py,pw,5,3); ctx.fill();
 
    // Label
    ctx.fillStyle = C.accent;
    ctx.font = 'bold 13px BannerFont, Arial';
    ctx.fillText('ПЕРЕВАГИ', px+24, py+35);
 
    // Name
    ctx.fillStyle = C.text;
    ctx.font = 'bold 24px BannerFont, Arial Black, Arial';
    const nameLines = measureLines(ctx, productName||'Назва товару', pw-44);
    let curY = drawLines(ctx, nameLines, px+24, py+68, 32, 2);
 
    // Divider
    ctx.globalAlpha=0.35; ctx.strokeStyle=C.accent; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(px+20,curY+10); ctx.lineTo(px+pw-20,curY+10); ctx.stroke();
    ctx.globalAlpha=1;
 
    let bulletY = curY + 36;
    const validB = bullets.filter(b=>b.trim()).slice(0,3);
    validB.forEach((bull, i) => {
      // Circle check
      ctx.fillStyle=C.accent;
      ctx.beginPath(); ctx.arc(px+34, bulletY+2, 14, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = C.isDark?'#000':'#fff';
      ctx.font='bold 13px Arial'; ctx.textAlign='center';
      ctx.fillText('✓', px+34, bulletY+7); ctx.textAlign='left';
 
      ctx.fillStyle=C.text; ctx.font='500 17px BannerFont, Arial';
      const bLines = measureLines(ctx, bull.replace(/^[✓•]\s*/,''), pw-82);
      const endY = drawLines(ctx, bLines, px+58, bulletY, 22, 2);
      bulletY = endY + 18;
 
      if (i<validB.length-1) {
        ctx.globalAlpha=0.12; ctx.strokeStyle=C.text; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(px+20,bulletY); ctx.lineTo(px+pw-20,bulletY); ctx.stroke();
        ctx.globalAlpha=1; bulletY+=16;
      }
    });
 
    if (price) {
      const prY = py+ph-88;
      ctx.fillStyle=C.accent; ctx.globalAlpha=0.13;
      rr(ctx,px+16,prY-28,pw-32,68,12); ctx.fill(); ctx.globalAlpha=1;
      ctx.strokeStyle=C.accent; ctx.lineWidth=1.5;
      rr(ctx,px+16,prY-28,pw-32,68,12); ctx.stroke();
      ctx.fillStyle=C.accent; ctx.font='bold 36px BannerFont, Arial Black';
      ctx.textAlign='center'; ctx.fillText(`${price} ₴`, px+pw/2, prY+12); ctx.textAlign='left';
    }
  }
 
  // ─── TEMPLATE: Callout ─────────────────────────────────────────────────────
  async function renderCallout(ctx: CanvasRenderingContext2D, W: number, H: number, C: BgStyle, src: string|null) {
    drawBg(ctx,W,H,C);
    if (src) await loadImg(src, W*0.5, H*0.49, H*0.70, C, ctx);
 
    // Title bar
    ctx.fillStyle=C.panel; rr(ctx,W*0.12,H*0.04,W*0.76,56,28); ctx.fill();
    ctx.fillStyle=C.accent; ctx.font='bold 21px BannerFont, Arial Black';
    ctx.textAlign='center'; ctx.fillText(productName||'Назва товару', W/2, H*0.082); ctx.textAlign='left';
 
    const validB = bullets.filter(b=>b.trim());
    const pts = [
      {bx:28,  by:165, text: validB[0]||'Висока якість'},
      {bx:660, by:200, text: validB[1]||'Ергономічний дизайн'},
      {bx:638, by:628, text: validB[2]||'Надійна конструкція'},
    ].slice(0, Math.max(validB.length,2));
 
    pts.forEach(pt => {
      const lw=210;
      ctx.font='15px BannerFont, Arial';
      const lines = measureLines(ctx, pt.text.replace(/^[✓•]\s*/,''), lw-28);
      const lh=26, boxH=lines.length*lh+20;
 
      ctx.fillStyle=C.isDark?'rgba(0,0,0,0.86)':'rgba(255,255,255,0.93)';
      rr(ctx,pt.bx,pt.by,lw,boxH,10); ctx.fill();
      ctx.fillStyle=C.accent; rr(ctx,pt.bx,pt.by,4,boxH,2); ctx.fill();
      ctx.fillStyle=C.text;
      drawLines(ctx, lines, pt.bx+14, pt.by+20, lh, 3);
    });
 
    if (price) {
      ctx.fillStyle=C.panel; rr(ctx,W*0.3,H*0.87,W*0.4,66,12); ctx.fill();
      ctx.fillStyle=C.accent; ctx.font='bold 36px BannerFont, Arial Black';
      ctx.textAlign='center'; ctx.fillText(`${price} ₴`, W/2, H*0.916); ctx.textAlign='left';
    }
  }
 
  // ─── TEMPLATE: CTA ────────────────────────────────────────────────────────
  async function renderCTA(ctx: CanvasRenderingContext2D, W: number, H: number, C: BgStyle, src: string|null) {
    drawBg(ctx,W,H,C);
    if (src) await loadImg(src, W*0.22, H*0.48, H*0.58, C, ctx);
 
    const rx = 430;
    ctx.fillStyle=C.accent; ctx.font='700 13px BannerFont, Arial';
    ctx.fillText('НОВА КОЛЕКЦІЯ', rx, H*0.18);
 
    ctx.fillStyle=C.text; ctx.font='bold 27px BannerFont, Arial Black';
    const nameL = measureLines(ctx, productName||'Назва товару', W-rx-24);
    let ny = drawLines(ctx, nameL, rx, H*0.24, 34, 2);
 
    ny += 16;
    bullets.filter(b=>b.trim()).slice(0,3).forEach(bull => {
      ctx.fillStyle=C.accent; ctx.font='bold 16px Arial'; ctx.fillText('✓', rx, ny);
      ctx.fillStyle=C.sub; ctx.font='500 15px BannerFont, Arial';
      const bL = measureLines(ctx, bull.replace(/^[✓•]\s*/,''), W-rx-50);
      ny = drawLines(ctx, bL, rx+22, ny, 20, 2) + 10;
    });
 
    if (price) {
      ctx.fillStyle=C.accent; ctx.font='bold 50px BannerFont, Arial Black';
      ctx.fillText(`${price} ₴`, rx, H*0.63);
    }
 
    const btnY = price ? H*0.68 : H*0.58;
    ctx.fillStyle=C.accent; rr(ctx,rx,btnY,W-rx-30,68,14); ctx.fill();
    ctx.fillStyle=C.isDark?'#0a0a0a':'#fff'; ctx.font='bold 19px BannerFont, Arial Black';
    ctx.textAlign='center'; ctx.fillText('ЗАМОВИТИ ЗАРАЗ', rx+(W-rx-30)/2, btnY+41);
    ctx.fillStyle=C.sub; ctx.font='500 13px BannerFont, Arial';
    ctx.fillText('Доставка по всій Україні', rx+(W-rx-30)/2, btnY+68); ctx.textAlign='left';
  }
 
  // ─── Generate ──────────────────────────────────────────────────────────────
  async function generate() {
    const canvas = canvasRef.current;
    if (!canvas || (!productName.trim() && !photo)) return;
    setGenerating(true); setError(''); setFinalUrl(null);
    try {
      const W=1024, H=1024;
      canvas.width=W; canvas.height=H;
      const ctx = canvas.getContext('2d')!;
      const C = BG_STYLES.find(s=>s.id===bgStyle)||BG_STYLES[0];
 
      let productSrc = photo;
      if (photo && !keepBackground) {
        setStep('🔮 Видаляю фон...');
        try {
          const res = await fetch('/api/remove-bg', {
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':`Bearer ${accessToken}`},
            body:JSON.stringify({imageBase64:photo}),
          });
          if (res.ok) { const d=await res.json(); if(d.imageBase64){productSrc=d.imageBase64; setNoBgPhoto(d.imageBase64);} }
        } catch {}
      }
 
      setStep('🎨 Рендерю банер...');
      try { await (document as any).fonts.ready; } catch {}
 
      if (template==='benefits') await renderBenefits(ctx,W,H,C,productSrc);
      else if (template==='callout') await renderCallout(ctx,W,H,C,productSrc);
      else await renderCTA(ctx,W,H,C,productSrc);
 
      setFinalUrl(canvas.toDataURL('image/jpeg', 0.93));
    } catch(e:unknown) {
      setError(e instanceof Error ? e.message : 'Помилка. Спробуй ще раз.');
    }
    setGenerating(false); setStep('');
  }
 
  function download() {
    if (!finalUrl) return;
    const a = document.createElement('a');
    a.href = finalUrl;
    a.download = `banner-${(productName||'tovar').replace(/\s/g,'-').slice(0,40)}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
 
  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        <Link href="/generate" className="text-white/40 text-sm hover:text-white">Генератор тексту →</Link>
      </div>
      <h1 className="font-display font-black text-2xl sm:text-3xl mb-2 tracking-tight">🖼️ Банер товару</h1>
      <p className="text-white/40 text-sm mb-8">Фото товару не змінюється — AI генерує тільки дизайн</p>
 
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          {/* Upload */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Фото товару</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden"/>
            <div onClick={()=>fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${photo?'border-gold/40 bg-gold/5':'border-white/10 hover:border-white/25'}`}>
              {photo?(
                <div className="flex items-center gap-3">
                  <img src={photo} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0"/>
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold truncate">{photoName}</p>
                    {analyzing?<p className="text-gold text-xs flex items-center gap-1 mt-0.5"><span className="w-3 h-3 border border-gold border-t-transparent rounded-full animate-spin"/>AI аналізує...</p>:<p className="text-green-400 text-xs mt-0.5">✓ Готово</p>}
                    {noBgPhoto&&<p className="text-blue-400 text-xs">✓ Фон видалено</p>}
                    <button onClick={e=>{e.stopPropagation();setPhoto(null);setNoBgPhoto(null);setPhotoName('');setFinalUrl(null);}} className="text-white/25 text-xs hover:text-red-400 mt-1">видалити ×</button>
                  </div>
                </div>
              ):(
                <div><div className="text-3xl mb-2">📸</div><p className="text-white/50 text-sm">Завантажити фото товару</p><p className="text-white/25 text-xs mt-1">AI визначить переваги автоматично</p></div>
              )}
            </div>
            {photo&&(
              <label className="flex items-center gap-3 mt-3 cursor-pointer select-none">
                <button type="button" onClick={()=>setKeepBackground(v=>!v)}
                  className={`w-9 h-5 rounded-full transition-colors shrink-0 relative ${keepBackground?'bg-gold':'bg-white/15'}`}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{left:keepBackground?'17px':'2px'}}/>
                </button>
                <span className="text-white/50 text-xs">{keepBackground?'✓ Зберегти оригінальний фон':'Видалити фон (Remove.bg)'}</span>
              </label>
            )}
          </div>
 
          {/* Data */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-gold text-xs font-bold uppercase tracking-widest">Дані товару</label>
              {photo&&<button onClick={()=>analyzePhoto()} disabled={analyzing} className="text-xs text-gold/60 hover:text-gold border border-gold/20 hover:border-gold/40 px-3 py-1 rounded-lg disabled:opacity-40 flex items-center gap-1">{analyzing?<><span className="w-3 h-3 border border-gold/40 border-t-gold rounded-full animate-spin"/>Аналізую...</>:'🤖 Визначити з фото'}</button>}
            </div>
            <input value={productName} onChange={e=>setProductName(e.target.value)} placeholder="Назва товару *" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors"/>
            <input value={price} onChange={e=>setPrice(e.target.value)} placeholder="Ціна (наприклад: 2 499 ₴)" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors"/>
            <p className="text-white/25 text-xs">Переваги (або залиш — AI визначить):</p>
            {bullets.map((b,i)=>(
              <div key={i} className="relative">
                <input value={b} onChange={e=>{const nb=[...bullets];nb[i]=e.target.value;setBullets(nb);}} placeholder={`Перевага ${i+1}`} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors pr-8"/>
                {b&&<button onClick={()=>{const nb=[...bullets];nb[i]='';setBullets(nb);}} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">×</button>}
              </div>
            ))}
          </div>
 
          {/* Style */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Стиль фону</label>
            <div className="grid grid-cols-2 gap-2">
              {BG_STYLES.map(s=><button key={s.id} onClick={()=>setBgStyle(s.id)} className={`p-3 rounded-xl border text-sm font-medium transition-all ${bgStyle===s.id?'border-gold bg-gold/10 text-gold':'border-white/10 text-white/50 hover:border-white/25'}`}>{s.label}</button>)}
            </div>
          </div>
 
          {/* Template */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Шаблон</label>
            <div className="space-y-2">
              {TEMPLATES.map(t=><button key={t.id} onClick={()=>setTemplate(t.id)} className={`w-full p-3 rounded-xl border text-left transition-all ${template===t.id?'border-gold bg-gold/10':'border-white/8 hover:border-white/20'}`}><span className="text-sm font-semibold text-white">{t.name}</span><span className="block text-xs text-white/35 mt-0.5">{t.desc}</span></button>)}
            </div>
          </div>
 
          {error&&<div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">⚠️ {error}</div>}
 
          <button onClick={generate} disabled={generating||(!productName.trim()&&!photo)}
            className="w-full bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 text-base">
            {generating?<><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"/>{step||'Генерую...'}</>:'✦ Згенерувати банер'}
          </button>
          <p className="text-white/20 text-xs text-center">~3-5 сек · Шрифт: {fontsReady?'✓ завантажено':'завантажується...'}</p>
        </div>
 
        {/* Result */}
        <div>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden sticky top-6">
            <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
              <span className="text-gold text-xs font-bold uppercase tracking-wider">Результат</span>
              {finalUrl&&<button onClick={download} className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600">⬇ Завантажити JPG</button>}
            </div>
            <div className="relative bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#141414_0%_50%)] bg-[length:24px_24px]" style={{minHeight:'360px'}}>
              {generating&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10"><div className="w-12 h-12 border-[3px] border-gold/20 border-t-gold rounded-full animate-spin"/><p className="text-white/60 text-sm">{step}</p></div>}
              {!generating&&!finalUrl&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/20"><span className="text-5xl">🖼️</span><span className="text-sm">Тут з'явиться банер</span></div>}
              {finalUrl&&<img src={finalUrl} alt="Banner" className="w-full block"/>}
            </div>
            {finalUrl&&(
              <div className="px-5 py-4 border-t border-white/8 flex gap-3">
                <button onClick={download} className="flex-1 bg-green-700 text-white py-3 rounded-xl font-bold hover:bg-green-600 text-sm flex items-center justify-center gap-2">⬇ Завантажити JPG</button>
                <button onClick={generate} className="flex-1 border border-white/15 text-white/60 py-3 rounded-xl font-semibold hover:border-gold hover:text-gold text-sm">↺ Перегенерувати</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden"/>
    </div>
  );
}
 
