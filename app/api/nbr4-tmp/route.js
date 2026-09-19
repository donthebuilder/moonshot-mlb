import { fetchBoardFull } from '../../../lib/dash/board'
import { boardNeighbors, boardNeighborsText } from '../../../lib/dash/homerFeed'
export const dynamic = 'force-dynamic'
const isCall = (r) => /\b(TOP|HR)\b/.test(String(r?.game_pick_role || '').toUpperCase())
export async function GET() {
  const rows = await fetchBoardFull()
  const pool = rows.filter(isCall)
  const ranked = pool.filter((r) => Number.isFinite(Number(r.hr_score))).sort((a, b) => Number(b.hr_score) - Number(a.hr_score))
  const out = []
  for (const c of [ranked[0], ranked[Math.floor(ranked.length / 2)], ranked[ranked.length - 1]].filter(Boolean)) {
    out.push({ who: `${c.name} [${c.game_pick_role}]`, text: boardNeighborsText(boardNeighbors(pool, c.player_id, 2), {}) })
  }
  const hrr = rows.find((r) => String(r.game_pick_role || '').toUpperCase() === 'HRR')
  out.push({ who: `${hrr?.name} [HRR — gate should skip]`, text: isCall(hrr) ? 'LEAKED' : '' })
  return Response.json({ pool: ranked.length, out })
}
