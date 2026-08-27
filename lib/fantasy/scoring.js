const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0

export function dashScore(player) {
  const values = Object.values(player?.source_payload?.scores || {}).map(Number).filter(Number.isFinite)
  return values.length ? Math.round(Math.max(...values)) : 50
}

export function projectedFantasyPoints(player, scoring = 'ppr') {
  const stats = player?.source_payload?.stats || {}
  const receptionValue = scoring === 'ppr' ? 1 : scoring === 'half_ppr' ? 0.5 : 0
  const position = player?.position
  let points = number(stats.RUYD) * 0.1 + number(stats.TD) * 6
  if (['RB','WR','TE'].includes(position)) points += number(stats.RECYD) * 0.1 + number(stats.REC) * receptionValue
  if (position === 'QB') points += number(stats.PAYD) * 0.04
  if (position === 'K') points = number(stats.FGM) * 3 + number(stats.PAT)
  if (position === 'DEF') points = 7
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
    const allowed=number(stats.points_allowed)
    points += allowed===0?10:allowed<=6?7:allowed<=13?4:allowed<=20?1:allowed<=27?0:allowed<=34?-1:-4
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
