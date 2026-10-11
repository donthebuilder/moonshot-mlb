// THE LADDER: CALLED > ON THE BOARD > NOT ON THE BOARD, against every dressed skater (2026-10-10, LAMP hero plan
// item 1 + 3; ledger audit findings 5 and 9). Pure and client-safe: no fetch, no framework imports.
//
// ONE QUESTION, ONE NUMBER. "Of the skaters on the board, how often did each group score?" is answered here
// and nowhere else. The rows are lamp_goal_log's, read by the lock-enforced calibration reader
// (lib/calibration/readSportCalibration.js readNhlCalibration -> /api/calibration?sport=nhl, one cache entry
// shared by the route, /called, /start and the front door). That reader hands its rows to ladderFromRecords();
// every surface prints the same `ladder` block it returns through ladderFrom(). Nothing is typed here: every
// figure is a count of the rows handed in, and every surface prints n, the group's goals, the rate and the 95%
// Wilson range beside it.
//
// What counts (the scope, printed with it): the regular season (preseason is out, the postseason is its own
// block), rows with a lock stamp (locked_at), graded, and DRESSED -- a skater who did not dress is void, not a
// miss, and is in no denominator. The status on each row is the one stored at lock (lib/callStatus STATUS_WORD
// words; LAMP's scoreNight sets it) -- never re-derived here.
//
// The base is every dressed skater on the board, not "every skater who plays well": the ladder is a check on the
// ranking, not one skater's chance. Never printed as a probability.
import { wilson } from '../interval'
import { STATUS_WORD } from '../callStatus'

/** The ladder's rungs, top to bottom (the base row is separate). */
export const LADDER_RUNGS = ['called', 'board', 'off']
export const BASE_LABEL = 'All dressed skaters'
/** Under this many graded skaters in a rung the row says "tracking" beside its rate. */
export const LADDER_MIN_N = 30

const SEASON = (type) => (Number(type) === 3 ? 'post' : 'regular')
const pct1 = (h, n) => (n > 0 ? Math.round((1000 * h) / n) / 10 : null)
const cell = (h, n) => ({ n, hits: h, rate: pct1(h, n), ci: wilson(h, n) })
const settled = (r) => r?.result === 'hit' || r?.result === 'miss'

/** "lamp-goal-v3" -> "v3" */
export const versionLabel = (v) => (String(v || '').match(/-(v\d+)$/) || [])[1] || String(v || '')

/**
 * ModelRecords (lib/record/nhl.js toRecord) -> one season's ladder, or null when nothing is graded.
 * { scope, nights, from, to, base, rungs:{called,board,off}, versions:[{ version, label, nights, from, to, base, called }] }
 * `versions` is oldest first; the caller marks the live one (it knows MODEL_VERSION).
 * @param season 'regular' | 'post'
 */
export function ladderFromRecords(records, { season = 'regular' } = {}) {
  const rows = (records || []).filter((r) => settled(r) && r.locked_at && SEASON(r.game_type) === season && Number(r.game_type) !== 1)
  if (!rows.length) return null
  const hit = (r) => r.result === 'hit'
  const count = (list) => cell(list.filter(hit).length, list.length)
  const dates = [...new Set(rows.map((r) => r.game_date))].sort()
  const rungs = {}
  for (const s of LADDER_RUNGS) rungs[s] = count(rows.filter((r) => r.status === s))
  const byVersion = new Map()
  for (const r of rows) { const v = r.model_version || ''; if (!byVersion.has(v)) byVersion.set(v, []); byVersion.get(v).push(r) }
  const versions = [...byVersion.entries()].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([version, list]) => {
    const d = [...new Set(list.map((r) => r.game_date))].sort()
    return { version, label: versionLabel(version), nights: d.length, from: d[0], to: d.at(-1), base: count(list), called: count(list.filter((r) => r.status === 'called')) }
  })
  return { scope: season, nights: dates.length, from: dates[0], to: dates.at(-1), base: count(rows), rungs, versions }
}

/** The ladder out of a /api/calibration body (regular season by default), or null. A body from before the ladder
 *  existed (a cached one) has none: the surface then prints nothing rather than a number it cannot stand behind. */
export function ladderFrom(cal, season = 'regular') {
  const l = cal?.ladder?.[season]
  return l && l.base?.n > 0 ? { ...l, live: cal.liveVersion || null, minN: cal.minN ?? LADDER_MIN_N } : null
}

