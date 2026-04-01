import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Bullet { icon: string; label: string; value: string; }
interface CalloutPin { x: string; y: string; text: string; dir: 'left' | 'right' | 'top'; }

interface CategoryConfig {
  layoutId:   'shoe' | 'bag' | 'clothing' | 'tech' | 'tactical' | 'universal';
  accent:     string;   // fallback if no color detected
  bg:         string;
  labelBadge: string;   // e.g. "ВЗУТТЯ", "ТЕХНІКА"
  specLabel:  string;   // e.g. "ХАРАКТЕРИСТИКИ"
  ctaText:    string;
}

const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  'Одяг та взуття': {
    layoutId: 'shoe', accent: '#c8a84b', bg: '#080808',
    labelBadge: 'ВЗУТТЯ', specLabel: 'ХАРАКТЕРИСТИКИ', ctaText: 'ОБРАТИ РОЗМІР',
  },
  'Тактичне спорядження': {
    layoutId: 'tactical', accent: '#5a8a3c', bg: '#0a0f08',
    labelBadge: 'ТАКТИКА', specLabel: 'ПАРАМЕТРИ', ctaText: 'ЗАМОВИТИ',
  },
  'Електроніка': {
    layoutId: 'tech', accent: '#4a9eff', bg: '#050b18',
    labelBadge: 'ТЕХНІКА', specLabel: 'СПЕЦИФІКАЦІЯ', ctaText: 'КУПИТИ',
  },
  'Спорт та хобі': {
    layoutId: 'bag', accent: '#ff6b35', bg: '#080d18',
    labelBadge: 'СПОРТ', specLabel: 'ПЕРЕВАГИ', ctaText: 'ЗАМОВИТИ',
  },
  'Дім та сад': {
    layoutId: 'universal', accent: '#6ab04c', bg: '#080c08',
    labelBadge: 'ДІМ', specLabel: 'ПЕРЕВАГИ', ctaText: 'КУПИТИ',
  },
  "Краса та здоров'я": {
    layoutId: 'universal', accent: '#e87aa0', bg: '#160a10',
    labelBadge: 'КРАСА', specLabel: 'ВЛАСТИВОСТІ', ctaText: 'СПРОБУВАТИ',
  },
  'Авто та мото': {
    layoutId: 'tech', accent: '#e0a020', bg: '#0a0a0a',
    labelBadge: 'АВТО', specLabel: 'ПАРАМЕТРИ', ctaText: 'ЗАМОВИТИ',
  },
  'Іграшки': {
    layoutId: 'universal', accent: '#8855ee', bg: '#08080f',
    labelBadge: 'ДИТЯЧІ', specLabel: 'ПЕРЕВАГИ', ctaText: 'ОБРАТИ',
  },
  'default': {
    layoutId: 'universal', accent: '#c8a84b', bg: '#0d0d0d',
    labelBadge: 'ТОВАР', specLabel: 'ПЕРЕВАГИ', ctaText: 'ЗАМОВИТИ ЗАРАЗ',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function hex2rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) {
      out.push(line.trim()); line = w;
    } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives (Edge JSX — all styles must be inline, no tailwind)
// ─────────────────────────────────────────────────────────────────────────────
function AccentBar({ accent, width = 48 }: { accent: string; width?: number }) {
  return <div style={{ width, height: 4, background: accent, borderRadius: 2, display: 'flex' }} />;
}

function Badge({ text, accent }: { text: string; accent: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: hex2rgba(accent, 0.18),
      border: `1px solid ${hex2rgba(accent, 0.5)}`,
      borderRadius: 20, padding: '4px 14px', width: 'fit-content',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 2 }}>{text}</span>
    </div>
  );
}

