// 🏒 GOAL TRACKING, FROM HIS OWN GAME LOG (2026-10-06, Donovan: "treat goal
// scoring as if it's a home run, how we track and stat them").
//
// Pure functions over the rows lib/nhl/reduce.js reduceGameLog already hands
// the player page -- NEWEST FIRST, one row per game he played:
//   { gameId, date, team, opp, home, g, a, pts, ppg, ppp, shg, otg, shots, toi }
// Nothing here fetches, and nothing here scores: it is the NHL twin of
// MOONSHOT's lib/gamelogs.js (market x window hit rates, the signed run) and
// lib/venueHr.js (his record at tonight's building), and it REUSES MOONSHOT's
// own run maths -- lib/runs.js readRun and lib/gamelogs.js streakRuns -- rather
// than copying them: the NHL rows are mapped onto readRun's array layout.
//
// A game he did not play is not in the log, so a run counts GAMES HE PLAYED
// (the same as MOONSHOT's, where a scratched game is not a game either). The
// gap between two of his games is reported in days (daysBetween), never
// counted as a miss.
import { readRun } from '../runs'
import { streakRuns } from '../gamelogs'

// The bars a bettor plays on a skater, each with the lines the chips offer.
// `stat` is the log column; `lines` are the whole-number bars (2+ shots).
export const GOAL_MARKETS = [
  { key: 'g', label: 'Goals', one: 'goal', stat: 'g', lines: [1, 2], first: 1 },
  { key: 'sog', label: 'Shots', one: 'shot', stat: 'shots', lines: [2, 3, 4], first: 2 },
  { key: 'pts', label: 'Points', one: 'point', stat: 'pts', lines: [1, 2], first: 1 },
  { key: 'a', label: 'Assists', one: 'assist', stat: 'a', lines: [1, 2], first: 1 },
  { key: 'ppp', label: 'PP points', one: 'PP point', stat: 'ppp', lines: [1], first: 1 },
]
export const marketOf = (k) => GOAL_MARKETS.find((m) => m.key === k) || GOAL_MARKETS[0]
// 'L5' 'L10' 'L20' 'Szn' -- a window bigger than the log is the whole log, and says so (full: false)
export const WINDOWS = [['L5', 5], ['L10', 10], ['L20', 20], ['Season', Infinity]]
// a rate off fewer games than this is read lightly (MOONSHOT's grid dims windows under four)
export const THIN_N = 5

export const val = (r, stat) => Number(r?.[stat]) || 0

/** cleared / n over the newest `size` games. n is what he actually played in the window. */
export function windowRate(rows, stat, line, size) {
  const seg = (rows || []).slice(0, size === Infinity ? undefined : size)
  if (!seg.length) return null
  const ok = seg.filter((r) => val(r, stat) >= line).length
  return { ok, n: seg.length, pct: (100 * ok) / seg.length, full: size === Infinity || seg.length >= size, thin: seg.length < THIN_N }
}

/** One matrix row: the market at a line, over every window. */
export function thresholdRow(rows, mk, line) {
  return { key: mk.key, label: `${line}+ ${mk.label}`, line, cells: WINDOWS.map(([, size]) => windowRate(rows, mk.stat, line, size)) }
}

// ── the run ──────────────────────────────────────────────────────────────
// readRun's array layout: [date, opp, H(col 2), ..., isHome(6), 'D'|'N'(7)].
export const RUN_COL = 2
export const toRunRows = (rows, stat) => (rows || []).map((r) => [r.date, r.opp, val(r, stat), 0, 0, 0, r.home ? 1 : 0, 'N'])

/**
 * The signed active run at a bar (positive = games in a row at the bar, negative =
 * games in a row without it), his longest of each kind, the one before this, and
 * how long since the last time he cleared it. null on an empty log.
 */
