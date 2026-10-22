// GET /api/buckets/blowout?date=YYYY-MM-DD -- the night's blowout-watch games and, for each, who plays more (and less) when his
// club's game gets lopsided: lib/nba/blowoutRead.js. Gated (BUCKETS). A night with no watch game answers no games (one book read).
import { adminClient } from '../../../../lib/supabase/admin'
import { readBlowouts } from '../../../../lib/nba/blowoutRead'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('blowout', async (q) => {
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  return ok(await readBlowouts(adminClient(), date), 900)
})
