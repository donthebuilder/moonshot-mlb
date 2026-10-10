// CALLS LANDED, AND THE STRAIGHT RECORD LINE (2026-10-10, one-record batch). Pure, client-safe.
//
// Two different questions, each with its own words, so a visitor never sees one number answer both:
//
//   CALLS LANDED   of the calls we made, how many did what they were called to do? (hit rate per call)
//                  Read from the lock-enforced calibration reader (/api/calibration?sport=), every sport
//                  through the same shape: the tiers that are calls (MLB's five CALLED roles, the CALLED row
//                  of NHL / NBA, every NFL card market), each on its own bar, regular season.
//   CAPTURE        of the events that happened (home runs, touchdowns, goals), how many had we called?
//                  That is the /called event count (lib/record/shape.js eventCapture): a coverage figure,
//                  secondary, always labelled "capture".
//
//   STRAIGHT LINE  one line per sport on the ledger: n, hit rate with its 95% Wilson interval, the rate the
//                  stored prices imply for the same calls, and flat 1-unit returns at the median and the best
//                  price ONLY once 100+ calls carry a stored price (lib/odds/roi MIN_N). A call with no stored
//                  price is counted in n and the hit rate, never in the price comparison. Voids are no result.
// Nothing here is typed: every number is a count of rows handed in.
import { wilson } from '../interval'
import { impliedOf, winProfit } from '../odds/priceAtLock'
import { MIN_N as PRICED_MIN } from '../odds/roi'

// what the straight line counts, per sport (the headline call whose market IS the stored price; app/api/record/calls)
export const STRAIGHT_CALL_WORD = { mlb: 'home-run calls (TOP or HR, a hitter once a night)', nfl: 'touchdown calls', nhl: 'goal calls', nba: 'calls' }

const num = (v) => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null }   // an absent price is not a 0
const pct1 = (h, n) => (n > 0 ? Math.round((1000 * h) / n) / 10 : null)

/** True for a tier that is a call (not a status row of the board, not a model band). */
export const isCallTier = (t) => t?.kind === 'call' || t?.status === 'called'

/**
 * A /api/calibration body -> the calls landed, regular season, or null when nothing is graded.
 * { n, hits, rate, ci:[lo,hi], enough, minN, tiers:[{key,label,bar,n,hits}], nights, unit, from, to, void, pending }
 */
export function callsLandedFrom(cal) {
  const b = cal?.regular
  if (!b?.nights) return null
  const tiers = (b.tiers || []).filter(isCallTier).map((t) => ({ key: t.key, label: t.label, bar: t.bar, n: t.n, hits: t.hits }))
  const n = tiers.reduce((a, t) => a + (t.n || 0), 0)
  const hits = tiers.reduce((a, t) => a + (t.hits || 0), 0)
  if (!n) return null
  const minN = cal.minN ?? 30
  return {
    n, hits, rate: pct1(hits, n), ci: wilson(hits, n), enough: n >= minN, minN, tiers,
    nights: b.nights, unit: b.unit || 'night', from: b.from || null, to: b.to || null,
    void: b.void || 0, pending: b.pending || 0, late: b.late || 0,
  }
}

/** One call row of /api/record/calls -> the straight line: n, hit rate, interval, implied, units. */
export function straightLine(calls, { minPriced = PRICED_MIN } = {}) {
  const graded = (calls || []).filter((c) => c?.result === 'hit' || c?.result === 'miss')
  const n = graded.length
  if (!n) return null
  const hits = graded.filter((c) => c.result === 'hit').length
  const priced = graded.filter((c) => num(c.median) != null && num(c.best) != null)
  const pricedHits = priced.filter((c) => c.result === 'hit').length
  const out = {
    n, hits, rate: pct1(hits, n), ci: wilson(hits, n), voids: (calls || []).filter((c) => c?.result === 'void').length,
    priced: priced.length, pricedHits, pricedRate: pct1(pricedHits, priced.length),
    // the rate the stored median prices imply for these same calls (no vig removed: the price as it stood)
    impliedRate: priced.length ? Math.round(1000 * (priced.reduce((a, c) => a + impliedOf(Number(c.median)), 0) / priced.length)) / 10 : null,
    minPriced, units: null,
  }
  if (priced.length >= minPriced) {
    const ret = (key) => priced.reduce((a, c) => a + (c.result === 'hit' ? winProfit(Number(c[key])) : -1), 0)
    out.units = { median: Math.round(ret('median') * 10) / 10, best: Math.round(ret('best') * 10) / 10 }
  }
  return out
}

const ci = (x) => (x?.ci ? `${x.ci[0].toFixed(0)}–${x.ci[1].toFixed(0)}%` : null)
const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`

/** The straight line as plain words: an array of short sentences (a surface joins them). */
export function straightWords(sl, { callWord = 'calls', season = 'this season' } = {}) {
  if (!sl) return []
  const out = [`${sl.hits} of ${sl.n} ${callWord} hit ${season}${sl.rate != null ? ` (${sl.rate}%${ci(sl) ? `, 95% range ${ci(sl)}` : ''})` : ''}.`]
  if (sl.priced > 0) {
    out.push(`${sl.priced} had a price stored at lock; the prices imply ${sl.impliedRate}% for those, and they hit ${sl.pricedRate}% (${sl.pricedHits}/${sl.priced}).`)
  } else {
    out.push('No stored price on any of them yet, so no price comparison.')
  }
  if (sl.units) out.push(`One unit on each of the ${sl.priced} priced calls: ${signed(sl.units.median)} units at the median price, ${signed(sl.units.best)} at the best price.`)
  else if (sl.priced > 0) out.push(`Units are not quoted under ${sl.minPriced} priced calls (${sl.priced} so far).`)
  return out
}

/** Calls landed as one plain sentence pair: [headline, detail]. */
export function landedWords(l, { callWord = 'calls' } = {}) {
  if (!l) return null
  const unit = l.nights === 1 ? l.unit : `${l.unit}s`
  const head = `${l.hits.toLocaleString('en-US')} of ${l.n.toLocaleString('en-US')} ${callWord} landed`
  const rate = l.enough && l.rate != null ? `${l.rate}%${ci(l) ? `, 95% range ${ci(l)}` : ''}` : `not enough calls for a rate yet (${l.minN} needed)`
  return [head, `${rate} · ${l.nights} ${unit}, each call on its own bar`]
}
