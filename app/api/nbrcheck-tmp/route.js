import { fetchBoardFull } from '../../../lib/dash/board'
import { boardNeighbors, boardNeighborsText } from '../../../lib/dash/homerFeed'
export const dynamic = 'force-dynamic'
export async function GET() {
  const rows = await fetchBoardFull()
  const ranked = rows.filter((r) => Number.isFinite(Number(r.hr_score)))
    .sort((a, b) => Number(b.hr_score) - Number(a.hr_score))
  const cases = [ranked[0], ranked[4], ranked[1], ranked[ranked.length - 1]].filter(Boolean)
  const out = []
  for (const c of cases) {
    const n = boardNeighbors(rows, c.player_id, 2)
    out.push({ who: c.name, text: boardNeighborsText(n, {}) })
  }
  out.push({ who: 'NOT ON BOARD (fake id)', text: boardNeighborsText(boardNeighbors(rows, 'nope-999', 2), {}) })
  return Response.json({ out })
}
