// LAMP · TEAM, DEEP -- GET /api/lamp/teamdeep?team=TOR
//
// The club page's league numbers (rank of 32 on offence and defence), goalie xG faced, OUR calls on the club's
// skaters and the next game's team-model context (lib/nhl/teamDeep.js). /api/lamp/team serves the schedule, roster,
// standing and season lines; this adds what the page could not show before. Cached ten minutes at the edge.
import { TEAM_RE } from '../../../../lib/nhl/api'
import { nhlTeam } from '../../../../lib/nhl/teams'
import { readTeamDeep } from '../../../../lib/nhl/teamDeep'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const team = String(new URL(request.url).searchParams.get('team') || '').toUpperCase()
  if (!TEAM_RE.test(team) || !nhlTeam(team)) return bad('team must be one of the 32 NHL abbreviations')
  try {
    return ok(await readTeamDeep(team), 600)
  } catch (e) {
    return delayed(`team deep ${team}`, e)
  }
}
