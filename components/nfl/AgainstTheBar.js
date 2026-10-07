'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// AGAINST THE BAR — one sentence, then the games.
//
// 2026-10-01 (0e a), Donovan on the dot strip that used to live here: "I
// actually hate these." It was an analyst instrument -- a dashed rule, three
// jitter lanes, fading dots, axis ticks, and a footnote telling you to "read
// the dots, not the rate". It needed instructions and it sat in front of the
// answer. The gate for every TUDDY chart now: a stranger reads it in five
// seconds with no legend, or it doesn't ship. This didn't, so it went.
//
// What stays is what the strip was computing all along, said in words, from
// the same fields (his own game log, the same clears() rule):
//   "Over 49.5: cleared 0 of his last 5 — short by 24.5 on average; best 41,
//    worst 3."
// and under it the games themselves, newest first, so the sentence can be
// checked against the numbers it came from.

// A half-point line (39.5) is cleared by going OVER it; a whole-number bar
// (1 TD, 12 carries) is cleared by REACHING it. StatPortal passes the market's
// own whole-number bar; the old `>` there graded "1 TD" as a miss on a game he
// scored in.
export const clears = (v, bar) => (Number.isInteger(bar) ? v >= bar : v > bar)

const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1))

export function barRead(log, statKey, bar, span = 5) {
  const all = (log || []).filter((g) => Number.isFinite(Number(g?.[statKey])))
  const games = span >= 9999 ? all : all.slice(-span)
  if (!games.length) return null
  const vals = games.map((g) => Number(g[statKey]))
  const overs = vals.filter((v) => clears(v, bar))
  const unders = vals.filter((v) => !clears(v, bar))
  return {
    games,
    n: vals.length,
    hits: overs.length,
    best: Math.max(...vals),
    worst: Math.min(...vals),
    over: overs.length ? overs.reduce((a, b) => a + b, 0) / overs.length - bar : null,
    short: unders.length ? bar - unders.reduce((a, b) => a + b, 0) / unders.length : null,
  }
}

// `head` overrides the lead-in entirely -- PropsGrid passes its own row name
// ("50+ Rush yds") so the sentence reads as the row it follows.
export function barSentence(read, bar, label = '', head = '') {
  if (!read) return ''
  const line = Number.isInteger(bar) ? `${bar}+` : `over ${bar}`
  if (!head) head = label ? `${label} ${line}` : line.charAt(0).toUpperCase() + line.slice(1)
  const games = read.n === 1 ? 'his last game' : `his last ${read.n}`
  let margin = ''
  if (read.hits === read.n && read.over != null) margin = ` — by ${fmt(read.over)} on average`
  else if (read.hits === 0 && read.short != null) margin = ` — short by ${fmt(read.short)} on average`
  else if (read.over != null && read.short != null) margin = ` — by ${fmt(read.over)} when he clears, short by ${fmt(read.short)} when he misses`
  const range = read.n > 1 ? `; best ${read.best}, worst ${read.worst}` : ''
  return `${head}: cleared ${read.hits} of ${games}${margin}${range}.`
}

// `big` (PropsGrid, 2026-10-07): the sentence as the HEADLINE over the broadcast bars, and no games list under it
// (the bars carry every game's number, opponent and week)
export default function AgainstTheBar({ log, statKey, bar, span = 5, label = '', head = '', big = false }) {
  const read = useMemo(() => barRead(log, statKey, bar, span), [log, statKey, bar, span])

  if (!read) {
    return (
      <div style={{ fontSize: 12, color: C.text3, padding: '6px 0' }}>
        No games for this market yet.
      </div>
    )
  }

  if (big) {
    return <div style={{ fontSize: 17, color: C.text, lineHeight: 1.4, fontWeight: 800 }}>{barSentence(read, bar, label, head)}</div>
  }
  const newest = [...read.games].reverse()
  const lastSeason = newest[0]?.s
  return (
    <div>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, fontWeight: 700 }}>
        {barSentence(read, bar, label, head)}
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 5,
        fontFamily: NUM_FONT, fontSize: 12, color: C.text3, lineHeight: 1.6,
      }}>
        {newest.map((g, i) => {
          const v = Number(g[statKey])
          const hit = clears(v, bar)
          return (
            <span key={`${g.s}-${g.w}-${i}`} style={{ whiteSpace: 'nowrap' }}>
              {g.w != null ? `wk ${g.w}` : ''}{g.s && g.s !== lastSeason ? ` '${String(g.s).slice(-2)}` : ''}{g.opp ? ` ${g.opp}` : ''}{' '}
              <b style={{ color: hit ? C.green : C.text2, fontWeight: 900 }}>{v}</b>
            </span>
          )
        })}
      </div>
    </div>
  )
}
