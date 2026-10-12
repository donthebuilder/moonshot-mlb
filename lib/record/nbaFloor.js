// THE BUCKETS PUBLIC-NUMBER FLOOR (2026-10-12, Donovan: "BUCKETS goes public only after 30 graded regular-season nights").
// Until a market has 30 graded regular-season nights, no NBA record number for that market is public: no hit count, no
// rate, no "X of Y". The line says "tracking" and carries n (the graded calls) and the nights so far. It holds even once
// BUCKETS_PUBLIC is on. Enforced where the numbers are made (the SERVER routes and readers), not in a component:
//   lib/calibration/generic.js blockFrom({ minNights })   /api/calibration?sport=nba, /called, /start
//   app/api/record/calls                                  the straight record line and the call list
//   app/api/buckets/record                                the Record tab (hits by market, last night, the calls that hit)
// ONE CONSTANT: the floor is lib/record/ladder.js LADDER_MIN_N (30), the ladder's own "tracking" bar. Pure, client-safe.
import { LADDER_MIN_N } from './ladder'

/** Graded regular-season NIGHTS a market needs before a record number is printed. */
export const NBA_MIN_NIGHTS = LADDER_MIN_N

export const isTracking = (nights) => !(Number(nights) >= NBA_MIN_NIGHTS)

/** "tracking · 12 graded calls, 3 of 30 nights" -- the only thing a market under the floor says about its record. */
export function trackingWords({ n = 0, nights = 0 } = {}) {
  return `tracking · ${n} graded ${n === 1 ? 'call' : 'calls'}, ${nights} of ${NBA_MIN_NIGHTS} nights`
}

/**
 * Graded calls -> { [market]: { n, nights, tracking } }. `items`: [{ market, date }], one per GRADED (hit or miss) CALLED
 * regular-season call; the caller leaves out preseason, void and ungraded rows.
 */
export function floorByMarket(items) {
  const by = {}
  for (const it of items || []) {
    const m = (by[it.market] ||= { n: 0, dates: new Set() })
    m.n += 1
    if (it.date) m.dates.add(it.date)
  }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { n: v.n, nights: v.dates.size, tracking: isTracking(v.dates.size) }]))
}

/**
 * /api/buckets/record's fold, with the floor applied. `rows`: buckets_log rows (game_date, market, status, hit, season_type, ...).
 * -> { nights, tracking } where a market under the floor has { n, tracking:true } and NO hit count, none of its "called that hit"
 * rows, and (points) none of the 25-point scorers it missed -- preseason rows included. A market with no regular-season graded
 * night yet is tracking too.
 */
export function foldBucketsNights(rows) {
  const floor = floorByMarket((rows || []).filter((r) => r.status === 'called' && r.hit != null && r.season_type !== 1).map((r) => ({ market: r.market, date: r.game_date })))
  const under = (k) => !floor[k] || floor[k].tracking
  const by = new Map()
  for (const r of rows || []) {
    const n = by.get(r.game_date) || { date: r.game_date, markets: {}, called: [], away: [] }
    const m = n.markets[r.market] ||= { n: 0, hit: 0 }
    if (r.status === 'called' && r.hit != null) { m.n += 1; if (r.hit && !under(r.market)) { m.hit += 1; n.called.push(r) } }
    if (r.market === 'pts' && r.hit === true && r.status !== 'called' && !under('pts')) n.away.push(r)
    by.set(r.game_date, n)
  }
  const tracking = {}
  for (const n of by.values()) for (const [k, m] of Object.entries(n.markets)) if (under(k)) { delete m.hit; m.tracking = true; tracking[k] = { n: floor[k]?.n || 0, nights: floor[k]?.nights || 0, minNights: NBA_MIN_NIGHTS } }
  return { nights: [...by.values()].sort((a, b) => a.date.localeCompare(b.date)), tracking }
}

/**
 * /api/record/calls for NBA, with the floor applied. `calls`: the listed calls ({ market, game_date, result, ... }).
 * -> { calls, tracking } -- a market under the floor loses every call row (results are the record) and is listed in `tracking`.
 */
export function floorCalls(calls, labelOf = (m) => m) {
  const floor = floorByMarket((calls || []).filter((p) => p.result === 'hit' || p.result === 'miss').map((p) => ({ market: p.market, date: p.game_date })))
  const under = new Set((calls || []).map((p) => p.market).filter((k) => !floor[k] || floor[k].tracking))   // a market with no graded call at all is under it too
  return {
    calls: (calls || []).filter((p) => !under.has(p.market)),
    tracking: [...under].filter((k) => floor[k]).map((market) => ({ market, label: labelOf(market), n: floor[market].n, nights: floor[market].nights, minNights: NBA_MIN_NIGHTS })),
  }
}
