// TUDDY's not-scored rows (components/table/NotScoredTable.js). The bot scores the depth chart's
// QB1, RB1-2, WR1-3, TE1-2 and anyone at 20%+ snaps in his last 3 (nfl_features.scoring_cutoff,
// 2026-10-18); everyone else on a roster ships unscored with this season's per-game line
// (`stats`, nfl_features.season_per_game). The reason is only said when the payload carries the
// cutoff (`thin` on its rows): an older payload never claims why.
const GROUP = 'Per game'
export const NOT_SCORED_COLUMNS = [
  { key: 'GP', label: 'GP', group: 'Games', w: 40, dp: 0 },
  { key: 'TGT', label: 'TGT', group: GROUP, dp: 1 },
  { key: 'REC', label: 'REC', group: GROUP, dp: 1 },
  { key: 'RECYD', label: 'REC YD', group: GROUP, w: 54, dp: 1 },
  { key: 'CAR', label: 'CAR', group: GROUP, dp: 1 },
  { key: 'RUYD', label: 'RU YD', group: GROUP, w: 52, dp: 1 },
  { key: 'TD', label: 'TD', group: GROUP, dp: 2 },
  { key: 'ATT', label: 'ATT', group: GROUP, dp: 1 },
  { key: 'PAYD', label: 'PA YD', group: GROUP, w: 54, dp: 0 },
  { key: 'PATD', label: 'PA TD', group: GROUP, w: 50, dp: 2 },
]

const OUT = /^(out|ir|pup|suspended|doubtful)/i
const touches = (r) => (r.TGT || 0) + (r.CAR || 0) + (r.ATT || 0)

export function notScoredRows(players = [], positions = [], team = 'all') {
  const pos = new Set(positions || [])
  const cutoff = (players || []).some((p) => 'thin' in p)
  return (players || [])
    .filter((p) => !Object.values(p.scores || {}).some(Number.isFinite) && !p.on_bye && pos.has(p.position) && (team === 'all' || p.team === team))
    .map((p) => {
      const s = p.stats || {}
      // an injury already shows under his name (the OUT chip), so the reason says it once, there
      const why = OUT.test(p.injury_status || '') ? null : cutoff ? (s.GP ? 'backup' : 'no games') : null
      return { _id: p.player_id, _raw: p, name: p.name, team: p.team, pos: p.position, why, ...s }
    })
    .sort((a, b) => (b.GP || 0) - (a.GP || 0) || touches(b) - touches(a) || String(a.name).localeCompare(String(b.name)))
}
