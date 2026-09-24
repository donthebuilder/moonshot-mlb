// Shared current-week resolver for Franchise.
// Team, Coach and Matchup MUST agree on the week or lineups get written for a
// week nobody scores. Mirrors the logic that previously lived only in
// app/fantasy/league/[leagueId]/matchup/page.js.

export const FANTASY_SEASON = 2026
// Regular season 1-14, playoffs 15-16 (2026-09-24,
// supabase/migrations/202609241200_franchise_playoffs.sql). LAST is the last
// week anything is played -- lineups, scoring, the week picker -- and
// REGULAR is the last week that counts toward standings.
export const FANTASY_REGULAR_WEEKS = 14
export const FANTASY_PLAYOFF_ROUNDS = { semifinal: 'SEMIFINAL', final: 'CHAMPIONSHIP', third_place: '3RD PLACE' }
export const FANTASY_LAST_WEEK = 16

export function normalizeWeek(value) {
  const week = Number(value)
  if (!Number.isInteger(week)) return null
  if (week < 1 || week > FANTASY_LAST_WEEK) return null
  return week
}

// ── THIS RAN ON EVERY FRANCHISE PAGE, SERIALLY, UNCACHED (2026-09-20) ───────
//
// Donovan: "i just dont like how slw everything loads." Measured against
// production, every Franchise page spent its first round trip here before it
// could start any of its real queries -- and the query is the whole regular
// season of nfl_week_games, ~272 rows, read fresh per request. Seven pages,
// every navigation, every refresh, for an answer that is identical for every
// viewer and changes at most a few times a week.
//
// Cached module-scope for the same reason and in the same shape as
// loadPlayerCatalog: per server instance, one fetch on a cold lambda, memory
// afterwards. The TTL is short because the answer DOES move -- a Thursday
// kickoff flips the week while people are on the site -- and 60s is the
// difference between one read per page view and one per minute, which is the
// entire win. A longer TTL buys nothing and risks showing last week's board
// after kickoff.
//
// Keyed by season, and only the resolved path is cached: an explicit ?week=
// never touched the database and still does not.
const WEEK_TTL_MS = 60_000
const weekCache = new Map()   // season -> { at, week }
const weekInFlight = new Map()// season -> promise

export async function resolveFantasyWeek(supabase, requested, season = FANTASY_SEASON) {
  const explicit = normalizeWeek(requested)
  if (explicit) return explicit
  if (!supabase) return 1
  const hit = weekCache.get(season)
  if (hit && Date.now() - hit.at < WEEK_TTL_MS) return hit.week
  const running = weekInFlight.get(season)
  if (running) return running
  const task = (async () => {
    try {
      const week = await readFantasyWeek(supabase, season)
      weekCache.set(season, { at: Date.now(), week })
      return week
    } catch {
      // A failed read serves the last good week rather than pinning every page
      // to Week 1, which would write lineups into a week nobody scores.
      return weekCache.get(season)?.week || 1
    } finally {
      weekInFlight.delete(season)
    }
  })()
  weekInFlight.set(season, task)
  return task
}

async function readFantasyWeek(supabase, season) {
  // REGULAR SEASON ONLY. Preseason weeks are numbered 1, 2 and 3 as well, and
  // those rows are in this table -- so without this predicate a preseason game
  // the bot last saw in progress and never republished as final wins the
  // `status === 'live'` search below and pins every Franchise page to a
  // preseason week for the rest of the year. Nothing would have looked broken;
  // the week number would simply have been wrong everywhere at once.
  const { data } = await supabase
    .from('nfl_week_games')
    .select('week,kickoff,status')
    .eq('season', season)
    .eq('season_type', 2)
    .lte('week', FANTASY_LAST_WEEK)
    .order('kickoff')
  const games = data || []
  const live = games.find((game) => game.status === 'live')
  const next = games.find((game) => game.status === 'scheduled' && new Date(game.kickoff).getTime() >= Date.now())
  return normalizeWeek(live?.week || next?.week || games.at(-1)?.week) || 1
}
