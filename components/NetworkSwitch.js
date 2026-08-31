'use client'
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
  { key: 'mlb', name: 'MOONSHOT', meta: 'MLB', href: '/app#sport=mlb&tab=home', color: '#f97316' },
  { key: 'nfl', name: 'TUDDY', meta: 'NFL', href: '/app#sport=nfl&tab=home', color: '#22c55e' },
  { key: 'fantasy', name: 'FRANCHISE', meta: 'FANTASY', href: '/fantasy', color: '#ff633e' },
]

export default function NetworkSwitch({ onNavigate }) {
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
        {PRODUCTS.map((product) => (
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
        .networkSwitchRow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
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
