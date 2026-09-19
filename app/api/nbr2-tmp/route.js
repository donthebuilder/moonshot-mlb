import { fetchBoardFull } from '../../../lib/dash/board'
import { boardNeighbors, boardNeighborsText } from '../../../lib/dash/homerFeed'
export const dynamic = 'force-dynamic'
export async function GET() {
  const rows = await fetchBoardFull()
  const roled = rows.filter((r) => String(r.game_pick_role || '').trim() && Number.isFinite(Number(r.hr_score)))
    .sort((a, b) => Number(b.hr_score) - Number(a.hr_score))
  const out = []
  for (const c of [roled[0], roled[3], roled[roled.length - 1]].filter(Boolean)) {
    out.push({ who: `${c.name} [role ${c.game_pick_role}]`, text: boardNeighborsText(boardNeighbors(rows, c.player_id, 2), {}) })
  }
  return Response.json({ roledCount: roled.length, out })
}
