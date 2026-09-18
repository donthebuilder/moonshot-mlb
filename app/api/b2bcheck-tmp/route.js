import { easternToday } from '../../../lib/data'
import { fetchBoardFull } from '../../../lib/dash/board'
import { backToBackPicks, backToBackText, playableRows } from '../../../lib/dash/tweetFeed'
export const dynamic = 'force-dynamic'
export async function GET() {
  const day = easternToday()
  const rows = playableRows(await fetchBoardFull())
  const p = backToBackPicks(rows, day)
  return Response.json({ picks: p.map((x) => ({ n: x.name, gap: x.gapDays, s: x.hr_score })), text: backToBackText(p, { day }) })
}
