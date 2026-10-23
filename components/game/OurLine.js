'use client'
import OurLineTable from './OurLineTable'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { canonTeam } from '../../lib/injuries/teams'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { blowoutFor, BLOWOUT_FINAL, WATCH_RECORD } from '../../lib/blowout'

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
  // 💨 BLOWOUT WATCH (lib/blowout.js, NFL 10+ since 2026-10-23): the book's spread big enough, said with its price and how
  // favourites that size did. A sport with no watch number (MLB, NHL) draws nothing here.
  const blow = blowoutFor(sport, line.book?.spread_home ?? null, { home, away, team: home })
  const rec = blow?.watch ? WATCH_RECORD[sport] : null
  const favMl = blow?.watch ? (blow.favoured ? line.book?.ml_home : line.book?.ml_away) : null
  const { C, NUM_FONT } = theme
  // the table's club codes are the product's own (its logos and team links), not ESPN's
  return (
    <div id={id || undefined} style={style || undefined}>
      <OurLineTable line={{ ...line, away, home }} sport={sport} theme={theme} accent={SPORT_ACCENT[sport]} reads={READS[sport]} onOpenTeam={onOpenTeam} />
      {blow?.watch ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: C.text2, lineHeight: 1.45 }}>
          💨 <b style={{ color: C.text }}>BLOWOUT WATCH</b> · the book has <b style={{ color: C.text, fontFamily: NUM_FONT }}>{blow.favoured ? home : away} by {blow.spread}</b>
          {favMl != null ? <> · ML <b style={{ color: C.text, fontFamily: NUM_FONT }}>{favMl > 0 ? `+${favMl}` : favMl}</b></> : null}
          {rec ? <>. Favourites by {blow.at}+, {rec.seasons}: won <b style={{ color: C.text, fontFamily: NUM_FONT }}>{rec.won} of {rec.games}</b>, {rec.big} by {BLOWOUT_FINAL[sport]}+.</> : '.'}
        </p>
      ) : null}
    </div>
  )
}
