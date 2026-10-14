// CLOSING LINE VALUE at my book (2026-10-14, Donovan: "an EV thing, a CLV thing, an odds
// discrepancy thing"). Pure; any sport. Reads odds_snap rows (supabase/migrations/
// 202609262100_odds_snap.sql): one row per (event, odd, book, snap) with snap = list | lock | close.
//
// CLV = where the price ended up against the price you could have taken, in break-even points:
//   clv = implied(close) - implied(taken)        + = the price shortened after you took it
// A positive average over many bets is the standard sign that you are buying before the market
// agrees. It is a property of PRICES, not of results: it says nothing about whether any one bet won.
//
// Two closes, both reported, never blended:
//   vsBook   the book's own closing price (what my book moved to)
//   vsFair   the market's closing no-vig price (fair_odds: what the whole market settled on)
// Taken price: `lock` (50-70 min before start, the price a bettor could still take) or `list`
// (the day's first read). Only pregame, available, integer prices count; a row missing either end
// is left out, never filled in.
import { impliedPct } from '../odds'

export const CLV_MIN_N = 100   // same bar as lib/odds/roi.js: under this the number is not shown

const ok = (r) => r && r.available !== false && Number.isInteger(r.odds) && r.odds !== 0
const r1 = (x) => Math.round(10 * x) / 10

/**
 * @param rows odds_snap rows for ONE book, any mix of snaps
 * @param from 'lock' | 'list'  which read counts as the price taken
 * @returns [{ key, taken, close, fair, vsBook, vsFair }]  one per (event, odd) with both ends
 */
export function clvItems(rows, from = 'lock') {
  const by = new Map()
  for (const r of rows || []) {
    if (!ok(r)) continue
    const k = `${r.event_id}|${r.odd_id}|${String(r.book).toLowerCase()}`
    const e = by.get(k) || {}
    e[r.snap] = r
    by.set(k, e)
  }
  const out = []
  for (const [key, e] of by) {
    const a = e[from], c = e.close
    if (!a || !c) continue
    const taken = impliedPct(a.odds), close = impliedPct(c.odds)
    if (taken == null || close == null) continue
    const fairOk = Number.isInteger(c.fair_odds) && c.fair_odds !== 0
    const fair = fairOk ? impliedPct(c.fair_odds) : null
    out.push({
      key, taken: a.odds, close: c.odds, fair: fairOk ? c.fair_odds : null,
      vsBook: r1(close - taken), vsFair: fair == null ? null : r1(fair - taken),
    })
  }
  return out
}

/** mean, beat rate and a standard error over a list of numbers. Null when empty. */
function stat(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(x))
  const n = v.length
  if (!n) return { n: 0, mean: null, beat: null, se: null, shown: false }
  const mean = v.reduce((s, x) => s + x, 0) / n
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0
  return {
    n, mean: r1(mean), beat: Math.round((1000 * v.filter((x) => x > 0).length) / n) / 10,
    se: n > 1 ? r1(sd / Math.sqrt(n)) : null, shown: n >= CLV_MIN_N,
  }
}

/** @returns { vsBook, vsFair } each { n, mean (pp), beat (% of bets that shortened), se, shown } */
export function summarizeClv(items) {
  return { vsBook: stat(items.map((i) => i.vsBook)), vsFair: stat(items.map((i) => i.vsFair)) }
}
