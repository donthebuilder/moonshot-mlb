import { fetchBoardFull } from '../../../lib/dash/board'
import { boardNeighbors, boardNeighborsText, marketForRole } from '../../../lib/dash/homerFeed'
export const dynamic = 'force-dynamic'
const matches = (r, want) => new RegExp(`\\b${want}\\b`).test(String(r?.game_pick_role || '').toUpperCase())
// Tonight's actual homers, with the role frozen on each homer_feed row.
const TONIGHT = [
  ['Ben Rice', 'TOP'], ['Ty France', 'HIT'], ['Mookie Betts', 'HIT'],
  ['Riley Greene', 'HRR'], ['Ronald Acuña Jr.', 'HRR'],
  ['Matt Olson', 'WATCH'], ['Jung Hoo Lee', null],
]
export async function GET() {
  const rows = await fetchBoardFull('today')
  const out = []
  for (const [name, role] of TONIGHT) {
    const row = rows.find((r) => String(r.name || '') === name)
    const mkt = marketForRole(role)
    if (!row || !mkt) { out.push({ name, role, text: '' }); continue }
    const pool = rows.filter((r) => matches(r, mkt.role))
    out.push({ name, role, pool: pool.length, text: boardNeighborsText(boardNeighbors(pool, row.player_id, 2, mkt.key), { market: mkt.label }) })
  }
  return Response.json({ out })
}
