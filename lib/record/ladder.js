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
import { LADDER_SPORTS } from './ladderSports'

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

/** The sentence's short form, for a folded block: "CALLED scored 49 of 151 (32.5%) vs 15.0% for every dressed skater". */
export function ladderOneLine(l) {
  const c = l?.rungs?.called
  if (!c?.n || c.rate == null || l.base.rate == null) return null
  return `CALLED scored ${nf(c.hits)} of ${nf(c.n)} (${rate(c)}) vs ${rate(l.base)} for every dressed skater`
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

// ── THE MARKET LADDER (Wave 8, 2026-10-11): MLB and TUDDY (and BUCKETS, hidden) ───────────────────────────────────
// The same question as the status ladder above -- "of the calls we made, how often did they clear, against everyone
// on the same bar" -- for sports whose CALLED rows are graded per market on their own bar. The rows are the
// calibration reader's tiers (lib/calibration/*: MLB tier.board, TUDDY cal.bases); nothing is stored for this and
// nothing is typed. A tier under `minN` graded calls prints its counts and NO rate (lib/calibration/proof.js MIN_N),
// the base beside it unchanged. A flat result is printed in the same words and the same weight as a wide one:
// the sentence, the signed gap and the "ranges overlap" fact are computed the same way whichever way the gap points.

const pts = (x) => `${x >= 0 ? '+' : '\u2212'}${Math.abs(x).toFixed(1)} pts`
const baseCell = (b, label) => (b && b.n > 0 ? { ...cell(b.hits, b.n), label: label || null, scope: b.scope || null, seasons: b.seasons || null } : null)

/** Two 95% ranges share some ground: this sample cannot tell the two rates apart. */
export const rangesOverlap = (a, b) => Boolean(a?.ci && b?.ci && a.ci[0] <= b.ci[1] && b.ci[0] <= a.ci[1])

/**
 * A calibration body (readCalibrationAny / /api/calibration) -> the market ladder for one season, or null when the sport has none / the body is absent.
 * The body of some readers carries no `sport` (MLB's): the caller says which.
 * { kind:'market', sport, scope, unit, nights, from, to, weeks, season, minN, lead, empty, rows:[
 *     { key, label, bar, status:'called', n, hits, rate, ci, enough, base:{n,hits,rate,ci,scope}|null, gap, overlap } ] }
 * `empty` is true when the sport has a market ladder but no graded CALLED row yet: the surface says so in words.
 */
export function marketLadderFrom(cal, { sport = cal?.sport, season = 'regular' } = {}) {
  const reg = LADDER_SPORTS[sport]
  if (!cal || reg?.kind !== 'market') return null
  const block = cal[season]
  const minN = cal.minN ?? LADDER_MIN_N
  const tiers = (block?.tiers || []).filter((t) => (t.kind === 'call' || t.kind === 'status') && t.n > 0)
  const rows = tiers.map((t) => {
    const c = cell(t.hits, t.n)
    const b = baseCell(t.board?.n > 0 ? t.board : cal.bases?.[t.key])
    const enough = t.n >= minN
    const overlap = b ? rangesOverlap(c, b) : null
    return { key: t.key, label: t.label, bar: t.bar, status: 'called', ...c, enough, base: b, gap: enough && b && c.rate != null && b.rate != null ? Math.round((c.rate - b.rate) * 10) / 10 : null, overlap: enough ? overlap : null }
  })
  return {
    kind: 'market', sport, scope: season, unit: block?.unit || reg.unit, nights: block?.nights || 0,
    from: block?.from || null, to: block?.to || null, weeks: block?.weeks || null, season: cal.season || null,
    minN, lead: reg.lead, empty: rows.length === 0, rows,
  }
}

const markets = (l) => l?.rows || []
const leadRow = (l) => markets(l).find((r) => r.key === l.lead) || null
const baseRateWords = (l, r) => `${rate(r.base)} ${LADDER_SPORTS[l.sport].baseWords}`

/** The claim in one sentence, the same template for every result: "CALLED HR calls cleared 1+ HR in 120 of 402 (29.9%), against 14.1% ...". */
export function marketSentence(l) {
  const r = leadRow(l)
  if (!r) return null
  const lead = `CALLED ${r.label} calls`
  if (!r.enough) return `${nf(r.n)} ${lead} graded so far (${nf(r.hits)} cleared ${r.bar}); a rate waits for ${l.minN}.`
  const tail = r.base ? `, against ${baseRateWords(l, r)}` : ''
  const range = ci(r) ? `, 95% range ${ci(r)}` : ''
  return `${lead} cleared ${r.bar} in ${nf(r.hits)} of ${nf(r.n)} (${rate(r)}${range})${tail}.`
}

/** The folded summary line. Falls back to a count when the lead market has nothing graded yet. */
export function marketOneLine(l) {
  if (!l) return null
  if (l.empty) return 'No CALLED calls graded yet'
  const r = leadRow(l)
  if (!r) { const n = markets(l).reduce((a, x) => a + x.n, 0); return `${nf(n)} CALLED calls graded across ${markets(l).length} ${markets(l).length === 1 ? 'market' : 'markets'}` }
  if (!r.enough) return `${nf(r.n)} CALLED ${r.label} calls graded so far`
  return `CALLED ${r.label} cleared ${nf(r.hits)} of ${nf(r.n)} (${rate(r)})${r.base ? ` vs ${rate(r.base)} on the same bar` : ''}`
}

/** The window every row was counted over. */
export function marketScope(l) {
  if (!l) return ''
  const reg = LADDER_SPORTS[l.sport]
  const season = l.scope === 'post' ? 'Postseason' : 'Regular season'
  const w = l.weeks?.length ? `weeks ${l.weeks[0]} to ${l.weeks.at(-1)}${l.season ? ` of ${l.season}` : ''}` : `${l.nights} graded ${l.nights === 1 ? reg.unit : `${reg.unit}s`}${l.from ? ` (${md(l.from)} to ${md(l.to)})` : ''}`
  return `${season}, ${w}, each call stamped before the game.`
}

/** A row's cells as printed. `rate` is '\u2014' under the minimum. `vs` is the signed gap and the fact about the ranges, or null. */
export function marketCells(r, minN = LADDER_MIN_N) {
  const base = r.base
  return {
    of: `${nf(r.hits)} of ${nf(r.n)}`,
    rate: r.enough ? rate(r) : '\u2014', range: r.enough ? ci(r) : null, tracking: !r.enough,
    base: base ? rate(base) : '\u2014', baseN: base ? `n=${nf(base.n)}` : 'none stored',
    vs: r.gap == null ? null : pts(r.gap),
    overlap: r.overlap == null ? null : r.overlap ? 'ranges overlap' : 'ranges apart',
  }
}
