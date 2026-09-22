// POSTING TO THREADS — the free mirror of everything CALLED IT already says.
//
// 2026-09-20, Donovan: "let get the threads lined up", after asking whether
// automated posting there is free. It is: Meta's Threads API has no paid tier
// and no per-call fee, and one profile may publish 250 posts and 1,000 replies
// per rolling 24 hours. The account currently runs ~1,800 X posts a month,
// about 60 a day — well inside that, at zero.
//
// TWO SECRETS, both from the Meta app (see THREADS-SETUP.txt at the repo root
// for how to get them):
//
//   THREADS_USER_ID        the numeric Threads user id for the CALLED IT profile
//   THREADS_ACCESS_TOKEN   a long-lived token with threads_basic and
//                          threads_content_publish
//
// UNSET MEANS OFF. Every function here returns a refusal instead of throwing
// when the credentials are missing, so this file is inert until the day the
// token exists — which matters, because Meta App Review takes weeks.
//
// ── WHAT THREADS WILL NOT DO THAT X DOES ───────────────────────────────────
//
// NO NATIVE POLL. THE BOT VS THE PEOPLE is an X-only post. Mirrored as plain
// text it would ask a question with no way to answer, so a post carrying a
// poll is skipped here rather than degraded.
//
// NO BYTE UPLOAD. X takes the card's PNG bytes; Threads takes only a PUBLIC
// image_url it fetches for itself. The cards are rendered in memory and handed
// straight to X, so a mirrored post is TEXT-ONLY unless the caller passes a
// URL. /api/dash/homers/card can serve one for three kinds; the rest have no
// public URL and would need one before their cards could cross.
//
// 500 CHARACTERS, not 280. Longer than the X budget every post is already
// written to, so nothing has to be rewritten — but a Premium long post (this
// repo's X_TEXT_LIMIT can be raised past 280) CAN exceed it, so the text is
// refit here rather than assumed to fit.
//
// PUBLISHING IS TWO CALLS. Create a container, then publish it. Meta's docs
// ask for a pause between the two for media; text containers are normally
// ready at once, so this publishes immediately and retries once after a short
// wait. Both calls are inside one cron tick, which has a 60-second ceiling,
// so the wait is deliberately small.

import { threadsLinkFor, threadsLinkMode } from './threadsLink'
import { mirrorsToThreads } from './postLink'

const clean = (v) => String(v == null ? '' : v).trim()

export const THREADS_LIMIT = 500
const GRAPH = 'https://graph.threads.net/v1.0'
const PUBLISH_RETRY_MS = 2500

export function threadsConfig() {
  return {
    userId: clean(process.env.THREADS_USER_ID),
    token: clean(process.env.THREADS_ACCESS_TOKEN),
  }
}

export function threadsProblem() {
  const c = threadsConfig()
  if (!c.userId) return 'THREADS_USER_ID is not set'
  if (!c.token) return 'THREADS_ACCESS_TOKEN is not set'
  return null
}

export const hasThreads = () => threadsProblem() === null

/**
 * Mirroring is OFF unless asked for, separately from having credentials.
 * A token that exists is not consent to double every post — flipping
 * THREADS_MIRROR on is.
 */
export const threadsMirrorOn = () => hasThreads() && clean(process.env.THREADS_MIRROR) === '1'

/** Same shape as xPost.js's fitToLimit, at Threads' own ceiling. */
export function fitThreads(text, limit = THREADS_LIMIT) {
  const chars = Array.from(String(text == null ? '' : text))
  if (chars.length <= limit) return chars.join('')
  const cut = chars.slice(0, limit).join('')
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf(' '))
  return (lastBreak > limit * 0.6 ? cut.slice(0, lastBreak) : cut).trimEnd()
}

async function graph(path, params) {
  const url = new URL(`${GRAPH}/${path}`)
  const body = new URLSearchParams({ ...params, access_token: threadsConfig().token })
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = json?.error || {}
    return { ok: false, status: res.status, error: e.message || res.statusText, code: e.code ?? null }
  }
  return { ok: true, id: json?.id || null }
}

/**
 * One Threads post. Returns { ok, id } or { ok:false, status, error }.
 * `replyTo` is a THREADS media id (not an X post id — see mirrorToThreads).
 * `imageUrl` must be publicly fetchable by Meta.
 *
 * Never throws. A refusal is logged and returned, the same contract every
 * other poster in this repo keeps.
 */
