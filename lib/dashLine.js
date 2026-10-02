// THE DASH LINE (2026-10-02, BATCH-DASH-LINE; the rules are .claude-notes/
// DASH-LINE-DEFINITION.md, dash-line-v1). One pure function for every sport:
// a player's games + the defence's factor -> our median for the stat, or no
// line with the reason. Browser- and server-safe; nothing fitted or tuned.
export const DASH_MODEL = 'dash-line-v1'

// market -> the log field, the volume that says he has a role, the lean unit, the
// defence-vs-position field (null = the feed publishes none: no opponent adjustment)
export const DASH_MARKETS = {
  nfl: {
    rec: { stat: 'g_rec', vol: 'g_rec', unit: 0.5, dvp: null },
    rec_yds: { stat: 'g_recyd', vol: 'g_rec', unit: 5, dvp: 'recyd_g' },
    rush_yds: { stat: 'g_ruyd', vol: 'g_car', unit: 5, dvp: 'rshyd_g' },
    rush_att: { stat: 'g_car', vol: 'g_car', unit: 1, dvp: null },
    pass_yds: { stat: 'g_payd', vol: 'g_payd', unit: 10, dvp: null },
    kick_pts: { stat: 'g_kick', vol: 'g_kick', unit: 1, dvp: null },
  },
}
const HALF_LIFE = 4        // the weight halves every 4 games back
const FILL_TO = 6          // last season fills this season's first games up to 6
const MIN_GAMES = 3        // games with a real role needed for a line
const MIN_DEF_GAMES = 2    // a defence's games needed for an opponent factor

/** The value where the cumulative weight first reaches half (ties between two: their midpoint). */
export function weightedMedian(xs, ws) {
  const pts = xs.map((x, i) => [x, ws[i]]).sort((a, b) => a[0] - b[0])
  const half = pts.reduce((a, p) => a + p[1], 0) / 2
  let acc = 0
  for (let i = 0; i < pts.length; i++) {
    acc += pts[i][1]
    if (Math.abs(acc - half) < 1e-12 && i + 1 < pts.length) return (pts[i][0] + pts[i + 1][0]) / 2
    if (acc > half) return pts[i][0]
  }
  return pts.length ? pts[pts.length - 1][0] : 0
}

/** Round to the nearest .5, never a whole number (no push): 54 -> 54.5. */
export const toHalf = (x) => { const r = Math.round(x * 2) / 2; return Number.isInteger(r) ? r + 0.5 : r }

/** The defence's factor for a role and stat: allowed / league mean, shrunk halfway to 1.0. */
export function oppFactor(dvpSeason, def, role, field) {
  if (!field) return { factor: 1, note: 'no opponent adjustment (the feed publishes no defence number for this stat)' }
  const row = dvpSeason?.[def]?.[role]
  if (!row || !(Number(row.g) >= MIN_DEF_GAMES) || !Number.isFinite(Number(row[field]))) return { factor: 1, note: `no opponent adjustment (${def} has under ${MIN_DEF_GAMES} games vs ${role || 'his role'})` }
  const vals = Object.values(dvpSeason || {}).map((t) => t?.[role]).filter((r) => r && Number(r.g) >= MIN_DEF_GAMES && Number.isFinite(Number(r[field]))).map((r) => Number(r[field]))
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  if (!(mean > 0)) return { factor: 1, note: 'no opponent adjustment (no league mean for this role)' }
  const raw = Number(row[field]) / mean
  return { factor: 1 + (raw - 1) / 2, raw, note: `${def} allow ${Number(row[field]).toFixed(1)} a game to ${role} vs the league's ${mean.toFixed(1)}` }
}

/**
 * games: his logged games, any order, each { s: season, w: week, ...log fields }.
 * season: the current season. Returns { line, base, factor, gamesUsed, reason, weights }.
 */
export function dashLine({ games = [], season, market, sport = 'nfl', opp = { factor: 1, note: null }, out = false }) {
  const M = DASH_MARKETS[sport]?.[market]
  if (!M) return { line: null, reason: `no DASH line for ${market}` }
  if (out) return { line: null, reason: 'out or doubtful' }
  const sorted = [...games].filter((g) => Number.isFinite(Number(g?.[M.stat]))).sort((a, b) => (b.s - a.s) || (b.w - a.w))
  const cur = sorted.filter((g) => g.s === season)
  const prev = sorted.filter((g) => g.s < season)
  const window = cur.length >= FILL_TO ? cur : [...cur, ...prev.slice(0, FILL_TO - cur.length)]
  const role = window.filter((g) => Number(g[M.vol]) > 0).length
  if (role < MIN_GAMES) return { line: null, gamesUsed: window.length, reason: `${role} game${role === 1 ? '' : 's'} with a role (needs ${MIN_GAMES})` }
  // a recency-weighted MEDIAN, not a mean: yards are right-skewed (one 150-yard game drags a mean
  // up), so a mean sits above the typical game and every line would lean OVER against a book's
  // median -- measured on week 4's 596 book lines: 265 over vs 145 under with the mean
  const weights = window.map((g, k) => Math.pow(0.5, k / HALF_LIFE))
  const base = weightedMedian(window.map((g) => Number(g[M.stat])), weights)
  const factor = Number.isFinite(opp?.factor) ? opp.factor : 1
  const v = base * factor
  // a whole number goes to the half where more of his games' weight sits (above it -> +.5),
  // so the line splits his games closest to 50/50; always rounding up put +.5 on every count
  const r2 = Math.round(v * 2) / 2
  let line = toHalf(v)
  if (Number.isInteger(r2)) {
    const vals = window.map((g) => Number(g[M.stat]) * factor)
    const above = vals.reduce((a, x, i) => a + (x > r2 ? weights[i] : 0), 0), below = vals.reduce((a, x, i) => a + (x < r2 ? weights[i] : 0), 0)
    line = above >= below ? r2 + 0.5 : r2 - 0.5
  }
  return { line, base, factor, gamesUsed: window.length, reason: opp?.note || null, weights }
}

/** OVER / UNDER / none: DASH vs the book, within half the market's unit = no lean. */
export function leanOf(dash, book, market, sport = 'nfl') {
  const M = DASH_MARKETS[sport]?.[market]
  if (!M || !Number.isFinite(dash) || !Number.isFinite(book)) return null
  const d = dash - book
  return Math.abs(d) < 0.5 * M.unit ? 'none' : d > 0 ? 'over' : 'under'
}
