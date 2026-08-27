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
