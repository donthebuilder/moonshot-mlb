// GET /api/totals?sport=mlb|nfl|nhl|nba[&key=<slate key>] -- TOP TOTALS, read side (lib/totals).
//   slate   the newest locked slate (or `key`): its rows, best projection first, each with the stored
//           rank / called flag / line and, once graded, the result
//   record  the CALLED record and the ON THE BOARD record (lib/totals/core recordOf) and the graded rows
// Public data (every row was fixed before its game); BUCKETS' is gated like every /api/buckets route until
// BUCKETS_PUBLIC=on. Nothing here writes. The table missing (migration not run) answers an empty slate.
import { adminClient } from '../../../lib/supabase/admin'
import { isSport } from '../../../lib/routes'
import { bucketsGuard, bucketsPublic } from '../../../lib/nba/gate'
import { TOTALS_UNITS, recordOf, recordBySource, totalsCallStatus } from '../../../lib/totals/core'
import { latestKey, slateRows, recordRows } from '../../../lib/totals/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const KEY_RE = /^[0-9]{4}-(?:[0-9]{2}-[0-9]{2}|w[0-9]{2})$/

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || 'mlb')
  if (!isSport(sport)) return Response.json({ error: 'BAD REQUEST', detail: 'unknown sport' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const priv = sport === 'nba' && !bucketsPublic()
  if (sport === 'nba') { const no = await bucketsGuard(); if (no) return no }
  const db = adminClient({ anon: true })
  const cache = priv ? 'private, max-age=60' : 'public, s-maxage=60, stale-while-revalidate=120'
  const u = TOTALS_UNITS[sport]
  const empty = { sport, unit: u.unit, short: u.short, slate: u.slate, key: null, rows: [], record: null, record_by_source: null, graded: [] }
  if (!db) return Response.json(empty, { headers: { 'Cache-Control': 'no-store' } })
  try {
    const want = q.get('key')
    const key = want && KEY_RE.test(want) ? want : await latestKey(db, sport)
    const [rows, history] = await Promise.all([key ? slateRows(db, sport, key) : [], recordRows(db, sport)])
    const shape = (r) => ({ ...r, status: totalsCallStatus(r) })
    return Response.json({
      ...empty, key, rows: rows.map(shape),
      record: recordOf(history),
      record_by_source: recordBySource(history),   // CALLED vs the book total / vs our own projection, never pooled
      graded: history.filter((r) => r.result != null && totalsCallStatus(r) === 'called').slice(0, 30).map(shape),
    }, { headers: { 'Cache-Control': cache } })
  } catch (e) {
    console.error(`[totals] read ${sport}: ${e?.message || e}`)
    return Response.json({ error: 'LIVE DATA DELAYED', detail: 'Top totals could not be read.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
