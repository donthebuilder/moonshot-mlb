// GET /api/buckets/lines?date=YYYY-MM-DD -- BUCKETS' "OUR LINE" beside the book's (2026-10-19, Donovan: info only, no
// CALLED, no %). Before tip: the live read (lib/nba/gameLinesRead.js) and the newest book line on file (odds_game_lines).
// From tip on: ONLY the row locked before tip (game_line_calls), with the book line it locked beside; no lock = no line.
// The answer is lib/gameLinesStore.js linesAnswer (every sport's). The model's win share is never in it. Gated.
import { ourLines } from '../../../../lib/nba/gameLinesRead'
import { bookRowsFor, lockedLinesFor } from '../../../../lib/nba/gameLinesStore'
import { booksFor, linesAnswer } from '../../../../lib/gameLinesStore'
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = bucketsRoute('lines', async (q) => {
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const now = Date.now()
  const db = adminClient()
  const [live, locked, rows] = await Promise.all([ourLines(date), db ? lockedLinesFor(db, date) : new Map(), db ? bookRowsFor(db, date) : []])
  return ok({ ...linesAnswer('nba', live, locked, booksFor('nba', live.games, rows, now), now), fetchedAt: new Date().toISOString() }, 300)
})
