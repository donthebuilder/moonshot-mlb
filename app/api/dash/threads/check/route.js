// THREADS — IS IT WIRED? (2026-09-20)
//
// The day the Meta token exists, this is how it gets verified before anything
// is mirrored to the public account. It answers three questions in order,
// because they fail in order:
//
//   1. Are the two env vars set?
//   2. Does the token actually resolve to a Threads profile? (GET /me)
//   3. Can it publish? (?go=1 posts one real test post)
//
// Step 3 POSTS PUBLICLY. It is gated on the same secret the tick routes use
// and defaults to off, so a stray browser hit can only ever read.
//
// Deliberately NOT deleted with the other -tmp routes: this is the check to
// re-run whenever the long-lived token is rotated, which is every 60 days.

import { timingSafeEqual } from 'node:crypto'
import { hasThreads, postToThreads, threadsConfig, threadsMirrorOn, threadsProblem } from '../../../../../lib/dash/threadsPost'
import { linkedKinds, threadsLinkFor, threadsLinkMode } from '../../../../../lib/dash/threadsLink'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authed(request, url) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || ''
  if (!supplied) return false
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET, process.env.CALLEDIT_SECRET]
    .filter(Boolean)
    .some((expected) => {
      const a = Buffer.from(expected)
      const b = Buffer.from(supplied)
      return a.length === b.length && timingSafeEqual(a, b)
    })
}

export async function GET(request) {
  const url = new URL(request.url)

  // WHICH POSTS CARRY A LINK, AND WHAT IT SAYS. Needs no token and posts
  // nothing -- the point is to read the funnel copy before it is live, since
  // this is the only part of the mirror a reader actually sees.
  if (url.searchParams.get('preview') === '1') {
    return Response.json({
      mode: threadsLinkMode(),
      note: 'mode "reply" posts the link as the first reply under the post; "inline" puts it in the body',
      linked: linkedKinds().map((kind) => ({ kind, line: threadsLinkFor(kind) })),
      clean: 'every other kind posts with no link — the live homer and touchdown alerts above all',
    })
  }

  const out = {
    configured: hasThreads(),
    problem: threadsProblem(),
    mirroring: threadsMirrorOn(),
    // Never the token itself, and never the whole id -- enough to tell one
    // account from another in a log, nothing more.
    userId: threadsConfig().userId ? `…${threadsConfig().userId.slice(-4)}` : null,
  }
  if (!out.configured) return Response.json(out)

  // WHO DOES THIS TOKEN THINK IT IS. A token can be valid and belong to the
  // wrong profile, which is the failure worth catching BEFORE a test post
  // lands on someone's personal account.
  try {
    const me = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(threadsConfig().token)}`)
    const j = await me.json().catch(() => ({}))
    out.profile = me.ok ? { id: j?.id || null, username: j?.username || null } : null
    if (!me.ok) out.profileError = j?.error?.message || me.statusText
  } catch (err) {
    out.profileError = String(err?.message || err)
  }

  if (url.searchParams.get('go') !== '1') {
    out.note = 'read-only. add ?go=1&key=<CALLEDIT_SECRET> to publish one real test post'
    return Response.json(out)
  }
  if (!authed(request, url)) return Response.json({ ...out, posted: false, error: 'unauthorized' }, { status: 401 })

  const text = [
    '🤖 CALLED IT',
    '',
    'Wiring check. Nothing to see here yet.',
    '',
    'MOONSHOT calls home runs. TUDDY calls touchdowns.',
    'Both graded in public.',
  ].join('\n')
  out.posted = await postToThreads(text)
  return Response.json(out)
}
