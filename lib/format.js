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
