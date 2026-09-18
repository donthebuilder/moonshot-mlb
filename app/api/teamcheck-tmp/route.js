import { fetchBoardFull } from '../../../lib/dash/board'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
const NAMES = ['Pete Alonso','Rafael Devers','Kyle Tucker','Alex Bregman','Bo Bichette','Jeff McNeil','Ketel Marte','Bo Naylor','Jared Young','Kazuma Okamoto']
export async function GET() {
  const rows = await fetchBoardFull()
  const byName = new Map()
  for (const r of rows) if (r?.name && !byName.has(r.name)) byName.set(r.name, r)
  const out = []
  for (const n of NAMES) {
    const r = byName.get(n)
    if (!r) { out.push({ name: n, onBoard: false }); continue }
    let api = null
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${r.player_id}?hydrate=currentTeam`)
      if (res.ok) { const j = await res.json(); const p = j?.people?.[0]; api = { team: p?.currentTeam?.name || null, abbr: p?.currentTeam?.abbreviation || null, full: p?.fullName } }
    } catch {}
    out.push({ name: n, id: r.player_id, boardTeam: r.team, boardOpp: r.opponent, api })
  }
  return Response.json({ rows: rows.length, out })
}