const nf = (n) => Number(n).toLocaleString('en-US')
const ci = (c) => (c?.ci ? `${c.ci[0].toFixed(0)}–${c.ci[1].toFixed(0)}%` : null)
const rate = (c) => (c.rate == null ? '—' : `${c.rate.toFixed(1)}%`)
const md = (ymd) => { const [, m, d] = String(ymd || '').split('-'); return m && d ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]} ${Number(d)}` : '' }

/** "CALLED skaters scored in 48 of 147 (32.7%), against 15.1% for every dressed skater." -- null with no CALLED rows. */
export function ladderSentence(l) {
  const c = l?.rungs?.called
  if (!c?.n || c.rate == null || l.base.rate == null) return null
  return `CALLED skaters scored in ${nf(c.hits)} of ${nf(c.n)} (${rate(c)}), against ${rate(l.base)} for every dressed skater.`
}

/** The scope, in words: the window every row in the ladder was counted over. */
export function ladderScope(l) {
  if (!l) return ''
  const season = l.scope === 'post' ? 'playoffs' : 'regular season'
  return `${season}, ${l.nights} graded ${l.nights === 1 ? 'night' : 'nights'} (${md(l.from)} to ${md(l.to)}), locked before puck drop. A skater who did not dress is out of every count.`
}

/** The scope, short: for a compact block on a phone. n is on every row; this is the window. */
export function ladderScopeShort(l) {
  if (!l) return ''
  return `${l.scope === 'post' ? 'Playoffs' : 'Regular season'}, ${l.nights} ${l.nights === 1 ? 'night' : 'nights'} (${md(l.from)} to ${md(l.to)}), locked before puck drop. Did not dress: not counted.`
}

/** A row's cells as printed: { rate, goals, n, range, tracking }. */
export function ladderCells(c, minN = LADDER_MIN_N) {
  return { rate: rate(c), goals: nf(c.hits), n: nf(c.n), of: `${nf(c.hits)} of ${nf(c.n)}`, range: ci(c), tracking: c.n < minN }
}

/** The ladder's rows in print order: the three rungs, then the base. Words are lib/callStatus STATUS_WORD's. */
export function ladderRows(l) {
  if (!l) return []
  return [
    ...LADDER_RUNGS.map((s) => ({ key: s, status: s, word: STATUS_WORD[s], ...l.rungs[s] })),
    { key: 'base', status: null, word: BASE_LABEL, ...l.base },
  ].filter((r) => r.n > 0)
}

/** One line per model version, newest (the live one) first, each with its own base beside it. */
export function versionRows(l) {
  if (!l) return []
  const rows = (l.versions || []).map((v) => ({ ...v, live: Boolean(l.live) && v.version === l.live })).reverse()
  return rows
}

/** The pooled row, labelled for what it is. */
export const POOLED_LABEL = 'All versions'

/**
 * The pooled CALLED figure must be the sum of the versions' (the audit's complaint was one rate hiding three).
 * @returns {boolean}
 */
export function versionsAddUp(l) {
  if (!l) return true
  const sum = (k, f) => (l.versions || []).reduce((a, v) => a + (v[k]?.[f] || 0), 0)
  return sum('called', 'n') === l.rungs.called.n && sum('called', 'hits') === l.rungs.called.hits && sum('base', 'n') === l.base.n && sum('base', 'hits') === l.base.hits
}

/**
 * The price line under the ladder, from lib/record/callsLanded.js straightLine() over the stored lock prices
 * (/api/record/calls?sport=nhl). Returns null unless units were COMPUTED (the line needs `minPriced` priced calls):
 * a number that is not computed at read time is never printed. "Roughly breaks even" appears only when the
 * median-price return is within 10% of the stake; otherwise the same numbers are stated without it.
 */
export const BREAK_EVEN_BAND = 0.1
export function priceNote(sl) {
  if (!sl?.units || !sl.priced || sl.impliedRate == null || sl.pricedRate == null) return null
  const roi = sl.units.median / sl.priced
  const signed = `${sl.units.median >= 0 ? '+' : '−'}${Math.abs(sl.units.median).toFixed(1)}`
  const facts = `${sl.pricedHits} of ${sl.priced} priced CALLED skaters scored (${sl.pricedRate}%) against ${sl.impliedRate}% the stored prices imply; one unit on each returned ${signed} units at the median price (n=${sl.priced}).`
  const lead = Math.abs(roi) <= BREAK_EVEN_BAND ? 'Priced at lock, CALLED roughly breaks even against the books' : 'Priced at lock, CALLED against the books'
  return { roughlyEven: Math.abs(roi) <= BREAK_EVEN_BAND, lead, facts, text: `${lead}: ${facts}` }
}
