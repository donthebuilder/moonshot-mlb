// LAMP · TEAM — GET /api/lamp/team?team=TOR
//
// One club: its standings row (standings/now), this season's roster
// (roster/{team}/current — the NEW season even in preseason), the season
// stat lines (club-stats/{team}/{season}/2, asked for the ACTIVE season and
// falling back to last season, labelled, when the new one has no games
// yet), and the full schedule (club-schedule-season/{team}/now, played and
// to come). Four upstream calls, each cached on its own TTL.
import { rosterFor, clubStatsFor, clubScheduleFor, standingsNow, TEAM_RE, TTL2 } from '../../../../lib/nhl/api'
import { reduceRoster, reduceClubStats, reduceClubSchedule, reduceStandings } from '../../../../lib/nhl/reduce'
import { nhlTeam } from '../../../../lib/nhl/teams'
import { previousSeasonId } from '../../../../lib/nhl/season'
import { whichSeason } from '../../../../lib/nhl/whichSeason'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const team = String(searchParams.get('team') || '').toUpperCase()
  if (!TEAM_RE.test(team) || !nhlTeam(team)) return bad('team must be one of the 32 NHL abbreviations')
  try {
    const season = await whichSeason()
    const [roster, schedule, standings] = await Promise.all([
      rosterFor(team).then((p) => reduceRoster(p, team)),
      clubScheduleFor(team).then((p) => reduceClubSchedule(p, team)),
      standingsNow().then(reduceStandings).catch((e) => { console.error(`[lamp] team ${team} standings: ${e?.message}`); return null }),
    ])
    // Stat lines: the active season, then last season if the active one has
    // no games yet (an empty list, not a 404, on this endpoint).
    let stats = null; let statsStale = season.stale
    if (season.id) {
      stats = reduceClubStats(await clubStatsFor(team, season.id, 2).catch(() => null))
      if (!stats.skaters.length && !season.stale) {
        stats = reduceClubStats(await clubStatsFor(team, previousSeasonId(season.id), 2).catch(() => null))
        statsStale = true
      }
    }
    const standing = standings?.rows?.find((r) => r.abbrev === team) || null
    return ok({
      team: nhlTeam(team), standing, standingSeason: standings?.seasonLabel || null, standingStale: standings ? (season.current && standings.seasonId < season.current) : null,
      roster, stats, statsStale, season, schedule, fetchedAt: new Date().toISOString(),
    }, TTL2.clubStats)
  } catch (e) {
    return delayed(`team ${team}`, e)
  }
}
