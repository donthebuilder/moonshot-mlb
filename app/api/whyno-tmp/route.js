import { fetchBoardFull } from '../../../lib/dash/board'
import { boardNeighbors, boardNeighborsText } from '../../../lib/dash/homerFeed'
export const dynamic = 'force-dynamic'
const isBoardHomerCall = (r) => /\b(TOP|HR)\b/.test(String(r?.game_pick_role || '').toUpperCase())
export async function GET() {
  const rows = await fetchBoardFull('today')
  const pool = rows.filter(isBoardHomerCall)
  const rice = rows.find((r) => String(r.name || '').includes('Ben Rice'))
  return Response.json({
    boardRows: rows.length,
    hasGamePickRole: rows.filter((r) => String(r.game_pick_role || '').trim()).length,
    callPool: pool.length,
    rice: rice ? { name: rice.name, game_pick_role: rice.game_pick_role, hr_score: rice.hr_score } : null,
    riceText: rice ? boardNeighborsText(boardNeighbors(pool, rice.player_id, 2), {}) : '',
  })
}
