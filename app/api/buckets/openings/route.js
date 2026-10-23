// GET /api/buckets/openings?season=both|this|last&where=all|home|away&last=10 -- BUCKETS' OPENINGS research (2026-10-22): every
// club's tip and first-score record and every player's first 3 / 6 minutes and Q1, counted from opening_games / opening_players
// (written once a game by the grade tick, lib/nba/openings.js; 2025-26 backfilled). Regular season and playoffs. Gated.
// Counts only (lib/nba/openingsAgg.js), never a chance. Cached 6 hours: the tables change once a night.
// COST NOTE (KNOWN-ISSUES): a cold read pages ~30 x 1,000 player rows; an SQL function that sums in Postgres replaces this
// once the page is settled.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { aggregateOpenings } from '../../../../lib/nba/openingsAgg'

export const dynamic = 'force-dynamic'
const GAME_COLS = 'game_id, game_date, season, season_type, home, away, jump_win_team, jump_players, first_att_team, first_att_player, first_score_team, first_score_player, first_score_clock_s, win1_home_pts, win1_away_pts, win2_home_pts, win2_away_pts, p1_home_pts, p1_away_pts'
const PLAYER_COLS = 'game_id, player_id, name, team, pos, starter, first_att_order, win1_att, win1_pts, win1_fta, win1_tov, win2_att, win2_pts, win2_fta, win2_tov, p1_att, p1_pts, p1_fta, p1_tov, p1_reb, p1_ast'

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
  const top = await db.from('opening_games').select('season').eq('sport', 'nba').order('season', { ascending: false }).limit(1)
  if (top.error) throw new Error(top.error.message)
  const cur = top.data?.[0]?.season ?? null
  if (cur == null) return ok({ teams: [], players: [], games: 0, seasons: [] }, 300)
  const seasons = season === 'this' ? [cur] : season === 'last' ? [cur - 1] : [cur - 1, cur]
  const games = await pageAll(() => db.from('opening_games').select(GAME_COLS).eq('sport', 'nba').in('season', seasons).in('season_type', [2, 3]).order('game_id'))
  const ids = new Set(games.map((g) => String(g.game_id)))
  const players = (await pageAll(() => db.from('opening_players').select(PLAYER_COLS).eq('sport', 'nba').in('season', seasons).in('season_type', [2, 3]).order('game_id').order('player_id')))
    .filter((p) => ids.has(String(p.game_id)))
  const agg = aggregateOpenings(games, players, { where, last })
  const count = (s) => games.filter((g) => g.season === s).length
  return ok({ ...agg, seasons: seasons.map((s) => ({ season: s, label: `${s - 1}-${String(s).slice(-2)}`, games: count(s) })), current: cur }, 21600)
})
