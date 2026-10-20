// GET /api/lines?sport=mlb|nfl|nhl&date=YYYY-MM-DD -- "OUR LINE" beside the book's for MOONSHOT, TUDDY and LAMP's game
// pages (2026-10-20, Donovan: "do this" -- the same info-only line BUCKETS has; BUCKETS' is /api/buckets/lines, gated).
// Before the start: the live read (lib/gameLinesRead.js) and the newest book line on file (odds_game_lines). From the
// start on: ONLY the row locked before it (game_line_calls). Never a win share, never CALLED.
import { ourGameLines, LINE_SPORTS } from '../../../lib/gameLinesRead'
import { bookRowsFor, booksFor, lockedGameLinesFor, linesAnswer } from '../../../lib/gameLinesStore'
import { SPORT_LINES } from '../../../lib/gameLines'
import { adminClient } from '../../../lib/supabase/admin'
import { slateNight } from '../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const no = (status, detail) => Response.json({ error: status === 400 ? 'BAD REQUEST' : 'DELAYED', detail }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = q.get('sport')
  if (!LINE_SPORTS.includes(sport)) return no(400, `sport must be one of ${LINE_SPORTS.join(', ')}`)
  const date = q.get('date') || await slateNight(sport)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return no(400, 'date must be YYYY-MM-DD')
  try {
    const now = Date.now()
    const db = adminClient()
    const [live, locked, rows] = await Promise.all([ourGameLines(sport, date), db ? lockedGameLinesFor(db, sport, date, SPORT_LINES[sport].version) : new Map(), db ? bookRowsFor(db, sport, date) : []])
    return Response.json({ ...linesAnswer(sport, live, locked, booksFor(sport, live.games, rows, now), now), fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
  } catch (e) {
    console.error(`[lines] ${sport} ${date}: ${e?.message || e}`)
    return no(502, 'Waiting on the league feed.')
  }
}
