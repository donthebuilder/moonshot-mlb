// X POLLS CRON (X overhaul stage 3 piece 2, 2026-10-09). Every ten minutes through the day.
//
// One native poll per ACTIVE sport per day (MLB, NFL, NHL, and BUCKETS once it has regular-season
// games), a different question each time, board and fun alternating (lib/dash/polls). Most runs
// end in one cheap check: before a sport's slot (lib/dash/polls/slots.js pollSlots), or already
// posted today. After the games, a "guess the stat" poll gets its REVEAL post (INFO, quotes the poll,
// only a real stored outcome). Polls are ON in code; X_POLLS_PAUSE=on is the emergency switch.
import { cronAuthorized, adminClient } from '../../../../../lib/supabase/admin'
import { isMaintenanceMode } from '../../../../../lib/edgeConfig'
import { easternToday } from '../../../../../lib/data'
import { POLL_SPORTS } from '../../../../../lib/dash/polls/kinds'
import { pollsPaused, postPollOnce, postRevealsOnce } from '../../../../../lib/dash/polls/post'
import { createMlbPollAdapter } from '../../../../../lib/dash/polls/adapters/mlb'
import { createNflPollAdapter } from '../../../../../lib/dash/polls/adapters/nfl'
import { createNhlPollAdapter } from '../../../../../lib/dash/polls/adapters/nhl'
import { createNbaPollAdapter } from '../../../../../lib/dash/polls/adapters/nba'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ADAPTERS = { mlb: createMlbPollAdapter, nfl: createNflPollAdapter, nhl: createNhlPollAdapter, nba: createNbaPollAdapter }

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (pollsPaused()) return Response.json({ skipped: 'X_POLLS_PAUSE is on' })
  if (await isMaintenanceMode()) return Response.json({ skipped: 'maintenance_mode' })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })
  const day = easternToday()
  const out = {}
  // one sport at a time: a sport's failure never costs another's poll
  for (const sport of POLL_SPORTS) {
    try {
      const adapter = ADAPTERS[sport]({ day, now: Date.now(), db })
      out[sport] = { poll: await postPollOnce(db, { sport, day, adapter }) }
      if (sport !== 'nba') out[sport].reveal = await postRevealsOnce(db, { sport, today: day, adapter })
    } catch (e) {
      console.error(`[polls] ${sport} failed: ${e?.message || e}`)
      out[sport] = { error: String(e?.message || e) }
    }
  }
  return Response.json({ day, ...out }, { headers: { 'Cache-Control': 'no-store' } })
}
