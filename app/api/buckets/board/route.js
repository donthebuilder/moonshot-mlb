// GET /api/buckets/board?date&market=pts|reb|ast|3pm|pra|first -- the board, gated.
import { readNbaBoard } from '../../../../lib/nba/boardRead'
import { NBA_MARKETS } from '../../../../lib/nba/model'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'
import { recordNbaBoard } from '../../../../lib/rankSnapshots/record'
import { adminClient } from '../../../../lib/supabase/admin'
import { bookRowsFor, booksFor } from '../../../../lib/gameLinesStore'
import { MEMBER_FEED_PARAM } from '../../../../lib/members/boardGate'
import { boardForViewer } from '../../../../lib/members/boardViewer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const GET = bucketsRoute('board', async (q) => {
  // the slate still being played, not the ET calendar day (2026-10-04 day rule; LAMP 3bde1ca)
  const date = q.get('date') || await slateNight('nba')
  const market = q.get('market') || 'pts'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  if (!NBA_MARKETS[market]) return bad(`market must be one of ${Object.keys(NBA_MARKETS).join(', ')}`)
  const board = await readNbaBoard(date, market)
  await recordNbaBoard(date, market, board)   // the ordering behind the rank arrows (lib/rankSnapshots): a quiet no-op until its table exists
  // THE BOOK'S SPREAD on each game (odds_game_lines, newest before tip), for the blowout watch (lib/blowout.js). One small read;
  // no line on file = no spread, never a guess.
  const db = adminClient()
  if (db && (board.games || []).length) {
    const books = booksFor('nba', board.games.map((g) => ({ id: g.id, away: g.away?.abbrev, home: g.home?.abbrev, start: g.start })), await bookRowsFor(db, 'nba', date), Date.now())
    board.games = board.games.map((g) => ({ ...g, spreadHome: books.get(String(g.id))?.spread_home ?? null }))
  }
  // THE PAID PICKS STAY PAID (2026-10-26, lib/members/boardGate.js): gated for everyone (cached), the full board for a member's own m=1 request (private)
  const v = await boardForViewer(board, { sport: 'nba', memberAsked: q.get(MEMBER_FEED_PARAM) === '1' })
  return v.private ? Response.json(v.body, { headers: { 'Cache-Control': 'private, no-store' } }) : ok(v.body, 60)
})
