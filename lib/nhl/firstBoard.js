// 🏒 LAMP FIRST GOAL, THE FETCH-AND-JOIN HALF (the definition is lib/nhl/firstModel.js). Server only. Reads the current season's finished
// games BEFORE the day (opening_games) for each club's first-goal count, scores the night the goal board already built, and hangs it on it:
// night.firstByGame = Map(gameId -> [every candidate]). A failed read leaves it null and the goals tick carries on.
import { clubFirstCounts, scoreFirstNight } from './firstModel'

export async function readClubFirstCounts(db, season, date) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('opening_games').select('home, away, first_score_team').eq('sport', 'nhl').eq('season', season).eq('season_type', 2).lt('game_date', date).order('game_id').range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return clubFirstCounts(rows)
}

export async function attachFirst(night, db, date) {
  const cur = night.season?.current || night.season?.id
  const counts = cur ? await readClubFirstCounts(db, cur, date) : new Map()
  const candidates = (night?.rows || []).map((r) => ({ gameId: r.gameId, playerId: r.playerId, name: r.name, pos: r.pos, team: r.team, opp: r.opp, home: r.home, legs: r.legs, context: r.context }))
  const out = scoreFirstNight(candidates, counts)
  night.firstByGame = out.byGame
  return { feeds: { clubs: counts.size, scored: out.rows.filter((r) => r.score != null).length } }
}
