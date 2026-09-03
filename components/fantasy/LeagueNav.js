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

const ITEMS = [
  ['draft',    '',           'Draft'],
  ['team',     '/team',      'Team'],
  ['matchup',  '/matchup',   'Matchup'],
  ['league',   '/league',    'League'],
  ['wire',     '/wire',      'Wire'],
  ['trades',   '/trades',    'Trades'],
  ['feed',     '/feed',      'Feed'],
  ['coach',    '/coach',     'Coach'],
]

export default function LeagueNav({ leagueId, active, role, className, activeClassName }) {
  const base = `/fantasy/league/${leagueId}`
  const isCommissioner = role === 'commissioner'
  return (
    <nav aria-label="League sections" className={className}>
      {ITEMS.map(([key, path, label]) => (
        key === active
          ? <a key={key} aria-current="page" className={activeClassName}>{label}</a>
          : <Link key={key} href={`${base}${path}`}>{label}</Link>
      ))}
      {isCommissioner && (
        active === 'settings'
          ? <a aria-current="page" className={activeClassName}>Settings</a>
          : <Link href={`${base}/settings`}>Settings</Link>
      )}
    </nav>
  )
}
