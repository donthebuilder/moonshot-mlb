'use client'
import { SPORT_ACCENT } from '../lib/sportAccent'
import { useVisibleSports } from '../lib/useVisibleSports'
// the inline row's rules as a real stylesheet, sent with the page: as styled-jsx they
// arrived only after hydration, so a hard load showed the row unstyled (2026-10-03)
import './NetworkSwitch.css'
import { ACCENT as FRANCHISE_ACCENT } from '../lib/fantasy/theme'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { setSport, useSport } from '../lib/sport'

// 🧭 THE NETWORK SWITCH (2026-08-29).
//
// Donovan: "remove the little floating ico, its redundant now — just make it
// so we can navigate the different sites from the nav thing at the bottom."
// components/DashNetworkNav.js was a draggable launcher pinned over every
// page in the network; it duplicated routes the header and the bottom bar
// already own, and on a phone it floated on top of the content it was
// covering. Deleted. This is the same three destinations, living inside the
// navigation the user is already in.
//
// Rules kept from the old switcher, because they were right:
//  · On /app, MOONSHOT <-> TUDDY is a STATE flip, not a navigation — a full
//    page load would throw away the slate that is already fetched. Off /app
//    (Franchise, the front door) the link navigates normally.
//  · The product you are in is marked, not hidden — "you are here" is a
//    navigational fact, and hiding it makes the row jump between screens.

const PRODUCTS = [
  { key: 'mlb', name: 'MOONSHOT', meta: 'MLB', href: '/app#sport=mlb&tab=home', color: SPORT_ACCENT.mlb },
  { key: 'nfl', name: 'TUDDY', meta: 'NFL', href: '/app#sport=nfl&tab=home', color: SPORT_ACCENT.nfl },  // jade, its theme's own (R2a; was #22c55e)
  // 2026-09-25: LAMP, the NHL product. Ice, so it reads apart from orange and jade.
  { key: 'nhl', name: 'LAMP', meta: 'NHL', href: '/app#sport=nhl&tab=home', color: SPORT_ACCENT.nhl },
  // 2026-10-02: BUCKETS, the NBA product -- shown only to a visitor who may see it (lib/useVisibleSports.js)
  { key: 'nba', name: 'BUCKETS', meta: 'NBA', href: '/app#sport=nba&tab=home', color: SPORT_ACCENT.nba, hidden: true },
  // FRANCHISE is gold (R10, Donovan 10-01 "stay gold"), from its own theme -- was a typed orange-red
  { key: 'fantasy', name: 'FRANCHISE', meta: 'FANTASY', href: '/fantasy', color: FRANCHISE_ACCENT },
]

// ── THE INLINE VARIANT (2026-09-06) ─────────────────────────────────────────
// Donovan: "i dont really like how its two navs, the three sites then the
// franchise nav under it."
//
// He was right and it was two different mistakes wearing the same hat:
//
//  · On /fantasy the page had a brand bar AND a boxed three-tile switcher
//    stacked beneath it -- two rows of chrome before any content, doing one
//    job between them.
//  · In a league room there was no switcher at all, just "← FRANCHISE", so
//    reaching MOONSHOT or TUDDY from a lineup screen took two navigations and
//    a bit of faith.
//
// `variant="inline"` is the same three destinations as one header-height row.
// It REPLACES the back link rather than joining it: FRANCHISE is already one
// of the three tiles and it already points at /fantasy, so the row does the
// back link's whole job and two more besides. One control, one row, no stack.
// a hidden product (BUCKETS before it opens) only for a visitor who may see it
function useProducts() {
  const seen = useVisibleSports()
  return PRODUCTS.filter((p) => !p.hidden || seen.includes(p.key))
}

export default function NetworkSwitch({ onNavigate, variant }) {
  if (variant === 'inline') return <InlineSwitch onNavigate={onNavigate} />
  return <StackedSwitch onNavigate={onNavigate} />
}

