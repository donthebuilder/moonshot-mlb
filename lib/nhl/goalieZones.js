// 🥅 WHERE A GOALIE IS SUSCEPTIBLE (BATCH-3D-V2 1h). Server only. Reads the two
// read-only functions in supabase/migrations/202610020200_lamp_goalie_zones.sql:
// one goalie's shots on goal and goals against per named zone (and per shot
// type in each), and the league's for the same zones and season. The league's
// half is cached 6 h per server instance; one goalie is a narrow indexed read.
// Until the SQL has run the functions don't exist: `available: false`, and the
// page keeps the goalie view hidden -- never a guess in its place.
import { adminClient } from '../supabase/admin'

const LEAGUE = new Map()
const TTL = 6 * 3600 * 1000
const missing = (error) => error && (/function .* does not exist|Could not find the function|PGRST202|42883/i.test(`${error.code} ${error.message}`))

export async function readGoalieZones(goalie, season) {
  const db = adminClient()
  if (!db) throw new Error('no supabase env')
  const { data: g, error } = await db.rpc('lamp_goalie_zones', { p_goalie: Number(goalie), p_season: Number(season) })
  if (missing(error)) return { available: false }
  if (error) throw new Error(error.message)
  let lg = LEAGUE.get(season)
  if (!lg || Date.now() - lg.at > TTL) {
    const { data, error: e2 } = await db.rpc('lamp_league_zones', { p_season: Number(season) })
    if (missing(e2)) return { available: false }
    if (e2) throw new Error(e2.message)
    lg = { at: Date.now(), v: data }
    LEAGUE.set(season, lg)
  }
  return { available: true, goalie: g, league: lg.v }
}
