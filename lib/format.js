// SMALL FORMATTERS, ONCE (R4, 2026-10-02). Started with ordinal(): eleven
// copies across lib / components / a tick route, five spellings, one rule --
// they agreed on every k from 1 to 5000. Callers that guard their input (round
// it, blank under 1, a dash for null) keep that guard and call this.

/** 1 -> '1st', 2 -> '2nd', 11 -> '11th', 23 -> '23rd'. */
export const ordinal = (k) => `${k}${[11, 12, 13].includes(k % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] || 'th')}`

// normName (R4): three identical copies (odds, nfl/oddsMatch, dash/homerFeed) -- the
// name key every odds join and the homer feed match on. Accents off, punctuation
// to spaces, lower case, a trailing Jr/Sr/II/III/IV/V dropped. (dash/mlbhr.js keeps
// its own: it matches @MLBHR's tweet text, a different job.)
const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/
export function normName(s) {
  const stripped = String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
  const parts = stripped.split(/\s+/).filter(Boolean)
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop()
  return parts.join(' ')
}

// fmtOdds (R4): two identical copies (odds, nfl/oddsMatch). A dash for 0 / not a
// number. (dash/homerFeed's fmtOdds has no guard -- a different contract, kept.)
export function fmtOdds(odds) {
  const n = Number(odds)
  if (!Number.isFinite(n) || n === 0) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

// Batch 1 text helpers (2026-10-17 audit): one rule each instead of per-file copies.

/** plural(1, 'game') -> '1 game', plural(2, 'game') -> '2 games'; plural(1, 'carry', 'carries') for irregulars. */
export const plural = (n, one, many = `${one}s`) => `${n} ${Number(n) === 1 ? one : many}`

/** Just the noun, for a count already printed elsewhere: pluralWord(1, 'game') -> 'game'. */
export const pluralWord = (n, one, many = `${one}s`) => (Number(n) === 1 ? one : many)

/**
 * A 1-based rank among n as words that never read as a score: 1 -> 'most in the league', 2 -> '2nd most';
 * the bottom half counts from the other end ('9th fewest'). With no n only the 'most' side is used (rank 1 is never '1st most').
 */
export function mostWord(r, n = null) {
  if (r == null || !Number.isFinite(Number(r)) || r < 1) return null
  if (r === 1) return 'most in the league'
  if (n == null || r <= Math.ceil(n / 2)) return `${ordinal(r)} most`
  const k = n + 1 - r
  return k === 1 ? 'fewest in the league' : `${ordinal(k)} fewest`
}

/**
 * A stat percentile p (0-100, higher = better) as the N in "top N%", held to 1..99 (a "top 0%" reads as a typo).
 * Say what it is measured on beside it: "top 1% of tonight's skaters".
 */
export const topPercentile = (p) => 100 - Math.min(99, Math.max(1, Math.round(Number(p))))

/**
 * A night rank (1 = best) among `of` as a plain band: { n: 5, word: 'top 5%' } | { n: null, word: 'top quarter' } | null (below the top half).
 * Rank 1 gives null: "#1 of 76" already says it, and "top 5%" for the first of 76 understated it.
 */
export function rankBandOf(rank, of) {
  const r = Number(rank), o = Number(of)
  if (!Number.isFinite(r) || !Number.isFinite(o) || o <= 0 || r < 1 || r > o) return null
  if (r === 1) return null
  const f = r / o
  const b = f <= 0.01 ? [1, 'top 1%'] : f <= 0.05 ? [5, 'top 5%'] : f <= 0.1 ? [10, 'top 10%'] : f <= 0.25 ? [null, 'top quarter'] : f <= 0.5 ? [null, 'top half'] : null
  return b ? { n: b[0], word: b[1] } : null
}
