// 🏒 PREPLAY · LAMP · THE SIMULATOR'S INPUT FOR ONE GAME (2026-10-22). Pure: the pieces LAMP already publishes ->
// lib/nhl/preplay.js's game shape. Nothing is estimated here; every number is one LAMP already shows or logs:
//
//   board    one game of /api/lamp/board: proj (lamp-team-v1: each club's expected goals and shots on goal),
//            starters (the goalies), rows (each skater with his goal-board legs: goals and shots a game)
//   rosters  { away, home }: /api/lamp/team roster rows ({ id, name, number, pos, headshot })
//   shots    { [player id]: the `recent` rows of /api/lamp/shots?player= ([x, y, result, ...], his real attempts) }
//
// Returns { G, players } or null when the board has no team projection for the game:
//   G        lib/nhl/preplay.js's input (skaters weighted by goals / shots a game, each with his real spots)
//   players  { [id]: { name, num, team, pos, face } } for the stage's chips and moment card
export function preplayGameInput({ board, rosters = {}, shots = {} }) {
  const proj = board?.proj
  if (!proj?.home?.goals || !proj?.away?.goals) return null
  const club = (key) => board.game?.[key]?.abbrev
  const players = {}
  const side = (key) => {
    const team = club(key)
    const roster = new Map((rosters[key] || []).map((r) => [Number(r.id), r]))
    const rows = (board.rows || []).filter((r) => r.team === team && r.dressed !== false)
    const pool = { goal: [], sog: [] }
    const skaters = rows.map((r) => {
      const id = Number(r.playerId)
      const ro = roster.get(id)
      const spots = { goal: [], sog: [] }
      for (const s of shots[id] || []) {
        const [x, y, result] = s
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        if (result === 'goal') { spots.goal.push([x, y]); pool.goal.push([x, y]) }
        if (result === 'goal' || result === 'sog') { spots.sog.push([x, y]); pool.sog.push([x, y]) }
      }
      players[id] = { name: r.name, num: ro?.number ?? null, team, pos: r.pos || ro?.pos || null, face: ro?.headshot || null }
      return { id, name: r.name, num: ro?.number ?? null, pos: r.pos === 'D' ? 'D' : r.pos === 'C' ? 'C' : 'F', g: Number(r.legs?.goalsPg) || 0, s: Number(r.legs?.shotsPg) || 0, spots }
    })
    const st = board.starters?.[key]
    const gid = Number(st?.playerId) || null
    if (gid) { const ro = roster.get(gid); players[gid] = { name: st.name || ro?.name || '', num: ro?.number ?? null, team, pos: 'G', face: ro?.headshot || null } }
    return { team, goals: Number(proj[key].goals), shots: Number(proj[key].shots) || 28, skaters, goalie: gid ? { id: gid, name: st.name || '', num: roster.get(gid)?.number ?? null, confirmed: !!st.confirmed } : null, spots: pool }
  }
  const G = { away: side('away'), home: side('home'), playoff: Number(board.game?.gameType) === 3 }
  if (!G.away.skaters.length || !G.home.skaters.length) return null
  return { G, players }
}
