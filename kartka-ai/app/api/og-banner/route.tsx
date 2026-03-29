import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const THEMES = {
  dark:  { bg: '#0a0a0a', accent: '#c8a84b', text: '#ffffff', sub: '#cccccc', panel: 'rgba(0,0,0,0.78)' },
  white: { bg: '#f0f0f0', accent: '#1a3a5c', text: '#1a1a1a', sub: '#444444', panel: 'rgba(255,255,255,0.88)' },
  navy:  { bg: '#060e1a', accent: '#4a9eff', text: '#ffffff', sub: '#aabbdd', panel: 'rgba(4,10,20,0.82)'  },
  gold:  { bg: '#0a0600', accent: '#e8c96a', text: '#f5e6c8', sub: '#c8aa88', panel: 'rgba(10,6,0,0.82)'  },
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

async function uploadAndGetUrl(
  supabase: ReturnType<typeof createClient>,
  base64: string,
  userId: string
): Promise<string | null> {
  try {
    const b64data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Uint8Array.from(atob(b64data), c => c.charCodeAt(0));
    const fileName = `tmp/${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('card-images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const [fontReg, fontBold] = await Promise.all([
    fetch('https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNjXhFVZNyBx2pqPIif.woff2').then(r=>r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/notosans/v36/o-0NipQlx3QUlC5A4PNjThZVZNyBx2pqPIif.woff2').then(r=>r.arrayBuffer()),
  ]);

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  const { productName='', price='', bullets=[], bgStyle='dark', template='benefits', productB64=null } = await req.json();
  const T = THEMES[bgStyle as ThemeKey] ?? THEMES.dark;
  const b = (bullets as string[]).filter((x:string)=>x.trim()).slice(0,3).map((x:string)=>x.replace(/^[✓•]\s*/,'').trim());
  const W=1024, H=1024;

  // Upload photo to Supabase for public URL (og can't use base64 > 2MB)
  let photoUrl: string | null = null;
  if (productB64 && token) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) photoUrl = await uploadAndGetUrl(supabase, productB64, user.id);
    } catch {}
  }

  let el: JSX.Element;

  if (template === 'benefits') {
    const nameL = lines(productName, 20);
    el = (
      <div style={{width:W,height:H,display:'flex',position:'relative',background:T.bg,fontFamily:'"NotoSans"'}}>
        {/* Full bleed photo left */}
        {photoUrl && (
          <img src={photoUrl} width={600} height={1024}
            style={{position:'absolute',left:0,top:0,width:'60%',height:'100%',objectFit:'cover',objectPosition:'center'}} />
        )}
        {/* Gradient overlay */}
        <div style={{position:'absolute',left:0,top:0,width:'65%',height:'100%',
          background:`linear-gradient(to right, transparent 35%, ${T.bg} 90%)`,display:'flex'}} />

        {/* Right panel */}
        <div style={{
          position:'absolute',right:0,top:0,width:'44%',height:'100%',
          background:T.panel,
          display:'flex',flexDirection:'column',
          padding:'52px 36px 52px 32px',
        }}>
          <div style={{width:'100%',height:4,background:T.accent,borderRadius:2,marginBottom:28,display:'flex'}} />
          <div style={{fontSize:12,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:12,display:'flex'}}>ПЕРЕВАГИ</div>
          <div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:22}}>
            {nameL.map((l,i)=><div key={i} style={{fontSize:nameL.length>1?23:27,fontWeight:700,color:T.text,lineHeight:1.25,display:'flex'}}>{l}</div>)}
          </div>
          <div style={{width:'100%',height:1,background:T.accent,opacity:0.3,marginBottom:26,display:'flex'}} />
          <div style={{display:'flex',flexDirection:'column',gap:18,flex:1}}>
            {b.map((bull,i)=>{
              const bL=lines(bull,28);
              return (
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:12}}>
                  <div style={{width:26,height:26,borderRadius:'50%',background:T.accent,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:13,fontWeight:700,color:'#000',marginTop:2}}>✓</div>
                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                    {bL.map((l,li)=><div key={li} style={{fontSize:16,color:T.text,lineHeight:1.45,display:'flex'}}>{l}</div>)}
                  </div>
                </div>
              );
            })}
          </div>
          {price && (
            <div style={{marginTop:24,padding:'14px 0',borderRadius:12,border:`1.5px solid ${T.accent}`,background:`${T.accent}18`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{fontSize:34,fontWeight:700,color:T.accent,display:'flex'}}>{price} ₴</div>
            </div>
          )}
        </div>
      </div>
    );

  } else if (template === 'callout') {
    const callouts = [
      {x:24, y:140, text:b[0]||'Висока якість', isLeft:true},
      {x:670,y:200, text:b[1]||'Ергономічний дизайн', isLeft:false},
      {x:648,y:630, text:b[2]||'Надійна конструкція', isLeft:false},
    ].slice(0,Math.max(b.length,2));

    el = (
      <div style={{width:W,height:H,display:'flex',position:'relative',background:T.bg,fontFamily:'"NotoSans"'}}>
        {photoUrl && (
          <img src={photoUrl} width={1024} height={1024}
            style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',opacity:0.82}} />
        )}
        <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.55) 100%)',display:'flex'}} />
        {/* Title bar */}
        <div style={{position:'absolute',top:32,left:90,right:90,height:56,background:'rgba(0,0,0,0.78)',borderRadius:28,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{fontSize:21,fontWeight:700,color:T.accent,display:'flex'}}>{productName}</div>
        </div>
        {callouts.map((c,i)=>{
          const cL=lines(c.text,22); const bh=cL.length*28+20;
          return (
            <div key={i} style={{position:'absolute',left:c.x,top:c.y,width:204,minHeight:bh,background:'rgba(0,0,0,0.86)',borderRadius:10,borderLeft:`4px solid ${T.accent}`,display:'flex',flexDirection:'column',padding:'10px 14px',gap:3}}>
              {cL.map((l,li)=><div key={li} style={{fontSize:14,color:'#ffffff',lineHeight:1.5,display:'flex'}}>{l}</div>)}
              {/* Arrow */}
              <div style={{position:'absolute',top:'50%',marginTop:-1,...(c.isLeft?{right:-48,width:44}:{left:-48,width:44}),height:2,background:T.accent,opacity:0.8,display:'flex'}} />
              <div style={{position:'absolute',top:'50%',marginTop:-6,width:12,height:12,borderRadius:'50%',background:T.accent,...(c.isLeft?{right:-60}:{left:-60}),display:'flex'}} />
            </div>
          );
        })}
        {price && (
          <div style={{position:'absolute',bottom:60,left:312,width:400,height:64,background:'rgba(0,0,0,0.84)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{fontSize:36,fontWeight:700,color:T.accent,display:'flex'}}>{price} ₴</div>
          </div>
        )}
      </div>
    );

  } else {
    const nameL = lines(productName, 18);
    el = (
      <div style={{width:W,height:H,display:'flex',position:'relative',background:T.bg,fontFamily:'"NotoSans"'}}>
        {photoUrl && (
          <img src={photoUrl} width={530} height={1024}
            style={{position:'absolute',left:0,top:0,width:'52%',height:'100%',objectFit:'cover'}} />
        )}
        <div style={{position:'absolute',left:0,top:0,width:'56%',height:'100%',background:`linear-gradient(to right, transparent 25%, ${T.bg} 88%)`,display:'flex'}} />
        <div style={{position:'absolute',right:0,top:0,width:'52%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',padding:'60px 48px 60px 36px'}}>
          <div style={{fontSize:11,fontWeight:700,color:T.accent,letterSpacing:2,marginBottom:14,display:'flex'}}>НОВА КОЛЕКЦІЯ</div>
          <div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:22}}>
            {nameL.map((l,i)=><div key={i} style={{fontSize:nameL.length>1?25:29,fontWeight:700,color:T.text,lineHeight:1.25,display:'flex'}}>{l}</div>)}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:26}}>
            {b.map((bull,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{fontSize:15,fontWeight:700,color:T.accent,display:'flex'}}>✓</div>
                <div style={{fontSize:14,color:T.sub,display:'flex'}}>{bull.slice(0,42)}</div>
              </div>
            ))}
          </div>
          {price && <div style={{fontSize:46,fontWeight:700,color:T.accent,marginBottom:18,display:'flex'}}>{price} ₴</div>}
          <div style={{width:340,height:60,borderRadius:12,background:T.accent,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{fontSize:17,fontWeight:700,color:'#000',display:'flex'}}>ЗАМОВИТИ ЗАРАЗ</div>
          </div>
          <div style={{marginTop:10,fontSize:12,color:T.sub,display:'flex'}}>Доставка по всій Україні 🇺🇦</div>
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
