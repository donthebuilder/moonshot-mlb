'use client'
import { useEffect, useRef } from 'react'
import { C as MLB_C } from '../../lib/theme'
import { C as NFL_C } from '../../lib/nfl/theme'
import { C as NHL_C } from '../../lib/nhl/theme'
import { C as NBA_C } from '../../lib/nba/theme'
import { useVisibleSports } from '../../lib/useVisibleSports'
import { BRAND } from '../../lib/routes'
import { setSport } from '../../lib/sport'
import SportSwitch from './SportSwitch'
import SearchButton from './SearchButton'

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
const PILL = { mlb: () => MLB_C.orange, nfl: () => NFL_C.green, nhl: () => NHL_C.ice, nba: () => NBA_C.purple }

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
 * date / account / settings: row 1's right side -- the day switch, the account
 * pill, the gear -- each in its own slot so the phone layout can place them
 * (2026-10-06). meta: anything else for that side. children: row 2 (the ticker).
 * headerClass: extra class on <header> (TUDDY's hdr-slate-on).
 */
export default function HeaderShell({ sport, theme = MLB_C, wordmark, onHome, homeTitle, glow, dot = null, league = null, date = null, account = null, settings = null, meta = null, children, headerClass }) {
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
  // the products this visitor may see (a hidden one only once it says yes)
  const others = useVisibleSports().filter((k) => k !== sport)

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
              className="hdr-mark-link" style={{ display: 'flex', textDecoration: 'none', borderRadius: 10, flexShrink: 0 }}>
              <div className="hdr-mark" style={{ position: 'relative', width: 46, height: 46, borderRadius: 12, boxShadow: `0 0 20px ${glow}` }}>
                <img src="/icon-192.png" alt="" width={46} height={46} style={{ display: 'block', width: '100%', height: '100%', borderRadius: 12 }} />
                {dot && <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: dot.color, border: `2px solid ${C.bg}`, animation: dot.pulse ? 'pulse 2s infinite' : undefined }} />}
              </div>
            </a>
            <div className="hdr-word" style={{ minWidth: 0 }}>
              <div className="hdr-word-row" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
            <SearchButton theme={C} />
            {date && <div className="hdr-date">{date}</div>}
            {account && <div className="hdr-acct">{account}</div>}
            {settings && <div className="hdr-gear">{settings}</div>}
            {meta}
          </div>
        </div>

        {/* THE PHONE'S PRODUCT SWITCH (2026-10-06): shown under 760px only (CSS below) */}
        <SportSwitch sport={sport} onHome={onHome} />

        {/* ── row 2: THE MOVING HEADER, ABOVE EVERYTHING ELSE (2026-09-06) ── */}
        <div className="hdr-ticker-slot">{children}</div>

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
        /* The slots are layout-neutral on a desktop (display: contents), so the
           bar is exactly the two rows it always was; the phone places them. */
        .hdr-date, .hdr-acct, .hdr-gear, .hdr-ticker-slot { display: contents; }
        .hdr-ticker-slot:empty { display: none; }
        .hdr-switch { display: none; }
        /* ── THE PHONE HEADER (2026-10-06, audit X1-X3) ──────────────────────
           Under the bottom bar's breakpoint (760px, components/MobileTabBar.js)
           the bar is two short rows:
             [mark] [MOONSHOT | TUDDY | LAMP switcher] [gear]
             [Today | Tmrw] [the product's own ticker ...........]
           It was a centred brand row, a Today/Sign up/gear row and the ticker:
           149px at 390 on MOONSHOT. Every control is 44px; the account pill
           moved into More (components/MobileTabBar.js); the other sports'
           scores left the ticker for the switcher's live dots. */
        @media (max-width: 760px) {
          /* a wrapping flex row, not a grid: a grid's first column would be as wide
             as the day switch and push the product switcher off the line above */
          header.hdr-one-bar > .hdr-bar {
            display: flex !important; flex-direction: row !important; flex-wrap: wrap; align-items: center;
            padding: 4px 12px 5px !important; column-gap: 8px !important; row-gap: 4px !important;
          }
          header.hdr-one-bar > .hdr-bar::after { content: ''; order: 4; flex: 0 0 100%; height: 0; }
          .hdr-row1, .hdr-brand, .hdr-meta, .hdr-word, .hdr-word-row { display: contents !important; }
          .hdr-mark-link { order: 1; flex: none; padding: 2px; }
          .hdr-mark { width: 40px !important; height: 40px !important; }
          .hdr-mark img { width: 40px !important; height: 40px !important; }
          .hdr-word-row > button, .hdr-word-row > span { display: none !important; }
          .hdr-switch { order: 2; flex: 1 1 0; display: flex; align-items: stretch; min-width: 0; border: 1px solid ${C.border}; border-radius: 999px; background: ${C.glass}; }
          .hdr-sw { position: relative; flex: 1 1 auto; min-width: 0; min-height: 44px; padding: 0 6px; border: 0; border-radius: 999px; background: transparent; color: ${C.text2}; font-size: 11px; font-weight: 900; letter-spacing: .05em; white-space: nowrap; cursor: pointer; }
          .hdr-sw.on { background: var(--sw); color: ${C.bg}; }
          .hdr-sw-live { position: absolute; top: 9px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: var(--sw); animation: pulse 2s infinite; }
          /* row 2 (before the day switch): row 1's switch has no room for a 44px button at 360 with four products */
          .hdr-search { order: 5; }
          .hdr-gear { display: block; order: 3; flex: none; }
          .hdr-gear > div > button[aria-haspopup] { width: 44px !important; height: 44px !important; font-size: 18px !important; }
          .hdr-acct { display: none; }
          .hdr-date { display: block; order: 5; flex: none; }
          .hdr-date .date-badge { display: none !important; }
          .hdr-date .date-mode-switch > div:last-child { padding: 0 !important; gap: 0 !important; }
          .hdr-date .date-mode-switch button { min-height: 44px; padding: 0 12px !important; font-size: 12px !important; }
          .hdr-ticker-slot { display: block; order: 6; flex: 1 1 0; min-width: 0; }
          .hdr-ticker-slot > * { margin-top: 0 !important; }
          .hdr-ticker-slot .hdr-ticker-track > *:not(.tp-game) { height: 36px !important; }
          /* the score strip's game chip (components/TickerPill GameChip): 34px chip, 44px tap box */
          .hdr-ticker-slot .tp-game, .nfl-ticker-shell .tp-game { padding: 5px 0 !important; }
          .hdr-scorebug { width: 100%; }
        }
      `}</style>
    </header>
  )
}
