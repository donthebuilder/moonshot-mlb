// THE TUDDY SHARE CARDS' ROW SHAPING (pure: no JSX, no I/O, so a script can test it with plain node). Moved from components/nfl/shareCard.js (the browser
// canvas wrapper, retired 2026-10-12) to the server's share data (lib/cards/shareData.js), which imports it.
const fin = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

export const nflGameOf = (games, team) => (games || []).find((g) => g.home === team || g.away === team) || null
/** His result once his game is final: { text, hot, miss } | null before that. results = nfl_results.json (lines by player id). */
export function nflTdResult(p, game, results) {
  const pid = p?.player_id
  if (!game?.completed || !results?.lines) return null
  const line = results.lines[String(pid)]
  if (!line) return null
  if (!Object.keys(line).length) return { text: 'VOID', hot: false, miss: true }
  const td = fin(line.TD) ?? 0
  return td > 0 ? { text: `${td} TD`, hot: true, miss: false } : { text: 'MISS', hot: false, miss: true }
}
export function nflItem(c, rank, s) {
  const g = nflGameOf(s.week.games, c.team)
  const res = nflTdResult({ player_id: c.player_id }, g, s.results)
  const where = g && c.opp ? `${g.home === c.team ? 'vs' : '@'} ${c.opp}` : c.opp ? `vs ${c.opp}` : ''
  return { rank, id: c.player_id, name: c.name, team: c.team, opp: c.opp, where, pos: c.pos, status: c.status, score: c.score, ...(res ? { result: { text: res.text, hot: res.hot }, miss: res.miss } : {}) }
}
