// GET /api/buckets/card -- BUCKETS' CARD, PREVIEW ONLY (2026-10-12, parity pass). What the Card WOULD pick tonight for NBA with the same slots, floors and stored-line
// rules as the other sports (lib/card/nbaPreview.js). It locks nothing, stores nothing and posts nothing; NBA is not in CARD_SPORTS. Gated like every BUCKETS route
// (admin, an early-access holder, or everyone once BUCKETS is public). With no stored book lines it says `no priced picks`.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bucketsRoute } from '../../../../lib/nba/respond'
import { loadNbaPreview } from '../../../../lib/card/nbaPreview'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
export const GET = bucketsRoute('card', async () => {
  let db = null
  try { db = adminClient() } catch { db = null }
  const r = await loadNbaPreview({ db })
  if (!r.ok) throw new Error(r.why || 'preview unavailable')
  return ok({ preview: true, ...r }, 60)
})
