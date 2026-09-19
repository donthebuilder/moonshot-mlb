import { fetchBoardFull } from '../../../lib/dash/board'
import { boardNeighbors, boardNeighborsText } from '../../../lib/dash/homerFeed'
export const dynamic = 'force-dynamic'
const roled = (r) => String(r?.game_pick_role || '').trim()
const isTop = (r) => /\b(TOP|HR)\b/.test(roled(r).toUpperCase())
export async function GET() {
  const rows = await fetchBoardFull('today')
  const out = {}
  const who = ['Jonathan Aranda', 'Carson Benge', 'Miguel Vargas']
  for (const name of who) {
    const row = rows.find((r) => String(r.name || '') === name)
    if (!row) { out[name] = { missing: true }; continue }
    // B: one ranking, every CALL (any role), by hr_score
    const allCalls = rows.filter(roled)
    // C: the TOP board only (TOP/HR calls), by hr_score
    const topBoard = rows.filter(isTop)
    out[name] = {
      role: row.game_pick_role,
      hr_score: row.hr_score,
      B_allCalls: boardNeighborsText(boardNeighbors(allCalls, row.player_id, 2, 'hr_score'), { market: 'BOARD' }),
      C_topBoard: boardNeighborsText(boardNeighbors(topBoard, row.player_id, 2, 'hr_score'), { market: 'TOP' }),
      sizes: { allCalls: allCalls.length, topBoard: topBoard.length },
    }
  }
  return Response.json(out)
}
