// THE MLB CALIBRATION TABLE, PURE PART (2026-10-06). For each tier the bot
// publishes -- the five CALLED roles and the three model tiers -- how many
// calls were made, how many cleared their bar, the rate, and when each was
// locked. Built only from the locked pregame record (por_rows + outcome_log,
// lib/record/mlbLocked.js) joined to the schedule; nothing is typed in.
//
//   TIERS    TOP, HR, HIT, HRR, CONTACT (lib/callStatus CALL_ROLES; each role of
//            a hitter is its own call on its own bar, lib/pickJob PICK_JOBS --
//            "HRR/CONTACT" is two calls, the way graded_slots counts them) and
//            the model tiers the row's own hr_overlay.qualified_tiers names
//            (graded on 1+ HR).
//   COUNTS   a graded call = the latest FINAL outcome, not void, 1+ plate
//            appearance (lib/record/mlbLocked.js, the rule lib/botOnHim.js uses).
//            Void, not final yet, and postponed are counted aside, never as misses.
//   LOCK     a row counts only if its generated_at (the run standing at the
//            game's lock) is BEFORE the game's scheduled first pitch. A row
//            stamped at or after it is set aside and counted ("locked late").
//   SEASON   the game's own gameType: R = regular season (the record), F/D/L/W
//            = postseason (its own table), S = spring (out). The game's own
//            date (officialDate), never the ET wall clock.
//   MIN N    a tier under MIN_N graded calls shows its n and its hit / miss
//            counts and no rate.
import { CALL_ROLES } from '../callStatus'
import { PICK_JOBS } from '../pickJob'
import { played, lockedBeforeFirstPitch } from '../record/mlbLocked'
import { MIN_N, proofOf } from './proof'
import { chosenOf } from './chosen'

export { MIN_N }

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

/** The tiers, in print order. `of` says which entries belong to the tier and `test` is its bar. */
export const TIERS = [
  ...CALL_ROLES.map((role) => ({ key: role, kind: 'call', label: role, bar: PICK_JOBS[role].job, test: PICK_JOBS[role].test })),
  { key: 'hr_overlay', kind: 'model', label: 'HR Overlay', bar: '1+ HR', test: PICK_JOBS.HR.test },
  { key: 'power_overlay', kind: 'model', label: 'Power Overlay', bar: '1+ HR', test: PICK_JOBS.HR.test },
  { key: 'premium_power', kind: 'model', label: 'Premium Power', bar: '1+ HR', test: PICK_JOBS.HR.test },
]
const TIER_BY_KEY = new Map(TIERS.map((t) => [t.key, t]))

const POST_TYPES = new Set(['F', 'D', 'L', 'W'])
export const seasonOfType = (t) => (t === 'R' ? 'regular' : POST_TYPES.has(t) ? 'post' : null)

/** A slash role list -> the CALLED roles in it, in print order. */
export function callRolesOf(role) {
  const tokens = new Set(String(role || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean))
  return CALL_ROLES.filter((r) => tokens.has(r))
}

const lineOf = (o) => ({ gotHr: o.went_yard === true || num(o.home_runs) > 0, hits: num(o.hits), ab: o.at_bats == null ? null : num(o.at_bats), runs: num(o.runs), rbi: num(o.rbi), tb: num(o.total_bases), hr: num(o.home_runs) })

/**
 * One night: por rows + final outcomes + the schedule -> one entry per locked row.
 * @param {{date:string, por:object[], outcomes:Map, games:Map, requireLock?:boolean}} a  games: pk -> { start (ms), type, state, date }
 * @returns {{ entries: object[], other: { noGame:number, spring:number } }}
 */
export function gradeNight({ date, por, outcomes, games, requireLock = true }) {
  const entries = []
  const other = { noGame: 0, spring: 0 }
  const seen = new Set()
  for (const r of por || []) {
    const pk = String(r?.game_pk ?? ''), pid = String(r?.player_id ?? '')
    if (!pk || !pid || seen.has(`${pk}|${pid}`)) continue
    seen.add(`${pk}|${pid}`)
    const g = games.get(pk)
    if (!g) { other.noGame += 1; continue }
    const season = seasonOfType(g.type)
    if (!season) { other.spring += 1; continue }
    const lockAt = Date.parse(r.generated_at)
    // requireLock:false exists only to re-measure the older, unlocked record (check-calibration)
    const late = requireLock && !lockedBeforeFirstPitch(r, g.start)
    const o = outcomes.get(`${pk}|${pid}`)
    const status = late ? 'late' : !o ? (/postponed|cancel/i.test(g.state || '') ? 'void' : 'pending') : played(o) ? 'graded' : 'void'
    entries.push({
      season, date: g.date || r.prediction_date || date, pk, pid, name: r.player, team: r.team, opp: r.opp,
      roles: callRolesOf(r.game_pick_role),
      hrScore: Number.isFinite(Number(r.scores?.hr)) ? Number(r.scores.hr) : null,
      hrw: Number.isFinite(Number(r.scores?.hrw)) ? Number(r.scores.hrw) : null,
      tiers: (Array.isArray(r.hr_overlay?.qualified_tiers) ? r.hr_overlay.qualified_tiers : []).filter((k) => TIER_BY_KEY.has(k) && TIER_BY_KEY.get(k).kind === 'model'),
      status,
      line: status === 'graded' ? lineOf(o) : null,
      lockAt: Number.isFinite(lockAt) ? lockAt : null, firstPitch: g.start,
      leadMin: Number.isFinite(lockAt) ? Math.round((g.start - lockAt) / 60000) : null,
    })
  }
  return { entries, other }
}

