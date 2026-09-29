'use client'
import { useEffect, useRef } from 'react'
import { C as MLB_C } from '../../lib/theme'
import { C as NFL_C } from '../../lib/nfl/theme'
import { C as NHL_C } from '../../lib/nhl/theme'
import { BRAND } from '../../lib/routes'
import { setSport } from '../../lib/sport'

// ONE HEADER FRAME, THREE PRODUCTS (2026-09-29, parity plan G; Donovan: "all
// pages take from MLB components"). MOONSHOT's header (components/Header.js)
// lifted out as the frame: the bar that scrolls away (never sticky), row 1 =
// the DASH mark (the network's front door) + the product's wordmark (its own
// home button) + pills naming the OTHER products + the meta cluster (date,
// account, gear), row 2 = the moving ticker, and MOONSHOT's phone rules
// (centred brand, the date badge drops under 760px). TUDDY's and LAMP's
// headers were hand-rolled copies that had drifted (pill borders at 70 vs 55,
// each product's colours for the others, no phone centring).
//
// The other products' pills are read off the registry (lib/routes BRAND), each
// in its OWN brand colour on every header -- MOONSHOT orange, TUDDY jade,
// LAMP ice -- so a product looks the same wherever it is named.
const PILL = { mlb: () => MLB_C.orange, nfl: () => NFL_C.green, nhl: () => NHL_C.ice }

function hexToRgba(hex, a) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return hex
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/**
 * sport: this product's registry key. theme: its C. wordmark: gradient CSS.
 * onHome / homeTitle: the wordmark button. glow: the mark's box-shadow colour.
 * dot: { color, pulse } for the mark's status dot, or null for none.
 * league: an optional small tag after the wordmark (LAMP's "NHL").
 * meta: row 1's right side. children: row 2 (the ticker). headerClass: extra
 * class on <header> (TUDDY's hdr-slate-on).
 */
export default function HeaderShell({ sport, theme = MLB_C, wordmark, onHome, homeTitle, glow, dot = null, league = null, meta, children, headerClass }) {
  const C = theme
  const hdrRef = useRef(null)
  // ── THE HEADER PUBLISHES ITS OWN HEIGHT (2026-08-16) ───────────────────
  // Anything else that wants to stick (the Games lineup jump strip) sits
  // below this bar via `top: var(--hdr-h)`. A header that scrolls away
  // occupies no fixed space, so it writes 0.
  useEffect(() => {
    const el = hdrRef.current
    if (!el) return
    const write = () => { document.documentElement.style.setProperty('--hdr-h', '0px') }
    write()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(write) : null
    if (ro) ro.observe(el)
    return () => { if (ro) ro.disconnect() }
  }, [])
  const name = BRAND[sport]?.name || ''
  const others = Object.keys(BRAND).filter((k) => k !== sport)

  return (
    <header ref={hdrRef} className={['hdr-one-bar', headerClass].filter(Boolean).join(' ')} style={{
      // NOT STICKY (2026-09-06). Donovan: "no sticky header. once you scroll
      // don't add that, ever."
      position: 'relative', zIndex: 50,
      background: hexToRgba(C.bg, 0.92),
      backdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div className="hdr-bar" style={{
        maxWidth: 1300, margin: '0 auto', padding: '8px 16px 6px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* ── row 1: brand · date · mode · account · settings ───────────── */}
        <div className="hdr-row1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'nowrap' }}>
          <div className="hdr-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {/* THE MARK IS THE WAY HOME (2026-08-31): the square mark goes to the
                DASH front door; the wordmark is this product's own home button. */}
            <a href="/" title="DASH Network home — MOONSHOT · TUDDY · LAMP · FRANCHISE" aria-label="DASH Network home"
              style={{ display: 'flex', textDecoration: 'none', borderRadius: 10, flexShrink: 0 }}>
              <div className="hdr-mark" style={{ position: 'relative', width: 46, height: 46, borderRadius: 12, boxShadow: `0 0 20px ${glow}` }}>
                <img src="/icon-192.png" alt="" width={46} height={46} style={{ display: 'block', width: '100%', height: '100%', borderRadius: 12 }} />
                {dot && <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: dot.color, border: `2px solid ${C.bg}`, animation: dot.pulse ? 'pulse 2s infinite' : undefined }} />}
              </div>
            </a>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button type="button" onClick={onHome} title={homeTitle} aria-label={`${name} home`}
                  style={{
                    padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 19, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1,
                    backgroundImage: wordmark,
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>{name}</button>
                {league && <span style={{ color: C.text3, fontSize: 8, fontWeight: 800, letterSpacing: '.14em' }}>{league}</span>}
                <span className="sport-switch" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {/* The OTHER products, named as products (not leagues), each in
                      its own colour so the switch reads as shows, not a filter. */}
                  {others.map((k) => {
                    const col = PILL[k] ? PILL[k]() : C.text2
                    const b = BRAND[k]
                    return (
                      <button key={k} onClick={() => setSport(k)} aria-pressed={false}
                        title={`Switch to ${b.name} · ${b.league}`} aria-label={`Switch to ${b.name} · ${b.league}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          height: 20, minHeight: 20, padding: '0 9px', lineHeight: 1,
                          fontSize: 9.5, fontWeight: 900, letterSpacing: '0.08em', borderRadius: 999,
                          cursor: 'pointer',
                          border: `1px solid ${col}55`,
                          background: `${col}10`,
                          color: col,
                        }}>{b.name}</button>
                    )
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* ── date · mode · account · settings ──────────────────────── */}
          <div className="hdr-meta" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {meta}
          </div>
        </div>

        {/* ── row 2: THE MOVING HEADER, ABOVE EVERYTHING ELSE (2026-09-06) ── */}
        {children}

        {/* TOP RAIL REMOVED (2026-09-28, Donovan: "remove the top line nav site wide... keep the bottom nav"). The dock (MobileTabBar) is the one navigation on every screen; its More is the side drawer. */}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .hdr-scorebug::-webkit-scrollbar { display: none; }
        .hdr-ticker-track button:hover { filter: brightness(1.25); }
        header div::-webkit-scrollbar { display: none; }
        @media (max-width: 700px) {
          .simple-more-grid { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
        }
        /* Under the bottom bar's breakpoint (760px, components/MobileTabBar.js):
           the ticker stays as the one line of context; the account pill and ⚙
           stay; the date badge drops to keep the row on one line. */
        @media (max-width: 760px) {
          .hdr-bar { gap: 6px !important; padding-bottom: 6px !important; }
          .hdr-row1 { flex-wrap: wrap !important; gap: 6px !important; }
          .hdr-mark { width: 40px !important; height: 40px !important; }
          .hdr-mark img { width: 40px !important; height: 40px !important; }
          .hdr-brand { flex-basis: 100% !important; }
          /* Centred, both rows (Donovan: "the MOONSHOT button should be
             centre on the page; header and the button under it seem off"). */
          .hdr-brand { flex: 1 1 100%; justify-content: center; text-align: center; }
          .hdr-brand > div > div:first-child { justify-content: center; }
          .hdr-scorebug { width: 100%; }
          .hdr-meta { padding-bottom: 8px; margin-left: auto !important; margin-right: auto !important; width: auto; justify-content: center; gap: 12px; }
          .hdr-meta .date-badge { display: none !important; }
        }
      `}</style>
    </header>
  )
}
