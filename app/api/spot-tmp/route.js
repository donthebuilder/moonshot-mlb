import { createClient } from '@supabase/supabase-js'
import { fetchNfl, nflSlatePaths, nflSlateLooksReal, nflLogPaths, nflFantasyStatsPaths, nflFantasyStatsLooksReal } from '../../../lib/nfl/dataSource'
import {
  spotlightPick, spotlightText, opportunityPicks, opportunityText,
  tdHistoryPicks, tdHistoryText, nflBoardPicks, nflBoardText,
} from '../../../lib/nfl/tweetFeed'
import { postToX } from '../../../lib/dash/xPost'
export const dynamic = 'force-dynamic'
export const maxDuration = 200
export async function GET(req) {
  const go = new URL(req.url).searchParams.get('go') === '1'
  const day = new Date().toISOString().slice(0, 10)
  const [data, logs, box] = await Promise.all([
    fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
    fetchNfl(nflLogPaths()).catch(() => null),
    fetchNfl(nflFantasyStatsPaths(), nflFantasyStatsLooksReal).catch(() => null),
  ])
  if (!data || !logs || !box) return Response.json({ error: 'no data' })
  const pick = spotlightPick(box, data)
  const spot = spotlightText(pick, data, {})
  if (!go) {
    return Response.json({
      pick: pick && { name: pick.name, week: pick.week, done: pick.done, payd: pick.payd, patd: pick.patd, ruyd: pick.ruyd, recyd: pick.recyd },
      spotlight: spot,
      respaced: {
        redzone: opportunityText(opportunityPicks(data, 'RZ'), data, 'RZ', {}),
        tdhistory: tdHistoryText(tdHistoryPicks(logs, data), data, {}),
        board: nflBoardText(nflBoardPicks(data), data, {}),
      },
    })
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const r = await postToX(spot)
  return Response.json({ ok: r.ok, id: r.id || null, error: r.error || null, chars: spot.length })
}
