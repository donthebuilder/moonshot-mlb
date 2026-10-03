// GET /api/gh/dispatch -- Vercel cron, every 10 minutes. Starts any watched
// bot workflow whose scheduled slot GitHub dropped (lib/gh/dispatch.js).
// Cron-secret only; ?dry=1 reports what it would start without starting it.
import { cronAuthorized } from '../../../../lib/supabase/admin'
import { dispatchDropped } from '../../../../lib/gh/dispatch'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const out = await dispatchDropped({ dry })
  for (const s of out.started || []) console.log(`[gh dispatch] ${s.dry ? 'would start' : 'started'} ${s.wf} for its ${s.slot} slot (${s.cron})`)
  for (const e of out.errors || []) console.error(`[gh dispatch] ${e.wf}: ${e.status || e.error}`)
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