/** The entries that are calls (or members) of one tier. */
export const inTier = (e, tier) => (tier.kind === 'call' ? e.roles.includes(tier.key) : e.tiers.includes(tier.key))

const pct = (h, n) => (n ? Math.round((1000 * h) / n) / 10 : null)
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2) }

// SCORE BANDS (the ScoreBands tab): the locked board's graded hitter-games by HR score and by HRW, each
// band's share that homered. Band edges are the ones the tab always printed.
export const HR_BANDS = [{ band: '70+', lo: 70 }, { band: '50–70', lo: 50, hi: 70 }, { band: '30–50', lo: 30, hi: 50 }, { band: '<30', hi: 30 }]
export const HRW_BANDS = [{ band: '80+', lo: 80 }, { band: '70–80', lo: 70, hi: 80 }, { band: '55–70', lo: 55, hi: 70 }, { band: '45–55', lo: 45, hi: 55 }, { band: '<45', hi: 45 }]
function bandRows(graded, field, bands) {
  const scored = graded.filter((e) => e[field] != null)
  return bands.map((b) => {
    const m = scored.filter((e) => (b.lo == null || e[field] >= b.lo) && (b.hi == null || e[field] < b.hi))
    const hits = m.filter((e) => PICK_JOBS.HR.test(e.line)).length
    return { band: b.band, n: m.length, hits, rate: pct(hits, m.length) }
  })
}

/** The locked calls night by night: [{ date, markets: { TOP: { hit, n }, ... } }], oldest first. Graded call
 *  tiers only, each judged on its own bar (the tier table's own test), so the Record page's market table and
 *  the tier table are the same population and the same definition (2026-10-10, one MLB record). */
export function nightSeries(graded) {
  const by = new Map()
  for (const e of graded) {
    const m = by.get(e.date) || {}
    for (const tier of TIERS) {
      if (tier.kind !== 'call' || !inTier(e, tier)) continue
      m[tier.key] ||= { hit: 0, n: 0 }
      m[tier.key].n += 1
      if (tier.test(e.line)) m[tier.key].hit += 1
    }
    by.set(e.date, m)
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, markets]) => ({ date, markets }))
}

/** Entries -> the table, one block per season (regular / post). */
export function summarize(entries, { minN = MIN_N } = {}) {
  const out = {}
  for (const season of ['regular', 'post']) {
    const mine = entries.filter((e) => e.season === season)
    const graded = mine.filter((e) => e.status === 'graded')
    const nights = new Set(graded.map((e) => e.date))
    const tiers = TIERS.map((tier) => {
      const all = mine.filter((e) => inTier(e, tier))
      const g = all.filter((e) => e.status === 'graded')
      const hits = g.filter((e) => tier.test(e.line)).length
      const boardHits = graded.filter((e) => tier.test(e.line)).length
      const enough = g.length >= minN
      const leads = g.map((e) => e.leadMin)
      const dates = g.map((e) => e.date).sort()
      const chosen = chosenOf('mlb', tier.key)
      const sel = (xs) => (chosen ? xs.filter((e) => e.date > chosen) : [])
      const cnt = (xs) => ({ n: xs.length, hits: xs.filter((e) => tier.test(e.line)).length })
      return {
        proof: proofOf({ all: { n: g.length, hits }, chosen, after: cnt(sel(g)), boardAfter: cnt(sel(graded)), minN }),
        key: tier.key, kind: tier.kind, label: tier.label, bar: tier.bar,
        n: g.length, hits, misses: g.length - hits,
        rate: enough ? pct(hits, g.length) : null, enough,
        board: { n: graded.length, hits: boardHits, rate: pct(boardHits, graded.length) },
        lift: enough && graded.length ? Math.round((pct(hits, g.length) - pct(boardHits, graded.length)) * 10) / 10 : null,
        void: all.filter((e) => e.status === 'void').length,
        pending: all.filter((e) => e.status === 'pending').length,
        late: all.filter((e) => e.status === 'late').length,
        lead: leads.length ? { min: Math.min(...leads), median: median(leads), max: Math.max(...leads) } : null,
        nights: new Set(dates).size, from: dates[0] || null, to: dates[dates.length - 1] || null,
      }
    })
    out[season] = {
      nights: nights.size, from: [...nights].sort()[0] || null, to: [...nights].sort().pop() || null,
      board: graded.length,
      rows: mine.length,
      late: mine.filter((e) => e.status === 'late').length,
      // nights whose every row was stamped at or after first pitch: not in the table at all
      lateNights: [...new Set(mine.map((e) => e.date))].filter((d) => mine.filter((e) => e.date === d).every((e) => e.status === 'late')).sort(),
      void: mine.filter((e) => e.status === 'void').length,
      pending: mine.filter((e) => e.status === 'pending').length,
      bands: { hr: bandRows(graded, 'hrScore', HR_BANDS), hrw: bandRows(graded, 'hrw', HRW_BANDS) },
      series: nightSeries(graded),
      tiers,
    }
  }
  return { minN, ...out }
}

/** Every call of one tier in one season, newest first -- the list a visitor checks. */
export function callsOf(entries, tierKey, season) {
  const tier = TIER_BY_KEY.get(tierKey)
  if (!tier) return []
  return entries
    .filter((e) => e.season === season && e.status === 'graded' && inTier(e, tier))
    .map((e) => ({
      date: e.date, pk: e.pk, pid: e.pid, name: e.name, team: e.team, opp: e.opp, hit: Boolean(tier.test(e.line)),
      line: { hr: e.line.hr, hits: e.line.hits, runs: e.line.runs, rbi: e.line.rbi, tb: e.line.tb },
      lockAt: e.lockAt, firstPitch: e.firstPitch, leadMin: e.leadMin,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.name).localeCompare(String(b.name)))
}
