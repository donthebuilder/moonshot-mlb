// DOUBLE-DOUBLE AND TRIPLE-DOUBLE, THE NUMBERS (2026-10-09, Donovan: "each sport, each game ... triple double /
// double double"). Pure: no fetch, no clock. The definition is .claude-notes/BUCKETS-DEFINITION.md
// (buckets-dd-v1, buckets-td-v1); this file is that definition in code.
//
//   A DOUBLE-DOUBLE is ten or more in two of points, rebounds, assists, steals, blocks in one game; a
//   TRIPLE-DOUBLE in three. Counted from the box score, never from a season average.
//   HIS RATES come from his own game log (ESPN athletes/{id}/gamelog, the same read Hot hands and xPTS use):
//   his last WINDOW real games (regular season and playoffs, minutes > 0, newest first, this season then last),
//   the share of them with a double-double / a triple-double, and the same share over his last 10. A rate
//   needs MIN_LOG games behind it; with fewer he is "unscored" with the reason, never a zero.
//   WHO IS READ: only a man whose second-best of points / rebounds / assists per game (pooled, the legs the
//   other markets already carry) is at least REACH_MIN is worth a game-log read; anyone under it is unscored
//   with that reason. Nothing is guessed for the others.
export const CATS = ['pts', 'reb', 'ast', 'stl', 'blk']
export const WINDOW = 82          // LAMP's pooled-window rule, in games
export const MIN_LOG = 10         // games behind a rate
export const RECENT = 10          // the "last 10" leg
export const REACH_MIN = 5        // second-best of ptsPg / rebPg / astPg to be read at all

const NOT_SEASON = /all-star|cup\s*-\s*(championship|final)/i
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** How many of points, rebounds, assists, steals, blocks reached ten in this line (a missing stat is not a ten). */
export const tensIn = (line) => CATS.filter((k) => fin(line?.[k]) != null && line[k] >= 10).length
export const isDoubleDouble = (line) => tensIn(line) >= 2
export const isTripleDouble = (line) => tensIn(line) >= 3

/** The second-highest of his points / rebounds / assists a game (the reach gate), or null with fewer than two numbers. */
export function reachOf(legs) {
  const v = [fin(legs?.ptsPg), fin(legs?.rebPg), fin(legs?.astPg)].filter((x) => x != null).sort((a, b) => b - a)
  return v.length >= 2 ? v[1] : null
}

/** Real games only, newest first: regular season / playoffs, he played, not the All-Star or Cup final. */
export function realGames(log) {
  return (log || []).filter((g) => (g.seasonType === 2 || g.seasonType === 3) && !NOT_SEASON.test(g.note || '') && fin(g.min) != null && g.min > 0)
}

/**
 * His double-double / triple-double rates from his game log (newest first, this season then last).
 * @returns { ok: true, n, dd, td, ddRate, tdRate, ddRecent, tdRecent, nRecent } | { ok: false, reason, n }
 * Rates are fractions 0-1 of games; ddRecent / tdRecent are null under RECENT games.
 */
export function ddtdFromLog(log) {
  const games = realGames(log).slice(0, WINDOW)
  const n = games.length
  if (n < MIN_LOG) return { ok: false, reason: `only ${n} NBA game${n === 1 ? '' : 's'} in his log (needs ${MIN_LOG})`, n }
  const dd = games.filter(isDoubleDouble).length
  const td = games.filter(isTripleDouble).length
  const recent = games.slice(0, RECENT)
  const nRecent = recent.length >= RECENT ? recent.length : 0
  return {
    ok: true, n, dd, td, ddRate: dd / n, tdRate: td / n,
    ddRecent: nRecent ? recent.filter(isDoubleDouble).length / nRecent : null,
    tdRecent: nRecent ? recent.filter(isTripleDouble).length / nRecent : null,
    nRecent,
  }
}

/** The extra legs one candidate carries for the two markets: from legsFor()'s legs plus his log summary (or why there is none). */
export function ddtdLegs(baseLegs, summary, { readFailed = false } = {}) {
  if (!baseLegs?.ok) return { ok: false, reason: baseLegs?.reason || 'no season line' }
  const reach = reachOf(baseLegs)
  const out = { ...baseLegs, reach }
  if (reach == null || reach < REACH_MIN) return { ...out, ddReason: `his second-best of points, rebounds and assists is ${reach == null ? 'unknown' : reach.toFixed(1)} a game (under ${REACH_MIN})` }
  if (readFailed || !summary) return { ...out, ddReason: 'his game log could not be read', unread: true }
  if (!summary.ok) return { ...out, ddReason: summary.reason }
  return { ...out, ddRate: summary.ddRate, tdRate: summary.tdRate, ddRecent: summary.ddRecent, tdRecent: summary.tdRecent, ddGames: summary.dd, tdGames: summary.td, logGames: summary.n }
}

/** Why a candidate is not scored for this market, or null. (A man who never did it in his window has nothing to rank on.) */
export function ddtdGate(market, legs) {
  if (!legs?.ok) return legs?.reason || 'no season line'
  if (legs.ddRate == null) return legs.ddReason || 'no game-log rate'
  if (market === 'dd' && !(legs.ddGames > 0)) return `no double-double in his last ${legs.logGames} games`
  if (market === 'td' && !(legs.tdGames > 0)) return `no triple-double in his last ${legs.logGames} games`
  return null
}

/** A finished box line -> the count of tens, for the graded row's `actual`. */
export const tensActual = (box) => (box && fin(box.pts) != null ? tensIn(box) : null)
