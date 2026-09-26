// 📜 THE CLAIM ENGINE (milestones plan step 1, 2026-09-26). Pure: given
// history rows (hist_<sport> shape) and a question, it answers "when was the
// last time" -- and every claim it words carries that answer as its proof.
// No hand-written history anywhere: a line exists only because a query
// returned it.
//
//   lastTime(rows, { stat, value, franchise?, position?, rookie?, ageMax?, before })
//     -> { hits, lastSeason, lastPlayer, lastValue, allSince, coverageFrom }
//
// FRANCHISE claims read the team rows (only the games with that franchise --
// a traded man's other team does not count toward it). League-wide claims
// read one row per player-season: his TOT row when he moved, else his only one.

export const MIN_GAP = 3   // "first since 2023" is not a story

/** One row per player-season (TOT if present). */
function seasonTotals(rows) {
  const by = new Map()
  for (const r of rows) {
    const k = `${r.season}:${r.source_id ?? r.player_id}`
    const cur = by.get(k)
    if (!cur || r.team === 'TOT') by.set(k, r)
  }
  return [...by.values()]
}

export function lastTime(rows, { stat, value, franchise = null, position = null, rookie = null, ageMax = null, before }) {
  const pool = franchise ? rows.filter((r) => r.team !== 'TOT' && r.franchise === franchise) : seasonTotals(rows)
  const coverageFrom = pool.reduce((m, r) => Math.min(m, r.season), Infinity)
  const hits = pool.filter((r) => r.season < before
    && Number(r[stat]) >= value
    && (!position || r.position === position)
    && (rookie == null || Boolean(r.rookie) === rookie)
    && (ageMax == null || (r.age != null && r.age <= ageMax)))
    .sort((a, b) => b.season - a.season || Number(b[stat]) - Number(a[stat]))
  const last = hits[0] || null
  return {
    hits: hits.length, lastSeason: last?.season ?? null, lastPlayer: last?.name ?? null, lastValue: last ? Number(last[stat]) : null,
    allSince: hits.slice(0, 25).map((r) => ({ season: r.season, name: r.name, value: Number(r[stat]), team: r.team })),
    coverageFrom: Number.isFinite(coverageFrom) ? coverageFrom : null,
  }
}

const POS_WORD = { C: 'catcher', '1B': 'first baseman', '2B': 'second baseman', '3B': 'third baseman', SS: 'shortstop', OF: 'outfielder', DH: 'designated hitter', P: 'pitcher', D: 'defenceman', G: 'goalie', F: 'forward', RB: 'running back', WR: 'receiver', TE: 'tight end', QB: 'quarterback' }
export const posWord = (p) => POS_WORD[p] || p

/**
 * Word a claim from a lastTime answer, or null when it should not be said:
 * the last time was inside MIN_GAP seasons, or there is nothing to anchor it.
 * `who` = "Braves catcher"; `what` = "25 HR"; `season` = the current season.
 */
export function wordClaim(ans, { who, what, season, firstSeason = null }) {
  if (!ans) return null
  if (ans.lastSeason != null) {
    if (season - ans.lastSeason <= MIN_GAP) return null
    return `first ${who} to ${what} since ${ans.lastPlayer} in ${ans.lastSeason}`
  }
  // Never done in the data: "ever" only when the data reaches the franchise's first season.
  if (firstSeason != null && ans.coverageFrom != null && ans.coverageFrom <= firstSeason) return `first ${who} ever to ${what}`
  return ans.coverageFrom ? `first ${who} to ${what} since at least ${ans.coverageFrom}` : null
}
