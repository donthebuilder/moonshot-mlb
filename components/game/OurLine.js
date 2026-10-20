'use client'
import OurLineTable from './OurLineTable'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { canonTeam } from '../../lib/injuries/teams'
import { SPORT_ACCENT } from '../../lib/sportAccent'

// "OUR LINE" ON MOONSHOT'S, TUDDY'S AND LAMP'S GAME PAGES (2026-10-20, Donovan: "do this" -- BUCKETS' info-only line for
// every sport). Reads /api/lines for the game's own date and finds the game by its two clubs (each product keys its games
// its own way: MLB game_pk, NHL's ids, ESPN's), through the one club-code table (lib/injuries/teams.js canonTeam); a
// doubleheader takes the start nearest this game's. No row -> nothing drawn, never a guess.
const READS = {
  mlb: 'Club ratings and home field only',
  nfl: 'Club ratings and home field only',
  nhl: 'Club ratings, rest and home ice only',
}

/** The lines answer's game for these two clubs (and the start nearest `start`, when two match). */
export function findLine(sport, games, away, home, start = null) {
  const a = canonTeam(sport, away), h = canonTeam(sport, home)
  const hits = (games || []).filter((g) => canonTeam(sport, g.away) === a && canonTeam(sport, g.home) === h)
  if (hits.length < 2 || !start) return hits[0] || null
  const t = Date.parse(start)
  return hits.slice().sort((x, y) => Math.abs(Date.parse(x.start) - t) - Math.abs(Date.parse(y.start) - t))[0]
}

/** id / style: the wrapper's, drawn only with a row (no row = no wrapper, no height). */
export default function OurLine({ sport, date, away, home, start = null, theme, onOpenTeam, id = null, style = null }) {
  const ok = READS[sport] && /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && away && home
  const { data } = useLiveFetch(ok ? `/api/lines?sport=${sport}&date=${date}` : null, { enabled: Boolean(ok) })
  const line = ok ? findLine(sport, data?.games, away, home, start) : null
  if (!line) return null
  // the table's club codes are the product's own (its logos and team links), not ESPN's
  return (
    <div id={id || undefined} style={style || undefined}>
      <OurLineTable line={{ ...line, away, home }} sport={sport} theme={theme} accent={SPORT_ACCENT[sport]} reads={READS[sport]} onOpenTeam={onOpenTeam} />
    </div>
  )
}
