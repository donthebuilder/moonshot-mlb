// GET /api/dash/four-record -- The Four's record per category, for the cards
// on MOONSHOT's home (2026-09-27, The Four like The Six): "9 of 14 nights".
//
// Each graded night is a ~2.4 MB file (graded_results_<date>.json), so the
// browser never reads them: this route reads the last WINDOW nights on the
// server at most once per TTL, grades each category's #1 on its own bar
// (lib/mlbFour.js fourRecord -- the same ranking the strip uses), and caches
// only the few hundred bytes of result. Nights keyed on their own dates;
// tonight is never in it (it isn't graded).
import { unstable_cache } from 'next/cache'
import { gradedResultsUrl } from '../../../../lib/dataSource'
import { fourRecord } from '../../../../lib/mlbFour'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
const WINDOW = 14
const TTL = 6 * 3600

const shift = (ymd, days) => new Date(Date.parse(`${ymd}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10)

async function night(date) {
  try {
    // no-store: a 2.4 MB body is over the fetch cache's item limit anyway;
    // the result is what gets cached, below.
    const r = await fetch(gradedResultsUrl(date), { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json()
    return Array.isArray(j?.graded_slots) ? { date, slots: j.graded_slots } : null
  } catch { return null }
}

async function compute(today) {
  const dates = Array.from({ length: WINDOW }, (_, i) => shift(today, -(i + 1)))
  const nights = (await Promise.all(dates.map(night))).filter(Boolean)
  return { through: nights[0]?.date || null, window: WINDOW, record: fourRecord(nights) }
}

const cached = unstable_cache(compute, ['four-record-v1'], { revalidate: TTL })

export async function GET() {
  try {
    const body = await cached(easternToday())
    return Response.json(body, { headers: { 'Cache-Control': `public, s-maxage=${TTL}, stale-while-revalidate=${TTL}` } })
  } catch (e) {
    console.error(`[four record] ${e?.message}`)
    return Response.json({ error: 'record delayed' }, { status: 502 })
  }
}
