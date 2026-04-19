'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface TextLayer {
  id: string; text: string; x: number; y: number;
  fontSize: number; fontWeight: 'normal'|'bold';
  color: string; bgColor: string; bgEnabled: boolean;
  align: 'left'|'center'|'right';
}
interface Props { imageUrl: string; onClose: () => void; onSave: (dataUrl: string) => void; }

function uid() { return Math.random().toString(36).slice(2,9); }
const PRESETS = [
  {label:'Назва',text:'Назва товару',x:512,y:940,fontSize:44,fontWeight:'bold' as const,color:'#ffffff',bgEnabled:true,bgColor:'#000000',align:'center' as const},
  {label:'Бейдж',text:'✓ Преміум',x:40,y:50,fontSize:18,fontWeight:'normal' as const,color:'#ffffff',bgEnabled:true,bgColor:'#c8a84b',align:'left' as const},
  {label:'Ціна',text:'₴ 999',x:984,y:940,fontSize:36,fontWeight:'bold' as const,color:'#c8a84b',bgEnabled:false,bgColor:'#000000',align:'right' as const},
  {label:'Характ.',text:'100% бавовна',x:40,y:400,fontSize:20,fontWeight:'normal' as const,color:'#ffffff',bgEnabled:true,bgColor:'#1a1a1a',align:'left' as const},
];

