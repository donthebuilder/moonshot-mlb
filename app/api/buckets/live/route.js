// BUCKETS LIVE LINES (2026-10-22, the shared live Status: Donovan wants to "come to the site live and see where they are
// at"). Every started game's box, one line per player: the counts each board lane grades on. The same scoreboard and box
// reads the ledger route already makes (lib/nba/api), with no database and no grading: the board grades after the final,
// this only says where a man is right now. Read by the board tables on open and on a ↻ (no timer); short edge cache while
// a game is live, long once the night is settled.
import { scoreboardFor, reduceScoreboard, summaryFor, reduceBox } from '../../../../lib/nba/api'
import { tensActual } from '../../../../lib/nba/ddtd'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'

export const GET = bucketsRoute('live', async (q) => {
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const games = reduceScoreboard(await scoreboardFor(date))
  const on = games.filter((g) => g.state !== 'pre')
  const boxes = await Promise.all(on.map((g) => summaryFor(g.id, g.state === 'final').then(reduceBox).catch(() => null)))
  const players = {}
  on.forEach((g, i) => {
    for (const b of boxes[i] || []) {
      if (!b.id) continue
      players[b.id] = { gameId: g.id, dnp: b.dnp, pts: b.pts, reb: b.reb, ast: b.ast, tpm: b.tpm, tens: tensActual(b) }
    }
  })
  const live = on.some((g) => g.state === 'live')
  return ok({ date, games: games.map((g) => ({ id: g.id, state: g.state, detail: g.detail, start: g.start })), players, fetchedAt: new Date().toISOString() }, live ? 20 : 300)
})
