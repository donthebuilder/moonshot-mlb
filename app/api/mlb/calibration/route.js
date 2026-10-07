// GET /api/mlb/calibration -- the MLB calibration table, public and read-only
// (2026-10-06): per tier, calls made, calls cleared, the rate (only where n >=
// minN), and the lock lead before first pitch. ?tier=TOP&season=regular|post
// lists every call of that tier (who, which game, the line, the lock stamp,
// first pitch) so the table can be checked row by row against the public
// por_rows / outcome_log files. Built in lib/calibration; cached 30 minutes.
import { readCalibration, readCalibrationCalls } from '../../../../lib/calibration/readMlbCalibration'
import { TIERS } from '../../../../lib/calibration/mlbCalibration'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
const CACHE = { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' }

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const through = easternToday()
  try {
    const tier = q.get('tier')
    if (tier) {
      const season = q.get('season') === 'post' ? 'post' : 'regular'
      if (!TIERS.some((t) => t.key === tier)) return Response.json({ error: 'tier' }, { status: 400 })
      return Response.json({ tier, season, through, calls: await readCalibrationCalls(through, tier, season) }, { headers: CACHE })
    }
    return Response.json(await readCalibration(through), { headers: CACHE })
  } catch (e) {
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
}
