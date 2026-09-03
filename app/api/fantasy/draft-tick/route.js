// ── #88: THE DRAFT CLOCK, SERVER SIDE ───────────────────────────────────────
//
// A live BASEBALL draft sat on "Pick 21 is on the clock · auto-picking…" for
// about a week. Nothing was broken. The auto-pick timer only ever existed in
// foreground browser tabs -- `DraftRoomLive` polls and calls `tickAutoPick`,
// which is a server action running as the signed-in user -- so the clock only
// advances while somebody is looking at it. Nobody kept a tab open. The clock
// stopped and stayed stopped, and no member could restart it, because the
// escape hatch ("Force expired pick") is a commissioner control (#90).
//
// The 08-28 note concluded a server-side timer "isn't available" because
// Vercel Hobby caps cron at one run per day. That is true of *Vercel* cron. It
// is not true of GitHub Actions, which this project already uses for scheduled
// work in the bot repo. So: this endpoint, and a `*/5 * * * *` workflow that
// POSTs to it. Worst case a stalled pick now waits five minutes instead of a
// week.
//
// WHY IT DOES THE SAME THING THE TAB DOES, AND NOTHING MORE. It calls
// `run_expired_fantasy_auto_pick`, the identical RPC behind both the foreground
// poller and the commissioner's Force button. The expiry rule, the auto-pick
// selection and the clock advance all stay in the database where they already
// live and are already tested. This route is a scheduler, not a second
// implementation of the draft -- a second implementation is how the two paths
// would drift and start disagreeing about whose pick it is.
//
// WHY IT LOOPS OVER LEAGUES RATHER THAN TAKING ONE. A cron that has to be told
// which leagues exist is a cron that silently stops covering the league created
// after it was written. It asks for every draft in a state where a clock can
// expire and ticks each one. Paused drafts are deliberately excluded: pausing
// is a commissioner saying "stop the clock," and a timer that overrides that is
// worse than no timer.
//
// WHY EVERY FAILURE IS COUNTED AND SWALLOWED. Same rule as the other crons in
// this repo (`dash/push/tick`, `dash/sim-log`): one league erroring must not
// take down the run for the other leagues, and a cron that throws is a cron
// that gets disabled. Errors come back in the response body so the workflow log
// shows them, and the HTTP status stays 200 unless the run could not start at
// all.

import { timingSafeEqual } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// A draft can only be behind its clock in these states. 'setup' has no clock
// yet and 'complete' has no picks left; 'paused' is excluded on purpose.
const TICKABLE = ['live']

function authorized(request) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!supplied) return false
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET]
    .filter(Boolean)
    .some((expected) => {
      const a = Buffer.from(expected)
      const b = Buffer.from(supplied)
      return a.length === b.length && timingSafeEqual(a, b)
    })
}

async function tick(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return Response.json({ error: 'Draft clock is not configured' }, { status: 503 })
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const started = Date.now()
  try {
    const { data: drafts, error } = await supabase
      .from('fantasy_drafts')
      .select('league_id,status,current_overall_pick,pick_deadline')
      .in('status', TICKABLE)
    if (error) throw error

    const now = Date.now()
    // Only leagues whose deadline has actually passed. The RPC is idempotent
    // and would no-op on the rest, but filtering here keeps the run cheap and
    // makes the response say something true about what it did.
    const due = (drafts || []).filter((d) => {
      if (!d.pick_deadline) return false
      const t = new Date(d.pick_deadline).getTime()
      return Number.isFinite(t) && t <= now
    })

    const ticked = []
    const failed = []
    for (const draft of due) {
      const { error: rpcError } = await supabase
        .rpc('run_expired_fantasy_auto_pick', { p_league_id: draft.league_id })
      if (rpcError) failed.push({ leagueId: draft.league_id, error: String(rpcError.message || rpcError).slice(0, 200) })
      else ticked.push({ leagueId: draft.league_id, wasOnPick: draft.current_overall_pick })
    }

    return Response.json({
      ok: true,
      live: (drafts || []).length,
      due: due.length,
      ticked,
      failed,
      ms: Date.now() - started,
    })
  } catch (err) {
    // The run itself could not start -- a real 500, worth failing the workflow.
    console.error('[franchise/draft-tick] failed', err)
    return Response.json({ error: 'Draft clock run failed' }, { status: 500 })
  }
}

export const GET = tick
export const POST = tick