export async function postToThreads(text, { replyTo = null, imageUrl = null } = {}) {
  const problem = threadsProblem()
  if (problem) return { ok: false, status: 0, error: problem }
  const { userId } = threadsConfig()
  const raw = String(text == null ? '' : text)
  const fitted = fitThreads(raw)
  if (fitted !== raw) {
    console.error(`[threads] post trimmed: ${Array.from(raw).length} -> ${Array.from(fitted).length}. Head: ${raw.split('\n')[0]}`)
  }

  const params = { media_type: imageUrl ? 'IMAGE' : 'TEXT', text: fitted }
  if (imageUrl) params.image_url = String(imageUrl)
  if (replyTo) params.reply_to_id = String(replyTo)

  const container = await graph(`${userId}/threads`, params)
  if (!container.ok || !container.id) {
    console.error(`[threads] container refused: ${container.status} ${container.error || ''}`)
    return { ok: false, status: container.status || 0, error: container.error || 'no container id' }
  }

  let pub = await graph(`${userId}/threads_publish`, { creation_id: container.id })
  if (!pub.ok) {
    // Not yet processed is the one failure worth a second attempt; anything
    // else (bad token, missing permission, rate limit) will fail identically.
    await new Promise((r) => setTimeout(r, PUBLISH_RETRY_MS))
    pub = await graph(`${userId}/threads_publish`, { creation_id: container.id })
  }
  if (!pub.ok) {
    console.error(`[threads] publish refused: ${pub.status} ${pub.error || ''}`)
    return { ok: false, status: pub.status || 0, error: pub.error || 'publish failed' }
  }
  return { ok: true, id: pub.id, chars: Array.from(fitted).length }
}

// ── THE MIRROR ─────────────────────────────────────────────────────────────
//
// Every post in this product goes through xPost.js's postToX(), so the mirror
// lives at that one seam rather than at twenty call sites. What it needs is a
// way to thread a reply: callers pass `replyTo` as an X post id, and Threads
// wants its own id for the same parent, so each successful mirror records the
// pairing.
//
// THE MAP IS PER-INSTANCE AND DELIBERATELY NOT PERSISTED. A reply posted in a
// LATER tick than its parent (the homer board-reply pass reads x_post_id back
// out of the database, which can be minutes later on a fresh serverless
// instance) will find no Threads parent — and in that case the mirror is
// SKIPPED, not posted flat. A reply's text only makes sense under the post it
// answers; orphaned on its own it reads as a non sequitur. Persisting the
// pairing is the fix, and it belongs in the feed tables next to x_post_id,
// not in a second store invented here.
const _parents = new Map()
let _results = []

export function rememberThreadsParent(xId, threadsId) {
  if (xId && threadsId) _parents.set(String(xId), String(threadsId))
}

/**
 * Mirror one post that just went out on X. Fire-and-forget by contract: the
 * return value is for the tick's diagnostics, and a Threads failure must
 * never change what happens on X.
 */
export async function mirrorToThreads(text, { replyTo = null, poll = null, imageUrl = null, xId = null, kind = null } = {}) {
  if (!threadsMirrorOn()) return { ok: false, skipped: 'off' }
  if (poll) return { ok: false, skipped: 'poll' }
  // A REPLY FOLLOWS ITS PARENT. If the post went to Threads, its reply does
  // too, whatever the kind policy says about the kind -- a reply is only ever
  // posted under a parent this mirror already put up.
  if (!replyTo && !mirrorsToThreads(kind)) return { ok: false, skipped: 'kind' }
  let parent = null
  if (replyTo) {
    parent = _parents.get(String(replyTo)) || null
    if (!parent) {
      _results.push({ ok: false, skipped: 'orphan-reply' })
      return { ok: false, skipped: 'orphan-reply' }
    }
  }

  // THE FUNNEL LINE (see threadsLink.js). Only the anchor kinds have one, and
  // only the top-level post carries it -- a link under a reply is a link under
  // a link. `inline` appends it to the body; the default `reply` posts it
  // underneath, which keeps the post itself link-free and its reach intact.
  const link = parent ? '' : threadsLinkFor(kind)
  const inline = link && threadsLinkMode() === 'inline'
  const body = inline ? `${text}\n\n${link}` : text

  const r = await postToThreads(body, { replyTo: parent, imageUrl })
  if (r.ok && xId) rememberThreadsParent(xId, r.id)
  _results.push(r.ok ? { ok: true, id: r.id, kind } : { ok: false, status: r.status, error: r.error, kind })

  if (r.ok && link && !inline) {
    // The link reply is its own post and its own failure. A refused reply
    // leaves the post up and clean rather than taking it down with it --
    // the post is the thing that had to go out.
    const lr = await postToThreads(link, { replyTo: r.id })
    _results.push(lr.ok ? { ok: true, id: lr.id, kind: `${kind}:link` } : { ok: false, status: lr.status, error: lr.error, kind: `${kind}:link` })
  }
  return r
}

/** Drains every mirror result since the last call — one snapshot per tick. */
export function threadsSnapshot() {
  const out = _results
  _results = []
  return out
}
