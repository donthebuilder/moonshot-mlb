// /api/dash/homers/x-mentions-test — TEMPORARY diagnostic route (2026-09-15).
//
// Read-only proof that CalledIt's real X credentials can see incoming
// replies/mentions, before any reply-pipeline code gets written against it.
// Donovan posts a real reply from a second account at @CalledItHr, this
// route fetches CalledIt's live mentions timeline and returns the raw JSON
// so we can see that reply for real. DELETE THIS ROUTE once the pipeline
// it's scoping is built and trusted -- it is not meant to ship long-term,
// it does not touch homer_feed_posts or any production table, and it never
// posts anything.
//
// Auth: same Bearer-secret pattern as app/api/dash/homers/tick/route.js.
// authorized() below is a deliberate duplicate (not imported from the tick
// route) so this throwaway file has zero coupling to production code and is
// safe to delete in one step.

import { xConfig, xProblem, oauthHeader } from '../../../../../lib/dash/xPost'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request) {
  const url = new URL(request.url)
  // A plain browser click can't set an Authorization header (needed because
  // this preview deployment sits behind Vercel's own SSO wall, which a
  // logged-in Vercel session clears automatically but a bare curl cannot) --
  // so this throwaway-only route also accepts the same secret as ?key=.
  // The production tick route does NOT do this; this file is deleted with
  // the rest of the diagnostic once the pipeline it's scoping is trusted.
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || ''
  if (!supplied) return false
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET, process.env.CALLEDIT_SECRET].filter(Boolean).some((expected) => {
    const a = Buffer.from(expected)
    const b = Buffer.from(supplied)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

// Same strict RFC3986 encoder xPost.js uses for signing -- reused here so the
// query string we actually send matches what we signed.
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

async function xGet(path, query = {}) {
  const url = `https://api.x.com${path}`
  const auth = oauthHeader('GET', url, xConfig(), query)
  const qs = Object.keys(query).length
    ? '?' + Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&')
    : ''
  let res, json
  try {
    res = await fetch(url + qs, { headers: { Authorization: auth } })
    json = await res.json().catch(() => ({}))
  } catch (err) {
    return { ok: false, status: 0, json: { error: String(err?.message || err) } }
  }
  return { ok: res.ok, status: res.status, json }
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const problem = xProblem()
  if (problem) return Response.json({ error: problem }, { status: 503 })

  // Step 1: who are we? The mentions endpoint needs our numeric user id, not
  // the @handle.
  const me = await xGet('/2/users/me')
  if (!me.ok) return Response.json({ step: 'users/me', ok: false, status: me.status, detail: me.json }, { status: 502 })
  const userId = me.json?.data?.id

  // Step 2: the real mentions timeline -- this is the actual thing we're
  // proving works before any matching/reply logic gets built on top of it.
  const mentions = await xGet(`/2/users/${userId}/mentions`, {
    max_results: '20',
    'tweet.fields': 'created_at,author_id,conversation_id,in_reply_to_user_id,referenced_tweets',
    expansions: 'author_id',
    'user.fields': 'username',
  })

  return Response.json({
    me: me.json?.data || null,
    mentions_ok: mentions.ok,
    mentions_status: mentions.status,
    mentions: mentions.json,
  })
}
