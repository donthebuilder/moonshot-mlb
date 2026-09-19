import { fetchBoardFull } from '../../../lib/dash/board'
import { boardNeighbors, boardNeighborsText } from '../../../lib/dash/homerFeed'
export const dynamic = 'force-dynamic'
const isHomerCall = (r) => /\b(TOP|HR)\b/.test(String(r?.game_pick_role || '').toUpperCase())
export async function GET() {
  const rows = await fetchBoardFull()
  const calls = rows.filter((r) => isHomerCall(r) && Number.isFinite(Number(r.hr_score)))
    .sort((a, b) => Number(b.hr_score) - Number(a.hr_score))
  const out = []
  for (const c of [calls[0], calls[4], calls[calls.length - 1]].filter(Boolean)) {
    out.push({ who: `${c.name} [${c.game_pick_role}]`, text: boardNeighborsText(boardNeighbors(rows, c.player_id, 2), {}) })
  }
  const hrr = rows.find((r) => String(r.game_pick_role || '').toUpperCase() === 'HRR')
  out.push({ who: `${hrr?.name} [HRR — should be skipped by the gate]`, text: isHomerCall(hrr) ? boardNeighborsText(boardNeighbors(rows, hrr.player_id, 2), {}) : '' })
  return Response.json({ calls: calls.length, out })
}
