// LAMP · LEADERS — GET /api/lamp/leaders
//
// Skater and goalie leaders for the ACTIVE season, regular season only,
// ten deep per category, from the league's own leader endpoints — measured,
// not modelled (the same rule TUDDY's Leaders page states). The dated form
// always: `/current` carries no season and is last season's in preseason.
// A 404 for the active season (no games yet, e.g. the afternoon of opening
// night) falls back to last season and says so with `stale`.
import { skaterLeaders, goalieLeaders, TTL2 } from '../../../../lib/nhl/api'
import { reduceLeaders, seasonLabel } from '../../../../lib/nhl/reduce'
import { previousSeasonId } from '../../../../lib/nhl/season'
import { whichSeason } from '../../../../lib/nhl/whichSeason'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

const SKATER_CATS = ['goals', 'assists', 'points', 'plusMinus', 'toi', 'penaltyMins', 'faceoffLeaders']
const GOALIE_CATS = ['wins', 'savePctg', 'goalsAgainstAverage', 'shutouts']
const LIMIT = 10

async function forSeason(season) {
  const [s, g] = await Promise.all([skaterLeaders(season, 2, SKATER_CATS, LIMIT), goalieLeaders(season, 2, GOALIE_CATS, LIMIT)])
  return { skaters: reduceLeaders(s), goalies: reduceLeaders(g) }
}

export async function GET() {
  try {
    const season = await whichSeason()
    if (!season.id) throw new Error('no season from standings-season')
    let used = season.id; let stale = season.stale; let data
    try {
      data = await forSeason(used)
    } catch (e) {
      if (e?.status !== 404 || season.stale) throw e
      used = previousSeasonId(season.id); stale = true
      data = await forSeason(used)
    }
    return ok({ ...data, season: used, seasonLabel: seasonLabel(used), stale, current: season.current, opens: season.opens, fetchedAt: new Date().toISOString() }, TTL2.leaders)
  } catch (e) {
    return delayed('leaders', e)
  }
}
