// MOONSHOT'S GAME PROJECTION, THE TEAM MODEL (2026-10-08, owner decision).
//
// The expected home runs of a game used to be a SUM over hitters: each tracked
// bat's chance (score band x ISO band x form x slot), added up. That number
// leans on who happens to be on the sheet, so it moves when a lineup posts or
// a hitter is scratched and says nothing about the club. The decision (every
// sport, same rule): the "expected" figure of a game comes from a TEAM model,
// and the game is both clubs.
//
//   expected HR (one club, one game) =
//       club HR per PA                shrunk to the league rate (SHRINK_PA)
//     x expected PA                   the league's PA per team-game
//     x opposing arms                 the starter's HR-allowed rate, shrunk to
//                                     the league (STARTER_PRIOR_IP), for his
//                                     share of the PAs; the rest of the game
//                                     is the league average, or the opposing
//                                     pen's own shrunk rate on the Adj column
//     x park HR factor ^ PARK_POW     (the slate's park_hr_factor)
//     x (1 + weather effect) ^ WX_POW (the slate's weather_hr_effect_pct)
//
// Everything on the right is already on the slate row (starter, park, weather)
// or comes from ONE league call for the whole slate (lib/clubHr.js: each club's
// HR and PA, the league's PA per team-game). Early in the year the shrink does
// the work: a club with 30 PA is the league average.
//
// THE CONSTANTS WERE CHOSEN ON HELD-OUT GAMES. Real graded games, 2026-04..10
// (Final games only, truth = the slate's own home-run capture by game and club):
// the parameters were fit on the days BEFORE 2026-09-01 (1,288 club-games) and
// scored on the days from it (664 club-games, 332 games). Club HR and PA are
// as-of the day before each game. See lib/__tests__ / scripts/check-team-hr.mjs
// for the frozen check and the numbers. Park and weather are near-flat on that
// sample (home runs per club-game are mostly noise), so they enter at the
// stated discounts below, not at full weight. Nothing here is fitted to a
// single day.
//
// A model value is a count to one decimal, never a printed probability.

export const TEAM_HR = {
  SHRINK_PA: 4000,        // pseudo-PA of league-average rate mixed into every club
  STARTER_SHARE: 0.65,    // share of a club's PAs taken against the opposing starter
  STARTER_PRIOR_IP: 100,  // pseudo-innings of league-average HR rate mixed into a starter
  NO_IP_PRIOR: 30,        // innings assumed for a starter with 0 HR allowed (his IP is not on the row)
  PEN_PRIOR_IP: 100,      // pseudo-innings mixed into the opposing pen's rate (Adj only)
  PARK_POW: 0.5,          // park HR factor enters at half weight
  WX_POW: 1,              // the published weather effect enters whole
}

const fin = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v))
const ok = (v) => Number.isFinite(v)

/**
 * The league table every club's number is read against.
 * `splits` is the StatsAPI teams/stats hitting season response (stats[0].splits),
 * `abbrs` maps team id -> abbreviation. Returns null when it does not look whole.
 */
export function clubTable(splits = [], abbrs = {}) {
  const clubs = {}
  let hr = 0; let pa = 0; let g = 0
  ;(splits || []).forEach((s) => {
    const ab = abbrs?.[s?.team?.id]
    const h = fin(s?.stat?.homeRuns); const p = fin(s?.stat?.plateAppearances); const gp = fin(s?.stat?.gamesPlayed)
    if (!ab || !ok(h) || !ok(p) || !ok(gp)) return
    clubs[String(ab).toUpperCase()] = { hr: h, pa: p, g: gp }
    hr += h; pa += p; g += gp
  })
  // a half-loaded response (or day one of the year) is not a league
  if (Object.keys(clubs).length < 20 || !(pa > 2000) || !(g > 0)) return null
  return { clubs, lgRate: hr / pa, paG: pa / g, lg9: hr / g }
}

const firstFinite = (rows, f) => {
  for (const r of rows) { const v = f(r); if (ok(v)) return v }
  return NaN
}

// 'inningsPitched' comes as "123.1" (thirds)
const ipOf = (s) => {
  const m = String(s ?? '').match(/^(\d+)(?:\.(\d))?$/)
  return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 3 : 0) : NaN
}

/**
 * One club's expected home runs in one game.
 * @param team   the batting club's abbreviation
 * @param rows   that club's hitter rows in the game (they carry the opposing
 *               starter, the park and the weather); may be empty
 * @param ctx    every row of the game (the park and weather fall back to it)
 * @param opts   { pen: { hr, ip } | null }  the opposing pen, for the Adj figure
 */
