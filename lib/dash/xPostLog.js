// THE POSTING LOG, MINIMAL (X overhaul stage 3 piece 1, 2026-10-09).
//
// Every decision the X posting rules make about a SCHEDULED post is recorded here
// as POSTED / HELD / DROPPED with its reason, in memory (the last RING entries on
// this instance) and as one console line (`[xlog] ...`, readable in the Vercel
// logs). A HELD post is retried every tick, so a repeat of the same decision is
// logged once, not once a minute.
//
// TODO (a later piece): the full /admin POSTING LOG -- a durable table
// (time, sport, kind, text, POSTED/HELD/DROPPED, reason, tweet id) read by a page.
// Nothing here is persisted, so it does not survive a cold start.
const RING = 300
const _log = []
const _lastKey = new Map()   // `${day}|${kind}` -> last `${state}|${reason}`

export const STATES = Object.freeze(['POSTED', 'HELD', 'DROPPED'])

/** @returns {boolean} true when this was a new decision and was logged. */
export function recordPost({ day = '', kind = '', sport = null, state, reason = '', ids = [], tweetId = null, text = null } = {}) {
  if (!STATES.includes(state)) return false
  const key = `${day}|${kind}`
  const sig = `${state}|${reason}`
  if (_lastKey.get(key) === sig && state !== 'POSTED') return false
  if (_lastKey.size > 2000) _lastKey.clear()
  _lastKey.set(key, sig)
  const entry = { at: new Date().toISOString(), day, kind, sport, state, reason, ids: (ids || []).slice(0, 12), tweetId, text: text == null ? null : String(text).slice(0, 400) }
  _log.push(entry)
  if (_log.length > RING) _log.shift()
  console.log(`[xlog] ${state} ${kind} ${day}${reason ? ` -- ${reason}` : ''}${tweetId ? ` (${tweetId})` : ''}`)
  return true
}
/** The most recent decisions on this instance, newest last. */
export const recentLog = () => _log.slice()
export const _resetLogForTests = () => { _log.length = 0; _lastKey.clear() }
