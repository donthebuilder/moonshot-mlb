// WHAT AN X REFUSAL MEANS, AND WHAT TO DO ABOUT IT -- ONE PLACE (2026-10-10 bug hunt).
//
// The 10-09 live bug (one NHL goal sent to Discord every minute for hours) was an X
// refusal that RESET a claim, so the same event was due again next tick. The same shape
// sat in every poster that releases a claim on a failed X post. X credits are pay-per-use
// now, so a refusal loop is also money (media uploads, reads) and log spam. This file is
// the shared rule every poster asks, so the answer is the same everywhere:
//
//   xErrorClass(r)   'ok' | 'transient' | 'account' | 'content'
//     transient  network error (status 0), 408, a plain 429 rate limit, any 5xx: may retry, a LIMITED number of times
//     account    401, 402 (credits depleted), a 403 that is about the app/permissions, a 429 that
//                is the usage cap: EVERY post will be refused until a human fixes it. Never retried per row.
//     content    any other 4xx (a duplicate post, a reply that is not allowed, a bad quote id):
//                this one post is refused for good. Closed, never retried.
//   The breaker      after an account-level (or rate-limit) refusal postToX / uploadImageToX / getFromX
//                answer instantly with { blocked:true } and make NO request, for a few minutes: one probe per
//                window per instance instead of one failing call per row per minute.
//   settleAlert(r)   what to write to a live alert's x_post_id after an X attempt: the id, 'skipped'
//                (close it: nothing re-posts after a top-up) or null (try again next tick).
//   LATE_ALERT_MS    a live alert older than this is never posted late (it expires; no backlog dump after
//                credits return or an outage ends).
//
// Pure, no imports, no I/O: runs under scripts/check-x-fail.mjs.

/** A live alert (homer, touchdown, goal) older than this is not news; it is closed rather than posted late. */
export const LATE_ALERT_MS = 45 * 60e3
/** A transient refusal on the same alert is retried this many times (per warm instance), then the alert is closed. */
export const MAX_TRANSIENT_TRIES = 3

const BLOCK_MS = { account: 10 * 60e3, rate: 2 * 60e3 }

const lower = (v) => String(v == null ? '' : v).toLowerCase()
const USAGE_CAP = /usagecap|creditsdepleted|credits|capped|usage cap|monthly.*(cap|limit)/
const DUPLICATE = /duplicate/
const ABOUT_THE_POST = /duplicate|reply|quote|conversation|mention|not allowed to (reply|quote)|engag/
const ABOUT_THE_APP = /oauth|permission|suspend|locked|enrol|forbidden|credit|unauthor|invalid.*token|client/

/**
 * Classify one postToX / getFromX / uploadImageToX result.
 * @param r { ok, status, error, title }
 */
export function xErrorClass(r) {
  if (!r) return 'transient'
  if (r.ok) return 'ok'
  if (r.blocked) return 'transient'   // no request was made: X is paused here, the post was neither accepted nor refused
  const status = Number(r.status) || 0
  const words = lower(`${r.title || ''} ${r.error || ''}`)
  if (status === 401 || status === 402) return 'account'
  if (status === 429) return USAGE_CAP.test(words) ? 'account' : 'transient'
  if (status === 403) return !DUPLICATE.test(words) && !ABOUT_THE_POST.test(words) && (ABOUT_THE_APP.test(words) || !words.trim()) ? 'account' : 'content'
  if (status === 0 || status === 408 || status >= 500) return 'transient'
  return 'content'
}

// ── THE BREAKER (per warm instance; a cold one probes once, which is the point) ──────────────
let _block = null   // { until, status, why, at }
const _opened = []  // [{ at, status, why, ms }] -- for the tick's JSON / the log
export const _resetXFail = () => { _block = null; _opened.length = 0; _tries.clear() }

/** Is X blocked right now? null, or { until, status, why }. */
export function xBlocked(now = Date.now()) {
  if (_block && now >= _block.until) _block = null
  return _block
}
/** The blocks opened on this instance (newest last), for a tick's response. */
export const xBlockLog = () => _opened.slice()

