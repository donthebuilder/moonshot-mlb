// ── #83 / #74: NINE HAND-COPIED NAVS THAT DISAGREED WITH EACH OTHER ─────────
//
// Every league page wrote its own <nav> inline. Nine copies of the same eight
// links, and they had drifted in two ways that a reader experiences as the app
// changing its mind about what exists:
//
//   · SETTINGS was gated on `membership.role === 'commissioner'` in four of
//     them (Draft, League, Matchup, Wire) and shown to everybody in the other
//     four (Team, Trades, Feed, Coach). So a member saw Settings appear and
//     disappear as they moved around the league, and the times it appeared it
//     led to the Commissioner Control Room, which is not theirs. The gated
//     version is the correct one -- this now behaves that way everywhere.
//   · `aria-label="League sections"` was on six of the nine. A screen-reader
//     user got a named landmark on some pages and an anonymous one on others.
//
// One component, one list, one gate. `active` is the key of the page rendering
// it, which is what makes the current item an <a> with aria-current rather
// than a link back to itself.

import Link from 'next/link'

// LABELS AND ORDER COME FROM ONE TABLE NOW (2026-09-07). This file spelled out
// its own list and LeagueMobileNav spelled out a different one, in a different
// order, with a different name for the same page -- the exact drift the header
// above describes, one level up. Both navs read lib/fantasy/nav.js.
import { FRANCHISE_NAV, FRANCHISE_RAIL } from '../../lib/fantasy/nav'

const ITEMS = FRANCHISE_RAIL.map((key) => [key, FRANCHISE_NAV[key].path, FRANCHISE_NAV[key].label])

// isCommissioner comes from fantasy_leagues.commissioner_id, not
// membership.role (2026-09-12, OPEN-ITEMS #2) -- see LeagueLayout for why.
export default function LeagueNav({ leagueId, active, isCommissioner, className, activeClassName }) {
  const base = `/fantasy/league/${leagueId}`
  return (
    <nav aria-label="League sections" className={className}>
      {ITEMS.map(([key, path, label]) => (
        key === active
          ? <a key={key} aria-current="page" className={activeClassName}>{label}</a>
          : <Link key={key} href={`${base}${path}`}>{label}</Link>
      ))}
      {isCommissioner && (
        active === 'settings'
          ? <a aria-current="page" className={activeClassName}>{FRANCHISE_NAV.settings.label}</a>
          : <Link href={`${base}/settings`}>{FRANCHISE_NAV.settings.label}</Link>
      )}
    </nav>
  )
}
