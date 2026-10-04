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
  // NOT A QUIET 200 (2026-10-04 ops audit). With no token this returned 200
  // {reason:'no-token'} every 10 minutes for a week while GitHub dropped ~90%
  // of the bot's slots, and nothing looked wrong. No token, or every dispatch
  // refused, now answers 503 so the cron shows as failing in Vercel.
  const broken = out.reason === 'no-token' || ((out.errors || []).length > 0 && !(out.started || []).length && !(out.covered || []).length)
  if (out.reason === 'no-token') console.error('[gh dispatch] GITHUB_DISPATCH_TOKEN is not set -- dropped bot slots are NOT being restarted')
  return Response.json(out, { status: broken ? 503 : 200, headers: { 'Cache-Control': 'no-store' } })
}
