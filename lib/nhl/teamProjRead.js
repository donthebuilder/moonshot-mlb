// 🏒 THE SLATE'S TEAM PROJECTION, READ (lamp-team-v1, 2026-10-08). Server only. For a night's games:
// each club's last 82 regular-season club-game rows before the game's own date (lamp_team_game_xg), run
// through lib/nhl/teamProj.js. One read per night, kept in Next's Data Cache for 30 minutes under the
// night and its clubs; only the finished numbers are cached, never the rows.
//
// FALLBACK, in order, each saying which it is (`source`): the team model ('xg') -> a plain rate from the
// standings ('rate': goals a game and goals allowed, AS OF NOW, so never on a game that has started) ->
// nothing (null; the page shows a dash). A missing table, a failed read or a club with no rows never
// fails the board and never invents a number.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../supabase/admin'
import MODEL from './teamProjV1'
import { projectGame, projectGameFromStandings, windowOf } from './teamProj'
import { readStandings } from './readers'

const COLS = 'game_id,team,game_date,game_type,gf,ga,sog,xg,sog_a,xg_a,goalies'

async function readRows(db, clubs, date) {
  const out = {}
  await Promise.all(clubs.map(async (c) => {
    const { data, error } = await db.from('lamp_team_game_xg').select(COLS).eq('team', c).eq('game_type', 2).lt('game_date', date)
      .order('game_date', { ascending: false }).limit(MODEL.windowGames)
    if (error) throw new Error(error.message)
    out[c] = data || []
  }))
  return out
}

const round = (v, dp) => (Number.isFinite(v) ? Number(v.toFixed(dp)) : null)
const shape = (p) => (p ? {
  total: round(p.total, 2), source: p.source, version: p.version,
  home: { team: p.home.team, goals: round(p.home.goals, 2), shots: round(p.home.shots, 1), goalieFactor: round(p.home.goalieFactor, 3), games: p.home.n },
  away: { team: p.away.team, goals: round(p.away.goals, 2), shots: round(p.away.shots, 1), goalieFactor: round(p.away.goalieFactor, 3), games: p.away.n },
} : null)

/**
 * @param games [{ id, date, state, home: abbrev, away: abbrev }]   `date` = the game's own date
 * @returns Map<gameId, { total, source, version, home, away } | null>
 */
export async function readTeamProj(games) {
  const out = new Map(games.map((g) => [g.id, null]))
  if (!games.length) return out
  const days = [...new Set(games.map((g) => g.date))].sort()
  const clubs = [...new Set(games.flatMap((g) => [g.home, g.away]))].sort()
  let xg = {}
  try {
    const db = adminClient()
    if (db) {
      const run = async () => {
        const o = {}
        for (const day of days) {
          const dayGames = games.filter((g) => g.date === day)
          const dayClubs = [...new Set(dayGames.flatMap((g) => [g.home, g.away]))].sort()
          const rows = await readRows(db, dayClubs, day)
          // a club with no history at all means the table is empty or missing for it: no team projection for that game
          for (const g of dayGames) {
            const have = (c) => windowOf(rows[c], day).length > 0
            if (have(g.home) && have(g.away)) o[g.id] = shape(projectGame({ home: g.home, away: g.away }, rows, day))
          }
        }
        return o
      }
      try {
        xg = await unstable_cache(run, ['lamp-teamproj-v1', days.join(','), clubs.join(',')], { revalidate: 1800 })()
      } catch (e) {
        if (!/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) throw e
        xg = await run()
      }
    }
  } catch (e) {
    console.error(`[lamp teamproj] ${e?.message}`)   // a missing table lands here; the fallback below answers
  }
  for (const g of games) if (xg[g.id]) out.set(g.id, xg[g.id])
  // the plain rate, for what the team model could not answer -- as of now, so never for a game that has started
  const need = games.filter((g) => !out.get(g.id) && g.state === 'pre')
  if (need.length) {
    try {
      const st = await readStandings()
      const table = Object.fromEntries((st.rows || []).filter((r) => r.gp > 0 && r.gf != null && r.ga != null).map((r) => [r.abbrev, r]))
      for (const g of need) out.set(g.id, shape(projectGameFromStandings({ home: g.home, away: g.away }, table)))
    } catch (e) { console.error(`[lamp teamproj] standings: ${e?.message}`) }
  }
  return out
}
