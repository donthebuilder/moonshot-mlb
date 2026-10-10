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

export const LEAGUE_MIN_SOG = 8000
async function leagueZones(db, season) {
  const hit = LEAGUE.get(season)
  if (hit && Date.now() - hit.at < TTL) return hit.v
  const { data, error } = await db.rpc('lamp_league_zones', { p_season: season })
  if (missing(error)) throw Object.assign(new Error('missing'), { missingFn: true })
  if (error) throw new Error(error.message)
  LEAGUE.set(season, { at: Date.now(), v: data })
  return data
}

export async function readGoalieZones(goalie, season) {
  const db = adminClient()
  if (!db) throw new Error('no supabase env')
  const { data: g, error } = await db.rpc('lamp_goalie_zones', { p_goalie: Number(goalie), p_season: Number(season) })
  if (missing(error)) return { available: false }
  if (error) throw new Error(error.message)
  // THE LEAGUE'S RATES, SAME SEASON when it has the volume (LEAGUE_MIN_SOG shots on goal ~ 10 games a club),
  // else last season's, labelled -- a tiny early-season league sample never shades a goalie's zones.
  let lg
  try { lg = await leagueZones(db, Number(season)) } catch (e) { if (e?.missingFn) return { available: false }; throw e }
  let leagueSeason = Number(season); let leagueFallback = false
  if (!(Number(lg?.sa) >= LEAGUE_MIN_SOG)) {
    const prev = await leagueZones(db, Number(season) - 10001).catch(() => null)
    if (Number(prev?.sa) >= LEAGUE_MIN_SOG) { lg = prev; leagueSeason = Number(season) - 10001; leagueFallback = true }
  }
  return { available: true, goalie: g, league: lg, leagueSeason, leagueFallback }
}
