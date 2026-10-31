// GET /api/market-rates?sport=mlb|nhl|nfl|nba -- the hit rate of the CALLED picks in each market, for the market chips
// on the Rankings boards (2026-10-29, Donovan: "the hit rate percentage on the call picks for each category ... for each sport").
// Not a second record: every number is read from the reader that already makes it. MLB / NFL / NBA are the tiers of
// /api/calibration (lib/calibration/readAny, 30-minute cache); NHL's goal market is its CALLED tier, and SHOTS / POINTS /
// ASSISTS are their called rows in lamp_prop_log, counted under the same rule as the record (regular season and playoffs,
// preseason out, not dressed = void). A rate is printed only at n >= minN calls AND, for BUCKETS and a LAMP TEST market,
// 30 graded nights (lib/record/nbaFloor.js): under either the entry carries n and no rate.
import { easternToday } from '../../../lib/data'
import { READ, readCalibrationAny } from '../../../lib/calibration/readAny'
import { adminClient } from '../../../lib/supabase/admin'
import { bucketsGuard } from '../../../lib/nba/gate'
import { readPaged } from '../../../lib/record/paged'
import { VERSIONS } from '../../../lib/nhl/versions'
import { isCallTier } from '../../../lib/record/callsLanded'
import { NBA_MIN_NIGHTS } from '../../../lib/record/nbaFloor'

export const dynamic = 'force-dynamic'
const GATED = new Set(['nba'])   // BUCKETS: 404 + no shared cache until it is public, like /api/calibration
const CACHE = { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' }
const PRIVATE = { 'Cache-Control': 'private, no-store' }
const HAS_PROPS = new Set(['nhl'])   // sports whose extra markets (shots, points, assists) live in lamp_prop_log
const MIN_N = 30
const pct1 = (h, n) => (n > 0 ? Math.round((1000 * h) / n) / 10 : null)

/** { KEY: { n, hits, rate } } from a calibration body's regular-season call tiers (a tier under the floor: no rate). */
function fromTiers(cal) {
  const out = {}
  for (const t of cal?.regular?.tiers || []) {
    if (!isCallTier(t)) continue
    const n = t.n || 0, hits = t.hits || 0
    out[t.key] = { n, hits, rate: t.tracking || n < (cal.minN ?? MIN_N) ? null : pct1(hits, n) }
  }
  return out
}

// LAMP's props: called + graded rows of one market, over every version of it. The test markets wait for 30 nights.
const NHL_PROPS = { SOG: { versions: VERSIONS.sog, test: false }, PTS: { versions: VERSIONS.pts, test: true }, AST: { versions: VERSIONS.ast, test: true } }
async function nhlProps(db) {
  const out = {}
  for (const [market, d] of Object.entries(NHL_PROPS)) {
    const { data, error } = await readPaged(() => db.from('lamp_prop_log').select('game_date, game_id, player_id, hit, graded_at')
      .eq('market', market).in('model_version', [...new Set(d.versions)]).eq('status', 'called').not('graded_at', 'is', null).neq('game_type', 1)
      .order('game_date', { ascending: true }).order('game_id', { ascending: true }).order('player_id', { ascending: true }))
    if (error) continue
    const graded = data.filter((r) => r.hit != null)
    const hits = graded.filter((r) => r.hit).length
    const nights = new Set(graded.map((r) => r.game_date)).size
    out[market] = { n: graded.length, hits, nights, rate: graded.length >= MIN_N && (!d.test || nights >= NBA_MIN_NIGHTS) ? pct1(hits, graded.length) : null }
  }
  return out
}

export async function GET(request) {
  const sport = new URL(request.url).searchParams.get('sport') || 'mlb'
  if (!READ[sport]) return Response.json({ error: 'sport' }, { status: 400 })
  if (GATED.has(sport)) { const g = await bucketsGuard(); if (g) return g }
  try {
    const cal = await readCalibrationAny(sport, easternToday())
    let rates = fromTiers(cal)
    if (HAS_PROPS.has(sport)) {
      const goal = (cal?.regular?.tiers || []).find((t) => t.status === 'called')
      rates = { GOAL: goal ? { n: goal.n || 0, hits: goal.hits || 0, rate: (goal.n || 0) >= MIN_N ? pct1(goal.hits || 0, goal.n || 0) : null } : null, ...(await nhlProps(adminClient({ anon: true }))) }
    }
    return Response.json({ sport, rates, minN: cal?.minN ?? MIN_N }, { headers: GATED.has(sport) ? PRIVATE : CACHE })
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
}
