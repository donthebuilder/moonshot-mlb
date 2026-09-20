import { createClient } from '@supabase/supabase-js'
import { fetchNfl, nflSlatePaths, nflSlateLooksReal, nflLogPaths } from '../../../lib/nfl/dataSource'
import {
  opportunityPicks, opportunityText, tdHistoryPicks, tdHistoryText,
  whyOnBoardPick, whyOnBoardText, nflBoardPicks, nflBoardText,
} from '../../../lib/nfl/tweetFeed'
import { hasX, postToX } from '../../../lib/dash/xPost'

export const dynamic = 'force-dynamic'
export const maxDuration = 200

export async function GET(req) {
  const go = new URL(req.url).searchParams.get('go') === '1'
  const day = new Date().toISOString().slice(0, 10)
  const [data, logs] = await Promise.all([
    fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
    fetchNfl(nflLogPaths()).catch(() => null),
  ])
  if (!data) return Response.json({ error: 'no slate' })

  const items = [
    { kind: 'nfl_redzone', text: opportunityText(opportunityPicks(data, 'RZ'), data, 'RZ', {}) },
    { kind: 'nfl_goalline', text: opportunityText(opportunityPicks(data, 'GL'), data, 'GL', {}) },
    { kind: 'nfl_tdhistory', text: logs ? tdHistoryText(tdHistoryPicks(logs, data), data, {}) : '' },
    { kind: 'nfl_whyboard', text: whyOnBoardText(whyOnBoardPick(data), data, {}) },
  ].filter((i) => i.text)

  if (!go) return Response.json({ day, hasX: hasX(), items: items.map((i) => ({ ...i, chars: i.text.length })) })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const out = []
  for (const it of items) {
    // Claim first, exactly like the tick does: if a row for (day, kind)
    // already exists this is a no-op and we post nothing twice.
    const { data: claim } = await db.from('homer_feed_posts')
      .upsert({ day, kind: it.kind }, { onConflict: 'day,kind', ignoreDuplicates: true })
      .select('kind')
    if (!claim?.length) { out.push({ kind: it.kind, result: 'already claimed' }); continue }
    const r = await postToX(it.text)
    if (r.ok && r.id) await db.from('homer_feed_posts').update({ x_post_id: r.id }).match({ day, kind: it.kind })
    out.push({ kind: it.kind, chars: it.text.length, ok: r.ok, id: r.id || null, error: r.error || null })
  }
  return Response.json({ day, out })
}
