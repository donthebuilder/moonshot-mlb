// THE CALL'S VOICE (X overhaul, 2026-10-20: "too robotic ... stat heavy, we need some voice or community speak").
// Every per-game write-up, all four sports, gets the same two things the fact posts and The Slate got:
//   a HOOK under the headline: a fan's line, in our voice ("we", "our"), no number, no claim
//   an ASK last, before the footer: a question to the network
// Fixed words only. No digits, nothing the board doesn't say ("due", "can't miss", "lock" never appear), no swearing.
// The hook and the ask are extras: the calls, the case and the price always come first, and a voice line is left out
// of a version it doesn't fit (the 280 one sheds the hook first, then the ask). Pure.
import { blocks } from './layout'

// (no "our touchdown calls" line: the plain sentence under it already says "the two touchdown looks in this game")
export const CALL_HOOKS = Object.freeze({
  mlb: ["Who we're riding in this one \u{1F447}", "Here's how we see this one \u{1F447}", "Here's who we like in this one \u{1F447}"],
  nfl: ['Who we like to find the end zone \u{1F447}', "Here's how we see this one \u{1F447}", "Here's who we're riding in this one \u{1F447}"],
  nhl: ['Who we like to light the lamp \u{1F447}', "Here's how we see this one \u{1F447}", "Here's who we're riding in this one \u{1F447}"],
  nba: ["Who we're riding in this one \u{1F447}", "Here's how we see this one \u{1F447}", "Here's who we like in this one \u{1F447}"],
})
export const CALL_ASKS = Object.freeze(['Who you got in this one, network?', 'Who are we missing in this one?', 'Ride or fade, network?'])

/** Every voice line, for the checker's word list (they are template words, not claims). */
export const VOICE_WORDS = Object.freeze([...new Set([...Object.values(CALL_HOOKS).flat(), ...CALL_ASKS])])

// the same game always gets the same lines (a re-render never changes the post); games on a night get different ones
const pick = (list, key) => {
  let h = 0
  for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return list[h % list.length]
}

/** { hook, ask } for this write-up; null when nobody is called (a fan's "who we like" over "no call in this game" reads wrong). */
export function callVoice(w) {
  if (!w?.players?.length) return null
  const key = [w.sport, w.away, w.home, w.when].join('|')
  const hooks = CALL_HOOKS[w.sport] || CALL_HOOKS.nfl
  return { hook: pick(hooks, key), ask: pick(CALL_ASKS, `${key}|ask`) }
}

/**
 * A body with the voice in it: the hook under the headline (on top of a one-line block, the plain "who" sentence, or as
 * its own block when the next block is longer), the ask as the last block. `room` = the most characters it may run;
 * the hook goes first when it doesn't fit, then the ask; the body itself is never cut.
 */
export function withVoice(body, voice, room = Infinity) {
  if (!body || !voice) return body
  const { hook, ask } = voice
  const parts = body.split('\n\n')
  const hooked = (() => {
    if (parts[0].includes('\n')) return null   // the headline has no blank under it (a tight 280 version): no room for a hook
    if (parts.length < 2) return [parts[0], hook]
    const next = parts[1].split('\n')
    return next.length === 1 ? [parts[0], `${hook}\n${parts[1]}`, ...parts.slice(2)] : [parts[0], hook, ...parts.slice(1)]
  })()
  const tries = [hooked ? blocks([...hooked, ask]) : null, blocks([...parts, ask])].filter(Boolean)
  for (const v of tries) if (v.length <= room) return v
  return body
}
