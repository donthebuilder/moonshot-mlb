'use client'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { useBucketsLines } from '../../lib/nba/useBuckets'
import { AT_BREAKS, COMEBACKS_SEASON, clubComebacks, comebackFor } from '../../lib/nba/comebacks'
import { fmtMl } from '../../lib/nba/favourites'
import { Kicker } from './ui'

// 🔁 COMEBACK WATCH (2026-10-22, Donovan: "look at the starting odds and then where they're at inside the game when they're
// down ... a good point to buy them so we can flip and hold"). LIVE games only, once a club trails by 10+: its pregame price
// (the book line we stored before the tip), how often clubs in its pregame role came back from this deep last season, the
// same at the last break (half / after Q3) when it was behind there, and the club's own comebacks. Counts from finished
// games (lib/nba/comebacks.js), no chance printed, no live price (we hold none).
export default function ComebackLine({ game, id, date }) {
  const { data } = useBucketsLines(date || null)
  if (game?.state !== 'live') return null
  const { away, home } = game
  const as = Number(away.score), hs = Number(home.score)
  if (!Number.isFinite(as) || !Number.isFinite(hs) || as === hs) return null
  const trailHome = hs < as
  const club = trailHome ? home : away
  const behind = Math.abs(hs - as)
  const book = (data?.games || []).find((x) => String(x.id) === String(id))?.book || null
  const spreadMine = book?.spread_home == null ? null : trailHome ? Number(book.spread_home) : -Number(book.spread_home)
  const read = comebackFor(spreadMine, behind)
  if (!read) return null
  const ml = fmtMl(trailHome ? book.ml_home : book.ml_away)
  const spread = spreadMine === 0 ? 'PK' : `${spreadMine > 0 ? '+' : ''}${spreadMine}`

  // the last break it was behind at: after Q3 once Q4 is on, the half once Q3 is on (each club's quarter scores summed)
  const done = Math.min(away.linescores?.length || 0, home.linescores?.length || 0) - 1
  const at = done >= 3 ? 2 : done >= 2 ? 1 : null
  let brk = null
  if (at != null) {
    const sum = (t) => (t.linescores || []).slice(0, at + 1).reduce((a, b) => a + (Number(b) || 0), 0)
    const down = trailHome ? sum(away) - sum(home) : sum(home) - sum(away)
    const b = AT_BREAKS[at]
    const row = down > 0 ? [...b.rows].reverse().find((x) => down >= x.down) : null
    const side = spreadMine < 0 ? row?.fav : spreadMine > 0 ? row?.dog : row
    if (row && side?.n) brk = { label: at === 2 ? 'after Q3' : 'at the half', down: row.down, ...side, as: spreadMine < 0 ? 'favourites' : spreadMine > 0 ? 'underdogs' : 'clubs' }
  }
  const own = clubComebacks(club.abbrev)
  const n = (v) => <b style={{ fontFamily: NUM_FONT, color: C.text }}>{v}</b>
  const line = { margin: 0, fontSize: 12, color: C.text2, lineHeight: 1.45 }
  return (
    <section aria-label="Comeback watch" style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', background: C.bg2 }}>
      <Kicker>🔁 COMEBACK WATCH · {club.abbrev} DOWN {behind}</Kicker>
      <div style={{ display: 'grid', gap: 4 }}>
        <p style={line}>Pregame {n(`${club.abbrev} ${spread}`)}{ml ? <> · ML {n(ml)}</> : null}. {read.role}, down {read.down}+ in {COMEBACKS_SEASON}: won {n(`${read.won} of ${read.n}`)}.</p>
        {brk ? <p style={line}>{brk.as[0].toUpperCase() + brk.as.slice(1)} down {brk.down}+ {brk.label}: won {n(`${brk.won} of ${brk.n}`)}.</p> : null}
        {own ? <p style={line}>{club.abbrev} last season: won {n(`${own.won10} of ${own.down10}`)} after trailing by 10+.</p> : null}
      </div>
    </section>
  )
}
