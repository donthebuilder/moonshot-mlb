// LAMP · HOT STICKS — GET /api/lamp/hotsticks
//
// Every skater's last 5 and last 10 regular-season games beside his season
// rate (lib/nhl/hotSticks.js), plus tonight's opponent for each club
// playing. Measured, not modelled. Last season's final weeks, labelled
// stale, until the new season has a game in it.
import { easternDate } from '../../../../lib/data'
import { slateNight } from '../../../../lib/slateNight'
import { scoreFor } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { readHotSticks } from '../../../../lib/nhl/hotSticks'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    // ?date=YYYY-MM-DD: the board's night (form is read from games strictly before it).
    // None = the slate's own night, not the wall clock.
    const q = new URL(req.url).searchParams.get('date')
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : await slateNight('nhl')
    // ?need=20: LAMP Power's whole-season floor (only 0 or 20 accepted, so the cache stays two entries).
    const needGp = new URL(req.url).searchParams.get('need') === '20' ? 20 : 0
    const [hs, day] = await Promise.all([readHotSticks({ needGp, date }), scoreFor(date).then(reduceScoreDay).catch(() => null)])
    const tonight = {}
    for (const g of day?.games || []) {
      if (g.scheduleState !== 'OK') continue
      tonight[g.away.abbrev] = { opp: g.home.abbrev, home: false, gameId: g.id }
      tonight[g.home.abbrev] = { opp: g.away.abbrev, home: true, gameId: g.id }
    }
    return ok({ ...hs, date, tonight, fetchedAt: new Date().toISOString() }, date === easternDate(Date.now()) ? 1800 : 300 /* a late slate rolls over soon */)
  } catch (e) {
    return delayed('hot sticks', e)
  }
}
