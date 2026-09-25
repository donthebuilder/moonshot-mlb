// 🥅 GOALIES — the seam lamp-goal-v1 leaves open. Measured 2026-09-25 against
// the league feed (BOS@PHI 2026010040, final):
//   · PREGAME there is no starter anywhere: boxscore goalies carry no
//     `starter` flag, play-by-play rosterSpots lists both goalies, the
//     landing has no confirmed-starter field. So v1 makes NO pregame
//     goalie claim — `startersFor` returns an empty map with source null,
//     and the board prints nothing about the net until the game is over.
//   · POSTGAME the starter is deterministic from play-by-play: the first
//     event with a `goalieInNetId` on each side is the man who started
//     (period 1, 00:39 in the sample; rosterSpots maps goalie → teamId).
//     And the boxscore's goalies carry toi / shotsAgainst / saves /
//     goalsAgainst / decision per man.
// Both postgame facts are archived on lamp_goal_games at grade time
// (starters_actual, goalies) from the first graded night, so a v2 leg that
// wants opponent-goalie quality has the history to be fitted on, and any
// pregame starter source that shows up later can be scored for accuracy
// against starters_actual before it is trusted in the score.
//
// THE CONTRACT for a pregame source (v2, not built):
//   startersFor(date, games) → { source: 'name-of-source' | null,
//     byGame: { [gameId]: { away: {playerId, name, confirmed:boolean} | null,
//                           home: {...} | null } } }
// Rows write it to lamp_goal_games.starters + starters_source; a candidate's
// context.oppGoalie gets the opposing entry. Until a source exists the
// map is empty and nothing downstream may invent one (rule 16).

/** v1: no pregame source. The shape is the contract; the map is empty. */
export async function startersFor(/* date, games */) {
  return { source: null, byGame: {} }
}

const teamIdOf = (pbp, side) => Number(pbp?.[`${side}Team`]?.id) || null

/**
 * Who actually started, from play-by-play — the first event on each side
 * with a goalieInNetId. Null for a side when no such event exists yet.
 */
export function startersFromPlayByPlay(pbp) {
  const out = { away: null, home: null }
  if (!pbp || !Array.isArray(pbp.plays)) return out
  const spots = new Map((pbp.rosterSpots || []).map((r) => [Number(r.playerId), r]))
  const ids = { away: teamIdOf(pbp, 'away'), home: teamIdOf(pbp, 'home') }
  for (const play of pbp.plays) {
    const gid = Number(play?.details?.goalieInNetId)
    if (!gid) continue
    const spot = spots.get(gid)
    if (!spot) continue
    const side = Number(spot.teamId) === ids.away ? 'away' : Number(spot.teamId) === ids.home ? 'home' : null
    if (!side || out[side]) continue
    out[side] = { playerId: gid, name: `${spot.firstName?.default || ''} ${spot.lastName?.default || ''}`.trim() || null }
    if (out.away && out.home) break
  }
  return out
}

/** Every goalie's line from the boxscore, both sides. Field names are the feed's. */
export function goaliesFromBoxscore(box) {
  const side = (s) => (box?.playerByGameStats?.[`${s}Team`]?.goalies || []).map((g) => ({
    playerId: Number(g.playerId), name: g.name?.default || null, toi: g.toi || null,
    shotsAgainst: Number.isFinite(Number(g.shotsAgainst)) ? Number(g.shotsAgainst) : null,
    saves: Number.isFinite(Number(g.saves)) ? Number(g.saves) : null,
    goalsAgainst: Number.isFinite(Number(g.goalsAgainst)) ? Number(g.goalsAgainst) : null,
    decision: g.decision || null,
  }))
  return { away: side('away'), home: side('home') }
}

/** "Woll 28/28 · DiPietro 26/28" — the line a graded game prints. */
export function netLine(goalies, starters) {
  const one = (s) => {
    const list = goalies?.[s] || []
    const starterId = starters?.[s]?.playerId
    const g = list.find((x) => x.playerId === starterId) || list.find((x) => x.toi && x.toi !== '00:00') || null
    if (!g) return null
    const sv = g.saves != null && g.shotsAgainst != null ? ` ${g.saves}/${g.shotsAgainst}` : ''
    return `${g.name || g.playerId}${sv}`
  }
  const a = one('away'); const h = one('home')
  return a || h ? [a, h].filter(Boolean).join(' · ') : null
}
