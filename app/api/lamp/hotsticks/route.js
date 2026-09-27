// LAMP · HOT STICKS — GET /api/lamp/hotsticks
//
// Every skater's last 5 and last 10 regular-season games beside his season
// rate (lib/nhl/hotSticks.js), plus tonight's opponent for each club
// playing. Measured, not modelled. Last season's final weeks, labelled
// stale, until the new season has a game in it.
import { easternToday } from '../../../../lib/data'
import { scoreFor } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { readHotSticks } from '../../../../lib/nhl/hotSticks'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const date = easternToday()
    const [hs, day] = await Promise.all([readHotSticks(), scoreFor(date).then(reduceScoreDay).catch(() => null)])
    const tonight = {}
    for (const g of day?.games || []) {
      if (g.scheduleState !== 'OK') continue
      tonight[g.away.abbrev] = { opp: g.home.abbrev, home: false, gameId: g.id }
      tonight[g.home.abbrev] = { opp: g.away.abbrev, home: true, gameId: g.id }
    }
    return ok({ ...hs, date, tonight, fetchedAt: new Date().toISOString() }, 1800)
  } catch (e) {
    return delayed('hot sticks', e)
  }
}
