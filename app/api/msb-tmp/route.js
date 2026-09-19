import { fetchBoardFull } from '../../../lib/dash/board'
import { moonshotBoardRanking, moonshotBoardText } from '../../../lib/dash/homerFeed'
export const dynamic = 'force-dynamic'
const WHO = ['Jonathan Aranda','Miguel Vargas','Carson Benge','Yordan Alvarez','George Lombard Jr.']
export async function GET() {
  const rows = await fetchBoardFull('today')
  const ranking = moonshotBoardRanking(rows)
  const out = []
  for (const name of WHO) {
    const r = ranking.find((x) => x.name === name)
    out.push({ name, rank: r?.rank ?? null, role: r?.role ?? null,
      text: r ? moonshotBoardText(ranking, r.player_id, { top: 10 }) : '' })
  }
  return Response.json({ size: ranking.length, out })
}
