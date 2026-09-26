import Link from 'next/link'
import { C, NUM_FONT } from '../../lib/nhl/theme'

// LAMP'S CRAWLABLE PAGES (2026-09-26). The LAMP tabs live at /app#sport=nhl&
// tab=…, and a hash never reaches a server -- so to a search engine "NHL
// standings" on DASH was one page called /app. These are real addresses
// (/nhl/standings, /nhl/leaders, /nhl/goalies) rendered on the server: the
// title, the H1 and the table are in the HTML. Same reads as the tabs
// (lib/nhl/readers.js); the tab stays the working page, linked from here.
// A server component, no client JS: tables and plain links, and <details>
// where a list is long (phone first, rows 6+ behind one tap).
const LINKS = [
  ['/nhl/standings', 'Standings'],
  ['/nhl/leaders', 'Leaders'],
  ['/nhl/goalies', 'Goalies'],
  ['/called?sport=nhl', 'CALLED IT'],
]

export default function StaticPage({ here, eyebrow, h1, lede, appHref, appLabel, source, children }) {
  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '0 16px 64px' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
          <Link href="/start?sport=nhl" style={{ color: C.text, textDecoration: 'none' }}>
            <small style={{ display: 'block', color: C.ice, font: `900 9px/1.4 ${NUM_FONT}`, letterSpacing: '.16em' }}>DASH NETWORK</small>
            <strong style={{ fontSize: 17, letterSpacing: '.02em' }}>LAMP <span style={{ color: C.text3, fontSize: 11, fontWeight: 800 }}>NHL</span></strong>
          </Link>
          <nav aria-label="LAMP pages" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', font: `800 11px/1 ${NUM_FONT}` }}>
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} aria-current={href === here ? 'page' : undefined}
                style={{ color: href === here ? C.ice : C.text2, textDecoration: 'none', padding: '6px 0' }}>{label}</Link>
            ))}
          </nav>
        </header>
        <section style={{ padding: '22px 0 12px' }}>
          <p style={{ margin: '0 0 6px', color: C.ice, font: `900 9px/1 ${NUM_FONT}`, letterSpacing: '.16em' }}>{eyebrow}</p>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1, letterSpacing: '-.02em' }}>{h1}</h1>
          {lede ? <p style={{ margin: '10px 0 0', color: C.text2, fontSize: 13.5, lineHeight: 1.55, maxWidth: 640 }}>{lede}</p> : null}
          <p style={{ margin: '12px 0 0' }}>
            <a href={appHref} style={{ color: C.ice, font: `800 12px/1 ${NUM_FONT}`, textDecoration: 'none' }}>{appLabel} →</a>
          </p>
        </section>
        {children}
        {source ? <p style={{ marginTop: 28, color: C.text3, font: `11px/1.5 ${NUM_FONT}` }}>{source}</p> : null}
      </div>
    </main>
  )
}

// The pieces every LAMP page's tables share.
export const kicker = { margin: '18px 0 6px', color: C.text3, font: `900 9px/1 ${NUM_FONT}`, letterSpacing: '.14em' }
export const table = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }
export const th = { padding: '6px 6px', textAlign: 'left', color: C.text3, font: `800 8.5px/1 ${NUM_FONT}`, letterSpacing: '.1em', whiteSpace: 'nowrap' }
export const td = { padding: '7px 6px', borderTop: `1px solid ${C.border}`, verticalAlign: 'middle' }
export const num = { ...td, textAlign: 'right', fontFamily: NUM_FONT, whiteSpace: 'nowrap' }
export const more = { marginTop: 4, color: C.ice, font: `800 11px/1 ${NUM_FONT}` }
export const playerHref = (id) => `/app#sport=nhl&tab=player&player=${encodeURIComponent(id)}`
export const teamHref = (abbrev) => `/app#sport=nhl&tab=team&team=${encodeURIComponent(abbrev)}`
export const linkStyle = { color: C.text, textDecoration: 'none' }
