// GET /api/mlb/openings?part=all|reg|post&where=all|home|away&last=10 -- MOONSHOT's OPENINGS research (2026-10-22): every club's
// 1st inning, first run, first hit and first homer, and every starter's 1st inning, counted from opening_games / opening_players
// (sport 'mlb'; written once a game by the homers tick, lib/mlb/openings.js; the season backfilled). The newest season on file,
// regular season and October (spring training is stored but never mixed in). Counts only (lib/mlb/openingsAgg.js), never a
// chance. Public and read-only; cached 6 hours: the tables change once a game.
import { adminClient } from '../../../../lib/supabase/admin'
import { aggregateMlbOpenings } from '../../../../lib/mlb/openingsAgg'
import { recordOf } from '../../../../lib/mlb/firstLock'
import { VERSION as FIRST_VERSION } from '../../../../lib/mlb/firstModel'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const GAME_COLS = 'game_id, game_date, season, season_type, home, away, first_score_team, first_score_player, first_hit_team, first_hit_player, first_hr_team, first_hr_player, first_score_type, pre_first_att_home, pre_first_att_away, pre_first_hit_home, pre_first_hit_away, pre_first_hr_home, pre_first_hr_away, p1_home_pts, p1_away_pts'
const PLAYER_COLS = 'game_id, player_id, name, team, pos, starter, bat_order, p1_att, p1_made, p1_hr, p1_tb, p1_runs'
const PARTS = { all: [2, 3], reg: [2], post: [3] }
const json = (body, sMaxAge, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge}` } })

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

const G_KEYS = ['game_id', 'game_date', 'home', 'away', 'first_score_team', 'first_score_player', 'first_hit_team', 'first_hit_player', 'first_hr_team', 'first_hr_player', 'p1_home_pts', 'p1_away_pts']
const P_KEYS = ['game_id', 'player_id', 'name', 'team', 'pos', 'starter', 'bat_order', 'p1_att', 'p1_made', 'p1_hr', 'p1_tb', 'p1_runs']
const fromArrays = (keys, rows) => (rows || []).map((a) => Object.fromEntries(keys.map((k, i) => [k, a[i]])))

// one call (public.opening_rows_mlb, supabase/migrations/202610221500_openings_mlb.sql); paging the tables until it exists
async function readRows(db, season, types) {
  const rpc = await db.rpc('opening_rows_mlb', { p_season: season, p_types: types })
  if (!rpc.error && rpc.data) return { games: fromArrays(G_KEYS, rpc.data.games), players: fromArrays(P_KEYS, rpc.data.players) }
  const games = await pageAll(() => db.from('opening_games').select(GAME_COLS).eq('sport', 'mlb').eq('season', season).in('season_type', types).order('game_id'))
  const ids = new Set(games.map((g) => String(g.game_id)))
  const players = (await pageAll(() => db.from('opening_players').select(PLAYER_COLS).eq('sport', 'mlb').eq('season', season).in('season_type', types).eq('starter', true).order('game_id').order('player_id')))
    .filter((p) => ids.has(String(p.game_id)))
  return { games, players }
}

export async function GET(request) {
  const sp = new URL(request.url).searchParams
  const part = sp.get('part') || 'all', where = sp.get('where') || 'all', last = sp.get('last') ? Number(sp.get('last')) : null
  if (!PARTS[part] || !['all', 'home', 'away'].includes(where) || (last != null && !(Number.isInteger(last) && last > 0 && last <= 162))) {
    return json({ error: 'part all|reg|post, where all|home|away, last 1-162' }, 60, 400)
  }
  const empty = { teams: [], players: [], games: 0, season: null }
  const db = adminClient()
  if (!db) return json(empty, 60)
  try {
    const top = await db.from('opening_games').select('season').eq('sport', 'mlb').in('season_type', [2, 3]).order('season', { ascending: false }).limit(1)
    if (top.error) throw new Error(top.error.message)
    const season = top.data?.[0]?.season ?? null
    if (season == null) return json(empty, 300)
    const { games, players } = await readRows(db, season, PARTS[part])
    const through = games.reduce((m, g) => (String(g.game_date) > m ? String(g.game_date) : m), '')
    // THE CALL'S OWN RECORD (lib/mlb/firstLock.js): the #1 first-hit / first-HR call over the graded games, every game it locked (no table yet: null)
    const fl = await db.from('mlb_first_log').select('game_pk, hit_rank, hr_rank, first_hit, first_hr, graded_at').eq('model_version', FIRST_VERSION).not('graded_at', 'is', null).limit(5000)
    const firstRecord = fl.error ? null : recordOf(fl.data || [])
    return json({ ...aggregateMlbOpenings(games, players, { where, last }), season, through, firstRecord }, 21600)
  } catch (e) {
    console.error(`[mlb/openings] ${e?.message}`)
    return json({ ...empty, error: 'openings' }, 60, 502)
  }
}
