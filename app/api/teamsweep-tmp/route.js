import { fetchBoardFull } from '../../../lib/dash/board'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function GET() {
  const rows = await fetchBoardFull()
  const teams = await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1').then((r) => r.json())
  const abbrById = new Map((teams?.teams || []).map((t) => [String(t.id), t.abbreviation]))
  const byId = new Map()
  for (const r of rows) if (r?.player_id && !byId.has(String(r.player_id))) byId.set(String(r.player_id), r)
  const ids = [...byId.keys()]
  const mismatches = []
  let checked = 0, unknown = 0
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40)
    const j = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}&hydrate=currentTeam`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    for (const p of j?.people || []) {
      const r = byId.get(String(p.id))
      if (!r) continue
      const apiAbbr = abbrById.get(String(p?.currentTeam?.id))
      checked += 1
      if (!apiAbbr) { unknown += 1; continue }
      if (apiAbbr !== r.team) mismatches.push({ name: p.fullName, id: p.id, board: r.team, api: apiAbbr, opp: r.opponent })
    }
  }
  return Response.json({ boardRows: rows.length, players: ids.length, checked, unknown, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 40) })
}