/**
 * Record a refusal. Opens the breaker for an account-level refusal (10 min) or a rate limit (2 min).
 * Returns the block if THIS call opened one (the caller logs it / tells ops once), else null.
 */
export function noteXFailure(r, now = Date.now()) {
  if (!r || r.ok || r.blocked) return null
  const cls = xErrorClass(r)
  const ms = cls === 'account' ? BLOCK_MS.account : Number(r.status) === 429 ? BLOCK_MS.rate : 0
  if (!ms) return null
  const already = xBlocked(now)
  if (already && already.until >= now + ms) return null
  const block = { at: now, until: now + ms, status: Number(r.status) || 0, why: String(r.title || r.error || '').slice(0, 120) }
  _block = block
  if (_opened.length > 20) _opened.shift()
  _opened.push({ at: new Date(now).toISOString(), status: block.status, why: block.why, ms })
  return already ? null : block
}

/** What a blocked call answers (no request was made). */
export function blockedResult(now = Date.now()) {
  const b = xBlocked(now)
  if (!b) return null
  return { ok: false, blocked: true, status: b.status, error: `X paused ${Math.ceil((b.until - now) / 60e3)} min after a ${b.status} (${b.why || 'refused'})`, title: 'XBlocked' }
}

// ── ATTEMPTS (per warm instance) ─────────────────────────────────────────────
const _tries = new Map()
/** Count one transient failure for `key`; true while it may still be retried. */
export function mayRetry(key, max = MAX_TRANSIENT_TRIES) {
  if (_tries.size > 2000) _tries.clear()
  const n = (_tries.get(key) || 0) + 1
  _tries.set(key, n)
  return n < max
}

/**
 * For the once-a-day claim posters that release their claim on a failed X post (the Slate, the receipts): may the
 * claim be released for another try? Only for a transient refusal (and a rate-limit pause), a few times per warm
 * instance; an account-level refusal (or X paused for one) goes on to Discord only instead of holding the channel
 * copy back until X answers.
 */
export function mayRetryPost(r, key, max = MAX_TRANSIENT_TRIES) {
  if (xErrorClass(r) !== 'transient') return false
  if (r && r.blocked && Number(r.status) !== 429) return false
  return mayRetry(key, max)
}

/**
 * What to store in a live alert's x_post_id after an X attempt that did NOT post (or did).
 *   value  the id on success; 'skipped' to close it (never retried, never counted as an X post); null to retry next tick
 *   stop   true when the rest of this tick's X attempts are pointless (account-level refusal, rate limit, X paused)
 * @param r           the postToX result
 * @param opts.key    a stable key for the alert, so transient retries are counted
 * @param opts.channelSent  the same alert already went out on another channel and a retry would re-send it
 */
export function settleAlert(r, { key = null, channelSent = false } = {}) {
  if (r && r.ok && r.id) return { value: String(r.id), stop: false }
  const cls = xErrorClass(r)
  if (channelSent) return { value: 'skipped', stop: Boolean(r?.blocked) || cls === 'account' || Number(r?.status) === 429 }
  if (r && r.blocked) return { value: null, stop: true }                       // no request was made: not a try, wait for the block to lapse (the alert expires by age)
  if (cls === 'account') return { value: 'skipped', stop: true }
  if (cls === 'content') return { value: 'skipped', stop: false }
  const again = key == null ? true : mayRetry(key)
  return { value: again ? null : 'skipped', stop: Number(r?.status) === 429 }
}

/** The ISO time before which a pending alert is too old to post. */
export const staleBefore = (now = Date.now()) => new Date(now - LATE_ALERT_MS).toISOString()
export const isLate = (seenAt, now = Date.now()) => {
  const t = Date.parse(seenAt || '')
  return Number.isFinite(t) && now - t > LATE_ALERT_MS
}
