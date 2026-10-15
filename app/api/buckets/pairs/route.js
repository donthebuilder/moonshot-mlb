// GET /api/buckets/pairs -- BUCKETS' PAIR HISTORY in the one file shape the Pairs table reads (pairhist_v2): two players who
// each scored 25+ on the same day, counted from our own graded games (lib/nba/pairHistory.js). Gated. No graded game yet
// answers a valid file with an empty `pairs` list; nothing is invented.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bucketsRoute } from '../../../../lib/nba/respond'
import { easternToday } from '../../../../lib/data'
import { readNbaPairHist } from '../../../../lib/nba/pairRead'
import { buildNbaPairHist } from '../../../../lib/nba/pairHistory'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('pairs', async () => {
  const db = adminClient()
  if (!db) return ok(buildNbaPairHist([]), 60)
  return ok(await readNbaPairHist(db, easternToday()), 900)
})
