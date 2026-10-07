// GET /api/mlb/call-status?from=YYYY-MM-DD&to=YYYY-MM-DD -- public, read-only (2026-10-06).
// Per night: the board size and each home run hitter's CALLED / ON THE BOARD / NOT ON THE
// BOARD, from the same homer_feed rows and the same lib/callStatus.js /called reads, so the
// in-app Called Ledger, the Record page and the header can't disagree with /called.
// At most 60 nights; cached 60 s like /called.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../../../../lib/supabase/admin'
import { readStatusNights } from '../../../../lib/record/mlbStatus'

export const dynamic = 'force-dynamic'
const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 60

const read = (from, to) => {
  const db = adminClient({ anon: true })
  return db ? readStatusNights(db, { since: from, until: to }) : Promise.resolve({})
}
const cached = (from, to) => unstable_cache(() => read(from, to), ['mlb-call-status-v1', from, to], { revalidate: 60 })()
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? read(from, to) : Promise.reject(e)))

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const from = q.get('from') || ''
  const to = q.get('to') || from
  if (!DAY.test(from) || !DAY.test(to) || to < from) return Response.json({ error: 'dates' }, { status: 400 })
  if ((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5 >= MAX_DAYS) return Response.json({ error: 'range' }, { status: 400 })
  try {
    return Response.json({ days: await cached(from, to) }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
}
