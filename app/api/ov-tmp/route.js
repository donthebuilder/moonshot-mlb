import { fetchBoardFull } from '../../../lib/dash/board'
export const dynamic = 'force-dynamic'
export async function GET() {
  const rows = await fetchBoardFull('today')
  const withOv = rows.filter((r) => Number.isFinite(Number(r.overall_score)))
  const ranked = withOv.slice().sort((a, b) => Number(b.overall_score) - Number(a.overall_score))
  const top = ranked.slice(0, 12).map((r, i) => ({
    n: i + 1, name: r.name, team: r.team, role: r.game_pick_role || null,
    overall: Number(r.overall_score), hr: Number(r.hr_score),
  }))
  const find = (nm) => {
    const i = ranked.findIndex((r) => String(r.name || '') === nm)
    return i < 0 ? null : { rank: i + 1, of: ranked.length, overall: Number(ranked[i].overall_score), role: ranked[i].game_pick_role }
  }
  return Response.json({
    boardRows: rows.length, withOverall: withOv.length,
    top,
    tonight: { 'Miguel Vargas': find('Miguel Vargas'), 'Carson Benge': find('Carson Benge'), 'Jonathan Aranda': find('Jonathan Aranda') },
  })
}
