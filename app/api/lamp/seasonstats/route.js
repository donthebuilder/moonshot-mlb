// LAMP · SEASON STATS — GET /api/lamp/seasonstats
//
// Every skater's and goalie's regular-season line (lib/nhl/seasonStats.js),
// plus tonight's opponent for each club playing, for the table under
// Leaders. Measured, not modelled. Only the Leaders page asks for it.
import { easternToday } from '../../../../lib/data'
import { scoreFor, TTL2 } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { readSeasonStats } from '../../../../lib/nhl/seasonStats'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const date = easternToday()
    const [st, day] = await Promise.all([readSeasonStats(), scoreFor(date).then(reduceScoreDay).catch(() => null)])
    const tonight = {}
    for (const g of day?.games || []) {
      if (g.scheduleState !== 'OK') continue
      tonight[g.away.abbrev] = { opp: g.home.abbrev, home: false, gameId: g.id }
      tonight[g.home.abbrev] = { opp: g.away.abbrev, home: true, gameId: g.id }
    }
    return ok({ ...st, date, tonight, fetchedAt: new Date().toISOString() }, TTL2.leaders)
  } catch (e) {
    return delayed('season stats', e)
  }
}
