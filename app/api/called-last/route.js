// GET /api/called-last?sport=mlb|nhl|nfl|nba&date=YYYY-MM-DD[&week=N] -- public, READ ONLY (2026-10-10).
// The players the bot CALLED at lock on the previous slate and what each did: a view over the stored, graded
// rows (lib/calledLast/*). `date` is the slate being viewed (the game's own date); `week` is the NFL week on
// the board. Writes nothing and changes no record. Cached 2 min; BUCKETS (nba) is a 404 until BUCKETS_PUBLIC=on
// (lib/nba/gate.js), and never cached publicly while gated.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../../../lib/supabase/admin'
import { bucketsGuard, bucketsPublic } from '../../../lib/nba/gate'
import { isDay } from '../../../lib/calledLast/core'
import { readMlb, readNhl, readNfl, readNba } from '../../../lib/calledLast/read'

export const dynamic = 'force-dynamic'

const READERS = {
  mlb: (slate) => readMlb(slate),
  nhl: (slate, week, db) => readNhl(db, slate),
  nfl: (slate, week, db) => readNfl(db, slate, week),
  nba: (slate, week, db) => readNba(db, slate),
}
const NEEDS_DB = new Set(['nhl', 'nfl', 'nba'])

const run = (sport, slate, week) => {
  const db = NEEDS_DB.has(sport) ? adminClient({ anon: true }) : null
  if (NEEDS_DB.has(sport) && !db) return Promise.resolve({ sport, slate, date: null, dates: [], state: 'none', rows: [], unavailable: true })
  return READERS[sport](slate, week, db)
}
const cached = (sport, slate, week) => unstable_cache(() => run(sport, slate, week), ['called-last-v1', sport, slate, String(week || '')], { revalidate: 120 })()
  .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? run(sport, slate, week) : Promise.reject(e)))

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  const slate = q.get('date') || ''
  const week = q.get('week') ? Number(q.get('week')) : null
  if (!READERS[sport] || !isDay(slate)) return Response.json({ error: 'sport/date' }, { status: 400 })
  if (sport === 'nba') {
    const no = await bucketsGuard()
    if (no) return no
  }
  try {
    const body = await cached(sport, slate, Number.isFinite(week) ? week : null)
    const open = sport !== 'nba' || bucketsPublic()
    return Response.json(body, { headers: { 'Cache-Control': open ? 'public, s-maxage=120, stale-while-revalidate=240' : 'private, max-age=60' } })
  } catch (e) {
    console.error(`[called-last] ${sport}: ${e?.message || e}`)
    return Response.json({ error: 'unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
