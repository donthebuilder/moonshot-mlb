// LAMP · SPECIAL TEAMS — GET /api/lamp/specialteams
//
// All 32 clubs' power play and penalty kill, from the league's own team
// reports (lib/nhl/spots.js), plus tonight's opponent for each club playing,
// so the page can flag the matchups. Measured, not modelled: nothing here is
// a LAMP score. Last season's reports, labelled stale, until the new season
// has a game in it.
import { easternToday } from '../../../../lib/data'
import { scoreFor } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { readSpecialTeams } from '../../../../lib/nhl/spots'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const date = easternToday()
    const [st, day] = await Promise.all([readSpecialTeams(), scoreFor(date).then(reduceScoreDay).catch(() => null)])
    const tonight = {}
    for (const g of day?.games || []) {
      if (g.scheduleState !== 'OK') continue
      tonight[g.away.abbrev] = { opp: g.home.abbrev, home: false, gameId: g.id }
      tonight[g.home.abbrev] = { opp: g.away.abbrev, home: true, gameId: g.id }
    }
    return ok({ ...st, date, tonight, fetchedAt: new Date().toISOString() }, 600)
  } catch (e) {
    return delayed('special teams', e)
  }
}
