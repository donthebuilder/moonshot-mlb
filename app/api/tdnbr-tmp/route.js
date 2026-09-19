import { fetchNfl, nflPicksPaths, nflPicksLooksReal } from '../../../lib/nfl/dataSource'
import { tdCallNeighbors, tdCallNeighborsText } from '../../../lib/nfl/tweetFeed'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
export async function GET() {
  const picks = await fetchNfl(nflPicksPaths(), nflPicksLooksReal).catch(() => null)
  const card = picks?.card || null
  const rungs = card?.TD?.rungs || []
  const out = []
  for (const r of [rungs[0], rungs[2], rungs[rungs.length - 1]].filter(Boolean)) {
    out.push({ who: `${r.name} (rung ${r.rank})`, text: tdCallNeighborsText(tdCallNeighbors(card, r.player_id, 2), {}) })
  }
  out.push({ who: 'NOT ON THE LADDER (fake id)', text: tdCallNeighborsText(tdCallNeighbors(card, '00-9999999', 2), {}) })
  return Response.json({ rungs: rungs.length, out })
}
