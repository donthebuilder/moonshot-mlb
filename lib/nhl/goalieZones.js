// 🥅 WHERE A GOALIE IS SUSCEPTIBLE (BATCH-3D-V2 1h). Server only. Reads the two
// read-only functions in supabase/migrations/202610020200_lamp_goalie_zones.sql:
// one goalie's shots on goal and goals against per named zone (and per shot
// type in each), and the league's for the same zones and season. The league's
// half is cached 6 h per server instance; one goalie is a narrow indexed read.
// Until the SQL has run the functions don't exist: `available: false`, and the
// page keeps the goalie view hidden -- never a guess in its place.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../supabase/admin'

const LEAGUE = new Map()
const TTL = 6 * 3600 * 1000
const missing = (error) => error && (/function .* does not exist|Could not find the function|PGRST202|42883/i.test(`${error.code} ${error.message}`))

export const LEAGUE_MIN_SOG = 8000
// SHARED, NOT PER INSTANCE (2026-10-20, cost round 7): Supabase's API report had lamp_league_zones at 75 calls an hour,
// ~2.7 s each -- the per-instance Map below misses on every cold serverless instance. The league's zones move once a
// night, so the answer now sits in Next's Data Cache for 6 hours, shared by every instance; the Map stays as the first
// stop. A missing function is never cached (it throws before the cache stores anything).
const leagueRpc = async (db, season) => {
  const { data, error } = await db.rpc('lamp_league_zones', { p_season: season })
  if (missing(error)) throw Object.assign(new Error('missing'), { missingFn: true })
  if (error) throw new Error(error.message)
  return data
}
async function leagueZones(db, season) {
  const hit = LEAGUE.get(season)
  if (hit && Date.now() - hit.at < TTL) return hit.v
  let data
  try {
    data = await unstable_cache(() => leagueRpc(db, season), ['lamp-league-zones-v1', String(season)], { revalidate: TTL / 1000 })()
  } catch (e) {
    if (e?.missingFn || !/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) throw e
    data = await leagueRpc(db, season)   // outside a Next request (a script): read directly
  }
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

// 🥅 WHO SCORES ON A GOALIE, AND FROM WHICH SIDE (2026-10-13). One read-only function, every goalie of a season at once
// (supabase/migrations/202610131200_lamp_goalie_giveups.sql): shots and goals by the scorer's position and by the side of
// the ice, with the league's beside them. Cached 6 h per season per server instance, like the league half above, and
// the page that reads it revalidates every 10 minutes. Until the SQL has run the function does not exist:
// `available: false`, and the page hides the section -- never a guess in its place. lib/nhl/goalieGiveUps.js has the rules.
const GIVEUPS = new Map()
export async function readGoalieGiveUps(season) {
  const hit = GIVEUPS.get(Number(season))
  if (hit && Date.now() - hit.at < TTL) return hit.v
  const db = adminClient()
  if (!db) throw new Error('no supabase env')
  const { data, error } = await db.rpc('lamp_goalie_giveups', { p_season: Number(season) })
  if (missing(error)) return { available: false, season: Number(season) }
  if (error) throw new Error(error.message)
  const v = { available: true, season: Number(season), league: data?.league || null, goalies: data?.goalies || [] }
  GIVEUPS.set(Number(season), { at: Date.now(), v })
  return v
}
