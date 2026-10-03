// BUCKETS (NBA), ADMIN ONLY (2026-10-02, Donovan: "create buckets but only for
// admin"). Not on any public nav, sport switcher or sitemap; the same check as
// /admin (signed in + ADMIN_EMAILS), anyone else gets a 404. The night is built
// server-side (lib/nba/board.js) -- no public API route serves it.
import { notFound } from 'next/navigation'
import { hasSupabaseConfig } from '../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../lib/supabase/server'
import { isAdminEmail } from '../../../lib/admin'
import { adminClient } from '../../../lib/supabase/admin'
import { buildNbaNight } from '../../../lib/nba/board'
import { NBA_MARKETS, whyNba } from '../../../lib/nba/model'
import { easternToday, shiftDay } from '../../../lib/data'
import BucketsAdmin from '../../../components/buckets/BucketsAdmin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'BUCKETS · admin', robots: { index: false, follow: false } }

const slim = (m, r) => ({ id: r.playerId, name: r.name, team: r.team, opp: r.opp, home: r.home, gameId: r.gameId, pos: r.pos, starter: r.starter,
  score: r.score, status: r.status, role: r.role, rank: r.rank, nightRank: r.nightRank, nightOf: r.nightOf, reason: r.reason, injury: r.injury,
  legs: r.legs?.ok ? Object.fromEntries(NBA_MARKETS[m].legs.map((l) => [l, r.legs[l]])) : null, why: r.score != null ? whyNba(m, r) : r.reason })

export default async function BucketsPage({ searchParams }) {
  if (!hasSupabaseConfig()) notFound()
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) notFound()

  const sp = await searchParams
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp?.date || '') ? sp.date : easternToday()
  const night = await buildNbaNight(date).catch((e) => ({ date, games: [], markets: {}, error: e?.message }))
  const markets = Object.fromEntries(Object.entries(night.markets || {}).map(([m, rows]) => [m, rows.map((r) => slim(m, r))]))
  // what's locked and graded so far (empty until QUEUE SQL part 3 runs)
  const db = adminClient()
  const log = db ? await db.from('buckets_log').select('game_date, market, status, hit, void_reason, season_type').not('graded_at', 'is', null).limit(20000) : { data: null, error: { message: 'no database' } }
  return (
    <BucketsAdmin date={date} prev={shiftDay(date, -1)} next={shiftDay(date, 1)} games={night.games || []} markets={markets}
      defs={Object.fromEntries(Object.entries(NBA_MARKETS).map(([k, M]) => [k, { label: M.label, legs: M.legs, highVariance: Boolean(M.highVariance), startersOnly: Boolean(M.startersOnly) }]))}
      season={night.season || null} error={night.error || night.note || null}
      graded={log.error ? null : log.data || []} gradedError={log.error?.message || null} />
  )
}
