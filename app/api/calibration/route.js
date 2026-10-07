// GET /api/calibration?sport=mlb|nhl|nfl|nba -- the calibration table for any sport, public and
// read-only (2026-10-06): per tier, calls, cleared, rate (only at n >= minN), board and proof
// state (lib/calibration/proof.js: PROVEN / TESTING / few). MLB delegates to lib/calibration/
// readMlbCalibration (its calls list is /api/mlb/calibration?tier=). BUCKETS (nba) answers 404
// until it is public (lib/nba/gate.js), exactly like every /api/buckets route.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../../../lib/supabase/admin'
import { easternToday } from '../../../lib/data'
import { readCalibration } from '../../../lib/calibration/readMlbCalibration'
import { readNhlCalibration, readNbaCalibration, readNflCalibration } from '../../../lib/calibration/readSportCalibration'
import { bucketsGuard } from '../../../lib/nba/gate'

export const dynamic = 'force-dynamic'
// per-sport facts as data, not branches
const GATED = new Set(['nba'])                       // BUCKETS: 404 + no shared cache until it is public
const CALLS_URL = { mlb: '/api/mlb/calibration' }    // sports that can list every call
const CACHE = { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' }

const READ = {
  mlb: (day) => readCalibration(day),
  nhl: () => readNhlCalibration(adminClient({ anon: true })),
  nfl: () => readNflCalibration(),
  nba: () => readNbaCalibration(adminClient({ anon: true })),
}
const cached = (sport, day) => unstable_cache(() => READ[sport](day), ['calibration-v1', sport, day], { revalidate: 1800 })()
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? READ[sport](day) : Promise.reject(e)))

export async function GET(request) {
  const sport = new URL(request.url).searchParams.get('sport') || 'mlb'
  if (!READ[sport]) return Response.json({ error: 'sport' }, { status: 400 })
  if (GATED.has(sport)) { const g = await bucketsGuard(); if (g) return g }
  try {
    const body = await cached(sport, easternToday())
    return Response.json({ ...body, sport, callsUrl: CALLS_URL[sport] || null }, { headers: GATED.has(sport) ? { 'Cache-Control': 'private, no-store' } : CACHE })
  } catch (e) {
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
}
