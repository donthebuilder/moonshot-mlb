// GET /api/buckets/calledledger?date=YYYY-MM-DD | ?days=N -- BUCKETS' Called Ledger and Archive (LAMP's /api/lamp/ledger,
// the NBA way): every 25-point game on a locked, graded regular-season night, CALLED / ON THE BOARD / NOT ON THE BOARD
// as locked (lib/nba/calledLedger.js). Under the public-number floor the counts are not sent. Gated.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { easternToday } from '../../../../lib/data'
import { readNbaLedgerNight, readNbaLedgerSeason } from '../../../../lib/nba/calledLedger'

export const dynamic = 'force-dynamic'
export const GET = bucketsRoute('calledledger', async (q) => {
  const db = adminClient()
  if (!db) return ok({ dbReady: false, nights: [], rows: [] }, 60)
  if (q.has('days')) {
    const days = Number(q.get('days'))
    if (!Number.isInteger(days) || days < 1 || days > 400) return bad('days must be 1..400')
    return ok({ dbReady: true, season: await readNbaLedgerSeason(db, days, easternToday()), fetchedAt: new Date().toISOString() }, 300)
  }
  const date = q.get('date')
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  return ok({ dbReady: true, ...(await readNbaLedgerNight(db, date || null)), fetchedAt: new Date().toISOString() }, 300)
})
