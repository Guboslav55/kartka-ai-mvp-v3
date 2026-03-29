'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const TEMPLATES = [
  { id: 'benefits', name: '✓ Переваги справа', desc: 'Товар зліва, список переваг справа' },
  { id: 'callout',  name: '◎ Стрілки на деталях', desc: 'Callout підписи на частинах товару' },
  { id: 'cta',      name: '💰 Ціна + Замовити', desc: 'Велика ціна і заклик до дії' },
];

const BG_STYLES = [
  { id: 'white',  label: '⬜ Білий',   bg: '#ffffff', text: '#1a1a1a', accent: '#1a3a5c', isDark: false },
  { id: 'dark',   label: '⚫ Темний',  bg: '#0a0a0a', text: '#ffffff', accent: '#c8a84b', isDark: true  },
  { id: 'navy',   label: '🌑 Синій',   bg: '#0a1020', text: '#ffffff', accent: '#4a9eff', isDark: true  },
  { id: 'gold',   label: '✨ Золотий', bg: '#100800', text: '#f5e6c8', accent: '#c8a84b', isDark: true  },
];

type Bg = typeof BG_STYLES[0];

export default function BannerPage() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const c1 = useRef<HTMLCanvasElement>(null);
  const c2 = useRef<HTMLCanvasElement>(null);

  const [photo, setPhoto] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [bullets, setBullets] = useState(['', '', '']);
  const [bgStyle, setBgStyle] = useState('white');
  const [t1, setT1] = useState('benefits');
  const [t2, setT2] = useState('callout');
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/auth');
    });
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  const getBg = () => BG_STYLES.find(b => b.id === bgStyle) || BG_STYLES[0];

  function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }

  function wt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, mw: number, lh: number) {
    const words = text.split(' '); let line='', cy=y;
    for (const w of words) {
      const t = line+w+' ';
      if (ctx.measureText(t).width > mw && line) { ctx.fillText(line.trim(),x,cy); line=w+' '; cy+=lh; }
      else line=t;
    }
    if (line.trim()) ctx.fillText(line.trim(),x,cy);
  }

  function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, bg: Bg) {
    ctx.fillStyle = bg.bg; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = bg.isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1;
    for (let i=0; i<H; i+=60) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(W,i); ctx.stroke(); }
  }

  function drawProduct(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, bg: Bg): Promise<void> {
    return new Promise(res => {
      if (photo) {
        const img = new Image();
        img.onload = () => {
          ctx.save();
          ctx.shadowColor = bg.isDark ? 'rgba(200,168,75,0.2)' : 'rgba(0,0,0,0.15)';
          ctx.shadowBlur = 48; ctx.shadowOffsetY = 16;
          ctx.drawImage(img, x-size/2, y-size/2, size, size);
          ctx.restore(); res();
        };
        img.src = photo;
      } else {
        ctx.save();
        ctx.fillStyle = bg.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        rr(ctx, x-size/2, y-size/2, size, size, 20); ctx.fill();
        ctx.fillStyle = bg.isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
        ctx.font = `${size*0.16}px Arial`; ctx.textAlign='center';
        ctx.fillText('📦', x, y+size*0.07);
        ctx.font = `${size*0.05}px sans-serif`;
        ctx.fillText('Фото товару', x, y+size*0.2);
        ctx.textAlign='left'; ctx.restore(); res();
      }
    });
  }

  async function drawBenefits(ctx: CanvasRenderingContext2D, W: number, H: number, bg: Bg) {
    drawBg(ctx,W,H,bg);
    await drawProduct(ctx, W*0.34, H*0.5, H*0.66, bg);
    const px=W*0.61, py=H*0.07, pw=W*0.36, ph=H*0.86;
    ctx.fillStyle = bg.isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.92)';
    rr(ctx,px,py,pw,ph,18); ctx.fill();
    ctx.fillStyle=bg.accent; rr(ctx,px,py,pw,5,3); ctx.fill();
    ctx.fillStyle=bg.accent; ctx.font=`bold ${W*0.019}px Unbounded`;
    wt(ctx, (productName||'НАЗВА ТОВАРУ').toUpperCase(), px+18, py+44, pw-28, W*0.023);
    ctx.fillStyle=bg.isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.08)';
    ctx.fillRect(px+18,py+72,pw-36,1);
    bullets.filter(b=>b.trim()).slice(0,3).forEach((b,i) => {
      const by=py+108+i*72;
      ctx.fillStyle=bg.accent; ctx.beginPath(); ctx.arc(px+30,by,12,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=bg.isDark?'#0a0a0a':'#fff'; ctx.font=`bold ${W*0.016}px Arial`; ctx.textAlign='center';
      ctx.fillText('✓',px+30,by+5); ctx.textAlign='left';
      ctx.fillStyle=bg.text; ctx.font=`500 ${W*0.018}px Golos Text`;
      wt(ctx, b.replace(/^[✓•]\s*/,''), px+50, by+5, pw-62, W*0.021);
      if (i<2) { ctx.fillStyle=bg.isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'; ctx.fillRect(px+18,by+28,pw-36,1); }
    });
    if (price) {
      const prY=py+ph-62;
      ctx.fillStyle=bg.isDark?'rgba(200,168,75,0.12)':'rgba(200,168,75,0.1)';
      rr(ctx,px+14,prY-30,pw-28,56,10); ctx.fill();
      ctx.fillStyle=bg.accent; ctx.font=`900 ${W*0.036}px Unbounded`;
      ctx.textAlign='center'; ctx.fillText(price,px+pw/2,prY+8); ctx.textAlign='left';
    }
  }

  async function drawCallout(ctx: CanvasRenderingContext2D, W: number, H: number, bg: Bg) {
    drawBg(ctx,W,H,bg);
    await drawProduct(ctx, W*0.5, H*0.48, H*0.66, bg);
    ctx.fillStyle=bg.isDark?'rgba(0,0,0,0.75)':'rgba(255,255,255,0.9)';
    rr(ctx,W*0.14,H*0.04,W*0.72,54,10); ctx.fill();
    ctx.fillStyle=bg.accent; ctx.font=`700 ${W*0.024}px Unbounded`;
    ctx.textAlign='center'; ctx.fillText(productName||'Назва товару',W/2,H*0.078); ctx.textAlign='left';
    const pts = [
      {x:W*0.26,y:H*0.28,dir:'left', text:bullets[0]||'Висока якість'},
      {x:W*0.74,y:H*0.36,dir:'right',text:bullets[1]||'Преміум матеріал'},
      {x:W*0.24,y:H*0.64,dir:'left', text:bullets[2]||'Надійна конструкція'},
    ].filter((_,i)=>bullets[i]?.trim()||i<2);
    pts.forEach(pt => {
      const isL=pt.dir==='left', ll=72;
      ctx.fillStyle=bg.accent; ctx.beginPath(); ctx.arc(pt.x,pt.y,9,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=bg.accent; ctx.globalAlpha=0.3; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(pt.x,pt.y,18,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=1; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(pt.x,pt.y); ctx.lineTo(isL?pt.x-ll:pt.x+ll,pt.y); ctx.stroke();
      const lw=196,lh=38,lx=isL?pt.x-ll-lw-2:pt.x+ll+2,ly=pt.y-lh/2;
      ctx.fillStyle=bg.isDark?'rgba(0,0,0,0.8)':'rgba(255,255,255,0.92)'; rr(ctx,lx,ly,lw,lh,8); ctx.fill();
      ctx.fillStyle=bg.accent; rr(ctx,lx,ly,4,lh,4); ctx.fill();
      ctx.fillStyle=bg.text; ctx.font=`500 ${W*0.016}px Golos Text`; ctx.textAlign='center';
      const txt=pt.text.replace(/^[✓•]\s*/,'');
      ctx.fillText(txt.length>24?txt.slice(0,24)+'…':txt,lx+lw/2,pt.y+5); ctx.textAlign='left';
    });
    if (price) {
      ctx.fillStyle=bg.isDark?'rgba(0,0,0,0.8)':'rgba(255,255,255,0.9)';
      rr(ctx,W*0.3,H*0.86,W*0.4,62,10); ctx.fill();
      ctx.fillStyle=bg.accent; ctx.font=`900 ${W*0.044}px Unbounded`;
      ctx.textAlign='center'; ctx.fillText(price,W/2,H*0.906); ctx.textAlign='left';
    }
  }

  async function drawCTA(ctx: CanvasRenderingContext2D, W: number, H: number, bg: Bg) {
    drawBg(ctx,W,H,bg);
    await drawProduct(ctx, W*0.3, H*0.45, H*0.56, bg);
    const rx=W*0.56;
    ctx.fillStyle=bg.text; ctx.font=`700 ${W*0.026}px Unbounded`;
    wt(ctx, productName||'Назва товару', rx, H*0.2, W*0.4, W*0.032);
    bullets.filter(b=>b.trim()).slice(0,3).forEach((b,i)=>{
      ctx.fillStyle=bg.accent; ctx.font=`bold ${W*0.018}px Arial`; ctx.fillText('✓',rx,H*0.35+i*40);
      ctx.fillStyle=bg.text; ctx.font=`${W*0.017}px Golos Text`;
      const bt=b.replace(/^[✓•]\s*/,''); ctx.fillText(bt.length>26?bt.slice(0,26)+'…':bt,rx+22,H*0.35+i*40);
    });
    if (price) {
      ctx.fillStyle=bg.isDark?'rgba(200,168,75,0.1)':'rgba(0,0,0,0.05)';
      rr(ctx,rx-8,H*0.56,W*0.41,86,12); ctx.fill();
      ctx.fillStyle=bg.accent; ctx.font=`900 ${W*0.065}px Unbounded`; ctx.fillText(price,rx,H*0.648);
    }
    ctx.fillStyle=bg.accent; rr(ctx,rx-8,H*0.72,W*0.41,68,14); ctx.fill();
    ctx.fillStyle=bg.isDark?'#0a0a0a':'#fff'; ctx.font=`700 ${W*0.022}px Unbounded`;
    ctx.textAlign='center'; ctx.fillText('ЗАМОВИТИ ЗАРАЗ',rx+W*0.205-8,H*0.763); ctx.textAlign='left';
    ctx.fillStyle=bg.isDark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)'; ctx.font=`${W*0.016}px Golos Text`;
    ctx.textAlign='center'; ctx.fillText('🚚 Доставка по всій Україні',rx+W*0.205-8,H*0.83); ctx.textAlign='left';
  }

  async function drawTemplate(canvas: HTMLCanvasElement, templateId: string) {
    const ctx = canvas.getContext('2d')!;
    canvas.width = 1024; canvas.height = 1024;
    const bg = getBg();
    if (templateId==='benefits') await drawBenefits(ctx,1024,1024,bg);
    if (templateId==='callout')  await drawCallout(ctx,1024,1024,bg);
    if (templateId==='cta')      await drawCTA(ctx,1024,1024,bg);
  }

  async function generate() {
    if (!productName.trim()) return;
    setLoading(true);
    await Promise.all([drawTemplate(c1.current!,t1), drawTemplate(c2.current!,t2)]);
    setGenerated(true); setLoading(false);
  }

  function dl(ref: React.RefObject<HTMLCanvasElement>, n: number) {
    const a = document.createElement('a');
    a.download = `banner-${n}.jpg`;
    a.href = ref.current!.toDataURL('image/jpeg', 0.95); a.click();
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <Link href="/dashboard" className="text-white/40 text-sm hover:text-white">← Кабінет</Link>
        <Link href="/generate" className="text-white/40 text-sm hover:text-white">Генератор тексту →</Link>
      </div>
      <h1 className="font-display font-black text-2xl sm:text-3xl mb-2 tracking-tight">🖼️ Банер товару</h1>
      <p className="text-white/40 text-sm mb-8">Два готових банери для Prom.ua та Rozetka — одним кліком</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* FORM */}
        <div className="space-y-4">
          {/* Upload */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Фото товару</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <div onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${photo?'border-gold/40 bg-gold/5':'border-white/10 hover:border-white/25'}`}>
              {photo ? (
                <div className="flex items-center gap-3">
                  <img src={photo} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />
                  <div className="text-left">
                    <p className="text-white text-sm font-semibold truncate">{photoName}</p>
                    <p className="text-gold text-xs mt-0.5">✓ Фото завантажено</p>
                    <button onClick={e=>{e.stopPropagation();setPhoto(null);setPhotoName('');}} className="text-white/30 text-xs hover:text-red-400 mt-1">видалити ×</button>
                  </div>
                </div>
              ) : (
                <div><div className="text-3xl mb-2">📸</div><p className="text-white/50 text-sm">Натисни щоб завантажити фото</p></div>
              )}
            </div>
          </div>

          {/* Product data */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-2.5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest">Дані товару</label>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors" placeholder="Назва товару *" value={productName} onChange={e=>setProductName(e.target.value)} />
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors" placeholder="Ціна (наприклад: 2 499 ₴)" value={price} onChange={e=>setPrice(e.target.value)} />
            {bullets.map((b,i)=>(
              <input key={i} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-gold transition-colors" placeholder={`Перевага ${i+1}`} value={b} onChange={e=>{const nb=[...bullets];nb[i]=e.target.value;setBullets(nb);}} />
            ))}
          </div>

          {/* BG */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Стиль фону</label>
            <div className="grid grid-cols-2 gap-2">
              {BG_STYLES.map(s=>(
                <button key={s.id} onClick={()=>setBgStyle(s.id)} className={`p-3 rounded-xl border text-sm font-medium transition-all ${bgStyle===s.id?'border-gold bg-gold/10 text-gold':'border-white/10 text-white/50 hover:border-white/25'}`}>{s.label}</button>
              ))}
            </div>
          </div>

          {/* Templates */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">
            <label className="block text-gold text-xs font-bold uppercase tracking-widest mb-3">Шаблони</label>
            {[{label:'Банер 1',val:t1,set:setT1},{label:'Банер 2',val:t2,set:setT2}].map(({label,val,set})=>(
              <div key={label} className="mb-3">
                <p className="text-white/40 text-xs mb-1.5">{label}:</p>
                <div className="space-y-1.5">
                  {TEMPLATES.map(tmpl=>(
                    <button key={tmpl.id} onClick={()=>set(tmpl.id)} className={`w-full p-2.5 rounded-lg border text-left transition-all ${val===tmpl.id?'border-gold bg-gold/10':'border-white/8 hover:border-white/20'}`}>
                      <span className="text-sm font-semibold text-white">{tmpl.name}</span>
                      <span className="block text-xs text-white/35 mt-0.5">{tmpl.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button onClick={generate} disabled={loading||!productName.trim()}
            className="w-full bg-gradient-to-r from-gold to-gold-light text-black font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
            {loading?<><span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"/>Генерую...</>:'✦ Згенерувати 2 банери'}
          </button>
        </div>

        {/* PREVIEW */}
        <div className="space-y-4">
          {[{ref:c1,n:1,t:t1},{ref:c2,n:2,t:t2}].map(({ref,n,t})=>(
            <div key={n} className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
                <div>
                  <span className="text-gold text-xs font-bold uppercase tracking-wider">Банер {n}</span>
                  <span className="text-white/30 text-xs ml-2">{TEMPLATES.find(tmpl=>tmpl.id===t)?.name}</span>
                </div>
                {generated&&<button onClick={()=>dl(ref,n)} className="bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600">⬇ JPG</button>}
              </div>
              <div className="relative bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#141414_0%_50%)] bg-[length:24px_24px]">
                {!generated&&<div className="absolute inset-0 flex items-center justify-center flex-col gap-2 text-white/20"><span className="text-3xl">🖼️</span><span className="text-sm">Банер {n}</span></div>}
                <canvas ref={ref} className="w-full" style={{opacity:generated?1:0.08}} />
              </div>
            </div>
          ))}
          {generated&&(
            <button onClick={()=>{dl(c1,1);setTimeout(()=>dl(c2,2),300);}}
              className="w-full bg-green-700 text-white py-3.5 rounded-xl font-bold hover:bg-green-600 flex items-center justify-center gap-2">
              ⬇ Завантажити обидва банери
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