export function runRead(rows, stat, line) {
  const rr = toRunRows(rows, stat)
  const run = readRun(rr, RUN_COL, line)
  if (!run) return null
  const lastIdx = (rows || []).findIndex((r) => val(r, stat) >= line)
  return { ...run, sinceLast: lastIdx < 0 ? rows.length : lastIdx, lastRow: lastIdx < 0 ? null : rows[lastIdx], never: lastIdx < 0 }
}

/** MOONSHOT's streakRuns over the same rows (the ribbon's input). */
export const ribbonOf = (rows, stat, line) => streakRuns(rows, (g) => val(g, stat) >= line)

// ── rolling form ─────────────────────────────────────────────────────────
/**
 * Trailing `win`-game average of a stat, OLDEST FIRST, one point per game. A
 * point exists only once a full window of games stands behind it: the first
 * win-1 games carry v = null, never a short-window average passed off as full.
 */
export function rollingSeries(rowsNewest, stat, win) {
  const old = [...(rowsNewest || [])].reverse()
  return old.map((r, i) => {
    if (i + 1 < win) return { i, date: r.date, opp: r.opp, home: r.home, x: val(r, stat), v: null }
    let s = 0
    for (let k = i - win + 1; k <= i; k++) s += val(old[k], stat)
    return { i, date: r.date, opp: r.opp, home: r.home, x: val(r, stat), v: s / win }
  })
}

