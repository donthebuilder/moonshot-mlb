// THE SHOTS ROUTES' PACKED ROWS (2026-10-20). Both /api/buckets/shots and /api/buckets/player send
//   shots: [[x, y, made, three, g, period], ...]   g = the shot's index into `games`
//   games: [[game_id, game_date], ...]              oldest first
// (the player route before 10-20 sent [x, y, made, three, game_id] with no games list: still read).
// event_id is the row's place in the list: unique per read.
export function packShots(rows = []) {
  const games = [...new Map(rows.map((s) => [String(s.game_id), s.game_date || null])).entries()]
    .sort((a, b) => String(a[1] || '').localeCompare(String(b[1] || '')) || Number(a[0]) - Number(b[0]))
  const at = new Map(games.map(([id], i) => [id, i]))
  return { shots: rows.map((s) => [s.x, s.y, s.made ? 1 : 0, s.three ? 1 : 0, at.get(String(s.game_id)), s.period ?? null]), games }
}
export function unpackShots(packed = [], games = null) {
  const g = Array.isArray(games) ? games : null
  return (packed || []).map((s, i) => {
    const byIndex = g && typeof s[4] === 'number'
    const game = byIndex ? g[s[4]] : null
    return { event_id: i, x: s[0], y: s[1], made: Boolean(s[2]), three: Boolean(s[3]), game_id: byIndex ? (game?.[0] ?? null) : (s[4] || null),
      game_date: game?.[1] ?? null, game_n: byIndex ? s[4] : null, period: s[5] ?? null }
  })
}
