// ROI BY BAND (odds plan step 3 prep, 2026-09-27). Pure -- no reads.
//
// Input: graded picks that carry a lock price (lib/odds/priceAtLock.js) --
//   { sport, status: 'called'|'board'|'off', result: 'hit'|'miss'|'void',
//     price: { best, median, fair, books } }
// Output: one row per (sport, status, price band): picks, hits, the average
// implied % at the median book, the actual hit %, and flat 1-unit ROI at the
// best book and at the median book.
//
// SHOWN ONLY AT n >= MIN_N (the plan: 100 priced picks in a band). A row
// under that is still returned, with `shown: false`, so a report can say
// "n = 37, not enough yet" -- the number is never printed as if it meant
// something. Voids (didn't play) are not picks for this table.
import { impliedOf, winProfit } from './priceAtLock'

export const MIN_N = 100

// Banded on the MEDIAN book's price: the market's price, not the one
// outlier book. Edges are the plan's (+150..+400, +401..+900), with the
// ends named so no pick falls outside a band.
export const BANDS = [
  { key: 'short', label: 'under +150', lo: -Infinity, hi: 149 },
  { key: 'mid', label: '+150 to +400', lo: 150, hi: 400 },
  { key: 'long', label: '+401 to +900', lo: 401, hi: 900 },
  { key: 'longshot', label: 'over +900', lo: 901, hi: Infinity },
]
export const bandOf = (american) => BANDS.find((b) => american >= b.lo && american <= b.hi)?.key || null

const STATUS_ORDER = { called: 0, 'hr-call': 1, board: 2, off: 3 }   // 'hr-call': the report's MLB TOP/HR subset

/** @returns {Array<object>} rows, sorted sport / status / band. */
export function roiTable(picks, { minN = MIN_N } = {}) {
  const groups = new Map()
  for (const p of picks) {
    if (p.result !== 'hit' && p.result !== 'miss') continue
    if (!p.price || !Number.isFinite(p.price.median) || !Number.isFinite(p.price.best)) continue
    const band = bandOf(p.price.median)
    const k = `${p.sport}|${p.status}|${band}`
    if (!groups.has(k)) groups.set(k, { sport: p.sport, status: p.status, band, n: 0, hits: 0, implied: 0, retBest: 0, retMedian: 0 })
    const g = groups.get(k)
    const hit = p.result === 'hit'
    g.n += 1
    if (hit) g.hits += 1
    g.implied += impliedOf(p.price.median)
    g.retBest += hit ? winProfit(p.price.best) : -1
    g.retMedian += hit ? winProfit(p.price.median) : -1
  }
  const bandIdx = Object.fromEntries(BANDS.map((b, i) => [b.key, i]))
  return [...groups.values()].map((g) => ({
    sport: g.sport, status: g.status, band: g.band,
    bandLabel: BANDS[bandIdx[g.band]]?.label || g.band,
    n: g.n, hits: g.hits,
    impliedPct: (100 * g.implied) / g.n,
    actualPct: (100 * g.hits) / g.n,
    roiBest: (100 * g.retBest) / g.n,
    roiMedian: (100 * g.retMedian) / g.n,
    shown: g.n >= minN,
  })).sort((a, b) => a.sport.localeCompare(b.sport) || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || bandIdx[a.band] - bandIdx[b.band])
}
