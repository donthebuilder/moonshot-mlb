// THE SERVER'S SUPABASE, ONCE (R3, 2026-10-02). Was lib/nhl/db.js (its re-export
// and its 22 importers moved here 2026-10-03) plus sixteen inline createClient copies.
// Server only: never import from a client component.
//
// adminClient()              service role only -- writes, crons, private reads.
// adminClient({ anon: true }) service role, else the public anon key: the
//                            read-only public pages (/start, /called, cards,
//                            the front door) keep working on a deploy that
//                            has only the anon key, exactly as before.
// Either returns null when no key is configured; callers already handle it.
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

/** Vercel's cron (CRON_SECRET), FRANCHISE's cron, or the manual-fire key. */
export function cronAuthorized(request) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!supplied) return false
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET, process.env.CALLEDIT_SECRET].filter(Boolean).some((expected) => {
    const a = Buffer.from(supplied); const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

export function adminClient({ anon = false } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || (anon ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : '')
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timedFetch } })
}

// A STALLED DATABASE MUST NOT HOLD EVERY PAGE (2026-10-21). On 10-21 the front page, LAMP's board and BUCKETS' board and player
// routes all hung together for minutes (504 FUNCTION_INVOCATION_TIMEOUT at 60 s / 300 s) while ESPN answered in 0.2 s: every read
// waits on this client and none had a limit. A request that takes longer than this fails, and the route says DELAYED.
const DB_TIMEOUT_MS = 25000
function timedFetch(input, init = {}) {
  return fetch(input, init.signal ? init : { ...init, signal: AbortSignal.timeout(DB_TIMEOUT_MS) })
}