function InlineSwitch({ onNavigate }) {
  const products = useProducts()
  const pathname = usePathname()
  const sport = useSport()
  const current = pathname.startsWith('/fantasy') ? 'fantasy' : (pathname === '/' ? null : sport)
  const go = (event, key) => {
    if (pathname === '/app' && key !== 'fantasy') { event.preventDefault(); setSport(key) }
    if (onNavigate) onNavigate()
  }
  return (
    <nav aria-label="DASH Network" className="netBar">
      <a className="netHome" href="/" aria-label="DASH Network home">⌂</a>
      {products.map((product) => (
        <Link
          key={product.key}
          href={product.href}
          onClick={(event) => go(event, product.key)}
          aria-current={current === product.key ? 'page' : undefined}
          className={current === product.key ? 'here' : ''}
          style={{ '--product': product.color }}
          title={`${product.name} · ${product.meta}`}
        >
          <i>{product.name.slice(0, 1)}</i>
          <b>{product.name}</b>
        </Link>
      ))}
    </nav>
  )
}

function StackedSwitch({ onNavigate }) {
  const products = useProducts()
  const pathname = usePathname()
  const sport = useSport()
  const current = pathname.startsWith('/fantasy') ? 'fantasy' : (pathname === '/' ? null : sport)

  const go = (event, key) => {
    if (pathname === '/app' && key !== 'fantasy') { event.preventDefault(); setSport(key) }
    if (onNavigate) onNavigate()
  }

  return (
    <div className="networkSwitch">
      <div className="networkSwitchHead">
        <small>DASH NETWORK</small>
        <a href="/" aria-label="DASH Network home">⌂ DASH HOME</a>
      </div>
      <div className="networkSwitchRow">
        {products.map((product) => (
          <Link
            key={product.key}
            href={product.href}
            onClick={(event) => go(event, product.key)}
            aria-current={current === product.key ? 'page' : undefined}
            className={current === product.key ? 'here' : ''}
            style={{ '--product': product.color }}
          >
            <i>{product.name.slice(0, 1)}</i>
            <b>{product.name}</b>
            <small>{current === product.key ? 'YOU ARE HERE' : product.meta}</small>
          </Link>
        ))}
      </div>
      <style jsx>{`
        .networkSwitch{grid-column:1/-1;padding:9px 10px;border:1px solid #ffffff1c;border-radius:11px;background:#ffffff08}
        .networkSwitchHead{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px}
        .networkSwitchHead small{color:#f97316;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:8px;font-weight:900;letter-spacing:.14em}
        .networkSwitchHead a{color:#ffffff7a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:8px;font-weight:800;text-decoration:none}
        .networkSwitchRow{display:grid;grid-template-columns:repeat(${products.length},minmax(0,1fr));gap:6px}
        .networkSwitchRow :global(a){display:flex;flex-direction:column;align-items:center;gap:3px;min-height:62px;padding:8px 4px;border:1px solid color-mix(in srgb,var(--product) 34%,#ffffff1a);border-radius:10px;background:color-mix(in srgb,var(--product) 7%,transparent);color:#e9e6e0;text-align:center;text-decoration:none}
        .networkSwitchRow :global(a.here){border-color:var(--product);background:color-mix(in srgb,var(--product) 16%,transparent)}
        .networkSwitchRow :global(a i){display:grid;place-items:center;width:22px;height:22px;border:1px solid color-mix(in srgb,var(--product) 50%,#333);border-radius:7px;color:var(--product);font:900 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;font-style:normal}
        .networkSwitchRow :global(a b){font-size:9.5px;font-weight:900;letter-spacing:.02em}
        .networkSwitchRow :global(a small){color:#ffffff66;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:7px;font-weight:800;letter-spacing:.08em}
        .networkSwitchRow :global(a.here small){color:var(--product)}
      `}</style>
    </div>
  )
}
