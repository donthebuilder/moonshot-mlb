// WHY THIS HITTER, IN NUMBERS (2026-09-30, BATCH-SIGNAL-WHY S1). The MLB
// twin of lib/nfl/boardReason.js: for one board row, the two or three
// published numbers that lift him furthest above tonight's board, each with
// its value and where it ranks among tonight's rated hitters --
//   "Avg exit velo 93.1 mph · 4th of 72 tonight"
// -- and watchFor(): the one number that argues against him, same rule.
//
// RULES (the plan's, and the header rule of the batch):
//  - Fields ONLY from the published row, read through lib/boardColumns.js
//    boardRow() -- the same normalised values the board's own columns show,
//    so a reason can never disagree with the cell beside it.
//  - A leg with no number is not a reason; a missing field is skipped,
//    never filled. No new score, no weight, no "edge".
//  - Ranked among the hitters who HAVE that number tonight ("of 72"), in
//    the direction that is good for the bat (the column's own `invert`).
//  - At most one leg per family, so three ways of saying "he has power"
//    don't crowd out the matchup or the park.
//  - why: legs in tonight's top quarter (>= 75th percentile, good side),
//    best first, up to three. watch: the single worst leg from the WATCH
//    set at or under the 25th percentile. Nothing qualifies -> nothing said.
//
// `title` on each reason is the column's own definition (lib/boardColumns.js),
// for the tap-to-explain (lib/explain.js) -- no new copy.
import { boardColumns, boardRowContext, boardRows } from '../boardColumns'

