// GET /api/buckets/lines?date=YYYY-MM-DD -- BUCKETS' "OUR LINE" beside the book's (2026-10-19, Donovan: info only, no
// CALLED, no %). Before tip: the live read (lib/nba/gameLinesRead.js) and the newest book line on file (odds_game_lines).
// From tip on: ONLY the row locked before tip (nba_line_calls), with the book line it locked beside; no lock = no line.
// The model's win share is never in this answer. Gated.
import { ourLines } from '../../../../lib/nba/gameLinesRead'
import { bookRowsFor, lockedLinesFor } from '../../../../lib/nba/gameLinesStore'
import { bookLinesFor } from '../../../../lib/odds/gameLine'
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const names = (list) => (list ? list.map((p) => ({ id: p.id, name: p.name, status: p.status })) : null)

export const GET = bucketsRoute('lines', async (q) => {
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const now = Date.now()
  const db = adminClient()
  const [live, locked, rows] = await Promise.all([ourLines(date), db ? lockedLinesFor(db, date) : new Map(), db ? bookRowsFor(db, date) : []])
  const books = bookLinesFor('nba', live.games.map((g) => ({ game_id: g.id, away: g.away, home: g.home, start_ms: Date.parse(g.start) })), rows, now)
  const games = live.games.map((g) => {
    const started = g.state !== 'pre' || !(now < Date.parse(g.start))
    const L = locked.get(String(g.id))
    const head = { id: g.id, away: g.away, home: g.home, state: g.state, start: g.start }
    if (started) {
      if (!L) return { ...head, locked: false, our: null, book: null }
      return { ...head, locked: true, lockedAt: L.locked_at, basis: L.basis, our: { margin: L.our_margin_home },
        out: { away: names(L.inputs?.out?.away), home: names(L.inputs?.out?.home) },
        book: L.book_spread_home == null && L.book_ml_home == null ? null : { spread_home: L.book_spread_home == null ? null : Number(L.book_spread_home), ml_home: L.book_ml_home, ml_away: L.book_ml_away, taken_at: L.book_taken_at },
        final: L.final_margin_home == null ? null : { margin: L.final_margin_home } }
    }
    const b = books.get(String(g.id)) || null
    return { ...head, locked: Boolean(L), basis: g.basis, b2b: g.b2b, our: { margin: g.margin }, out: { away: names(g.out.away), home: names(g.out.home) },
      book: b ? { spread_home: b.spread_home, ml_home: b.ml_home, ml_away: b.ml_away, taken_at: b.taken_at } : null }
  })
  return ok({ date, version: live.version, injuries: live.injuries || null, games, fetchedAt: new Date().toISOString() }, 300)
})