// ── per-60 ───────────────────────────────────────────────────────────────
export function toiSecs(s) {
  const m = /^(\d+):(\d{2})$/.exec(String(s ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
/** Goals and shots per 60 from the games that carry a TOI. null with no ice time on file. */
export function per60(rows) {
  const used = (rows || []).filter((r) => toiSecs(r.toi) != null && toiSecs(r.toi) > 0)
  if (!used.length) return null
  const secs = used.reduce((t, r) => t + toiSecs(r.toi), 0)
  const g = used.reduce((t, r) => t + val(r, 'g'), 0)
  const sh = used.reduce((t, r) => t + val(r, 'shots'), 0)
  const hr = secs / 3600
  return { gp: used.length, of: rows.length, minutes: Math.round(secs / 60), goals: g, shots: sh, g60: g / hr, sog60: sh / hr, gps: sh ? g / sh : null, thin: used.length < 10 }
}

// ── his record at tonight's building ─────────────────────────────────────
/**
 * His goals and shots in the building he plays in tonight, against everywhere,
 * over the rows given (this season's log and last season's, newest first). The
 * log has no venue field, so the building is read from who hosted: a game
 * with `host` as the home club. Tonight at his own home -> his home games for
 * `host`; tonight on the road at `host` -> his road games against `host`.
 * Null without a host. A rink goal FACTOR (the league's goals at that building)
 * is not computed: the league's per-arena goal totals are not on file.
 */
export function rinkRecord(rows, { host, team }) {
  if (!host || !team || !rows?.length) return null
  const homeTonight = host === team
  const here = rows.filter((r) => (homeTonight ? r.home && r.team === host : !r.home && r.opp === host))
  const sum = (xs, k) => xs.reduce((t, r) => t + val(r, k), 0)
  const gHere = sum(here, 'g'); const shHere = sum(here, 'shots')
  const gAll = sum(rows, 'g'); const shAll = sum(rows, 'shots')
  return {
    host, homeTonight, games: here.length, goals: gHere, shots: shHere,
    goalsPg: here.length ? gHere / here.length : null, shotsPg: here.length ? shHere / here.length : null,
    gamesAll: rows.length, goalsAll: gAll, shotsAll: shAll,
    goalsPgAll: rows.length ? gAll / rows.length : null, shotsPgAll: rows.length ? shAll / rows.length : null,
    log: here,
  }
}

export const daysBetween = (a, b) => {
  const pa = Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`); const pb = Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(pa) && Number.isFinite(pb) ? Math.round((pb - pa) / 86400000) : null
}

// ── the cold case ────────────────────────────────────────────────────────
const MIN_COLD = 8     // games in the log before there is a case to make
/**
 * The argument against a goal tonight, off HIS OWN log and what tonight's board
 * already carries. Each item: { key, label, text, n } with n the sample the
 * sentence stands on; a sentence is only written when there is a sample for it.
 *   opts.opp, opts.home    tonight's opponent and whether he is at home (null off the board)
 *   opts.today             the board's own date (the game's date, YYYY-MM-DD)
 *   opts.oppGaPg, opts.oppRank, opts.oppN   the opponent's goals allowed a game and its place among tonight's opponents
 *   opts.b2b               his club played last night
 *   opts.oppRows           his games against tonight's opponent (this and last season)
 */
export function coldCase(rows, opts = {}) {
  const n = rows?.length || 0
  if (n < MIN_COLD) return null
  const items = []
  const goalGames = rows.filter((r) => val(r, 'g') >= 1).length
  const blank = n - goalGames
  items.push({ key: 'base', label: 'Most nights', n, text: `He has gone without a goal in ${blank} of ${n} games (${Math.round((100 * blank) / n)}%). A goal is the less common result even for a scorer.` })
  const run = runRead(rows, 'g', 1)
  if (run && run.run < 0) {
    items.push({ key: 'drought', label: 'Drought', n, text: `${-run.run} ${-run.run === 1 ? 'game' : 'games'} without a goal now${run.bestMiss > -run.run ? `; his longest this season is ${run.bestMiss}` : ''}. A drought is not a debt: nothing in the log says he is due.` })
  } else if (run) {
    items.push({ key: 'run', label: 'On a run', n, text: `${run.run === 1 ? 'A goal in his last game' : `A goal in each of his last ${run.run} games`}; the season rate he is measured against is ${goalGames} goal games in ${n}.` })
  }
  // shooting luck: last ten against the season, only with a sample of shots under it
  const l10 = rows.slice(0, 10)
  const sh10 = l10.reduce((t, r) => t + val(r, 'shots'), 0); const g10 = l10.reduce((t, r) => t + val(r, 'g'), 0)
  const shAll = rows.reduce((t, r) => t + val(r, 'shots'), 0); const gAll = rows.reduce((t, r) => t + val(r, 'g'), 0)
  if (l10.length === 10 && sh10 >= 20 && shAll >= 40) {
    const p10 = (100 * g10) / sh10; const pAll = (100 * gAll) / shAll
    if (p10 - pAll >= 4) items.push({ key: 'luck', label: 'Shooting luck', n: sh10, text: `${g10} ${g10 === 1 ? 'goal' : 'goals'} on ${sh10} shots in his last ten is ${p10.toFixed(1)}% against ${pAll.toFixed(1)}% over the season (${gAll} on ${shAll}). A rate that far above his own tends to come back down.` })
    else if (pAll - p10 >= 4) items.push({ key: 'luck', label: 'Shooting', n: sh10, text: `${g10} ${g10 === 1 ? 'goal' : 'goals'} on ${sh10} shots in his last ten is ${p10.toFixed(1)}% against ${pAll.toFixed(1)}% over the season: the shots are coming, the goals are not.` })
  }
  // ice time down: last five against the season, from the games that carry a TOI
  const withToi = rows.filter((r) => toiSecs(r.toi) != null)
  if (withToi.length >= 15) {
    const avg = (xs) => xs.reduce((t, r) => t + toiSecs(r.toi), 0) / xs.length
    const a5 = avg(withToi.slice(0, 5)); const aAll = avg(withToi)
    if (aAll - a5 >= 60) items.push({ key: 'toi', label: 'Ice time', n: 5, text: `${fmtMS(a5)} a night over his last five against ${fmtMS(aAll)} over the season (${withToi.length} games): less ice, fewer chances.` })
  }
  if (opts.opp && opts.oppRows) {
    const o = opts.oppRows; const og = o.reduce((t, r) => t + val(r, 'g'), 0)
    if (o.length) items.push({ key: 'opp', label: `Against ${opts.opp}`, n: o.length, text: `${og} ${og === 1 ? 'goal' : 'goals'} in ${o.length} ${o.length === 1 ? 'game' : 'games'} against ${opts.opp} in the games on file${o.length < 4 ? ' (a thin sample: read it lightly)' : ''}.` })
  }
  if (opts.opp && opts.home != null) {
    const side = rows.filter((r) => r.home === opts.home); const other = rows.filter((r) => r.home !== opts.home)
    if (side.length >= 8 && other.length >= 8) {
      const a = side.filter((r) => val(r, 'g') >= 1).length / side.length; const b = other.filter((r) => val(r, 'g') >= 1).length / other.length
      if (b - a >= 0.12) items.push({ key: 'side', label: opts.home ? 'At home' : 'On the road', n: side.length, text: `He scores in ${Math.round(a * 100)}% of his ${opts.home ? 'home' : 'road'} games (${side.length}) against ${Math.round(b * 100)}% ${opts.home ? 'on the road' : 'at home'} (${other.length}).` })
    }
  }
  if (Number.isFinite(opts.oppGaPg) && opts.oppN >= 8 && opts.oppRank) {
    const tough = opts.oppRank <= Math.ceil(opts.oppN / 4)
    if (tough) items.push({ key: 'def', label: 'The defence', n: opts.oppN, text: `${opts.opp} allow ${opts.oppGaPg.toFixed(2)} goals a game, the ${ord(opts.oppRank)}-fewest of the ${opts.oppN} clubs playing tonight.` })
  }
  if (opts.b2b) items.push({ key: 'b2b', label: 'Back to back', n: 1, text: 'His club played last night.' })
  if (opts.today && rows[0]?.date) {
    const d = daysBetween(rows[0].date, opts.today)
    if (d != null && d >= 10) items.push({ key: 'gap', label: 'Time off', n: 1, text: `His last game on file was ${d} days ago (${rows[0].date}).` })
  }
  return { n, items }
}

const ord = (k) => `${k}${k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] || 'th'}`
const fmtMS = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }

// ── goal shape (from the shot archive aggregate) ─────────────────────────
// MOONSHOT's rule (lib/hrShape.js SHAPE_MIN_N): under four tracked goals the
// counts stand alone and no 'his type' is claimed.
export const SHAPE_MIN_GOALS = 4
/**
 * @param all   /api/lamp/shots `all` (types: { 'wrist': {att,sog,g}, ... }, distGoal, goals)
 * @param recent  its `recent` shots ([x, y, result, type, strength, ...], newest 200 attempts)
 * @param zones ShotPanel's ZONES (the one definition of the zones)
 */
export function goalShape(all, recent, zones) {
  const n = all?.goals || 0
  if (!n) return null
  const byType = Object.entries(all.types || {}).filter(([, t]) => t.g > 0).map(([k, t]) => ({ key: k, goals: t.g, att: t.att })).sort((a, b) => b.goals - a.goals)
  const typed = byType.reduce((t, x) => t + x.goals, 0)
  const rg = (recent || []).filter((s) => s[2] === 'goal')
  const zoneRows = rg.length ? zones.map((z) => ({ key: z.key, label: z.label, def: z.def, goals: rg.filter(z.test).length })).filter((z) => z.goals > 0).sort((a, b) => b.goals - a.goals) : []
  const str = { ev: 0, pp: 0, sh: 0, other: 0 }
  for (const s of rg) str[s[4] === 'ev' || s[4] === 'pp' || s[4] === 'sh' ? s[4] : 'other'] += 1
  return { n, typed, byType, thin: n < SHAPE_MIN_GOALS, distGoal: all.distGoal ?? null, zoneRows, zoneN: rg.length, strength: str }
}
