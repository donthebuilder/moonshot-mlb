// BUCKETS (NBA), ADMIN ONLY (2026-10-02, Donovan: "create buckets but only for
// admin"). Not on any public nav, sport switcher or sitemap; the same check as
// /admin (signed in + ADMIN_EMAILS), anyone else gets a 404. The night is built
// server-side (lib/nba/board.js) -- no public API route serves it.
import { notFound } from 'next/navigation'
import { bucketsAccess } from '../../../lib/nba/gate'
import { adminClient } from '../../../lib/supabase/admin'
import { buildNbaNight } from '../../../lib/nba/board'
import { NBA_MARKETS, LIVE_VERSIONS, whyNba } from '../../../lib/nba/model'
import { easternToday, shiftDay } from '../../../lib/data'
import { summaryFor, reduceShots, reduceBox, GAME_ID_RE } from '../../../lib/nba/api'
import BucketsAdmin from '../../../components/buckets/BucketsAdmin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'BUCKETS · admin', robots: { index: false, follow: false } }

const slim = (m, r) => ({ id: r.playerId, name: r.name, team: r.team, opp: r.opp, home: r.home, gameId: r.gameId, pos: r.pos, starter: r.starter,
  score: r.score, status: r.status, role: r.role, rank: r.rank, nightRank: r.nightRank, nightOf: r.nightOf, reason: r.reason, injury: r.injury,
  legs: r.legs?.ok ? Object.fromEntries(NBA_MARKETS[m].legs.map((l) => [l, r.legs[l]])) : null, why: r.score != null ? whyNba(m, r) : r.reason })

export default async function BucketsPage({ searchParams }) {
  // the one gate every BUCKETS surface asks (lib/nba/gate.js)
  if (!(await bucketsAccess()).ok) notFound()

  const sp = await searchParams
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp?.date || '') ? sp.date : easternToday()
  const night = await buildNbaNight(date).catch((e) => ({ date, games: [], markets: {}, error: e?.message }))
  const markets = Object.fromEntries(Object.entries(night.markets || {}).map(([m, rows]) => [m, rows.map((r) => slim(m, r))]))
  // THE SHOT CHART: a finished game on this date (?game=), else last season's sample (MEM@PHI, 03-10)
  const finals = (night.games || []).filter((g) => g.state === 'final')
  const SAMPLE = '401810791'
  const gameId = GAME_ID_RE.test(sp?.game || '') ? sp.game : finals[0]?.id || SAMPLE
  const sum = await summaryFor(gameId, true).catch(() => null)
  const chart = sum ? {
    id: gameId, sample: gameId === SAMPLE && !finals.length,
    title: (sum.header?.competitions?.[0]?.competitors || []).map((c) => `${c.team?.abbreviation} ${c.score ?? ''}`).join(' · '),
    shots: reduceShots(sum, gameId),
    names: Object.fromEntries(reduceBox(sum).map((b) => [b.id, b.name])),
    teams: Object.fromEntries((sum.header?.competitions?.[0]?.competitors || []).map((c) => [String(c.team?.id), c.team?.abbreviation])),
    finals: finals.map((g) => ({ id: g.id, label: `${g.away.abbrev}@${g.home.abbrev}` })),
  } : null

  // what's locked and graded so far (empty until QUEUE SQL part 3 runs)
  const db = adminClient()
  const log = db ? await db.from('buckets_log').select('game_date, market, status, hit, void_reason, season_type').in('model_version', LIVE_VERSIONS).not('graded_at', 'is', null).limit(20000) : { data: null, error: { message: 'no database' } }
  return (
    <BucketsAdmin date={date} prev={shiftDay(date, -1)} next={shiftDay(date, 1)} games={night.games || []} markets={markets}
      defs={Object.fromEntries(Object.entries(NBA_MARKETS).map(([k, M]) => [k, { label: M.label, legs: M.legs, highVariance: Boolean(M.highVariance), startersOnly: Boolean(M.startersOnly) }]))}
      season={night.season || null} error={night.error || night.note || null}
      graded={log.error ? null : log.data || []} gradedError={log.error?.message || null} chart={chart} />
  )
}
