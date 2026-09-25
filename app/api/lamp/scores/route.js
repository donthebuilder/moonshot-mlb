// LAMP · SCORES — GET /api/lamp/scores?date=YYYY-MM-DD
//
// One NHL game day (Eastern calendar day, the league's own unit, the same
// rule MOONSHOT's easternToday lives by), reduced to the site's shape by
// lib/nhl/reduce.js. No date = today in ET. Why this is a server route and
// not a browser fetch like TUDDY's ESPN read: lib/nhl/api.js, first note.
import { easternToday } from '../../../../lib/data'
import { scoreFor, validDate, TTL } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || easternToday()
  if (!validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  try {
    const raw = await scoreFor(date)
    return ok({ ...reduceScoreDay(raw), fetchedAt: new Date().toISOString() }, TTL.score)
  } catch (e) {
    return delayed(`scores ${date}`, e)
  }
}
