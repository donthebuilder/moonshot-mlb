// THE FACT ENGINE'S CRON (BATCH-FACT-ENGINE). Every 30 minutes; it does
// nothing outside a posting window (lib/facts/engine.js FACTS_CONFIG) and
// nothing at all while the kill switch is off. ?dry=1 finds, writes and checks
// without posting or writing a row.
import { adminClient, cronAuthorized } from '../../../../lib/supabase/admin'
import { runFacts } from '../../../../lib/facts/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })
  const q = new URL(request.url).searchParams
  const out = await runFacts(db, { dry: q.get('dry') === '1' })
  if (out.posted) console.log(`[facts] posted ${out.posted.id}: ${out.posted.x || out.posted.error}`)
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