// key, words, family, format(v) -> string, zeroIsMissing (boardRow fills 0
// for an unpublished score), invert (lower is better for the bat; must match
// the column's own flag -- checked in scripts/check-mlb-board-reason.mjs).
const LEGS = [
  // 'Recent': the board's own window (recent_ev / recent_barrel_rate), which
  // is not the card strip's last-25-PA / last-20-PA number -- named so the two
  // never read as one stat disagreeing with itself.
  { key: 'ev', words: 'Recent avg exit velo', fam: 'contact', fmt: (v) => `${v.toFixed(1)} mph` },
  { key: 'brl', words: 'Recent barrel rate', fam: 'contact', fmt: (v) => `${v.toFixed(1)}%` },
  { key: 'd350', words: 'Balls hit 350+ ft', fam: 'contact', fmt: (v) => `${Math.round(v)}%` },
  { key: 'p3', words: 'Power-3', fam: 'contact', fmt: (v) => `${Math.round(v)}`, zeroIsMissing: true },
  { key: 'iso', words: 'ISO', fam: 'power', fmt: (v) => v.toFixed(3).replace(/^0/, '') },
  { key: 'isoHand', words: 'ISO vs this hand', fam: 'power', fmt: (v) => v.toFixed(3).replace(/^0/, '') },
  { key: 'hrPa', words: 'HR per PA', fam: 'power', fmt: (v) => v.toFixed(3).replace(/^0/, '') },
  { key: 'sznHr', words: 'Season HR', fam: 'power', fmt: (v) => `${Math.round(v)}` },
  // 'Last-10 HR', not 'HR in his last 10': the value follows the words, and "HR in his last 10 2" read as one number (10-02)
  { key: 'l10hr', words: 'Last-10 HR', fam: 'form', fmt: (v) => `${Math.round(v)}` },
  { key: 'pmatch', words: 'Pitch-type match', fam: 'matchup', fmt: (v) => v.toFixed(1), zeroIsMissing: true },
  { key: 'pmix', words: 'Pitch-mix score', fam: 'matchup', fmt: (v) => v.toFixed(1), zeroIsMissing: true },
  { key: 'hrw', words: 'HR window', fam: 'matchup', fmt: (v) => v.toFixed(1), zeroIsMissing: true },
  { key: 'park', words: 'Park HR factor', fam: 'park', fmt: (v) => `${v.toFixed(2)}x` },
  { key: 'hr9', words: 'Starter HR/9', fam: 'arm', fmt: (v) => v.toFixed(2), zeroIsMissing: true },
  { key: 'pL3Hr9', words: 'Starter HR/9, last 3', fam: 'arm', fmt: (v) => v.toFixed(2) },
  { key: 'pBrl', words: 'Starter barrel% allowed', fam: 'arm', fmt: (v) => `${v.toFixed(1)}%` },
  { key: 'pHH', words: 'Starter hard-hit% allowed', fam: 'arm', fmt: (v) => `${v.toFixed(1)}%` },
  { key: 'pPull', words: 'Starter pull-air% allowed', fam: 'arm', fmt: (v) => `${v.toFixed(1)}%` },
  { key: 'pFB', words: 'Starter fly-ball%', fam: 'arm', fmt: (v) => `${v.toFixed(1)}%` },
  // against the bat: lower is better
  { key: 'k', words: 'K rate', fam: 'k', fmt: (v) => `${v.toFixed(1)}%`, invert: true, zeroIsMissing: true },
  { key: 'kRisk', words: 'K risk', fam: 'k', fmt: (v) => `${Math.round(v)}`, invert: true, zeroIsMissing: true },
  { key: 'pK9', words: 'Starter K/9', fam: 'armK', fmt: (v) => v.toFixed(2), invert: true },
  { key: 'pSw', words: 'Starter swinging-strike%', fam: 'armK', fmt: (v) => `${v.toFixed(1)}%`, invert: true },
]
export const LEG_KEYS = LEGS.map((l) => l.key)
// The legs that can argue against him (watchFor). Season power is not here:
// a low ISO is who he is, not a warning about tonight.
const WATCH = ['kRisk', 'k', 'pK9', 'pSw', 'l10hr', 'hr9', 'park']
// A leg whose board column carries no definition borrows the one the site
// already prints elsewhere (no new copy): PMix from the ranked boards
// (components/tabs/RankedBoard.js).
const TITLE_FALLBACK = { pmix: 'How well his swing matches the arsenal he is facing tonight.' }
// Legs that belong to the GAME, not the hitter: every bat facing one starter
// shares his HR/9, every bat in one building shares its park factor. Ranked
// among tonight's starters / parks ("1st of 8 starters tonight"), one value
// each, so nine Padres don't each read "1st of 72".
const SHARED = {
  arm: { of: 'starters', id: (r) => r._raw?.pitcher_id ?? r._raw?.pitcher_name ?? null },
  armK: { of: 'starters', id: (r) => r._raw?.pitcher_id ?? r._raw?.pitcher_name ?? null },
  park: { of: 'parks', id: (r) => r._raw?.venue_name ?? r._raw?.game_pk ?? null },
}
const WHY_PCT = 75
const WATCH_PCT = 25

const ordinal = (k) => `${k}${[11, 12, 13].includes(k % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] || 'th')}`
const valueOf = (row, leg) => {
  const v = row?.[leg.key]
  if (v === null || v === undefined || v === '') return null
  const x = Number(v)
  if (!Number.isFinite(x)) return null
  if (leg.zeroIsMissing && x === 0) return null
  return x
}

/**
 * Tonight's distributions, once per board. `players` = the slate's raw rows
 * (the whole slate, never a filtered view: a rank is a fact about tonight).
 */
export function reasonContext(players) {
  const all = Array.isArray(players) ? players : []
  const rows = boardRows(all, boardRowContext(all))
  const titles = { ...TITLE_FALLBACK, ...Object.fromEntries(boardColumns({}).filter((c) => c.title).map((c) => [c.key, c.title])) }
  const dist = {}
  for (const leg of LEGS) {
    const shared = SHARED[leg.fam]
    let vals
    if (shared) {
      const one = new Map()
      for (const r of rows) {
        const v = valueOf(r, leg)
        const id = shared.id(r)
        if (v != null && id != null && !one.has(String(id))) one.set(String(id), v)
      }
      vals = [...one.values()]
    } else {
      vals = rows.map((r) => valueOf(r, leg)).filter((v) => v != null)
    }
    // good-for-the-bat order: higher first, or lower first when inverted
    dist[leg.key] = vals.sort((a, b) => (leg.invert ? a - b : b - a))
  }
  return { rows, dist, titles }
}

