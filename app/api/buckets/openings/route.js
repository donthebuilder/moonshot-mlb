// GET /api/buckets/openings?season=both|this|last&where=all|home|away&last=10 -- BUCKETS' OPENINGS research (2026-10-22): every
// club's tip and first-score record and every player's first 3 / 6 minutes and Q1, counted from opening_games / opening_players
// (written once a game by the grade tick, lib/nba/openings.js; 2025-26 backfilled). Regular season and playoffs. Gated.
// Counts only (lib/nba/openingsAgg.js), never a chance. Cached 6 hours: the tables change once a night.
// COST NOTE (KNOWN-ISSUES): a cold read pages ~30 x 1,000 player rows; an SQL function that sums in Postgres replaces this
// once the page is settled.
// COST (Supabase usage check, 2026-10-26, item A): the edge cache above is per query string (season x where x last), so every filter
// combination reloaded the whole table. Each SEASON's rows now stay in this server instance (lib/memoLoad.js): 30 minutes for the season in
// progress, 6 hours for a finished one, and every answer is built from them. Same numbers, same page.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { aggregateOpenings } from '../../../../lib/nba/openingsAgg'
import { memoLoad } from '../../../../lib/memoLoad'

export const dynamic = 'force-dynamic'
const CURRENT_TTL_MS = 30 * 60 * 1000
const FINISHED_TTL_MS = 6 * 60 * 60 * 1000
const SEASON_TTL_MS = 10 * 60 * 1000
const GAME_COLS = 'game_id, game_date, season, season_type, home, away, jump_win_team, jump_players, first_att_team, first_att_player, first_att_clock_s, first_score_team, first_score_player, first_score_clock_s, win1_home_pts, win1_away_pts, win2_home_pts, win2_away_pts, p1_home_pts, p1_away_pts'
const PLAYER_COLS = 'game_id, player_id, name, team, pos, starter, first_att_order, win1_att, win1_made, win1_pts, win1_fta, win1_tov, win2_att, win2_made, win2_pts, win2_fta, win2_tov, p1_att, p1_made, p1_pts, p1_fta, p1_tov, p1_reb, p1_ast'   // *_made: the FG% columns (10-25)

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

export const GET = bucketsRoute('openings', async (sp) => {
  const season = sp.get('season') || 'both', where = sp.get('where') || 'all', last = sp.get('last') ? Number(sp.get('last')) : null
  if (!['both', 'this', 'last'].includes(season) || !['all', 'home', 'away'].includes(where) || (last != null && !(last > 0 && last <= 82))) return bad('season both|this|last, where all|home|away, last 1-82')
  const db = adminClient()
  if (!db) return ok({ teams: [], players: [], games: 0, seasons: [] }, 60)
  const cur = await memoLoad('nba-openings:season', SEASON_TTL_MS, async () => {
    const top = await db.from('opening_games').select('season').eq('sport', 'nba').order('season', { ascending: false }).limit(1)
    if (top.error) throw new Error(top.error.message)
    return top.data?.[0]?.season ?? null
  })
  if (cur == null) return ok({ teams: [], players: [], games: 0, seasons: [] }, 300)
  const seasons = season === 'this' ? [cur] : season === 'last' ? [cur - 1] : [cur - 1, cur]
  // one cached read per season (games, then that season's players); 'both' is just the two joined, in season order as before
  const perSeason = await Promise.all(seasons.map((s) => memoLoad(`nba-openings:rows:${s}`, s === cur ? CURRENT_TTL_MS : FINISHED_TTL_MS, async () => {
    const g = await pageAll(() => db.from('opening_games').select(GAME_COLS).eq('sport', 'nba').eq('season', s).in('season_type', [2, 3]).order('game_id'))
    const gameIds = new Set(g.map((x) => String(x.game_id)))
    const p = (await pageAll(() => db.from('opening_players').select(PLAYER_COLS).eq('sport', 'nba').eq('season', s).in('season_type', [2, 3]).order('game_id').order('player_id')))
      .filter((x) => gameIds.has(String(x.game_id)))
    return { games: g, players: p }
  })))
  const games = perSeason.flatMap((x) => x.games)
  const players = perSeason.flatMap((x) => x.players)
  const agg = aggregateOpenings(games, players, { where, last })
  const count = (s) => games.filter((g) => g.season === s).length
  return ok({ ...agg, seasons: seasons.map((s) => ({ season: s, label: `${s - 1}-${String(s).slice(-2)}`, games: count(s) })), current: cur }, 21600)
})
