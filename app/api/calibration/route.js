// GET /api/calibration?sport=mlb|nhl|nfl|nba -- the calibration table for any sport, public and
// read-only (2026-10-06): per tier, calls, cleared, rate (only at n >= minN), board and proof
// state (lib/calibration/proof.js: PROVEN / TESTING / few). MLB delegates to lib/calibration/
// readMlbCalibration (its calls list is /api/mlb/calibration?tier=). BUCKETS (nba) answers 404
// until it is public (lib/nba/gate.js), exactly like every /api/buckets route.
import { easternToday } from '../../../lib/data'
import { READ, readCalibrationAny } from '../../../lib/calibration/readAny'
import { bucketsGuard } from '../../../lib/nba/gate'

export const dynamic = 'force-dynamic'
// per-sport facts as data, not branches
const GATED = new Set(['nba'])                       // BUCKETS: 404 + no shared cache until it is public
const CALLS_URL = { mlb: '/api/mlb/calibration' }    // sports that can list every call
const CACHE = { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' }

export async function GET(request) {
  const sport = new URL(request.url).searchParams.get('sport') || 'mlb'
  if (!READ[sport]) return Response.json({ error: 'sport' }, { status: 400 })
  if (GATED.has(sport)) { const g = await bucketsGuard(); if (g) return g }
  try {
    const body = await readCalibrationAny(sport, easternToday())
    return Response.json({ ...body, sport, callsUrl: CALLS_URL[sport] || null }, { headers: GATED.has(sport) ? { 'Cache-Control': 'private, no-store' } : CACHE })
  } catch (e) {
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
}
