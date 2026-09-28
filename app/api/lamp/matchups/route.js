// LAMP · MATCHUPS — GET /api/lamp/matchups?date=YYYY-MM-DD
//
// Tonight's defences, ranked by goals allowed per game, with PK%, the
// attacking club's PP%, rest, and the attacking club's called skaters
// (lib/nhl/matchups.js). Measured, not modelled. Cached ten minutes at the
// edge: nothing here moves faster than the board's own locks.
import { easternToday } from '../../../../lib/data'
import { validDate } from '../../../../lib/nhl/api'
import { buildMatchups } from '../../../../lib/nhl/matchups'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  const date = new URL(request.url).searchParams.get('date') || easternToday()
  if (!validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  try {
    return ok({ ...(await buildMatchups(date)), fetchedAt: new Date().toISOString() }, 600)
  } catch (e) {
    return delayed(`matchups ${date}`, e)
  }
}
