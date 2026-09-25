// LAMP · SCHEDULE — GET /api/lamp/schedule?date=YYYY-MM-DD
//
// The league week that contains `date` (the feed's own week boundaries —
// previousStartDate / nextStartDate come back for paging), plus the season's
// boundary dates so the UI can say PRESEASON / REGULAR SEASON from the feed
// rather than from a calendar guess. No date = today in ET.
import { easternToday } from '../../../../lib/data'
import { scheduleFor, validDate, TTL } from '../../../../lib/nhl/api'
import { reduceScheduleWeek } from '../../../../lib/nhl/reduce'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || easternToday()
  if (!validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  try {
    const raw = await scheduleFor(date)
    return ok({ ...reduceScheduleWeek(raw), asked: date, fetchedAt: new Date().toISOString() }, TTL.schedule)
  } catch (e) {
    return delayed(`schedule ${date}`, e)
  }
}
