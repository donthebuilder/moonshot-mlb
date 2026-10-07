import { BRAND, SPORT_KEYS } from '../../lib/routes'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import styles from './PublicHeader.module.css'

// THE PUBLIC PAGES' ONE HEADER (2026-10-06, audit 1.2 / 1.3). /start drew
// "logo + DASH NETWORK / product + MLB NFL NHL pills"; /called drew a stacked
// "DASH NETWORK · MOONSHOT / CALLED IT" with no pills worth the name and an
// orange button; the app draws a third. This is the first one -- the best
// "where do I go" structure on the site (audit 1.4) -- and both public pages
// use it. Plain links, no JS, server-rendered.
//
//   sport   the sport key this page is showing (lit in its own accent)
//   base    '/start' or '/called' -- each pill links to `${base}?sport=${key}`
//   title   the line under DASH NETWORK, e.g. "MOONSHOT" or "MOONSHOT · CALLED IT"
//   cta     optional { href, label }: a page action, drawn on wider screens only
//           (the pages carry their own button under the headline on a phone)
// A product that is hidden stays off this list (lib/routes SPORT_KEYS).
export default function PublicHeader({ sport, base, title, cta = null }) {
  return (
    <header className={styles.bar}>
      <a className={styles.brand} href="/" aria-label="DASH Network home">
        <img src="/icon-192.png" alt="" width="32" height="32" />
        <div><small>DASH NETWORK</small><strong>{title}</strong></div>
      </a>
      <nav className={styles.nav} aria-label="Product">
        {SPORT_KEYS.map((k) => (
          <a key={k} className={k === sport ? styles.on : styles.off} style={{ '--acc': SPORT_ACCENT[k] }}
            href={`${base}?sport=${k}`} aria-current={k === sport ? 'page' : undefined}>
            <span aria-hidden="true">{BRAND[k].icon}</span> {BRAND[k].league}
          </a>
        ))}
        {cta && <a className={styles.cta} href={cta.href}>{cta.label}</a>}
      </nav>
    </header>
  )
}
