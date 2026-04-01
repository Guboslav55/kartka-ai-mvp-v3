import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const {
    productName='', bullets=[], accent='#c8a84b', bg='#0d0d0d',
    photoUrl=null,   // Public Supabase URL — original quality
    productB64=null, // Fallback base64
  } = await req.json();

  const W=1024, H=1024;
  const accentColor = accent || '#c8a84b';
  const bgColor = bg || '#0d0d0d';

  const icons = ['🔒','📐','⚡','✅','🛡️','⭐'];
  const specs = (bullets as string[])
    .filter((b:string)=>b.trim())
    .slice(0,4)
    .map((b:string, i:number) => ({
      icon: icons[i] || '✅',
      label: `ПЕРЕВАГА ${i+1}`,
      value: b.replace(/^[✓•]\s*/,'').slice(0,22),
    }));

  if (specs.length === 0) {
    specs.push(
      {icon:'✅', label:'ЯКІСТЬ', value:'Преміум'},
      {icon:'🚚', label:'ДОСТАВКА', value:'По Україні'},
      {icon:'🛡️', label:'ГАРАНТІЯ', value:'12 місяців'},
      {icon:'⭐', label:'РЕЙТИНГ', value:'5.0 / 5.0'},
    );
  }

  const titleWords = (productName || 'ТОВАР').toUpperCase().split(' ');
  const line1 = titleWords.slice(0,2).join(' ');
  const line2 = titleWords.slice(2,4).join(' ');
  // Prefer public URL (original quality) over base64
  const photoSrc: string | null = photoUrl || productB64;

  const el = (
    <div style={{width:W,height:H,display:'flex',background:bgColor,position:'relative'}}>
      {photoSrc && (
        <img src={photoSrc} width={1024} height={1024}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:0.1}} />
      )}
      <div style={{position:'absolute',inset:0,
        background:`linear-gradient(150deg, ${bgColor}f5 0%, ${bgColor}99 55%, ${bgColor}ee 100%)`,
        display:'flex'}} />
      {photoSrc && (
        <div style={{position:'absolute',right:28,top:80,width:460,height:500,
          display:'flex',alignItems:'center',justifyContent:'center'}}>
          <img src={photoSrc} width={460} height={500}
            style={{maxWidth:460,maxHeight:500,objectFit:'contain',
              filter:'drop-shadow(0 24px 64px rgba(0,0,0,0.9))'}} />
        </div>
      )}
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',padding:'52px 48px 44px'}}>
        <div style={{width:56,height:5,background:accentColor,borderRadius:3,marginBottom:24,display:'flex'}} />
        <div style={{display:'flex',flexDirection:'column',marginBottom:10}}>
          <div style={{fontSize:54,fontWeight:700,color:'#ffffff',lineHeight:1.05,display:'flex'}}>{line1}</div>
          {line2 && <div style={{fontSize:54,fontWeight:700,color:accentColor,lineHeight:1.05,display:'flex'}}>{line2}</div>}
        </div>
        <div style={{width:72,height:3,background:accentColor,borderRadius:2,marginBottom:36,display:'flex'}} />
        <div style={{display:'flex',flexDirection:'column',gap:14,maxWidth:470}}>
          {specs.map((s:any, i:number) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:16,
              background:'rgba(255,255,255,0.07)',borderRadius:14,
              padding:'16px 22px',borderLeft:`4px solid ${accentColor}`}}>
              <div style={{fontSize:26,width:36,display:'flex',alignItems:'center',justifyContent:'center'}}>{s.icon}</div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                <div style={{fontSize:11,fontWeight:700,color:accentColor,letterSpacing:1.5,display:'flex'}}>{s.label}</div>
                <div style={{fontSize:18,fontWeight:700,color:'#ffffff',display:'flex'}}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{position:'absolute',bottom:40,left:48,right:48,
          display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.38)',display:'flex'}}>Доставка по всій Україні</div>
          <div style={{background:accentColor,borderRadius:50,padding:'9px 24px',
            fontSize:14,fontWeight:700,color:'#000',display:'flex'}}>ЗАМОВИТИ</div>
        </div>
      </div>
    </div>
  );

  // No fonts - use system fonts to avoid empty response
  return new ImageResponse(el, { width: W, height: H });
}