export default function InfographicEditor({imageUrl,onClose,onSave}:Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layers,setLayers] = useState<TextLayer[]>([]);
  const [selected,setSelected] = useState<string|null>(null);
  const [dragging,setDragging] = useState(false);
  const [dragOffset,setDragOffset] = useState({x:0,y:0});
  const [imgLoaded,setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement|null>(null);
  const [saving,setSaving] = useState(false);
  const sel = layers.find(l=>l.id===selected)??null;

  useEffect(()=>{
    const img=new window.Image(); img.crossOrigin='anonymous';
    img.onload=()=>{imgRef.current=img;setImgLoaded(true);};
    img.src=imageUrl;
  },[imageUrl]);

  function wrap(ctx:CanvasRenderingContext2D,text:string,maxW:number):string[]{
    const words=text.split(' '); const lines:string[]=[]; let cur='';
    for(const w of words){const c=cur?cur+' '+w:w; if(ctx.measureText(c).width>maxW){if(cur)lines.push(cur);cur=w;}else cur=c;}
    if(cur)lines.push(cur); return lines.length?lines:[''];
  }

  const render=useCallback(()=>{
    const canvas=canvasRef.current; const img=imgRef.current;
    if(!canvas||!img||!imgLoaded)return;
    const ctx=canvas.getContext('2d'); if(!ctx)return;
    canvas.width=1024; canvas.height=1024;
    ctx.drawImage(img,0,0,1024,1024);
    layers.forEach(l=>{
      ctx.save();
      ctx.font=`${l.fontWeight} ${l.fontSize}px Arial,sans-serif`;
      ctx.textAlign=l.align; ctx.textBaseline='top';
      const lines=wrap(ctx,l.text,480);
      const lh=l.fontSize*1.3;
      const tw=Math.max(...lines.map(ln=>ctx.measureText(ln).width));
      const th=lines.length*lh; const pad=10;
      let bx=l.x-pad;
      if(l.align==='center')bx=l.x-tw/2-pad;
      if(l.align==='right')bx=l.x-tw-pad;
      if(l.bgEnabled){
        ctx.fillStyle=l.bgColor+'dd';
        ctx.beginPath();
        (ctx as any).roundRect(bx,l.y-pad,tw+pad*2,th+pad*2,8);
        ctx.fill();
      }
      ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=4;
      ctx.fillStyle=l.color;
      lines.forEach((line,i)=>ctx.fillText(line,l.x,l.y+i*lh));
      if(l.id===selected){
        ctx.shadowBlur=0; ctx.strokeStyle='#c8a84b'; ctx.lineWidth=2;
        ctx.setLineDash([6,3]);
        ctx.strokeRect(bx,l.y-pad,tw+pad*2,th+pad*2);
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
  },[layers,selected,imgLoaded]);

  useEffect(()=>{render();},[render]);

  function coords(e:React.MouseEvent<HTMLCanvasElement>){
    const r=canvasRef.current!.getBoundingClientRect();
    return{x:(e.clientX-r.left)*(1024/r.width),y:(e.clientY-r.top)*(1024/r.height)};
  }

  function hit(x:number,y:number):string|null{
    const ctx=canvasRef.current?.getContext('2d'); if(!ctx)return null;
    for(let i=layers.length-1;i>=0;i--){
      const l=layers[i];
      ctx.font=`${l.fontWeight} ${l.fontSize}px Arial,sans-serif`;
      const lines=wrap(ctx,l.text,480);
      const tw=Math.max(...lines.map(ln=>ctx.measureText(ln).width));
      const th=lines.length*l.fontSize*1.3; const pad=14;
      let bx=l.x-pad;
      if(l.align==='center')bx=l.x-tw/2-pad;
      if(l.align==='right')bx=l.x-tw-pad;
      if(x>=bx&&x<=bx+tw+pad*2&&y>=l.y-pad&&y<=l.y+th+pad)return l.id;
    }
    return null;
  }

  function onMD(e:React.MouseEvent<HTMLCanvasElement>){
    const{x,y}=coords(e); const h=hit(x,y); setSelected(h);
    if(h){const l=layers.find(l=>l.id===h)!;setDragging(true);setDragOffset({x:x-l.x,y:y-l.y});}
  }
  function onMM(e:React.MouseEvent<HTMLCanvasElement>){
    if(!dragging||!selected)return;
    const{x,y}=coords(e);
    setLayers(p=>p.map(l=>l.id===selected?{...l,x:Math.round(x-dragOffset.x),y:Math.round(y-dragOffset.y)}:l));
  }
  function addLayer(){
    const l:TextLayer={id:uid(),text:'Новий текст',x:512,y:900,fontSize:40,fontWeight:'bold',color:'#ffffff',bgColor:'#000000',bgEnabled:true,align:'center'};
    setLayers(p=>[...p,l]); setSelected(l.id);
  }
  function upd(patch:Partial<TextLayer>){if(!selected)return;setLayers(p=>p.map(l=>l.id===selected?{...l,...patch}:l));}
  function del(id:string){setLayers(p=>p.filter(l=>l.id!==id));if(selected===id)setSelected(null);}

  return(
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-gold font-bold">✏️ Редактор інфографіки</span>
          <span className="text-white/30 text-xs hidden sm:block">Перетягуй текст мишкою</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded-xl text-sm text-white/50 border border-white/10 hover:border-white/20 transition-colors">✕ Закрити</button>
          <button onClick={async()=>{setSaving(true);onSave(canvasRef.current!.toDataURL('image/jpeg',0.92));setSaving(false);}} disabled={saving}
            className="px-5 py-1.5 rounded-xl text-sm font-bold bg-gold text-black hover:bg-amber-400 transition-colors disabled:opacity-50">
            {saving?'...':'↓ Зберегти'}
          </button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-4 bg-[#111]">
          <canvas ref={canvasRef} className="max-h-full max-w-full rounded-xl shadow-2xl cursor-crosshair" style={{aspectRatio:'1/1'}}
            onMouseDown={onMD} onMouseMove={onMM} onMouseUp={()=>setDragging(false)} onMouseLeave={()=>setDragging(false)}/>
        </div>
        <div className="w-64 border-l border-white/10 flex flex-col bg-[#0d0d0d]">
          <div className="p-3 border-b border-white/10">
            <p className="text-white/30 text-xs mb-2 uppercase tracking-wider">Додати шар</p>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {PRESETS.map(p=>(
                <button key={p.label} onClick={()=>{const l={id:uid(),...p};setLayers(pr=>[...pr,l]);setSelected(l.id);}}
                  className="px-2 py-1.5 rounded-lg text-xs text-white/60 border border-white/10 hover:border-gold/40 hover:text-gold/80 transition-colors text-left truncate">
                  + {p.label}
                </button>
              ))}
            </div>
            <button onClick={addLayer} className="w-full py-1.5 rounded-lg text-xs text-white/60 border border-white/10 hover:border-white/20 transition-colors">+ Свій текст</button>
          </div>
          <div className="p-3 border-b border-white/10">
            <p className="text-white/30 text-xs mb-1.5 uppercase tracking-wider">Шари {layers.length>0&&`(${layers.length})`}</p>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {layers.length===0&&<p className="text-white/20 text-xs text-center py-2">Пусто</p>}
              {layers.map(l=>(
                <div key={l.id} onClick={()=>setSelected(l.id)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${l.id===selected?'bg-gold/15 border border-gold/30 text-gold':'text-white/50 hover:bg-white/5 border border-transparent'}`}>
                  <span className="truncate max-w-[150px]">{l.text}</span>
                  <button onClick={e=>{e.stopPropagation();del(l.id);}} className="text-white/20 hover:text-red-400 ml-1 flex-shrink-0">✕</button>
                </div>
              ))}
            </div>
          </div>
          {sel?(
            <div className="p-3 flex-1 overflow-y-auto space-y-3">
              <p className="text-white/30 text-xs uppercase tracking-wider">Властивості</p>
              <textarea value={sel.text} onChange={e=>upd({text:e.target.value})} rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white text-xs resize-none focus:outline-none focus:border-gold/40"/>
              <div>
                <div className="flex justify-between text-xs mb-1"><span className="text-white/30">Розмір</span><span className="text-white/50">{sel.fontSize}px</span></div>
                <input type="range" min={12} max={96} value={sel.fontSize} onChange={e=>upd({fontSize:Number(e.target.value)})} className="w-full accent-amber-400 h-1"/>
              </div>
              <div className="flex gap-1.5">
                {(['normal','bold'] as const).map(w=>(
                  <button key={w} onClick={()=>upd({fontWeight:w})} style={{fontWeight:w}}
                    className={`flex-1 py-1 rounded text-xs border transition-colors ${sel.fontWeight===w?'border-gold bg-gold/10 text-gold':'border-white/10 text-white/40'}`}>
                    {w==='bold'?'Bold':'Normal'}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                {(['left','center','right'] as const).map(a=>(
                  <button key={a} onClick={()=>upd({align:a})}
                    className={`flex-1 py-1 rounded text-xs border transition-colors ${sel.align===a?'border-gold bg-gold/10 text-gold':'border-white/10 text-white/40'}`}>
                    {a==='left'?'←':a==='center'?'↔':'→'}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-white/30 text-xs mb-1">Колір тексту</p>
                <div className="flex gap-1.5 items-center flex-wrap">
                  <input type="color" value={sel.color} onChange={e=>upd({color:e.target.value})} className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"/>
                  {['#ffffff','#000000','#c8a84b','#ff4444','#44dd88','#4488ff'].map(c=>(
                    <button key={c} onClick={()=>upd({color:c})} className="w-5 h-5 rounded-full border transition-all hover:scale-110"
                      style={{backgroundColor:c,borderColor:sel.color===c?'#c8a84b':'rgba(255,255,255,0.15)'}}/>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-white/30 text-xs">Фон</p>
                  <input type="checkbox" checked={sel.bgEnabled} onChange={e=>upd({bgEnabled:e.target.checked})} className="accent-amber-400 w-3 h-3"/>
                </div>
                {sel.bgEnabled&&(
                  <div className="flex gap-1.5 items-center flex-wrap">
                    <input type="color" value={sel.bgColor} onChange={e=>upd({bgColor:e.target.value})} className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"/>
                    {['#000000','#1a1a1a','#c8a84b','#ffffff','#0d0d2e'].map(c=>(
                      <button key={c} onClick={()=>upd({bgColor:c})} className="w-5 h-5 rounded-full border transition-all hover:scale-110"
                        style={{backgroundColor:c,borderColor:sel.bgColor===c?'#c8a84b':'rgba(255,255,255,0.15)'}}/>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[['X','x'],['Y','y']].map(([label,key])=>(
                  <div key={key}>
                    <p className="text-white/30 text-xs mb-1">{label}</p>
                    <input type="number" value={(sel as any)[key]} min={0} max={1024}
                      onChange={e=>upd({[key]:Number(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-gold/40"/>
                  </div>
                ))}
              </div>
            </div>
          ):(
            <div className="flex-1 flex items-center justify-center">
              <p className="text-white/15 text-xs text-center px-4">Вибери або додай шар вище</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}