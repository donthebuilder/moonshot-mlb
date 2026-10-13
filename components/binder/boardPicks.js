// THE REAL PLAYERS THE BINDER'S EMPTY STATE NAMES: the top of the board the shell already loaded (never invented, never a request of its own).
// rows = the shell's own board rows (MOONSHOT: allPlayers, TUDDY: the slate's players, LAMP: board.games[].rows flattened). Returns [{ sport, id, name, team }] in board order,
// best-ranked first when the rows carry a rank; at most 12 (the binder takes the first 3 it is not already following).
const clean = (v) => String(v == null ? '' : v).trim()
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export function boardPicks(sport, rows) {
  const list = Array.isArray(rows) ? rows : []
  const out = list.map((p, i) => {
    const id = clean(p?.player_id ?? p?.playerId ?? p?.id)
    const name = clean(p?.name || p?.player || p?.player_name)
    if (!id || !name) return null
    const rank = num(p?.board_rank ?? p?.rank)
    const score = num(p?.score ?? p?.td_score)
    return { sport, id, name, team: clean(p?.team || p?.team_abbr), _o: rank != null ? rank : (score != null ? 1e6 - score : 2e6 + i) }
  }).filter(Boolean)
  out.sort((a, b) => a._o - b._o)
  return out.slice(0, 12).map(({ _o, ...p }) => p)
}