export function sideExpHr(team, rows, table, ctx = rows, opts = {}) {
  if (!table) return null
  const T = TEAM_HR
  const c = table.clubs[String(team || '').toUpperCase()]
  const rate = ((c ? c.hr : 0) + T.SHRINK_PA * table.lgRate) / ((c ? c.pa : 0) + T.SHRINK_PA)
  const lg9 = table.lg9

  // the opposing starter, off any of this club's rows
  let arm = 1
  const hr9 = firstFinite(rows, (r) => fin(r?.pitcher_hr9))
  if (ok(hr9)) {
    const hra0 = firstFinite(rows, (r) => fin(r?.pitcher_hr_allowed))
    const hra = ok(hra0) ? hra0 : 0
    const ip = hra > 0 && hr9 > 0 ? (9 * hra) / hr9 : T.NO_IP_PRIOR
    const r = (hra + (T.STARTER_PRIOR_IP * lg9) / 9) / (ip + T.STARTER_PRIOR_IP)
    const relief = opts.pen && ok(fin(opts.pen.ip)) && opts.pen.ip > 0
      ? ((opts.pen.hr + (T.PEN_PRIOR_IP * lg9) / 9) / (opts.pen.ip + T.PEN_PRIOR_IP)) * 9 / lg9
      : 1
    arm = T.STARTER_SHARE * ((r * 9) / lg9) + (1 - T.STARTER_SHARE) * relief
  }

  const all = ctx && ctx.length ? ctx : rows
  const pf = firstFinite(all, (r) => fin(r?.park_hr_factor))
  const park = ok(pf) && pf > 0 ? Math.pow(pf, T.PARK_POW) : 1
  const wx = firstFinite(all, (r) => (r?.weather_has_data === false ? NaN : fin(r?.weather_hr_effect_pct ?? r?.hr_weather_effect_pct)))
  const weather = ok(wx) && 1 + wx / 100 > 0 ? Math.pow(1 + wx / 100, T.WX_POW) : 1

  return rate * table.paG * arm * park * weather
}

const teamOf = (r) => String(r?.team || '').toUpperCase()
const oppOf = (r) => String(r?.opponent || r?.opp || '').toUpperCase()

/** Pen option for the club batting against `oppTeam`, from penStatsFor's Map. */
const penFor = (pens, oppTeam) => {
  const p = pens && oppTeam ? pens.get(String(oppTeam).toUpperCase()) : null
  const ip = p ? ipOf(p.ip) : NaN
  return ok(ip) && ip > 0 && ok(fin(p.hr)) ? { hr: Number(p.hr), ip } : null
}

/**
 * One game, both clubs: { total, sides: { TEAM: value } }. Null without the
 * league table. `rows` is every hitter row of the game.
 */
export function gameExpHr(rows, table, { pens = null } = {}) {
  if (!table) return null
  const rs = (rows || []).filter(Boolean)
  const by = new Map()
  rs.forEach((r) => { const t = teamOf(r); if (t) { if (!by.has(t)) by.set(t, []); by.get(t).push(r) } })
  // a side with no rows still has a club (its opponent's rows name it)
  rs.forEach((r) => { const o = oppOf(r); if (o && !by.has(o) && by.size < 2) by.set(o, []) })
  const sides = {}
  let total = 0
  by.forEach((mine, t) => {
    const opp = [...by.keys()].find((k) => k !== t) || (mine[0] ? oppOf(mine[0]) : '')
    const v = sideExpHr(t, mine, table, rs, { pen: penFor(pens, opp) })
    sides[t] = v
    total += v
  })
  return by.size ? { total, sides } : null
}

/** Rows grouped by game_pk. */
export function byGame(players) {
  const m = new Map()
  ;(players || []).forEach((p) => {
    if (!p || p.game_pk == null) return
    if (!m.has(p.game_pk)) m.set(p.game_pk, [])
    m.get(p.game_pk).push(p)
  })
  return m
}

/** The whole slate: both clubs of every game, summed. Null without the table. */
export function slateExpHr(players, table, opts) {
  if (!table) return null
  let total = 0; let any = false
  byGame(players).forEach((rows) => {
    const g = gameExpHr(rows, table, opts)
    if (g) { total += g.total; any = true }
  })
  return any ? total : null
}

/** A club's expected HR across its games in `rows` (a doubleheader is two games). */
export function clubExpHr(team, rows, table, { pens = null } = {}) {
  if (!table) return null
  let total = 0; let any = false
  byGame((rows || []).filter((r) => teamOf(r) === String(team).toUpperCase())).forEach((mine, pk) => {
    const ctx = (rows || []).filter((r) => r && r.game_pk === pk)
    const opp = oppOf(mine[0])
    total += sideExpHr(team, mine, table, ctx, { pen: penFor(pens, opp) })
    any = true
  })
  return any ? total : null
}

/**
 * Where a game sits in tonight's own distribution of this number: its median
 * and spread, so "hot" and "cold" are read against the slate and not against a
 * fixed percentage that belonged to a wider-spread number.
 */
export function spreadOf(values) {
  const xs = (values || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!xs.length) return { mid: 0, mean: 0, sd: 0, n: 0 }
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
  return { mid: xs[Math.floor(xs.length / 2)], mean, sd, n: xs.length }
}

/** Standard deviations from the slate mean; null when the slate is too small to have a spread. */
export function zOf(v, spread) {
  if (!Number.isFinite(v) || !spread || spread.n < 4 || !(spread.sd > 0.02)) return null
  return (v - spread.mean) / spread.sd
}