/** Where v sits, good side up: rank (1 = best for the bat), n, pct (100 = best). */
function placeOf(leg, v, ctx) {
  const vals = ctx.dist[leg.key] || []
  const n = vals.length
  if (n < 2) return null
  const better = vals.filter((x) => (leg.invert ? x < v : x > v)).length
  const worse = vals.filter((x) => (leg.invert ? x > v : x < v)).length
  const rank = better + 1
  const pct = (100 * (worse + 0.5 * (n - better - worse))) / n
  return { rank, n, pct, worseRank: worse + 1 }
}

function reason(leg, v, place, ctx, side) {
  const of = SHARED[leg.fam]?.of ? ` ${SHARED[leg.fam].of}` : ''
  const dir = leg.invert ? 'highest' : 'lowest'
  const where = side === 'why'
    ? `${ordinal(place.rank)} of ${place.n}${of} tonight`
    : `${place.worseRank === 1 ? dir : `${ordinal(place.worseRank)}-${dir}`} of ${place.n}${of} tonight`
  return {
    key: leg.key, label: leg.words, value: v, rank: side === 'why' ? place.rank : place.worseRank, n: place.n,
    pct: Math.round(place.pct), text: `${leg.words} ${leg.fmt(v)} · ${where}`, title: ctx.titles[leg.key] || '',
  }
}

/** Up to three reasons he's up there, best first; [] when nothing clears the top quarter. */
export function whyFor(row, ctx, { max = 3 } = {}) {
  if (!row || !ctx) return []
  const cands = []
  for (const leg of LEGS) {
    const v = valueOf(row, leg)
    if (v == null) continue
    const place = placeOf(leg, v, ctx)
    if (!place || place.pct < WHY_PCT) continue
    cands.push({ leg, v, place })
  }
  cands.sort((a, b) => b.place.pct - a.place.pct || a.place.rank - b.place.rank)
  const seen = new Set()
  const out = []
  for (const c of cands) {
    if (seen.has(c.leg.fam)) continue
    seen.add(c.leg.fam)
    out.push(reason(c.leg, c.v, c.place, ctx, 'why'))
    if (out.length >= max) break
  }
  return out
}

/** The one number that argues against him tonight, or null. */
export function watchFor(row, ctx) {
  if (!row || !ctx) return null
  let worst = null
  for (const key of WATCH) {
    const leg = LEGS.find((l) => l.key === key)
    const v = valueOf(row, leg)
    if (v == null) continue
    const place = placeOf(leg, v, ctx)
    if (!place || place.pct > WATCH_PCT) continue
    if (!worst || place.pct < worst.place.pct) worst = { leg, v, place }
  }
  return worst ? reason(worst.leg, worst.v, worst.place, ctx, 'watch') : null
}

/** Both, for a raw slate row `p` (matched to its board row by player id + game). */
export function boardReasonFor(p, ctx) {
  const row = ctx?.rows?.find((r) => r._raw === p)
    || ctx?.rows?.find((r) => String(r._raw?.player_id) === String(p?.player_id) && String(r._raw?.game_pk ?? '') === String(p?.game_pk ?? ''))
  if (!row) return { why: [], watch: null }
  return { why: whyFor(row, ctx), watch: watchFor(row, ctx) }
}

/**
 * The headline card's two lines (BATCH-SIGNAL-WHY S2): the top reason, the
 * watch, and the explain panel's full text (every reason + the watch, each
 * with the column's own definition of its number). Plain strings, so a
 * server page can hand them to a client card without the row.
 */
export function reasonLines({ why = [], watch = null } = {}, name = '') {
  if (!why.length && !watch) return null
  const parts = why.map((r) => `${r.text}.${r.title ? ` ${r.title}` : ''}`)
  if (watch) parts.push(`Watch: ${watch.text}.${watch.title ? ` ${watch.title}` : ''}`)
  return {
    why: why[0]?.text || null,
    watch: watch?.text || null,
    explain: { label: name ? `Why ${name}` : 'Why', text: parts.join('  ') },
  }
}
