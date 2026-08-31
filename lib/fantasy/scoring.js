const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0

// -- THE POINTS-ALLOWED TIER, IN ONE PLACE (2026-08-31) ---------------------
// It was written out inline in fantasyPointsFromStats and nowhere else, and
// the DEF projection beside it was the literal number 7 -- so the two columns
// a manager reads side by side came from two different models, one of which
// was not a model. Both call this now.
export function defensePointsAllowedScore(allowed) {
  const n = number(allowed)
  return n === 0 ? 10 : n <= 6 ? 7 : n <= 13 ? 4 : n <= 20 ? 1 : n <= 27 ? 0 : n <= 34 ? -1 : -4
}

// What an average NFL team gives up in a game. Used only when a D/ST has no
// stat line yet -- a projection, in other words. It is deliberately the same
// input the actual will later be scored on, so the projected and actual
// columns cannot disagree about the model, only about the game.
export const DEF_BASELINE_POINTS_ALLOWED = 21

export function dashScore(player) {
  const values = Object.values(player?.source_payload?.scores || {}).map(Number).filter(Number.isFinite)
  return values.length ? Math.round(Math.max(...values)) : 50
}

export function projectedFantasyPoints(player, scoring = 'ppr') {
  const stats = player?.source_payload?.stats || {}
  const receptionValue = scoring === 'ppr' ? 1 : scoring === 'half_ppr' ? 0.5 : 0
  const position = player?.position
  // A QB's TDs are mostly passing TDs, worth 4 — charging 6 here made the
  // projection column disagree with the actual-points column beside it.
  let points = number(stats.RUYD) * 0.1 + number(stats.TD) * (position === 'QB' ? 4 : 6)
  if (['RB','WR','TE'].includes(position)) points += number(stats.RECYD) * 0.1 + number(stats.REC) * receptionValue
  if (position === 'QB') points += number(stats.PAYD) * 0.04
  if (position === 'K') points = number(stats.FGM) * 3 + number(stats.PAT)
  // A FLAT 7 FOR EVERY DEFENCE (fixed 2026-08-31). It made a projection out of
  // nothing -- the same number for the best defence in football and the worst,
  // in every matchup, all season -- and it disagreed with the actual-points
  // column beside it, which scores D/ST off a real stat line.
  //
  // Both go through defensePointsAllowedScore now. When a stat line exists the
  // projection uses it; before kickoff it falls back to a league-average game.
  // The sack, interception, fumble-recovery and defensive-touchdown terms are
  // absent from BOTH sides until the bot publishes them, so the two columns
  // understate a D/ST by the same amount rather than contradicting each other.
  if (position === 'DEF') {
    const allowed = stats.points_allowed === undefined || stats.points_allowed === null
      ? DEF_BASELINE_POINTS_ALLOWED
      : stats.points_allowed
    points = defensePointsAllowedScore(allowed)
      + number(stats.def_sacks) + number(stats.def_interceptions) * 2
      + number(stats.def_fumble_recoveries) * 2 + number(stats.def_touchdowns) * 6
  }
  return Math.round(points * 10) / 10
}

export function fantasyPointsFromStats(stats = {}, scoring = 'ppr') {
  const receptionValue = scoring === 'ppr' ? 1 : scoring === 'half_ppr' ? 0.5 : 0
  let points = number(stats.passing_yards) * 0.04 + number(stats.passing_touchdowns) * 4 - number(stats.interceptions) * 2
  points += number(stats.rushing_yards) * 0.1 + number(stats.rushing_touchdowns) * 6
  points += number(stats.receiving_yards) * 0.1 + number(stats.receiving_touchdowns) * 6 + number(stats.receptions) * receptionValue
  points += number(stats.two_point_conversions) * 2 - number(stats.fumbles_lost) * 2
  points += number(stats.field_goals_0_39) * 3 + number(stats.field_goals_40_49) * 4 + number(stats.field_goals_50_plus) * 5 + number(stats.extra_points)
  points += number(stats.def_sacks) + number(stats.def_interceptions) * 2 + number(stats.def_fumble_recoveries) * 2 + number(stats.def_touchdowns) * 6
  if (stats.points_allowed !== undefined && stats.points_allowed !== null) {
    points += defensePointsAllowedScore(stats.points_allowed)
  }
  return Math.round(points * 100) / 100
}

export function eligibleForSlot(player, slot) {
  if (slot === 'FLEX') return ['RB','WR','TE'].includes(player?.position)
  return player?.position === slot
}

export function grade(value) {
  if (value >= 90) return 'A+'
  if (value >= 85) return 'A'
  if (value >= 80) return 'A−'
  if (value >= 74) return 'B+'
  if (value >= 68) return 'B'
  if (value >= 60) return 'C'
  return 'D'
}
