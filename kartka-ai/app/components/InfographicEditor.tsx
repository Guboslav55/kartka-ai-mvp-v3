'use client';
import { useEffect, useRef, useState } from 'react';

interface TextBlock {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  bold: boolean;
  type: 'title' | 'bullet' | 'custom';
}

interface Props {
  backgroundUrl: string;
  productName: string;
  bullets: string[];
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

export default function InfographicEditor({ backgroundUrl, productName, bullets, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  const SIZE = 580;
  const SCALE = 1024 / SIZE;

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setBgImage(img);
    img.src = backgroundUrl;
  }, [backgroundUrl]);

  useEffect(() => {
    setBlocks([
      { id: 'title', text: productName.slice(0, 50), x: SIZE/2, y: 52, fontSize: 34, color: '#ffffff', bold: true, type: 'title' },
      ...bullets.slice(0, 4).map((b, i) => ({
        id: `b${i}`, text: '\u2713 ' + b.slice(0, 38), x: 16, y: SIZE - 150 + i * 36,
        fontSize: 20, color: '#ffffff', bold: false, type: 'bullet' as const,
      })),
    ]);
  }, [productName, bullets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(bgImage, 0, 0, SIZE, SIZE);
    blocks.forEach(b => {
      ctx.font = `${b.bold ? 'bold ' : ''}${b.fontSize}px Arial`;
      ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 7;
      ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
      ctx.fillStyle = b.color;
      ctx.textAlign = b.type === 'title' ? 'center' : 'left';
      ctx.fillText(b.text, b.x, b.y);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      if (selected === b.id) {
        const m = ctx.measureText(b.text);
        const bx = b.type === 'title' ? b.x - m.width/2 - 4 : b.x - 4;
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 2;
        ctx.strokeRect(bx, b.y - b.fontSize, m.width + 8, b.fontSize + 8);
      }
    });
  }, [bgImage, blocks, selected]);

  function hitTest(x: number, y: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d')!;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      ctx.font = `${b.bold ? 'bold ' : ''}${b.fontSize}px Arial`;
      const w = ctx.measureText(b.text).width;
      const bx = b.type === 'title' ? b.x - w/2 : b.x;
      if (x >= bx-4 && x <= bx+w+4 && y >= b.y-b.fontSize-4 && y <= b.y+8) return b.id;
    }
    return null;
  }

  function onDown(e: React.MouseEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const id = hitTest(x, y);
    setSelected(id);
    if (id) { const bl = blocks.find(b => b.id === id)!; setDragging({ id, offsetX: x - bl.x, offsetY: y - bl.y }); }
  }
  function onMove(e: React.MouseEvent) {
    if (!dragging) return;
    const r = canvasRef.current!.getBoundingClientRect();
    setBlocks(prev => prev.map(b => b.id === dragging.id ? { ...b, x: e.clientX-r.left-dragging.offsetX, y: e.clientY-r.top-dragging.offsetY } : b));
  }
  function onUp() { setDragging(null); }

  function upd(u: Partial<TextBlock>) { if (selected) setBlocks(p => p.map(b => b.id === selected ? {...b,...u} : b)); }

  function save() {
    const fc = document.createElement('canvas');
    fc.width = 1024; fc.height = 1024;
    const ctx = fc.getContext('2d')!;
    ctx.drawImage(bgImage!, 0, 0, 1024, 1024);
    blocks.forEach(b => {
      ctx.font = `${b.bold ? 'bold ' : ''}${b.fontSize * SCALE}px Arial`;
      ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
      ctx.fillStyle = b.color;
      ctx.textAlign = b.type === 'title' ? 'center' : 'left';
      ctx.fillText(b.text, b.x * SCALE, b.y * SCALE);
      ctx.shadowColor = 'transparent';
    });
    onSave(fc.toDataURL('image/jpeg', 0.92));
  }

  const sel = blocks.find(b => b.id === selected);

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-3">
      <div className="bg-[#0f0f0f] rounded-2xl overflow-hidden flex w-full max-w-5xl" style={{maxHeight:'95vh'}}>
        <div className="flex-1 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold">✏️ Редактор інфографіки</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white text-xl">✕</button>
          </div>
          <canvas ref={canvasRef} width={SIZE} height={SIZE}
            className="rounded-xl cursor-move w-full flex-1"
            style={{objectFit:'contain'}}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          />
          <p className="text-white/25 text-xs mt-2 text-center">Клікни на текст · Тягни щоб перемістити</p>
        </div>

        <div className="w-64 bg-white/[0.03] border-l border-white/10 p-4 flex flex-col gap-3 overflow-y-auto">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Блоки</p>
            {blocks.map(b => (
              <button key={b.id} onClick={() => setSelected(b.id)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs truncate mb-1 transition-colors ${selected===b.id ? 'bg-gold text-black font-bold' : 'bg-white/[0.06] text-white/60 hover:bg-white/10'}`}>
                {b.text.slice(0,30)}
              </button>
            ))}
            <button onClick={() => { const id='c'+Date.now(); setBlocks(p=>[...p,{id,text:'Новий текст',x:SIZE/2,y:SIZE/2,fontSize:26,color:'#ffffff',bold:false,type:'custom'}]); setSelected(id); }}
              className="w-full py-1.5 border border-white/15 text-white/40 hover:border-gold/50 hover:text-gold rounded-lg text-xs mt-1 transition-colors">
              + Додати текст
            </button>
          </div>

          {sel && (
            <div className="space-y-3 border-t border-white/10 pt-3">
              <p className="text-white/40 text-xs uppercase tracking-wider">Редагування</p>
              <textarea value={sel.text} onChange={e=>upd({text:e.target.value})}
                className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs resize-none focus:outline-none focus:border-gold/40" rows={2}/>
              <div>
                <p className="text-white/35 text-xs mb-1">Розмір: {sel.fontSize}px</p>
                <input type="range" min={10} max={72} value={sel.fontSize}
                  onChange={e=>upd({fontSize:+e.target.value})} className="w-full accent-yellow-400"/>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="color" value={sel.color} onChange={e=>upd({color:e.target.value})} className="w-7 h-7 rounded cursor-pointer"/>
                {['#ffffff','#000000','#FFD700','#FF5722','#29B6F6'].map(c=>(
                  <button key={c} onClick={()=>upd({color:c})} className="w-6 h-6 rounded-full border border-white/20 hover:scale-110 transition-transform" style={{background:c}}/>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={sel.bold} onChange={e=>upd({bold:e.target.checked})} className="accent-yellow-400"/>
                <span className="text-white/50 text-xs">Жирний</span>
              </label>
              {sel.type==='custom' && (
                <button onClick={()=>{setBlocks(p=>p.filter(b=>b.id!==selected));setSelected(null);}}
                  className="w-full py-1.5 bg-red-500/15 border border-red-500/25 text-red-400 rounded-lg text-xs hover:bg-red-500/25 transition-colors">
                  🗑 Видалити
                </button>
              )}
            </div>
          )}

          <div className="mt-auto space-y-2 pt-3 border-t border-white/10">
            <button onClick={save} className="w-full py-2.5 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl text-sm transition-colors">
              ⬇ Зберегти
            </button>
            <button onClick={onClose} className="w-full py-2 border border-white/15 text-white/40 hover:border-white/30 rounded-xl text-sm transition-colors">
              Закрити
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}