function SpecRow({ icon, label, value, accent, isLast }: {
  icon: string; label: string; value: string; accent: string; isLast: boolean;
}) {
  const vLines = wrapLines(value, 36);
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      paddingBottom: isLast ? 0 : 18,
      borderBottom: isLast ? 'none' : `1px solid rgba(255,255,255,0.07)`,
      marginBottom: isLast ? 0 : 18,
    }}>
      {/* Icon circle */}
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        background: hex2rgba(accent, 0.15),
        border: `1px solid ${hex2rgba(accent, 0.4)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 18,
      }}>{icon}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 1.5 }}>{label}</span>
        {vLines.map((l, i) => (
          <span key={i} style={{ fontSize: 15, fontWeight: i === 0 ? 500 : 400, color: '#ffffff', lineHeight: 1.4 }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// Callout pill — floating annotation
function Callout({ text, accent, side }: { text: string; accent: string; side: 'left' | 'right' }) {
  const lines = wrapLines(text, 22);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: `rgba(10,10,10,0.88)`,
      border: `1px solid ${hex2rgba(accent, 0.6)}`,
      borderLeft: side === 'left' ? `3px solid ${accent}` : `1px solid ${hex2rgba(accent, 0.6)}`,
      borderRight: side === 'right' ? `3px solid ${accent}` : `1px solid ${hex2rgba(accent, 0.6)}`,
      borderRadius: 8, padding: '8px 12px', maxWidth: 160,
    }}>
      {lines.map((l, i) => (
        <span key={i} style={{ fontSize: 13, color: '#ffffff', lineHeight: 1.35, fontWeight: i === 0 ? 500 : 400 }}>{l}</span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout: SHOE / CLOTHING — large side view, sole detail, material callouts
// ─────────────────────────────────────────────────────────────────────────────
function LayoutShoe({ photo, name, specs, callouts, accent, bg, cfg }: {
  photo: string; name: string; specs: Bullet[]; callouts: CalloutPin[];
  accent: string; bg: string; cfg: CategoryConfig;
}) {
  const titleLines = wrapLines(name, 22);
  return (
    <div style={{ width: 1080, height: 1080, display: 'flex', background: bg, position: 'relative' }}>
      {/* Background photo (full, dimmed) */}
      <img src={photo} width={1080} height={1080}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.08 }} />
      {/* Dark gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(135deg, ${bg}fa 0%, ${bg}88 50%, ${bg}dd 100%)`,
        display: 'flex',
      }} />

      {/* Product image — large, left-center */}
      <div style={{
        position: 'absolute', left: 0, top: 80, width: 580, height: 760,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img src={photo} width={560} height={560}
          style={{ objectFit: 'contain', filter: 'drop-shadow(0 32px 80px rgba(0,0,0,0.95)) drop-shadow(0 8px 24px rgba(0,0,0,0.8))' }} />
      </div>

      {/* Callout annotations on product */}
      {callouts.slice(0, 3).map((c, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: c.dir === 'right' ? undefined : 20,
          right: c.dir === 'right' ? 440 : undefined,
          top: `${18 + i * 24}%`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {c.dir !== 'right' && (
            <div style={{ width: 40, height: 1, background: hex2rgba(accent, 0.6), display: 'flex' }} />
          )}
          <Callout text={c.text} accent={accent} side={c.dir === 'right' ? 'right' : 'left'} />
          {c.dir === 'right' && (
            <div style={{ width: 40, height: 1, background: hex2rgba(accent, 0.6), display: 'flex' }} />
          )}
        </div>
      ))}

      {/* Right panel */}
      <div style={{
        position: 'absolute', right: 0, top: 0, width: 460, height: 1080,
        background: `rgba(0,0,0,0.72)`,
        borderLeft: `1px solid ${hex2rgba(accent, 0.2)}`,
        display: 'flex', flexDirection: 'column', padding: '48px 36px 40px',
      }}>
        {/* Top badge + bar */}
        <Badge text={cfg.labelBadge} accent={accent} />
        <div style={{ marginTop: 20, marginBottom: 20, display: 'flex' }}>
          <AccentBar accent={accent} width={60} />
        </div>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 24 }}>
          {titleLines.map((l, i) => (
            <span key={i} style={{
              fontSize: titleLines.length > 2 ? 22 : 26,
              fontWeight: 700,
              color: i === 0 ? '#ffffff' : accent,
              lineHeight: 1.2,
            }}>{l}</span>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: hex2rgba(accent, 0.3), marginBottom: 28, display: 'flex' }} />

        {/* Spec label */}
        <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 2, marginBottom: 20 }}>
          {cfg.specLabel}
        </span>

        {/* Specs */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {specs.slice(0, 4).map((s, i) => (
            <SpecRow key={i} {...s} accent={accent} isLast={i === specs.length - 1 || i === 3} />
          ))}
        </div>

        {/* CTA */}
        <div style={{
          marginTop: 24,
          background: accent, borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px 0',
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#000000', letterSpacing: 1 }}>{cfg.ctaText}</span>
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 10 }}>
          Швидка доставка по всій Україні
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout: TACTICAL / BAG — front view, volume badge, compartments callouts
// ─────────────────────────────────────────────────────────────────────────────
function LayoutTactical({ photo, name, specs, callouts, accent, bg, cfg }: {
  photo: string; name: string; specs: Bullet[]; callouts: CalloutPin[];
  accent: string; bg: string; cfg: CategoryConfig;
}) {
  const titleLines = wrapLines(name, 24);
  return (
    <div style={{ width: 1080, height: 1080, display: 'flex', background: bg, position: 'relative' }}>
      <img src={photo} width={1080} height={1080}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.06 }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(150deg, ${bg}fc 0%, ${bg}80 60%, ${bg}f0 100%)`,
        display: 'flex',
      }} />

      {/* TOP BAR */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 72,
        background: `rgba(0,0,0,0.7)`,
        borderBottom: `2px solid ${accent}`,
        display: 'flex', alignItems: 'center', padding: '0 40px',
        gap: 16,
      }}>
        <AccentBar accent={accent} width={32} />
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, letterSpacing: 3 }}>{cfg.labelBadge}</span>
        <div style={{ flex: 1, display: 'flex' }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>ЯКІСТЬ · НАДІЙНІСТЬ · УКРАЇНА</span>
      </div>

      {/* Product — center-left, large */}
      <div style={{
        position: 'absolute', left: 20, top: 90, width: 560, height: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img src={photo} width={520} height={680}
          style={{ objectFit: 'contain', filter: 'drop-shadow(0 40px 100px rgba(0,0,0,0.98)) drop-shadow(0 10px 30px rgba(0,0,0,0.9))' }} />
      </div>

      {/* Callout pins — scattered around product */}
      {callouts.slice(0, 3).map((c, i) => {
        const tops = ['22%', '45%', '68%'];
        return (
          <div key={i} style={{
            position: 'absolute',
            left: 24, top: tops[i],
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {/* Dot */}
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: accent, flexShrink: 0,
              boxShadow: `0 0 0 3px ${hex2rgba(accent, 0.3)}`,
              display: 'flex',
            }} />
            {/* Line */}
            <div style={{ width: 30, height: 1, background: hex2rgba(accent, 0.5), display: 'flex' }} />
            <Callout text={c.text} accent={accent} side="left" />
          </div>
        );
      })}

      {/* RIGHT PANEL */}
      <div style={{
        position: 'absolute', right: 0, top: 72, width: 470, height: 1008,
        background: `rgba(0,0,0,0.80)`,
        borderLeft: `1px solid ${hex2rgba(accent, 0.25)}`,
        display: 'flex', flexDirection: 'column', padding: '36px 32px 36px',
      }}>
        {/* Title block */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
          {titleLines.map((l, i) => (
            <span key={i} style={{
              fontSize: titleLines.length > 2 ? 20 : 24,
              fontWeight: 700, lineHeight: 1.2,
              color: i === 0 ? '#ffffff' : accent,
            }}>{l}</span>
          ))}
        </div>

        {/* Thin accent line */}
        <div style={{ display: 'flex', marginBottom: 28, marginTop: 16 }}>
          <AccentBar accent={accent} width={48} />
        </div>

        {/* Specs */}
        <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 2, marginBottom: 18 }}>
          {cfg.specLabel}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {specs.slice(0, 4).map((s, i) => (
            <SpecRow key={i} {...s} accent={accent} isLast={i === Math.min(specs.length, 4) - 1} />
          ))}
        </div>

        {/* Bottom: CTA + delivery */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <div style={{
            background: accent, borderRadius: 10, padding: '15px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#000', letterSpacing: 1.5 }}>{cfg.ctaText}</span>
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
            🇺🇦 Доставка по всій Україні · Гарантія якості
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout: TECH — spec grid with icons, close-up area
// ─────────────────────────────────────────────────────────────────────────────
function LayoutTech({ photo, name, specs, accent, bg, cfg, extraSpecs }: {
  photo: string; name: string; specs: Bullet[]; accent: string; bg: string;
  cfg: CategoryConfig; extraSpecs: { key: string; val: string }[];
}) {
  const titleLines = wrapLines(name, 26);
  return (
    <div style={{ width: 1080, height: 1080, display: 'flex', flexDirection: 'column', background: bg, position: 'relative' }}>
      <img src={photo} width={1080} height={1080}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.05 }} />

      {/* HEADER */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        padding: '40px 44px 28px', gap: 20,
        borderBottom: `1px solid ${hex2rgba(accent, 0.2)}`,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Badge text={cfg.labelBadge} accent={accent} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
            {titleLines.map((l, i) => (
              <span key={i} style={{
                fontSize: titleLines.length > 1 ? 28 : 32, fontWeight: 700,
                color: i === 0 ? '#ffffff' : accent, lineHeight: 1.15,
              }}>{l}</span>
            ))}
          </div>
        </div>
        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 12 }}>
          {extraSpecs.slice(0, 2).map((s, i) => (
            <div key={i} style={{
              background: hex2rgba(accent, 0.12),
              border: `1px solid ${hex2rgba(accent, 0.3)}`,
              borderRadius: 12, padding: '12px 18px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              minWidth: 80,
            }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: accent }}>{s.val}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>{s.key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* BODY: photo left, specs right */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flex: 1, gap: 0 }}>
        {/* Photo */}
        <div style={{
          width: 520, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px 20px',
        }}>
          <img src={photo} width={460} height={500}
            style={{ objectFit: 'contain', filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.95))' }} />
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: hex2rgba(accent, 0.2), margin: '20px 0', display: 'flex' }} />

        {/* Specs grid */}
        <div style={{
          flex: 1, padding: '24px 32px 24px 28px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 2, marginBottom: 16 }}>
            {cfg.specLabel}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {specs.slice(0, 4).map((s, i) => (
              <SpecRow key={i} {...s} accent={accent} isLast={i === Math.min(specs.length, 4) - 1} />
            ))}
          </div>
          <div style={{
            background: accent, borderRadius: 10, padding: '14px 0', marginTop: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#000', letterSpacing: 1 }}>{cfg.ctaText}</span>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{
        position: 'relative', zIndex: 1,
        borderTop: `1px solid ${hex2rgba(accent, 0.15)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '14px 44px',
        background: `rgba(0,0,0,0.5)`,
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
          ШВИДКА ДОСТАВКА · ГАРАНТІЯ ЯКОСТІ · ПОВЕРНЕННЯ 14 ДНІВ
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout: UNIVERSAL — clean vertical, works for anything
// ─────────────────────────────────────────────────────────────────────────────
function LayoutUniversal({ photo, name, specs, accent, bg, cfg }: {
  photo: string; name: string; specs: Bullet[]; accent: string; bg: string; cfg: CategoryConfig;
}) {
  const titleLines = wrapLines(name, 28);
  return (
    <div style={{ width: 1080, height: 1080, display: 'flex', background: bg, position: 'relative' }}>
      <img src={photo} width={1080} height={1080}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.07 }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(145deg, ${bg}fc 0%, ${bg}82 55%, ${bg}f5 100%)`,
        display: 'flex',
      }} />

      {/* LEFT: product */}
      <div style={{
        position: 'absolute', left: 0, top: 60, width: 540, height: 960,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img src={photo} width={500} height={600}
          style={{ objectFit: 'contain', filter: 'drop-shadow(0 30px 70px rgba(0,0,0,0.97))' }} />
      </div>

      {/* RIGHT: content */}
      <div style={{
        position: 'absolute', right: 0, top: 0, width: 500, height: 1080,
        background: `rgba(0,0,0,0.75)`,
        borderLeft: `1px solid ${hex2rgba(accent, 0.2)}`,
        display: 'flex', flexDirection: 'column', padding: '52px 36px 40px',
      }}>
        {/* Badge */}
        <Badge text={cfg.labelBadge} accent={accent} />

        {/* Accent line */}
        <div style={{ display: 'flex', marginTop: 20, marginBottom: 20 }}>
          <AccentBar accent={accent} width={52} />
        </div>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 28 }}>
          {titleLines.map((l, i) => (
            <span key={i} style={{
              fontSize: titleLines.length > 2 ? 21 : 25,
              fontWeight: 700, lineHeight: 1.2,
              color: i === 0 ? '#ffffff' : accent,
            }}>{l}</span>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: hex2rgba(accent, 0.25), marginBottom: 28, display: 'flex' }} />

        {/* Specs */}
        <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 2, marginBottom: 20 }}>
          {cfg.specLabel}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {specs.slice(0, 4).map((s, i) => (
            <SpecRow key={i} {...s} accent={accent} isLast={i === Math.min(specs.length, 4) - 1} />
          ))}
        </div>

        {/* CTA */}
        <div style={{
          background: accent, borderRadius: 12, padding: '16px 0', marginTop: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#000', letterSpacing: 1 }}>{cfg.ctaText}</span>
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 10 }}>
          🇺🇦 Доставка по всій Україні
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon mapping per spec content keywords
// ─────────────────────────────────────────────────────────────────────────────
function pickIcon(text: string): string {
  const t = text.toLowerCase();
  if (t.match(/шкір|leather|шкіра/))        return '🦎';
  if (t.match(/підошв|sole|підошва/))        return '👟';
  if (t.match(/водо|water|вологостійк/))    return '💧';
  if (t.match(/матер|fabric|тканин/))        return '🧵';
  if (t.match(/розмір|size|об'єм|літр/))    return '📐';
  if (t.match(/міцн|durable|зносостійк/))  return '💪';
  if (t.match(/зручн|comfort|comf/))        return '✋';
  if (t.match(/відділ|compartment|кишен/)) return '🎒';
  if (t.match(/захист|protect/))            return '🛡️';
  if (t.match(/гаранті|warranty/))          return '✅';
  if (t.match(/матричн|display|екран|dpi/)) return '🖥️';
  if (t.match(/бездрот|wireless|wifi/))     return '📡';
  if (t.match(/батар|battery|заряд/))       return '🔋';
  if (t.match(/швидк|speed|fast/))          return '⚡';
  if (t.match(/тактичн|tactical/))          return '🎯';
  if (t.match(/колір|color|кольор/))        return '🎨';
  if (t.match(/стиль|style|дизайн/))        return '✨';
  if (t.match(/ціна|price|вартість/))       return '💰';
  return '✅';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const {
    productName = '',
    bullets = [],
    photoUrl = null,
    productB64 = null,
    category = '',
    detectedAccent = '',   // hex color extracted from product by GPT-4o
    extraSpecs = [],       // [{key, val}] — e.g. [{key:'DPI', val:'12400'}]
    callouts: rawCallouts = [], // [{text, dir}] callout annotations
  } = await req.json();

  const W = 1080, H = 1080;
  const photoSrc: string | null = photoUrl || productB64;

  if (!photoSrc) {
    return new Response(JSON.stringify({ error: 'Потрібне фото' }), { status: 400 });
  }

  // Resolve category config
  const cfg: CategoryConfig = CATEGORY_CONFIGS[category] ?? CATEGORY_CONFIGS['default'];

  // Override accent with detected product color if valid
  const accent = (detectedAccent && /^#[0-9a-fA-F]{6}$/.test(detectedAccent))
    ? detectedAccent
    : cfg.accent;
  const bg = cfg.bg;

  // Build spec bullets with smart icons
  const rawBullets = (bullets as string[]).filter((b: string) => b.trim()).slice(0, 5);
  const specs: Bullet[] = rawBullets.length > 0
    ? rawBullets.map((b: string, i: number) => {
        const clean = b.replace(/^[✓•]\s*/, '').trim();
        // Try to extract label from "Матеріал: шкіра" format
        const colonIdx = clean.indexOf(':');
        const hasLabel = colonIdx > 0 && colonIdx < 20;
        return {
          icon: pickIcon(clean),
          label: hasLabel ? clean.slice(0, colonIdx).toUpperCase().trim() : `ПЕРЕВАГА ${i + 1}`,
          value: hasLabel ? clean.slice(colonIdx + 1).trim() : clean,
        };
      })
    : [
        { icon: '✅', label: 'ЯКІСТЬ',    value: 'Преміум матеріали' },
        { icon: '🚚', label: 'ДОСТАВКА',  value: 'По всій Україні' },
        { icon: '🛡️', label: 'ГАРАНТІЯ',  value: '12 місяців' },
        { icon: '⭐', label: 'РЕЙТИНГ',   value: '5.0 / 5.0' },
      ];

  // Callouts
  const callouts: CalloutPin[] = (rawCallouts as { text: string; dir?: string }[])
    .slice(0, 3)
    .map((c, i) => ({
      text: c.text,
      dir: (c.dir as CalloutPin['dir']) || (i % 2 === 0 ? 'left' : 'right'),
      x: '30%',
      y: `${20 + i * 25}%`,
    }));

  // Select layout by category
  let el: JSX.Element;
  const sharedProps = { photo: photoSrc, name: productName, specs, accent, bg, cfg };

  switch (cfg.layoutId) {
    case 'shoe':
    case 'clothing':
      el = <LayoutShoe    {...sharedProps} callouts={callouts} />;
      break;
    case 'tactical':
    case 'bag':
      el = <LayoutTactical {...sharedProps} callouts={callouts} />;
      break;
    case 'tech':
      el = <LayoutTech    {...sharedProps} extraSpecs={extraSpecs} />;
      break;
    default:
      el = <LayoutUniversal {...sharedProps} />;
  }

  return new ImageResponse(el, { width: W, height: H });
}
