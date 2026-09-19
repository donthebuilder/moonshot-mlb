import { fetchBoardFull } from '../../../lib/dash/board'
import { boardNeighbors, boardNeighborsText, marketForRole } from '../../../lib/dash/homerFeed'
export const dynamic = 'force-dynamic'
const matches = (r, want) => new RegExp(`\\b${want}\\b`).test(String(r?.game_pick_role || '').toUpperCase())
const TONIGHT = [['Miguel Vargas','TOP'],['Carson Benge','HIT'],['Jonathan Aranda','HRR']]
export async function GET() {
  const rows = await fetchBoardFull('today')
  const out = []
  for (const [name, frozenRole] of TONIGHT) {
    const row = rows.find((r) => String(r.name || '') === name)
    const mkt = marketForRole(frozenRole)
    const pool = mkt ? rows.filter((r) => matches(r, mkt.role)) : []
    const inPool = row ? pool.some((r) => String(r.player_id) === String(row.player_id)) : false
    out.push({
      name, frozenRole,
      onBoardNow: !!row,
      boardRoleNow: row ? row.game_pick_role : null,
      poolSize: pool.length,
      inPool,
      text: row && mkt ? boardNeighborsText(boardNeighbors(pool, row.player_id, 2, mkt.key), { market: mkt.label }) : '',
    })
  }
  return Response.json({ boardRows: rows.length, out })
}
