import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const THEMES = {
  dark:  { bg: '#0a0a0a', accent: '#c8a84b', text: '#ffffff', sub: '#cccccc', panel: 'rgba(0,0,0,0.75)' },
  white: { bg: '#f0f0f0', accent: '#1a3a5c', text: '#1a1a1a', sub: '#444444', panel: 'rgba(255,255,255,0.85)' },
  navy:  { bg: '#060e1a', accent: '#4a9eff', text: '#ffffff', sub: '#aabbdd', panel: 'rgba(4,10,20,0.8)'  },
  gold:  { bg: '#0a0600', accent: '#e8c96a', text: '#f5e6c8', sub: '#c8aa88', panel: 'rgba(10,6,0,0.8)'  },
} as const;
type ThemeKey = keyof typeof THEMES;

function lines(text: string, max: number): string[] {
  const words = text.split(' ');
  const out: string[] = []; let line = '';
  for (const w of words) {
    if ((line+' '+w).trim().length > max && line) { out.push(line.trim()); line = w; }
    else line = (line+' '+w).trim();
  }
  if (line) out.push(line);
  return out.slice(0, 3);
}

export async function POST(req: NextRequest) {
  const [fontReg, fontBold] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNjXhFVZNyBx2pqPIif.woff2').then(r=>r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/notosans/v36/o-0NipQlx3QUlC5A4PNjThZVZNyBx2pqPIif.woff2').then(r=>r.arrayBuffer()),
  ]);

  const { productName='', price='', bullets=[], bgStyle='dark', template='benefits', productB64=null } = await req.json();
  const T = THEMES[bgStyle as ThemeKey] ?? THEMES.dark;
  const b = (bullets as string[]).filter((x:string)=>x.trim()).slice(0,3).map((x:string)=>x.replace(/^[✓•]\s*/,'').trim());
  const W=1024, H=1024;

  let el: JSX.Element;

  if (template === 'benefits') {
    const nameL = lines(productName, 20);
    el = (
      <div style={{width:W,height:H,display:'flex',position:'relative',background:T.bg,fontFamily:'"NotoSans"'}}>
        {/* Full bleed photo */}
        {productB64 && (
          <img src={productB64} style={{position:'absolute',left:0,top:0,width:'58%',height:'100%',objectFit:'cover',objectPosition:'center'}} />
        )}
        {/* Gradient overlay on photo side */}
        <div style={{position:'absolute',left:0,top:0,width:'62%',height:'100%',background:'linear-gradient(to right, transparent 40%, '+T.bg+' 95%)',display:'flex'}} />

        {/* Right panel */}
        <div style={{
          position:'absolute',right:0,top:0,width:'46%',height:'100%',
          background:T.panel,
          display:'flex',flexDirection:'column',
          padding:'48px 36px 48px 32px',
        }}>
          {/* Accent bar */}
          <div style={{width:'100%',height:4,background:T.accent,borderRadius:2,marginBottom:28,display:'flex'}} />

          {/* Label */}
          <div style={{fontSize:13,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:12,display:'flex'}}>ПЕРЕВАГИ</div>

          {/* Name */}
          <div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:24}}>
            {nameL.map((l,i)=><div key={i} style={{fontSize:nameL.length>1?24:28,fontWeight:700,color:T.text,lineHeight:1.25,display:'flex'}}>{l}</div>)}
          </div>

          {/* Divider */}
          <div style={{width:'100%',height:1,background:T.accent,opacity:0.3,marginBottom:28,display:'flex'}} />

          {/* Bullets */}
          <div style={{display:'flex',flexDirection:'column',gap:18,flex:1}}>
            {b.map((bull,i)=>{
              const bLines = lines(bull, 28);
              return (
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:14}}>
                  <div style={{
                    width:28,height:28,borderRadius:'50%',background:T.accent,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    flexShrink:0,fontSize:13,fontWeight:700,color:'#000',marginTop:2,
                  }}>✓</div>
                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                    {bLines.map((l,li)=><div key={li} style={{fontSize:17,color:T.text,lineHeight:1.45,display:'flex'}}>{l}</div>)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Price */}
          {price && (
            <div style={{
              marginTop:24,padding:'16px 0',borderRadius:12,
              border:`1.5px solid ${T.accent}`,background:`${T.accent}18`,
              display:'flex',alignItems:'center',justifyContent:'center',
            }}>
              <div style={{fontSize:36,fontWeight:700,color:T.accent,display:'flex'}}>{price} ₴</div>
            </div>
          )}
        </div>
      </div>
    );

  } else if (template === 'callout') {
    const callouts = [
      {x:24, y:140, text:b[0]||'Висока якість'},
      {x:680,y:200, text:b[1]||'Ергономічний дизайн'},
      {x:660,y:640, text:b[2]||'Надійна конструкція'},
    ].slice(0,Math.max(b.length,2));

    el = (
      <div style={{width:W,height:H,display:'flex',position:'relative',background:T.bg,fontFamily:'"NotoSans"'}}>
        {productB64 && (
          <img src={productB64} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',opacity:0.85}} />
        )}
        {/* Vignette */}
        <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)',display:'flex'}} />
        {/* Top bar */}
        <div style={{position:'absolute',top:32,left:100,right:100,height:56,background:'rgba(0,0,0,0.75)',borderRadius:28,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{fontSize:22,fontWeight:700,color:T.accent,display:'flex'}}>{productName}</div>
        </div>
        {/* Callouts */}
        {callouts.map((c,i)=>{
          const cLines = lines(c.text, 22);
          const bh = cLines.length*28+20;
          return (
            <div key={i} style={{
              position:'absolute',left:c.x,top:c.y,
              width:210,minHeight:bh,
              background:'rgba(0,0,0,0.85)',borderRadius:10,
              borderLeft:`4px solid ${T.accent}`,
              display:'flex',flexDirection:'column',padding:'10px 14px',gap:4,
            }}>
              {cLines.map((l,li)=><div key={li} style={{fontSize:15,color:'#ffffff',lineHeight:1.5,display:'flex'}}>{l}</div>)}
              {/* Arrow line */}
              <div style={{
                position:'absolute',
                top:'50%',
                ...(c.x < 400 ? {right:-44,width:40} : {left:-44,width:40}),
                height:2,background:T.accent,opacity:0.7,display:'flex',
              }} />
              <div style={{
                position:'absolute',top:'50%',marginTop:-5,width:10,height:10,
                borderRadius:'50%',background:T.accent,
                ...(c.x < 400 ? {right:-54} : {left:-54}),
                display:'flex',
              }} />
            </div>
          );
        })}
        {price && (
          <div style={{position:'absolute',bottom:60,left:312,width:400,height:66,background:'rgba(0,0,0,0.82)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{fontSize:38,fontWeight:700,color:T.accent,display:'flex'}}>{price} ₴</div>
          </div>
        )}
      </div>
    );

  } else {
    // CTA — full bleed left photo, right text
    const nameL = lines(productName, 18);
    el = (
      <div style={{width:W,height:H,display:'flex',position:'relative',background:T.bg,fontFamily:'"NotoSans"'}}>
        {productB64 && (
          <img src={productB64} style={{position:'absolute',left:0,top:0,width:'52%',height:'100%',objectFit:'cover'}} />
        )}
        <div style={{position:'absolute',left:0,top:0,width:'56%',height:'100%',background:'linear-gradient(to right, transparent 30%, '+T.bg+' 90%)',display:'flex'}} />

        <div style={{position:'absolute',right:0,top:0,width:'52%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',padding:'60px 48px 60px 40px'}}>
          <div style={{fontSize:12,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:16,display:'flex'}}>НОВА КОЛЕКЦІЯ</div>
          <div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:24}}>
            {nameL.map((l,i)=><div key={i} style={{fontSize:nameL.length>1?26:30,fontWeight:700,color:T.text,lineHeight:1.25,display:'flex'}}>{l}</div>)}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:28}}>
            {b.map((bull,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{fontSize:16,fontWeight:700,color:T.accent,display:'flex'}}>✓</div>
                <div style={{fontSize:15,color:T.sub,display:'flex'}}>{bull.slice(0,42)}</div>
              </div>
            ))}
          </div>
          {price && <div style={{fontSize:48,fontWeight:700,color:T.accent,marginBottom:20,display:'flex'}}>{price} ₴</div>}
          <div style={{width:340,height:62,borderRadius:12,background:T.accent,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{fontSize:18,fontWeight:700,color:'#000',display:'flex'}}>ЗАМОВИТИ ЗАРАЗ</div>
          </div>
          <div style={{marginTop:10,fontSize:13,color:T.sub,display:'flex'}}>Доставка по всій Україні 🇺🇦</div>
        </div>
      </div>
    );
  }

  return new ImageResponse(el, {
    width:W, height:H,
    fonts:[
      {name:'NotoSans',data:fontReg, weight:400,style:'normal'},
      {name:'NotoSans',data:fontBold,weight:700,style:'normal'},
    ],
  });
}

