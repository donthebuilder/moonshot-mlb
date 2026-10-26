// THE TEAM-LEVEL OPENINGS READ, ONE FOR LAMP AND TUDDY (2026-10-26). Server only. opening_games (sport 'nhl' | 'nfl'), regular season and
// playoffs, each season's rows kept in this instance for a while (lib/memoLoad.js: 30 minutes for the season in progress, 6 hours for a
// finished one) and every answer built from them (lib/openings/teamAgg.js). Counts of what happened, never a chance.
import { aggregateTeamOpenings } from './teamAgg'
import { memoLoad } from '../memoLoad'

const COLS = 'game_id, game_date, season, season_type, home, away, jump_win_team, first_score_team, first_score_player, first_score_type, pre_first_att_home, pre_first_att_away, win1_home_pts, win1_away_pts, win2_home_pts, win2_away_pts, p1_home_pts, p1_away_pts'
const CURRENT_TTL_MS = 30 * 60 * 1000, FINISHED_TTL_MS = 6 * 60 * 60 * 1000, SEASON_TTL_MS = 10 * 60 * 1000

async function pageAll(q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}
// 20252026 -> '2025-26'; 2026 -> '2026'
const labelOf = (s) => (s > 9999 ? `${String(s).slice(0, 4)}-${String(s).slice(6)}` : String(s))

export async function readTeamOpenings(db, sport, { season = 'both', where = 'all', last = null } = {}) {
  const seasonsOn = await memoLoad(`${sport}-openings:seasons`, SEASON_TTL_MS, async () => {
    const top = await db.from('opening_games').select('season').eq('sport', sport).order('season', { ascending: false }).limit(1)
    if (top.error) throw new Error(top.error.message)
    const cur = top.data?.[0]?.season ?? null
    if (cur == null) return { cur: null, prev: null }
    const p = await db.from('opening_games').select('season').eq('sport', sport).lt('season', cur).order('season', { ascending: false }).limit(1)
    if (p.error) throw new Error(p.error.message)
    return { cur, prev: p.data?.[0]?.season ?? null }
  })
  const { cur, prev } = seasonsOn
  if (cur == null) return { teams: [], scorers: [], games: 0, seasons: [], current: null }
  const seasons = (season === 'this' ? [cur] : season === 'last' ? [prev] : [prev, cur]).filter((s) => s != null)
  const perSeason = await Promise.all(seasons.map((s) => memoLoad(`${sport}-openings:rows:${s}`, s === cur ? CURRENT_TTL_MS : FINISHED_TTL_MS,
    () => pageAll(() => db.from('opening_games').select(COLS).eq('sport', sport).eq('season', s).in('season_type', [2, 3]).order('game_id')))))
  const games = perSeason.flat()
  const agg = aggregateTeamOpenings(games, { where, last })
  return { ...agg, seasons: seasons.map((s, i) => ({ season: s, label: labelOf(s), games: perSeason[i].length })), current: cur }
}
